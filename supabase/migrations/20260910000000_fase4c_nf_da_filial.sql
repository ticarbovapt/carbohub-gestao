-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4C — a nota emitida na filial volta para o pedido
--
-- Sem isto, faturar em SP deixa o pedido preso: o casamento automático NF↔
-- pedido roda só sobre `bling_nfe` (matriz), então a nota da filial nunca
-- chegaria ao pedido — ele ficaria para sempre na fila de faturamento, e nota
-- cancelada lá não teria efeito nenhum aqui.
--
-- ⚠️ RODE EM BLOCOS.
--
-- ── Por que NÃO por regex, como na matriz ─────────────────────────────────
--
-- Na matriz o vínculo é textual: o número do pedido vai na observação e um
-- regex o encontra na NF. Na conta 2 isso não funciona — foi medido quando a
-- ponte foi escrita: as notas de lá chegam com observação VAZIA, e casar por
-- valor + data seria heurística que erra calada.
--
-- Mas aqui a situação é melhor que a da ponte: o pedido foi criado por NÓS, e
-- guardamos o id dele. O espelho já liga pedido→nota por id exato
-- (`bling2_orders.nf_bling_id`, coluna gerada de raw_detalhe). Então o caminho
-- é determinístico ponta a ponta, sem texto no meio:
--
--     carboze_orders.external_ref ('bling2-<id>')
--        → bling2_orders.bling_id → .nf_bling_id
--        → bling2_nfe.bling_id
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna da NF de bonificação da filial                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists bling2_nf_bonificacao_id      bigint,
  add column if not exists nf2_bonificacao_access_key    text,
  add column if not exists invoice2_bonificacao_number   text;

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o casamento                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Também DESVINCULA. Se a nota deixou a lista branca (cancelada, por
-- exemplo), o vínculo é desfeito e o pedido VOLTA para a fila de faturamento.
--
-- É o comportamento certo e é conservador de propósito: eu poderia ter feito a
-- venda ser cancelada junto, como a matriz faz — mas esse mecanismo é outro,
-- mexe em status de pedido e em faturamento, e ampliá-lo de lado numa
-- migração de vínculo seria mudar o que ninguém pediu. Voltar para a fila
-- torna o problema VISÍVEL para quem fatura, que é quem decide.
--
-- ⚠️ Nota cancelada SOME da listagem do Bling, então o espelho pode congelar
-- na última situação conhecida. O mesmo já vale para a matriz e é tratado pela
-- reconferência por id do `nfe_recheck`. Aqui a consequência de um espelho
-- desatualizado é o pedido continuar dado como faturado — não é silencioso,
-- porque a conferência do BLOCO 5 mostra a divergência.

create or replace function public.carbo_vincula_nf_filial()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select
      o.id                                            as order_id,
      nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint as pedido_bling,
      o.bling2_pedido_bonificacao_id                  as pedido_bon,
      o.bling2_nf_id                                  as nf_atual
    from public.carboze_orders o
    where o.bling_conta = 2
      and o.external_ref like 'bling2-%'
  loop
    -- ── a nota do pedido PAGO ────────────────────────────────────────────
    declare
      v_nf record;
    begin
      select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
        into v_nf
        from public.bling2_orders bo
        join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
       where bo.bling_id = r.pedido_bling
       limit 1;

      if found and public.bling2_nf_e_valida(v_nf.situacao) then
        if r.nf_atual is distinct from v_nf.bling_id then
          update public.carboze_orders
             set bling2_nf_id    = v_nf.bling_id,
                 nf2_access_key  = v_nf.chave_acesso,
                 invoice2_number = v_nf.numero,
                 updated_at      = now()
           where id = r.order_id;
          n := n + 1;
        end if;
      elsif r.nf_atual is not null then
        -- Nota deixou de valer → desfaz o vínculo e devolve à fila.
        update public.carboze_orders
           set bling2_nf_id = null, nf2_access_key = null, invoice2_number = null,
               updated_at = now()
         where id = r.order_id;
        n := n + 1;
      end if;
    end;

    -- ── a nota da REMESSA de bonificação ─────────────────────────────────
    if r.pedido_bon is not null then
      declare
        v_bon record;
      begin
        select nf.bling_id, nf.chave_acesso, nf.numero, nf.situacao
          into v_bon
          from public.bling2_orders bo
          join public.bling2_nfe    nf on nf.bling_id = bo.nf_bling_id
         where bo.bling_id = r.pedido_bon
         limit 1;

        if found and public.bling2_nf_e_valida(v_bon.situacao) then
          update public.carboze_orders
             set bling2_nf_bonificacao_id    = v_bon.bling_id,
                 nf2_bonificacao_access_key  = v_bon.chave_acesso,
                 invoice2_bonificacao_number = v_bon.numero,
                 updated_at                  = now()
           where id = r.order_id
             and bling2_nf_bonificacao_id is distinct from v_bon.bling_id;
        end if;
      end;
    end if;
  end loop;

  return n;
exception when others then
  raise warning 'carbo_vincula_nf_filial falhou: %', sqlerrm;
  return n;
end;
$$;

revoke all on function public.carbo_vincula_nf_filial() from public, anon;

comment on function public.carbo_vincula_nf_filial is
  'Liga a NF emitida na filial SP ao pedido, por id exato (external_ref → bling2_orders → bling2_nfe). Não usa regex porque as notas da conta 2 chegam com observação vazia. Também DESVINCULA quando a nota sai da lista branca, devolvendo o pedido à fila de faturamento.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — agendamento                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A cada 5 min, logo depois da janela do espelho. SQL puro, banco→banco.
-- ⚠️ Depende do `bling2-order-details-10min`: é ele que traz `raw_detalhe`, de
-- onde sai `nf_bling_id`. Sem os detalhes, a nota chega ao espelho órfã e este
-- vínculo não acha nada — é a mesma dependência que já prendia pedido em
-- "Confirmado" antes de aquele job existir.

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'vincula-nf-filial' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'vincula-nf-filial', '*/5 * * * *',
    $cron$ select public.carbo_vincula_nf_filial(); $cron$
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O agendamento existe?
select jobname, schedule, active from cron.job where jobname = 'vincula-nf-filial';

-- (b) Disparo manual — devolve quantos vínculos mudaram.
select public.carbo_vincula_nf_filial() as vinculos_alterados;

-- (c) Pedidos faturados na filial e o estado da nota. Vazio até alguém
--     faturar em SP.
select o.order_number, o.total,
       o.bling2_nf_id, o.invoice2_number,
       o.bling2_nf_bonificacao_id, o.invoice2_bonificacao_number
from public.carboze_orders o
where o.bling_conta = 2
order by o.created_at desc
limit 20;

-- (d) ⚠️ Faturado em SP e SEM nota vinculada há mais de 1 hora. Se aparecer
--     linha aqui, o pedido está preso: ou a NF não foi emitida no Bling, ou o
--     job de detalhes não trouxe o vínculo.
select o.order_number, o.created_at, o.total
from public.carboze_orders o
where o.bling_conta = 2
  and o.bling2_nf_id is null
  and o.created_at < now() - interval '1 hour'
order by o.created_at;
