-- ─────────────────────────────────────────────────────────────────────────────
-- As contas do Bling 1 (matriz) chegam às TELAS — a cada 10 min (21/10/2026)
--
-- O espelho `bling_contas_pagar` / `bling_contas_receber` (20261121) já lê o
-- Bling. Esta migração faz ele atualizar as tabelas que as telas, o fluxo de
-- caixa, o Início e as RPCs `fin_*` JÁ leem: `purchase_payables` e
-- `receivables`. Nenhuma tela muda de lugar.
--
-- Medido antes (21/10/2026), contas a pagar:
--   dos 320 "em aberto" no sistema, 128 já estavam PAGOS no Bling (R$ 404 mil)
--   e 59 não existiam mais lá (R$ 126 mil); 458 títulos do Bling nunca tinham
--   chegado — 136 deles em aberto (R$ 343 mil).
--
-- Regras:
--   1. O Bling MANDA no que veio dele — status, valor, vencimento.
--   2. ⚠️ Decisão tomada AQUI não é desfeita pelo Bling: baixa feita no Finanças
--      (`paid_by` / `received_by` preenchido) e cancelamento feito aqui ficam,
--      mesmo com o Bling ainda em aberto. (Levar a baixa para o Bling é a etapa
--      seguinte, com aprovação.)
--   3. Pago no Bling e `pago` aqui SEM ninguém ter dado baixa aqui, e o Bling
--      volta para aberto ⇒ volta para aberto (foi estornado lá).
--   4. Título que SUMIU do Bling (não está no espelho) e está aberto aqui ⇒
--      cancelado, com nota. Só quando o espelho está cheio e rodou bem há
--      menos de 1 h — espelho vazio ou parado não pode "cancelar tudo".
--   5. ⚠️ Só grava quando MUDA: `purchase_payables` está no Realtime e na
--      auditoria; regravar 1.800 linhas iguais a cada 10 min é custo puro.
--   6. `atrasado` deixa de ser gravado (vira `programado`): vencido é CALCULADO
--      pela data, a regra única do Finanças (`estaVencido`).
--   ⚠️ A data de pagamento NÃO vem: nem a listagem nem o detalhe do Bling a
--      trazem (ela mora no BORDERÔ da baixa, outra consulta). Fica nula e a tela
--      diz "no Bling". Pendente.
--
-- Rode em BLOCOS, nesta ordem.
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — desliga a geração de contas a receber pela NF (decisão do dono do
-- processo: "fica no radar, não é para aparecer agora"). Sem isso, cada venda
-- da matriz apareceria DUAS vezes: o título nascido da NF e o do Bling.
-- Idempotente. Espera: 1 linha, sobrou = 0.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.unschedule('fin-receber-da-nf-10min');
exception when others then null; end $$;
update public.fin_receber_config set ativo = false, atualizado_em = now();
delete from public.receivables where source = 'nf';
select count(*) as sobrou from public.receivables where source = 'nf';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — a função. Espera: "Success. No rows returned".
-- ⚠️ `p_ensaio` nasce TRUE: sem argumento ela calcula tudo, DESFAZ e só conta.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fin_bling1_contas_aplicar(p_ensaio boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res        jsonb := '{}'::jsonb;
  v_n          int;
  v_espelho_ok boolean;
  v_pagar_upd  int := 0; v_pagar_ins int := 0; v_pagar_sumiu int := 0; v_pagar_sem_venc int := 0;
  v_rec_upd    int := 0; v_rec_ins   int := 0; v_rec_sumiu   int := 0; v_rec_sem_venc   int := 0;
begin
  -- O espelho está em dia? (rodada boa há < 1 h e com volume) — só aí "sumiu
  -- do Bling" significa alguma coisa.
  v_espelho_ok :=
        exists (select 1 from public.bling_contas_espelho_log
                where ok and rodou_em > now() - interval '1 hour'
                  and resumo ? 'pagar' and resumo ? 'receber')
    and (select count(*) from public.bling_contas_pagar)   >= 100
    and (select count(*) from public.bling_contas_receber) >= 100;

  begin
    -- ── CONTAS A PAGAR ─────────────────────────────────────────────────────
    with b as (
      select bp.bling_id, bp.valor, bp.vencimento, bp.historico, bp.listagem,
             nullif(bp.numero, '') as numero,
             coalesce(nullif(bp.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''),
                      'Fornecedor não identificado') as nome,
             case bp.situacao when '2' then 'pago' when '4' then 'cancelado' when '5' then 'cancelado'
                              else 'programado' end as st
      from public.bling_contas_pagar bp
      left join public.bling_contacts c on c.bling_id = bp.contato_id
    ), novo as (
      select pp.id,
             coalesce(b.valor, pp.amount) as amount,
             coalesce(b.vencimento, pp.due_date) as due_date,
             (case
                when b.st = 'pago' then 'pago'
                when pp.paid_by is not null and pp.status = 'pago' then 'pago'          -- baixa feita AQUI
                when b.st = 'cancelado' then 'cancelado'
                when pp.status = 'cancelado' then 'cancelado'                           -- cancelado AQUI
                else 'programado'
              end)::public.payable_status as status,
             case when pp.supplier_name in ('', 'Fornecedor não identificado')
                  then b.nome else pp.supplier_name end as supplier_name,
             coalesce(b.numero, pp.bling_numero) as bling_numero
      from public.purchase_payables pp
      join b on b.bling_id = pp.bling_id
      where pp.source = 'bling'
    )
    update public.purchase_payables pp
       set amount = n.amount, due_date = n.due_date, status = n.status,
           supplier_name = n.supplier_name, bling_numero = n.bling_numero, updated_at = now()
      from novo n
     where pp.id = n.id
       and (pp.amount, pp.due_date, pp.status, pp.supplier_name, pp.bling_numero)
           is distinct from (n.amount, n.due_date, n.status, n.supplier_name, n.bling_numero);
    get diagnostics v_pagar_upd = row_count;

    insert into public.purchase_payables
      (source, bling_id, bling_numero, supplier_name, amount, due_date, status, currency, notes, bling_raw)
    select 'bling', bp.bling_id, nullif(bp.numero, ''),
           coalesce(nullif(bp.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''), 'Fornecedor não identificado'),
           coalesce(bp.valor, 0), bp.vencimento,
           (case bp.situacao when '2' then 'pago' when '4' then 'cancelado' when '5' then 'cancelado'
                             else 'programado' end)::public.payable_status,
           'BRL', bp.historico, bp.listagem
      from public.bling_contas_pagar bp
      left join public.bling_contacts c on c.bling_id = bp.contato_id
     where bp.vencimento is not null
       and not exists (select 1 from public.purchase_payables pp where pp.bling_id = bp.bling_id)
    on conflict (bling_id) do nothing;
    get diagnostics v_pagar_ins = row_count;

    select count(*) into v_pagar_sem_venc from public.bling_contas_pagar bp
     where bp.vencimento is null
       and not exists (select 1 from public.purchase_payables pp where pp.bling_id = bp.bling_id);

    if v_espelho_ok then
      update public.purchase_payables pp
         set status = 'cancelado',
             notes  = coalesce(pp.notes || ' · ', '') || 'não está mais no Bling 1 (' ||
                      to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')',
             updated_at = now()
       where pp.source = 'bling' and pp.bling_id is not null
         and pp.status in ('programado', 'atrasado')
         and pp.paid_by is null
         and not exists (select 1 from public.bling_contas_pagar b where b.bling_id = pp.bling_id);
      get diagnostics v_pagar_sumiu = row_count;
    end if;

    -- ── CONTAS A RECEBER ───────────────────────────────────────────────────
    with b as (
      select br.bling_id, br.valor, br.vencimento,
             nullif(br.numero, '') as numero,
             coalesce(nullif(br.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''),
                      'Cliente não identificado') as nome,
             br.contato_documento,
             case br.situacao when '2' then 'recebido' when '4' then 'cancelado' when '5' then 'cancelado'
                              else 'programado' end as st
      from public.bling_contas_receber br
      left join public.bling_contacts c on c.bling_id = br.contato_id
    ), novo as (
      select r.id,
             coalesce(b.valor, r.amount) as amount,
             coalesce(b.vencimento, r.due_date) as due_date,
             case
               when b.st = 'recebido' then 'recebido'
               when r.received_by is not null and r.status = 'recebido' then 'recebido'   -- baixa feita AQUI
               when b.st = 'cancelado' then 'cancelado'
               when r.status = 'cancelado' then 'cancelado'                               -- cancelado AQUI
               else 'programado'
             end as status,
             case when r.customer_name is null or r.customer_name in ('', 'Cliente não identificado')
                  then b.nome else r.customer_name end as customer_name,
             coalesce(b.numero, r.bling_numero) as bling_numero,
             coalesce(r.documento, b.contato_documento) as documento
      from public.receivables r
      join b on b.bling_id = r.bling_id
      where r.source = 'bling'
    )
    update public.receivables r
       set amount = n.amount, due_date = n.due_date, status = n.status,
           customer_name = n.customer_name, bling_numero = n.bling_numero,
           documento = n.documento, empresa = 'matriz', updated_at = now()
      from novo n
     where r.id = n.id
       and (r.amount, r.due_date, r.status, r.customer_name, r.bling_numero, r.documento, r.empresa)
           is distinct from (n.amount, n.due_date, n.status, n.customer_name, n.bling_numero, n.documento, 'matriz');
    get diagnostics v_rec_upd = row_count;

    insert into public.receivables
      (source, bling_id, bling_numero, customer_name, amount, currency, due_date, status,
       notes, bling_raw, empresa, documento)
    select 'bling', br.bling_id, nullif(br.numero, ''),
           coalesce(nullif(br.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''), 'Cliente não identificado'),
           coalesce(br.valor, 0), 'BRL', br.vencimento,
           case br.situacao when '2' then 'recebido' when '4' then 'cancelado' when '5' then 'cancelado'
                            else 'programado' end,
           br.historico, br.listagem, 'matriz', br.contato_documento
      from public.bling_contas_receber br
      left join public.bling_contacts c on c.bling_id = br.contato_id
     where br.vencimento is not null
       and not exists (select 1 from public.receivables r where r.bling_id = br.bling_id)
    on conflict (bling_id) where bling_id is not null do nothing;
    get diagnostics v_rec_ins = row_count;

    select count(*) into v_rec_sem_venc from public.bling_contas_receber br
     where br.vencimento is null
       and not exists (select 1 from public.receivables r where r.bling_id = br.bling_id);

    if v_espelho_ok then
      update public.receivables r
         set status = 'cancelado',
             notes  = coalesce(r.notes || ' · ', '') || 'não está mais no Bling 1 (' ||
                      to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')',
             updated_at = now()
       where r.source = 'bling' and r.bling_id is not null
         and r.status = 'programado' and r.received_by is null
         and not exists (select 1 from public.bling_contas_receber b where b.bling_id = r.bling_id);
      get diagnostics v_rec_sumiu = row_count;
    end if;

    v_res := jsonb_build_object(
      'ensaio', p_ensaio,
      'espelho_em_dia', v_espelho_ok,
      'pagar',   jsonb_build_object('atualizados', v_pagar_upd, 'novos', v_pagar_ins,
                                    'sumiram_do_bling', v_pagar_sumiu, 'sem_vencimento', v_pagar_sem_venc),
      'receber', jsonb_build_object('atualizados', v_rec_upd, 'novos', v_rec_ins,
                                    'sumiram_do_bling', v_rec_sumiu, 'sem_vencimento', v_rec_sem_venc));

    -- ⚠️ ENSAIO: tudo acima é DESFEITO. As variáveis sobrevivem ao rollback do
    -- bloco, então a contagem que volta é exatamente a de verdade.
    if p_ensaio then
      raise exception using errcode = 'P0001', message = '__ensaio__';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__ensaio__' then raise; end if;
  end;

  return v_res;
end;
$$;

revoke execute on function public.fin_bling1_contas_aplicar(boolean) from public, anon, authenticated;
grant  execute on function public.fin_bling1_contas_aplicar(boolean) to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — ENSAIO (não grava nada). Espera: um jsonb com as contagens.
-- `espelho_em_dia` tem de vir TRUE; se vier false, `sumiram_do_bling` fica 0
-- (proteção) — rode depois da próxima rodada do espelho.
-- ════════════════════════════════════════════════════════════════════════════
select public.fin_bling1_contas_aplicar();


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — APLICA de verdade e agenda a cada 10 min (minutos 27/37/47/57,
-- 4 min depois do espelho). SQL puro: o `succeeded` do pg_cron SIGNIFICA algo.
-- Espera: o jsonb da rodada e 1 linha do job com active = true.
-- ════════════════════════════════════════════════════════════════════════════
select public.fin_bling1_contas_aplicar(false);

do $$ begin
  perform cron.unschedule('fin-bling1-contas-10min');
exception when others then null; end $$;
select cron.schedule('fin-bling1-contas-10min', '27-59/10 * * * *',
                     'select public.fin_bling1_contas_aplicar(false)');

select jobname, schedule, active from cron.job where jobname = 'fin-bling1-contas-10min';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — a FILIAL (Bling 2) a cada 30 min, não 1×/dia.
-- O espelho `bling2_contas_*` só era relido pelo `bling2-sync-rapido`
-- (`30 11 * * *` = 08:30 de Brasília) — a tela da filial dizia "Última
-- sincronização 08:33" à tarde. Este job chama o MESMO `bling2-auto-sync`,
-- só com as duas fases de contas (a renovação de token é a dele, como sempre).
-- Segredo copiado do job que funciona (molde da `20261036`).
-- Espera: a NOTICE e 1 linha com active = true.
-- ════════════════════════════════════════════════════════════════════════════
do $fix$
declare
  v_secret text;
  v_cmd    text;
  j        bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job
   where jobname = 'bling2-sync-incremental'
   limit 1;

  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental — nao agendei nada.';
  end if;

  for j in select jobid from cron.job where jobname = 'bling2-contas-30min' loop
    perform cron.unschedule(j);
  end loop;

  v_cmd := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb) as request_id;',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
    'Content-Type',  'application/json',
    'X-Cron-Secret', v_secret,
    '{"source":"cron-contas","fases":["contas_pagar","contas_receber"]}'
  );
  perform cron.schedule('bling2-contas-30min', '17,47 * * * *', v_cmd);
  raise notice 'bling2-contas-30min agendado.';
end $fix$;

select jobname, schedule, active from cron.job where jobname = 'bling2-contas-30min';
