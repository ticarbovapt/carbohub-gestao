-- ─────────────────────────────────────────────────────────────────
-- A baixa feita no Finanças VAI para o Bling 1 — e a do Bling volta com a DATA
-- (21/10/2026)
--
-- Pedido do dono do processo: "confirmar no sistema que foi pago refletir no
-- Bling e confirmar no Bling também refletir no sistema".
--
--   Bling → sistema   já existia (20261121 + 20261122): o espelho a cada 10 min
--                     e o aplicador 4 min depois. Faltava a DATA de pagamento,
--                     que mora no BORDERÔ — o espelho passou a lê-lo.
--   sistema → Bling   NOVO: a edge function `bling-contas-baixar`, chamada pela
--                     tela logo depois da baixa local (POST /contas/<tipo>/<id>/
--                     baixar), e o estorno (DELETE /borderos/<id>, só o NOSSO).
--
-- Regras novas no aplicador:
--   1. Pago no Bling sem data aqui ⇒ `paid_at`/`received_at` = a data do
--      borderô (12:00 de Brasília — data pura não pode virar o dia anterior).
--   2. ⚠️ Depois que a baixa daqui chegou ao Bling (`bling_baixa_em`), quem
--      manda é o Bling: se ele voltar a ABERTO numa leitura POSTERIOR ao envio
--      (`visto_em > bling_baixa_em`), alguém estornou lá ⇒ reabre aqui. Antes
--      de chegar ao Bling (envio desligado, ou recusado), a baixa daqui fica,
--      como sempre ficou.
--
-- ⚠️ O envio nasce DESLIGADO (`fin_bling_baixa_config.ativo = false`) e se
-- testa com UM título (`teste_ids`) antes de ligar: escrever dado financeiro
-- noutro sistema só depois de ver o resultado no Bling.
--
-- Rode em BLOCOS, nesta ordem.
-- ─────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════
-- BLOCO 0 (a) — MEDIÇÃO, só leitura. Quantas baixas feitas AQUI ainda estão
-- abertas no Bling — é o que o botão "Enviar ao Bling" vai oferecer depois.
-- Espera: 1 linha por tipo. Zero é possível (ninguém deu baixa aqui ainda).
-- ════════════════════════════════════════════════════════════════
select 'pagar' as tipo, count(*) as baixados_aqui_e_abertos_no_bling, coalesce(sum(pp.amount), 0) as valor
  from public.purchase_payables pp
  join public.bling_contas_pagar b on b.bling_id = pp.bling_id
 where pp.source = 'bling' and pp.status = 'pago' and pp.paid_by is not null
   and b.situacao not in ('2', '4', '5')
union all
select 'receber', count(*), coalesce(sum(r.amount), 0)
  from public.receivables r
  join public.bling_contas_receber b on b.bling_id = r.bling_id
 where r.source = 'bling' and r.status = 'recebido' and r.received_by is not null
   and b.situacao not in ('2', '4', '5');


-- ════════════════════════════════════════════════════════════════
-- BLOCO 0 (b) — MEDIÇÃO, só leitura. O Bling EXIGE conta (portador) e
-- categoria para dar baixa. Quantos títulos ABERTOS não têm um dos dois no
-- detalhe? Esses precisam do PADRÃO no BLOCO 5.
-- Espera: 2 linhas. `sem_portador`/`sem_categoria` > 0 ⇒ preencher o padrão.
-- ════════════════════════════════════════════════════════════════
select 'pagar' as tipo, count(*) as abertos,
       count(*) filter (where coalesce((detalhe->'portador'->>'id')::bigint, 0) = 0)  as sem_portador,
       count(*) filter (where coalesce((detalhe->'categoria'->>'id')::bigint, 0) = 0) as sem_categoria
  from public.bling_contas_pagar where situacao in ('1', '3') and detalhe is not null
union all
select 'receber', count(*),
       count(*) filter (where coalesce((detalhe->'portador'->>'id')::bigint, 0) = 0),
       count(*) filter (where coalesce((detalhe->'categoria'->>'id')::bigint, 0) = 0)
  from public.bling_contas_receber where situacao in ('1', '3') and detalhe is not null;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 0 (c) — MEDIÇÃO, só leitura. Os portadores e categorias que o Bling já
