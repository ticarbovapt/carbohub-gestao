-- ═══════════════════════════════════════════════════════════════════════════
-- Transferência entre estoques — o ACEITE e as duas views que faltavam
--
-- ⚠️ LEIA ISTO ANTES: a origem parametrizada NÃO está aqui. Ela já entrou na
-- migração 20260906 (Fase 2 — o caminho de volta), que derrubou a
-- `ops_transfer_register` de 6 argumentos e criou a de 7 com
-- `p_from_code default 'HUB-RN'`, o guard de origem=destino, a mensagem de
-- saldo com o nome real da origem, o estorno com o nome dinâmico e os índices
-- por `from_hub`/`to_hub`.
--
-- Esta migração NÃO toca em nada disso de propósito. Recriar a função só para
-- "ter certeza" significaria um DROP + CREATE com janela de segundos em que
-- envio nenhum funciona — risco puro, ganho zero.
--
-- O que a 20260906 avisou que faltava, com todas as letras:
--
--     "Por isso a Fase 2 tem uma parte de front obrigatória (fila de
--      confirmação por from_hub, no Ops). Rodar só este SQL e parar aí é pior
--      do que não ter feito nada."
--
-- Foi exatamente o que aconteceu: o SQL rodou, o front não veio, e a aba
-- "Recebimento" do Ops continuou sendo um placeholder de "próxima fase".
-- Consequência: um envio para o Escritório ou para a caixa de um vendedor
-- sai da origem e não tem ONDE ser aceito — fica em `approved` para sempre,
-- debitado de um lado e nunca creditado do outro. Perda silenciosa.
--
-- Esta migração fecha os três buracos que sobraram:
--   1. quem pode dar o aceite (hoje: qualquer autenticado, em qualquer envio);
--   2. a lista de estoques que a tela pode oferecer como origem/destino;
--   3. a transferência com nome e AUTORIA, para a tela parar de montar a
--      junção no navegador — e para "quem aceitou" finalmente aparecer.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a 20260906 está mesmo aplicada?                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Rode isto PRIMEIRO. Se vier a assinatura de 6 argumentos (sem o `text`
-- final), a Fase 2 não foi aplicada neste banco — pare aqui e rode a
-- 20260906 antes, senão o front novo vai chamar com `p_from_code` e receber
-- "function does not exist" no clique do usuário.
--
-- Esperado: UMA linha, terminando em `,text)`.
select p.oid::regprocedure as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ops_transfer_register';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem pode dar o aceite                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Hoje QUALQUER autenticado confirma QUALQUER envio. Enquanto o destino era
-- um CD da empresa isso era só frouxo; com a caixa do vendedor vira outra
-- coisa. O aceite é o que transfere a responsabilidade sobre a mercadoria —
-- um terceiro confirmando cria saldo na caixa de alguém que nunca viu a caixa,
-- e é o saldo dessa caixa que autoriza venda de pronta entrega.
--
-- A regra: o DONO da caixa, ou gestão. Não é "só o dono" de propósito — o
-- vendedor pode estar sem sinal, de férias ou ter saído da empresa, e o
-- estoque não pode ficar preso em trânsito por isso. Quem confirmou fica em
-- `executed_by`, e é ISSO que responde "quem deu o aceite".
--
-- Destino hub segue como estava: quem opera confirma.
--
-- ⚠️ A permissão é conferida ANTES do UPDATE. O flip approved→executed é
-- condicional e irreversível; recusar depois dele deixaria o envio marcado
-- como entregue sem o crédito ter acontecido.