-- usa, com quantos títulos cada — é daqui que sai o padrão do BLOCO 5.
-- Espera: algumas linhas (id, nome quando o detalhe traz, quantos).
-- ════════════════════════════════════════════════════════════════
select 'portador' as o_que, (detalhe->'portador'->>'id') as id,
       max(detalhe->'portador'->>'descricao') as nome, count(*) as titulos
  from (select detalhe from public.bling_contas_pagar union all select detalhe from public.bling_contas_receber) x
 where coalesce((detalhe->'portador'->>'id')::bigint, 0) <> 0
 group by 2
union all
select 'categoria', (detalhe->'categoria'->>'id'),
       max(detalhe->'categoria'->>'descricao'), count(*)
  from (select detalhe from public.bling_contas_pagar union all select detalhe from public.bling_contas_receber) x
 where coalesce((detalhe->'categoria'->>'id')::bigint, 0) <> 0
 group by 2
order by 1, 4 desc;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 1 — colunas, o interruptor e o espelho com `visto_em`.
-- Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════
alter table public.purchase_payables
  add column if not exists bling_baixa_em          timestamptz,   -- a baixa daqui chegou ao Bling (ou ele já estava pago)
  add column if not exists bling_baixa_bordero     bigint,        -- o borderô que NÓS criamos (só ele se desfaz daqui)
  add column if not exists bling_baixa_erro        text,          -- a recusa do Bling, para a tela mostrar
  add column if not exists bling_baixa_tentando_em timestamptz;   -- trava: um envio por vez por título
alter table public.receivables
  add column if not exists bling_baixa_em          timestamptz,
  add column if not exists bling_baixa_bordero     bigint,
  add column if not exists bling_baixa_erro        text,
  add column if not exists bling_baixa_tentando_em timestamptz;

create table if not exists public.fin_bling_baixa_config (
  id                  boolean primary key default true check (id),
  ativo               boolean not null default false,          -- ⚠️ nasce DESLIGADO
  teste_ids           uuid[]  not null default '{}',           -- títulos liberados UM A UM, para o teste
  portador_padrao_id  bigint,                                  -- quando o título do Bling não tem conta
  categoria_padrao_id bigint,                                  -- idem, categoria
  atualizado_em       timestamptz not null default now()
);
insert into public.fin_bling_baixa_config (id) values (true) on conflict (id) do nothing;

-- Leitura: quem tem o Finanças (a tela decide o texto e os botões por ela).
-- Escrita: NENHUMA policy — liga e desliga pelo SQL Editor, de propósito.
alter table public.fin_bling_baixa_config enable row level security;
drop policy if exists fin_bling_baixa_config_financas_le on public.fin_bling_baixa_config;
create policy fin_bling_baixa_config_financas_le on public.fin_bling_baixa_config
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));


-- ════════════════════════════════════════════════════════════════
-- BLOCO 2 — o aplicador, com a DATA do borderô e o estorno feito no Bling.
-- Mesma função da 20261122 (mesma assinatura, mesmo ensaio), com as duas regras
-- do cabeçalho. Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════
create or replace function public.fin_bling1_contas_aplicar(p_ensaio boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res        jsonb := '{}'::jsonb;
  v_espelho_ok boolean;
  v_pagar_upd  int := 0; v_pagar_ins int := 0; v_pagar_sumiu int := 0; v_pagar_sem_venc int := 0;
  v_rec_upd    int := 0; v_rec_ins   int := 0; v_rec_sumiu   int := 0; v_rec_sem_venc   int := 0;
  v_pagar_estornados int := 0; v_rec_estornados int := 0;
begin
  v_espelho_ok :=
        exists (select 1 from public.bling_contas_espelho_log
                where ok and rodou_em > now() - interval '1 hour'
                  and resumo ? 'pagar' and resumo ? 'receber')
    and (select count(*) from public.bling_contas_pagar)   >= 100
    and (select count(*) from public.bling_contas_receber) >= 100;

  begin
    -- ── CONTAS A PAGAR ─────────────────────────────────────────────────────
    with b as (
      select bp.bling_id, bp.valor, bp.vencimento, bp.visto_em,
             -- data pura ⇒ meio-dia de Brasília (nunca vira o dia anterior)
             case when bp.data_pagamento is not null
                  then (bp.data_pagamento::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo' end as pago_em,
             nullif(bp.numero, '') as numero,
             coalesce(nullif(bp.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''),
                      'Fornecedor não identificado') as nome,
             case bp.situacao when '2' then 'pago' when '4' then 'cancelado' when '5' then 'cancelado'
                              else 'programado' end as st
      from public.bling_contas_pagar bp
      left join public.bling_contacts c on c.bling_id = bp.contato_id
    ), base as (
      select pp.*, b.valor as b_valor, b.vencimento as b_venc, b.pago_em as b_pago_em,
             b.numero as b_numero, b.nome as b_nome, b.st as b_st,
             -- ⚠️ a baixa daqui chegou ao Bling e o Bling, lido DEPOIS, diz aberto
             coalesce(pp.bling_baixa_em is not null and b.st = 'programado'
                      and b.visto_em > pp.bling_baixa_em, false) as estornado_la
      from public.purchase_payables pp
      join b on b.bling_id = pp.bling_id
      where pp.source = 'bling'
    ), st as (
      select x.*,
             (case
                when x.b_st = 'pago' then 'pago'
                when x.estornado_la then 'programado'
                when x.paid_by is not null and x.status = 'pago' then 'pago'          -- baixa feita AQUI
                when x.b_st = 'cancelado' then 'cancelado'
                when x.status = 'cancelado' then 'cancelado'                          -- cancelado AQUI
                else 'programado'
              end)::public.payable_status as st_novo
      from base x
    ), novo as (
      select s.id,
             coalesce(s.b_valor, s.amount) as amount,
             coalesce(s.b_venc, s.due_date) as due_date,
             s.st_novo as status,
             case when s.supplier_name in ('', 'Fornecedor não identificado')
                  then s.b_nome else s.supplier_name end as supplier_name,
             coalesce(s.b_numero, s.bling_numero) as bling_numero,
             case when s.st_novo = 'pago' and not s.estornado_la
                  then coalesce(s.paid_at, s.b_pago_em) end as paid_at,
             case when s.estornado_la then null else s.paid_by end as paid_by,
             case when s.estornado_la then null else s.bling_baixa_em end as bling_baixa_em,
             case when s.estornado_la then null else s.bling_baixa_bordero end as bling_baixa_bordero,
             s.estornado_la
      from st s
    )
    , upd as (
    update public.purchase_payables pp
       set amount = n.amount, due_date = n.due_date, status = n.status,
           supplier_name = n.supplier_name, bling_numero = n.bling_numero,
           paid_at = n.paid_at, paid_by = n.paid_by,
           bling_baixa_em = n.bling_baixa_em, bling_baixa_bordero = n.bling_baixa_bordero,
           notes = case when n.estornado_la
                        then coalesce(pp.notes || ' · ', '') || 'baixa estornada no Bling (' ||
                             to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')'
                        else pp.notes end,
           updated_at = now()
      from novo n
     where pp.id = n.id
       and (pp.amount, pp.due_date, pp.status, pp.supplier_name, pp.bling_numero,
            pp.paid_at, pp.paid_by, pp.bling_baixa_em, pp.bling_baixa_bordero)
           is distinct from
           (n.amount, n.due_date, n.status, n.supplier_name, n.bling_numero,
            n.paid_at, n.paid_by, n.bling_baixa_em, n.bling_baixa_bordero)
    returning n.estornado_la
    )
    select count(*), count(*) filter (where estornado_la) into v_pagar_upd, v_pagar_estornados from upd;

    insert into public.purchase_payables
      (source, bling_id, bling_numero, supplier_name, amount, due_date, status, paid_at, currency, notes, bling_raw)
    select 'bling', bp.bling_id, nullif(bp.numero, ''),
           coalesce(nullif(bp.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''), 'Fornecedor não identificado'),
           coalesce(bp.valor, 0), bp.vencimento,
           (case bp.situacao when '2' then 'pago' when '4' then 'cancelado' when '5' then 'cancelado'
                             else 'programado' end)::public.payable_status,
           case when bp.situacao = '2' and bp.data_pagamento is not null
                then (bp.data_pagamento::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo' end,
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
      select br.bling_id, br.valor, br.vencimento, br.visto_em,
             case when br.data_pagamento is not null
                  then (br.data_pagamento::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo' end as pago_em,
             nullif(br.numero, '') as numero,
             coalesce(nullif(br.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''),
                      'Cliente não identificado') as nome,
             br.contato_documento,
             case br.situacao when '2' then 'recebido' when '4' then 'cancelado' when '5' then 'cancelado'
                              else 'programado' end as st
      from public.bling_contas_receber br
      left join public.bling_contacts c on c.bling_id = br.contato_id
    ), base as (
      select r.*, b.valor as b_valor, b.vencimento as b_venc, b.pago_em as b_pago_em,
             b.numero as b_numero, b.nome as b_nome, b.st as b_st, b.contato_documento as b_doc,
             coalesce(r.bling_baixa_em is not null and b.st = 'programado'
                      and b.visto_em > r.bling_baixa_em, false) as estornado_la
      from public.receivables r
      join b on b.bling_id = r.bling_id
      where r.source = 'bling'
    ), st as (
      select x.*,
             case
               when x.b_st = 'recebido' then 'recebido'
               when x.estornado_la then 'programado'
               when x.received_by is not null and x.status = 'recebido' then 'recebido'   -- baixa feita AQUI
               when x.b_st = 'cancelado' then 'cancelado'
               when x.status = 'cancelado' then 'cancelado'                               -- cancelado AQUI
               else 'programado'
             end as st_novo
      from base x
    ), novo as (
      select s.id,
             coalesce(s.b_valor, s.amount) as amount,
             coalesce(s.b_venc, s.due_date) as due_date,
             s.st_novo as status,
             case when s.customer_name is null or s.customer_name in ('', 'Cliente não identificado')
                  then s.b_nome else s.customer_name end as customer_name,
             coalesce(s.b_numero, s.bling_numero) as bling_numero,
             coalesce(s.documento, s.b_doc) as documento,
             case when s.st_novo = 'recebido' and not s.estornado_la
                  then coalesce(s.received_at, s.b_pago_em) end as received_at,
             case when s.estornado_la then null else s.received_by end as received_by,
             case when s.st_novo = 'recebido' and not s.estornado_la
                  then coalesce(s.recebido_via, case when s.received_by is null then 'bling' end) end as recebido_via,
             case when s.estornado_la then null else s.bling_baixa_em end as bling_baixa_em,
             case when s.estornado_la then null else s.bling_baixa_bordero end as bling_baixa_bordero,
             s.estornado_la
      from st s
    )
    , upd as (
    update public.receivables r
       set amount = n.amount, due_date = n.due_date, status = n.status,
           customer_name = n.customer_name, bling_numero = n.bling_numero,
           documento = n.documento, empresa = 'matriz',
           received_at = n.received_at, received_by = n.received_by, recebido_via = n.recebido_via,
           bling_baixa_em = n.bling_baixa_em, bling_baixa_bordero = n.bling_baixa_bordero,
           notes = case when n.estornado_la
                        then coalesce(r.notes || ' · ', '') || 'baixa estornada no Bling (' ||
                             to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')'
                        else r.notes end,
           updated_at = now()
      from novo n
     where r.id = n.id
       and (r.amount, r.due_date, r.status, r.customer_name, r.bling_numero, r.documento, r.empresa,
            r.received_at, r.received_by, r.recebido_via, r.bling_baixa_em, r.bling_baixa_bordero)
           is distinct from
           (n.amount, n.due_date, n.status, n.customer_name, n.bling_numero, n.documento, 'matriz',
            n.received_at, n.received_by, n.recebido_via, n.bling_baixa_em, n.bling_baixa_bordero)
    returning n.estornado_la
    )
    select count(*), count(*) filter (where estornado_la) into v_rec_upd, v_rec_estornados from upd;

    insert into public.receivables
      (source, bling_id, bling_numero, customer_name, amount, currency, due_date, status, received_at, recebido_via,
       notes, bling_raw, empresa, documento)
    select 'bling', br.bling_id, nullif(br.numero, ''),
           coalesce(nullif(br.contato_nome, ''), nullif(c.nome, ''), nullif(c.fantasia, ''), 'Cliente não identificado'),
           coalesce(br.valor, 0), 'BRL', br.vencimento,
           case br.situacao when '2' then 'recebido' when '4' then 'cancelado' when '5' then 'cancelado'
                            else 'programado' end,
           case when br.situacao = '2' and br.data_pagamento is not null
                then (br.data_pagamento::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo' end,
           case when br.situacao = '2' then 'bling' end,
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
                                    'sumiram_do_bling', v_pagar_sumiu, 'sem_vencimento', v_pagar_sem_venc,
                                    'estornados_no_bling', v_pagar_estornados),
      'receber', jsonb_build_object('atualizados', v_rec_upd, 'novos', v_rec_ins,
                                    'sumiram_do_bling', v_rec_sumiu, 'sem_vencimento', v_rec_sem_venc,
                                    'estornados_no_bling', v_rec_estornados));

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


-- ════════════════════════════════════════════════════════════════
-- BLOCO 3 — ENSAIO (não grava nada). Espera: o jsonb da 20261122 com
-- `estornados_no_bling` = 0 (nada foi enviado ao Bling ainda).
-- `atualizados` alto nesta 1ª vez é ESPERADO só se o espelho já tiver lido
-- datas de borderô (rode de novo depois de 1–2 rodadas do espelho).
-- ════════════════════════════════════════════════════════════════
select public.fin_bling1_contas_aplicar();


-- ════════════════════════════════════════════════════════════════
-- BLOCO 4 — o TESTE com UM título, antes de ligar. ⚠️ EDITE antes de rodar:
-- troque o NULL pelo id (uuid) de um título do Bling que FOI PAGO DE VERDADE e
-- ainda está aberto no Bling (abra o título na tela e copie o id da URL / do
-- detalhe). Sem editar, o bloco RECUSA rodar.
-- Depois: dê a baixa desse título na tela do Finanças e confira no Bling.
-- ════════════════════════════════════════════════════════════════
do $$
declare v_id uuid := null;   -- ⚠️ TROQUE pelo id do título de teste
begin
  if v_id is null then
    raise exception 'Escolha o título de teste: troque o NULL de v_id pelo id dele. Nada foi gravado.';
  end if;
  if not exists (select 1 from public.purchase_payables where id = v_id and source = 'bling')
     and not exists (select 1 from public.receivables where id = v_id and source = 'bling') then
    raise exception 'O id % não é de um título vindo do Bling. Nada foi gravado.', v_id;
  end if;
  update public.fin_bling_baixa_config
     set teste_ids = array(select distinct unnest(teste_ids || v_id)), atualizado_em = now();
  raise notice 'Título % liberado para o teste. Dê a baixa dele na tela.', v_id;
end $$;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 5 — CONFERÊNCIA do teste (só leitura). Espera: 1 linha com
-- bling_baixa_em preenchido, bling_baixa_bordero com um número e
-- bling_baixa_erro NULO. Erro preenchido = o motivo do Bling, em texto.
-- ════════════════════════════════════════════════════════════════
select 'pagar' as tipo, id, supplier_name as nome, amount, status::text as status, bling_baixa_em, bling_baixa_bordero, bling_baixa_erro
  from public.purchase_payables where id in (select unnest(teste_ids) from public.fin_bling_baixa_config)
union all
select 'receber', id, customer_name, amount, status, bling_baixa_em, bling_baixa_bordero, bling_baixa_erro
  from public.receivables where id in (select unnest(teste_ids) from public.fin_bling_baixa_config);


-- ════════════════════════════════════════════════════════════════
-- BLOCO 6 — LIGAR para todos (só depois de o teste conferir no Bling).
-- Se o BLOCO 0 (b) mostrou títulos sem portador/categoria, preencha os dois
-- padrões com ids do BLOCO 0 (c); senão deixe NULL (o do título vale).
-- Espera: 1 linha com ativo = true.
-- ════════════════════════════════════════════════════════════════
update public.fin_bling_baixa_config
   set ativo = true,
       -- portador_padrao_id  = <id>,
       -- categoria_padrao_id = <id>,
       atualizado_em = now();
select ativo, teste_ids, portador_padrao_id, categoria_padrao_id from public.fin_bling_baixa_config;