create or replace function public.ops_transfer_confirm(p_transfer_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_to uuid; v_pid uuid; v_qty numeric; v_tonome text;
  v_kind text; v_owner uuid;
begin
  select w.kind, w.owner_id, w.name into v_kind, v_owner, v_tonome
  from public.stock_transfers t
  join public.warehouses w on w.id = t.to_hub
  where t.id = p_transfer_id;

  if v_kind is null then
    raise exception 'Envio não encontrado.';
  end if;

  if v_kind = 'vendedor'
     and v_owner is distinct from p_user
     and not public.is_manager_or_admin(p_user) then
    raise exception 'Só o dono da caixa (ou a gestão) pode aceitar este recebimento.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.stock_transfers
     set status = 'executed', executed_by = p_user, executed_at = now()
   where id = p_transfer_id and status = 'approved'
  returning to_hub, product_id, quantity into v_to, v_pid, v_qty;

  if not found then
    raise exception 'Envio já confirmado ou cancelado.';
  end if;

  insert into public.warehouse_stock (warehouse_id, product_id, quantity)
  values (v_to, v_pid, v_qty)
  on conflict (warehouse_id, product_id)
  do update set quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
  values
    (v_pid, v_to, 'entrada', v_qty, 'transferencia', p_transfer_id,
     format('[%s] chegada de transferência', coalesce(v_tonome, '?')), p_user);
end $$;

comment on function public.ops_transfer_confirm is
  'Aceita o recebimento: credita o destino e grava o movimento de entrada. Caixa de vendedor só é aceita pelo DONO ou pela gestão — o aceite transfere a responsabilidade sobre a mercadoria. Quem aceitou fica em stock_transfers.executed_by.';

grant execute on function public.ops_transfer_confirm(uuid, uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista de estoques que a tela pode escolher                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Uma VIEW, e não uma lista no código. O `stockData.ts` já tem uma constante
-- `HUBS`, e ela existe para a GRADE de Suprimentos — as caixas de vendedor
-- ficam fora dela DE PROPÓSITO, porque cada caixa vira uma coluna e quinze
-- vendedores tornariam a grade ilegível.
--
-- São duas perguntas diferentes: "o que mostrar na grade" e "para onde posso
-- enviar". Reaproveitar `HUBS` para a segunda puxaria as caixas para dentro da
-- primeira junto.

create or replace view public.carbo_estoques
with (security_invoker = true) as
select
  w.id, w.code, w.name, w.kind, w.owner_id,
  p.full_name as dono_nome,
  coalesce(w.is_active, true) as ativo
from public.warehouses w
left join public.profiles p on p.id = w.owner_id
where coalesce(w.is_active, true);

comment on view public.carbo_estoques is
  'Estoques disponíveis como origem/destino de transferência: hubs e caixas de vendedor ativas. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_estoques to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o envio com nome, origem, destino e QUEM ACEITOU            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A tela montava isso com três consultas e dois `Map` no navegador, e não
-- mostrava autor nenhum. `approved_by` e `executed_by` já estavam sendo
-- gravados desde a migração 20260710310000 — e nunca apareceram em tela
-- alguma. Envio sem autor é envio por que ninguém responde.

create or replace view public.carbo_transferencias
with (security_invoker = true) as
select
  t.id,
  t.product_id,
  t.product_code,
  pr.name                       as produto,
  coalesce(pr.stock_unit, 'un') as unidade,
  t.quantity                    as qtd,
  wf.code                       as origem_code,
  wf.name                       as origem_nome,
  wf.kind                       as origem_kind,
  wt.code                       as destino_code,
  wt.name                       as destino_nome,
  wt.kind                       as destino_kind,
  wt.owner_id                   as destino_dono_id,
  t.status,
  t.notes,
  t.created_at                  as enviado_em,
  t.approved_by                 as registrado_por,
  pa.full_name                  as registrado_por_nome,
  t.executed_at                 as aceito_em,
  t.executed_by                 as aceito_por,
  pe.full_name                  as aceito_por_nome
from public.stock_transfers t
join public.warehouses wf        on wf.id = t.from_hub
join public.warehouses wt        on wt.id = t.to_hub
left join public.mrp_products pr on pr.id = t.product_id
left join public.profiles pa     on pa.id = t.approved_by
left join public.profiles pe     on pe.id = t.executed_by;

comment on view public.carbo_transferencias is
  'Transferências entre estoques com origem, destino, produto e AUTORIA (quem registrou e quem deu o aceite). ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_transferencias to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ As duas views com security_invoker. Nulo aqui significa que elas
--     rodam como DONO, ignorando RLS — e `authenticated` inclui o portal de
--     lojas e o de licenciados, que usam a MESMA tabela `profiles`.
select relname, reloptions from pg_class
where relname in ('carbo_estoques', 'carbo_transferencias');

-- (b) Os estoques que a tela vai oferecer.
select kind, count(*) as quantos, string_agg(code, ', ' order by code) as codigos
from public.carbo_estoques group by kind order by kind;

-- (c) ⚠️ O QUE ESTÁ PRESO EM TRÂNSITO HOJE. Este é o número que interessa: são
--     envios que saíram da origem e nunca foram aceitos porque não havia tela
--     para aceitá-los. Depois do deploy do front, eles passam a aparecer na
--     aba "Recebimento" do estoque de destino.
select destino_code, destino_nome, count(*) as presos,
       min(enviado_em)::date as mais_antigo
from public.carbo_transferencias
where status = 'approved'
group by 1, 2 order by presos desc;

-- (d) O histórico, agora com autoria visível. `com_aceite_registrado` menor
--     que `envios` entregues é esperado no histórico antigo — o campo existia
--     e a tela nunca o mostrou, mas ele sempre foi gravado.
select origem_code, destino_code, status, count(*) as envios,
       count(*) filter (where aceito_por is not null) as com_aceite_registrado
from public.carbo_transferencias
group by 1, 2, 3 order by 1, 2, 3;
