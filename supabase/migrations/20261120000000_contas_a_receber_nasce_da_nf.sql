-- ─────────────────────────────────────────────────────────────────────────────
-- Contas a receber NASCE da NF de venda — e fica pronta para o banco dar baixa
-- (21/10/2026)
--
-- Pedido do dono do processo: "quando é faturado (emitido a NF) já gera o contas
-- a receber ali, então aproveitaríamos a emissão que já funciona … de acordo com
-- o prazo/parcelas … e pronto para quando o banco mandar as coisas da integração".
--
-- Como é HOJE (medido): `receivables` da matriz está VAZIA. O time cadastra a
-- conta a receber no Bling, olha no internet banking se o boleto foi pago e
-- marca "recebido" à mão no Bling. Nada disso chega ao sistema.
--
-- O que esta migração faz:
--   1. `carbo_prazos_do_texto(text)` — o MESMO parser de `apps/financas/src/lib/
--      parcelas.ts` (prazo → dias). Mudou um, mude o outro.
--   2. `fin_receber_gerar_da_nf(p_ensaio)` — cron de 10 min, SQL puro,
--      idempotente: pedido com NF de VENDA válida (matriz ou filial) ou NFS-e
--      autorizada (CarboVAPT) ganha UM título por parcela, `source = 'nf'`.
--      Pedido cancelado / NF que deixou de valer cancela o que ainda está aberto.
--   3. A FUNDAÇÃO do banco: `fin_contas_bancarias`, `fin_banco_eventos` (o CRU,
--      append-only, chave de idempotência) e `fin_banco_conciliar()`, que dá
--      baixa por IDENTIDADE (nosso número, linha digitável, txid) — nunca por
--      valor + data. Fica parada até existir a primeira integração.
--   4. A filial (Bling 2) passa a ser LIDA por quem tem o app Finanças.
--
-- ⚠️ MARCO ZERO: só NF emitida a partir de `fin_receber_config.gerar_a_partir_de`
-- (nasce = HOJE). Sem ele a primeira rodada criaria título para a história
-- inteira — boletos já pagos no banco aparecendo como "vencido" no Finanças. É a
-- lição do `carbo_carrinho_config.inicio_em` e do `deduz_a_partir_de`.
--
-- ⚠️ Prazo que o parser não reconhece NÃO vira título com data inventada: o
-- pedido sai na lista `sem_prazo` do retorno e na tela "Gerar de pedidos
-- faturados", que pede o vencimento. Ausência vira lista de trabalho.
--
-- Rode em BLOCOS, nesta ordem. O SQL Editor mostra só o resultado da ÚLTIMA
-- consulta de cada bloco.
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — o parser do prazo (função pura; não toca em dado nenhum)
-- Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.carbo_prazos_do_texto(p_texto text)
returns int[]
language plpgsql immutable
set search_path = public
as $$
declare
  t      text;
  m      text;
  n      int;
  par    text;
  fora   text;
  miolo  text;
  partes text[];
  dias   int[] := '{}';
  p      text;
  i      int;
begin
  t := lower(translate(coalesce(p_texto, ''),
         'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
         'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if t = '' then return null; end if;

  -- À vista: vence na data-base.
  if t ~ '\mdebito\M' or t ~ '\mpix\M' or t ~ '\ma ?vista\M' or t ~ '\mdinheiro\M' then
    return array[0];
  end if;

  -- Cartão de crédito em N vezes: uma parcela a cada 30 dias, a primeira em 30.
  m := substring(t from '\m(\d{1,2}) ?x\M');
  if m is not null then
    n := m::int;
    if n < 1 or n > 24 then return null; end if;
    return array(select 30 * g from generate_series(1, n) g);
  end if;

  -- Lista de dias: "(30/60)", "(30\60)", "(30 60)", "(30/60 dias)", "30/60/90".
  par := substring(t from '\(([^)]*)\)');
  if par is not null then
    fora := btrim(regexp_replace(regexp_replace(t, '\([^)]*\)', ' '),
                                 '\m(boleto|bancario|faturado|prazo)\M', ' ', 'g'));
    if fora <> '' then return null; end if;   -- texto desconhecido fora dos parênteses
    miolo := par;
  else
    miolo := regexp_replace(t, '\m(boleto|bancario|faturado|prazo)\M', ' ', 'g');
  end if;
  miolo := regexp_replace(miolo, '(\d) ?(dias|dia|ddl|dd|d)\M', '\1 ', 'g');
  miolo := btrim(regexp_replace(miolo, '\m(dias|dia|ddl|dd|d)\M', ' ', 'g'));
  if miolo = '' then return null; end if;

  partes := regexp_split_to_array(miolo, '[\s/\\,;-]+');
  foreach p in array partes loop
    if p = '' then continue; end if;
    if p !~ '^\d{1,3}$' then return null; end if;
    dias := dias || p::int;
  end loop;
  if coalesce(array_length(dias, 1), 0) = 0 then return null; end if;
  -- Prazos têm de CRESCER: "(60/30)" ou "(30/30)" não tem leitura segura.
  for i in 2 .. array_length(dias, 1) loop
    if dias[i] <= dias[i - 1] then return null; end if;
  end loop;
  if exists (select 1 from unnest(dias) d where d > 365) then return null; end if;
  return dias;
end;
$$;

comment on function public.carbo_prazos_do_texto(text) is
  'Prazo de pagamento do /vender (texto livre) → dias a partir da data-base. NULL = não reconhecido (nunca um palpite). Espelho de apps/financas/src/lib/parcelas.ts.';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — conferência do parser (só leitura)
-- Espera: 14 linhas e a coluna `confere` TRUE em TODAS. Uma `false` é o parser
-- daqui discordando do da tela: não siga, me mande o resultado.
-- ════════════════════════════════════════════════════════════════════════════
select texto, public.carbo_prazos_do_texto(texto) as dias, esperado,
       public.carbo_prazos_do_texto(texto) is not distinct from esperado as confere
from (values
  ('Boleto faturado (30/60)',            array[30,60]),
  ('Boleto faturado (30\60)',            array[30,60]),
  ('Boleto faturado (30 60)',            array[30,60]),
  ('Boleto faturado (30/60 dias)',       array[30,60]),
  ('Boleto faturado (45/60/90)',         array[45,60,90]),
  ('Boleto faturado (30/60/90/120/150)', array[30,60,90,120,150]),
  ('Boleto faturado (33)',               array[33]),
  ('Cartão de crédito 3x',               array[30,60,90]),
  ('Cartão de crédito 1x',               array[30]),
  ('PIX',                                array[0]),
  ('Boleto à vista',                     array[0]),
  ('Cartão de débito',                   array[0]),
  ('Boleto faturado (60/30)',            null::int[]),
  ('texto qualquer',                     null::int[])
) v(texto, esperado);


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — MEDIÇÃO (só leitura): o que teria nascido nos últimos 30 dias
-- Uma linha por empresa × "prazo reconhecido?". Serve para decidir se o marco
-- zero fica HOJE (padrão) ou volta alguns dias.
-- ⚠️ `sem_prazo` alto = muito pedido sem prazo legível (ex.: importado do
-- Bling, `payment_terms` nulo) — eles NÃO viram título sozinhos; vão para a
-- lista de trabalho da tela.
-- ════════════════════════════════════════════════════════════════════════════
with nf as (
  select o.id, o.order_number, o.payment_terms, o.segmento,
         case when public.carbo_nf_valida(n.situacao) then 'matriz'
              when public.bling2_nf_e_valida(n2.situacao) then 'filial' end as empresa,
         coalesce(case when public.carbo_nf_valida(n.situacao) then n.valor_total end,
                  case when public.bling2_nf_e_valida(n2.situacao) then n2.valor_total end,
                  o.total) as valor,
         coalesce(case when public.carbo_nf_valida(n.situacao) then n.data_emissao end,
                  case when public.bling2_nf_e_valida(n2.situacao) then n2.data_emissao end) as emissao
  from public.carbo_vendas_metrica o
  left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
  left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id
  where o.status not in ('quote','cancelled')
    and not o.e_bonificacao and not o.sem_faturamento
    and (public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao))
    and o.segmento is distinct from 'online'
)
select empresa,
       public.carbo_prazos_do_texto(payment_terms) is not null as prazo_reconhecido,
       count(*) as pedidos, round(sum(valor), 2) as valor,
       min(emissao) as de, max(emissao) as ate
from nf
where emissao >= (now() at time zone 'America/Sao_Paulo')::date - 30
group by 1, 2
order by 1, 2 desc;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — estrutura (colunas, cadastro, fundação do banco, permissões)
-- Espera: "Success. No rows returned". Não cria título nenhum.
-- ════════════════════════════════════════════════════════════════════════════

-- 4.1 Colunas novas em receivables. ⚠️ `add column if not exists`: a produção
-- não é o repositório.
alter table public.receivables
  add column if not exists parcela           int,
  add column if not exists parcelas_total    int,
  add column if not exists empresa           text,
  add column if not exists order_number      text,
  add column if not exists nf_numero         text,
  add column if not exists documento         text,
  add column if not exists conta_bancaria_id uuid,
  add column if not exists nosso_numero      text,
  add column if not exists linha_digitavel   text,
  add column if not exists txid              text,
  add column if not exists valor_recebido    numeric(14,2),
  add column if not exists recebido_via      text;

comment on column public.receivables.empresa is 'matriz | filial — qual CNPJ emitiu a nota.';
comment on column public.receivables.recebido_via is 'manual (alguém clicou) | banco (fin_banco_conciliar, por identidade).';

-- ⚠️ A trava contra título em dobro mora no BANCO: duas rodadas do cron (ou o
-- cron e o botão da tela) não criam a mesma parcela duas vezes. Cancelado sai
-- do índice — é o que deixa um pedido re-faturado com NF nova ganhar títulos
-- novos.
create unique index if not exists receivables_nf_parcela_uq
  on public.receivables (order_id, parcela)
  where source = 'nf' and status <> 'cancelado';
create index if not exists receivables_order_id_idx on public.receivables (order_id);

-- 4.2 O marco zero (CADASTRO, uma linha).
create table if not exists public.fin_receber_config (
  id                 boolean primary key default true check (id),
  gerar_a_partir_de  date not null,
  ativo              boolean not null default true,
  atualizado_em      timestamptz not null default now()
);
insert into public.fin_receber_config (id, gerar_a_partir_de)
values (true, (now() at time zone 'America/Sao_Paulo')::date)
on conflict (id) do nothing;
alter table public.fin_receber_config enable row level security;
drop policy if exists fin_receber_config_le on public.fin_receber_config;
create policy fin_receber_config_le on public.fin_receber_config
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

-- 4.3 Contas bancárias da empresa (CADASTRO).
create table if not exists public.fin_contas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null check (empresa in ('matriz','filial')),
  banco_codigo  text not null,          -- COMPE, 3 dígitos
  banco_nome    text,
  agencia       text not null,
  conta         text not null,
  apelido       text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (banco_codigo, agencia, conta)
);
alter table public.fin_contas_bancarias enable row level security;
drop policy if exists fin_contas_bancarias_le on public.fin_contas_bancarias;
create policy fin_contas_bancarias_le on public.fin_contas_bancarias
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

do $$ begin
  alter table public.receivables
    add constraint receivables_conta_bancaria_fk
    foreign key (conta_bancaria_id) references public.fin_contas_bancarias(id);
exception when duplicate_object then null; end $$;

-- ⚠️ Identidade do boleto/Pix é ÚNICA — é ela que a baixa automática usa.
create unique index if not exists receivables_nosso_numero_uq
  on public.receivables (conta_bancaria_id, nosso_numero)
  where nosso_numero is not null and status <> 'cancelado';
create unique index if not exists receivables_linha_digitavel_uq
  on public.receivables (linha_digitavel)
  where linha_digitavel is not null and status <> 'cancelado';
create unique index if not exists receivables_txid_uq
  on public.receivables (txid)
  where txid is not null and status <> 'cancelado';

-- 4.4 O CRU do banco: tudo o que a integração mandar entra aqui ANTES de ser
-- interpretado (molde do `payt_eventos`). Append-only: nenhuma policy de
-- escrita — quem grava é a service role (a edge function da integração).
create table if not exists public.fin_banco_eventos (
  id                  uuid primary key default gen_random_uuid(),
  conta_bancaria_id   uuid references public.fin_contas_bancarias(id),
  origem              text not null check (origem in ('api','webhook','cnab','ofx','manual')),
  tipo                text not null,     -- liquidacao | credito | debito | tarifa | outro
  chave_idempotencia  text not null unique,
  nosso_numero        text,
  linha_digitavel     text,
  txid                text,
  e2e_id              text,
  documento_pagador   text,
  valor               numeric(14,2),
  data_evento         date,
  cru                 jsonb not null default '{}'::jsonb,
  recebido_em         timestamptz not null default now(),
  receivable_id       uuid references public.receivables(id),
  conciliado_em       timestamptz,
  conciliacao_nota    text
);
create index if not exists fin_banco_eventos_pendentes_idx
  on public.fin_banco_eventos (recebido_em) where receivable_id is null;
create index if not exists fin_banco_eventos_receivable_idx on public.fin_banco_eventos (receivable_id);
alter table public.fin_banco_eventos enable row level security;
drop policy if exists fin_banco_eventos_le on public.fin_banco_eventos;
create policy fin_banco_eventos_le on public.fin_banco_eventos
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

-- 4.5 A filial (Bling 2) passa a ser LIDA por quem tem o Finanças — SOMADA à
-- regra antiga (admin/CEO/gestor), que continua. Policies de SELECT somam com OR.
drop policy if exists bling2_contas_receber_financas_le on public.bling2_contas_receber;
create policy bling2_contas_receber_financas_le on public.bling2_contas_receber
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));
drop policy if exists bling2_contas_pagar_financas_le on public.bling2_contas_pagar;
create policy bling2_contas_pagar_financas_le on public.bling2_contas_pagar
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));


-- 4.6 O GERADOR. ⚠️ `p_ensaio` nasce TRUE: chamar sem argumento só mostra o
-- que faria. Quem grava é o cron, que passa `false`.
create or replace function public.fin_receber_gerar_da_nf(p_ensaio boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg        record;
  v_ped        record;
  v_dias       int[];
  v_n          int;
  v_cent       bigint;
  v_cada       bigint;
  v_sobra      bigint;
  v_i          int;
  v_criados    int := 0;
  v_pedidos    int := 0;
  v_cancel     int := 0;
  v_sem_prazo  jsonb := '[]'::jsonb;
  v_novos      jsonb := '[]'::jsonb;
  v_ins        int;
begin
  select * into v_cfg from public.fin_receber_config where id;
  if v_cfg is null or not v_cfg.ativo then
    return jsonb_build_object('ativo', false);
  end if;

  for v_ped in
    with venda as (
      -- NF de venda pelo Bling (matriz ou filial).
      select o.id, o.order_number, o.customer_name, o.cnpj, o.payment_terms,
             case when public.carbo_nf_valida(n.situacao) then 'matriz' else 'filial' end as empresa,
             coalesce(case when public.carbo_nf_valida(n.situacao) then n.valor_total end,
                      case when public.bling2_nf_e_valida(n2.situacao) then n2.valor_total end,
                      o.total) as valor,
             coalesce(case when public.carbo_nf_valida(n.situacao) then n.data_emissao end,
                      case when public.bling2_nf_e_valida(n2.situacao) then n2.data_emissao end) as base,
             coalesce(case when public.carbo_nf_valida(n.situacao) then n.numero end,
                      case when public.bling2_nf_e_valida(n2.situacao) then n2.numero end) as nf_numero
      from public.carbo_vendas_metrica o
      left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
      left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id
      where o.status not in ('quote','cancelled')
        and not o.e_bonificacao and not o.sem_faturamento
        and (public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao))
        -- ⚠️ Venda on-line é paga NA PLATAFORMA: não há boleto a receber.
        and o.segmento is distinct from 'online'
      union all
      -- NFS-e do CarboVAPT (Portal Nacional), só PRODUÇÃO e só autorizada.
      select o.id, o.order_number, o.customer_name, o.cnpj, o.payment_terms,
             'matriz', e.valor, (e.concluido_em at time zone 'America/Sao_Paulo')::date, e.n_nfse
      from public.carbo_nfse_emissoes e
      join public.carboze_orders o on o.id = e.order_id
      where e.ambiente = 1 and e.status = 'autorizada'
        and o.status not in ('quote','cancelled')
    )
    select v.* from venda v
    where v.base >= v_cfg.gerar_a_partir_de
      and coalesce(v.valor, 0) > 0
      -- Pedido que já tem título vivo (gerado aqui, à mão ou de antes) não ganha outro.
      and not exists (select 1 from public.receivables r
                      where r.order_id = v.id and r.status <> 'cancelado')
    order by v.base, v.id
  loop
    v_dias := public.carbo_prazos_do_texto(v_ped.payment_terms);
    if v_dias is null then
      v_sem_prazo := v_sem_prazo || jsonb_build_object(
        'pedido', v_ped.order_number, 'prazo', v_ped.payment_terms,
        'valor', v_ped.valor, 'nf', v_ped.nf_numero, 'emissao', v_ped.base);
      continue;
    end if;

    v_pedidos := v_pedidos + 1;
    v_n    := array_length(v_dias, 1);
    v_cent := round(v_ped.valor * 100);
    v_cada := v_cent / v_n;
    v_sobra := v_cent - v_cada * v_n;

    for v_i in 1 .. v_n loop
      if p_ensaio then
        v_novos := v_novos || jsonb_build_object(
          'pedido', v_ped.order_number, 'parcela', v_i || '/' || v_n,
          'vencimento', v_ped.base + v_dias[v_i],
          'valor', round((v_cada + case when v_i = v_n then v_sobra else 0 end) / 100.0, 2),
          'empresa', v_ped.empresa);
        v_criados := v_criados + 1;
      else
        insert into public.receivables
          (source, customer_name, order_id, order_number, amount, currency, due_date, status,
           notes, parcela, parcelas_total, empresa, nf_numero, documento)
        values
          ('nf', v_ped.customer_name, v_ped.id, v_ped.order_number,
           (v_cada + case when v_i = v_n then v_sobra else 0 end) / 100.0, 'BRL',
           v_ped.base + v_dias[v_i], 'programado',
           'Parcela ' || v_i || '/' || v_n || ' · ' || coalesce(v_ped.order_number, '') ||
             coalesce(' · NF ' || v_ped.nf_numero, ''),
           v_i, v_n, v_ped.empresa, v_ped.nf_numero,
           nullif(regexp_replace(coalesce(v_ped.cnpj, ''), '\D', '', 'g'), ''))
        on conflict (order_id, parcela) where source = 'nf' and status <> 'cancelado'
        do nothing;
        get diagnostics v_ins = row_count;
        v_criados := v_criados + v_ins;
      end if;
    end loop;
  end loop;

  -- Pedido cancelado, ou cuja NF de venda deixou de valer: o que ainda está
  -- ABERTO sai. ⚠️ Recebido nunca é tocado — dinheiro que entrou é fato.
  if not p_ensaio then
    update public.receivables r
       set status = 'cancelado',
           notes  = coalesce(r.notes, '') || ' · cancelado automaticamente: ' ||
                    case when o.status = 'cancelled' then 'pedido cancelado' else 'NF deixou de valer' end,
           updated_at = now()
      from public.carbo_vendas_metrica o
     where r.source = 'nf' and r.status = 'programado'
       and o.id = r.order_id
       and (o.status = 'cancelled'
            or (o.nf_invalida and not exists (
                  select 1 from public.carbo_nfse_emissoes e
                  where e.order_id = o.id and e.ambiente = 1 and e.status = 'autorizada')));
    get diagnostics v_cancel = row_count;
  end if;

  return jsonb_build_object(
    'ensaio', p_ensaio,
    'marco_zero', v_cfg.gerar_a_partir_de,
    'pedidos', v_pedidos,
    'titulos', v_criados,
    'cancelados', v_cancel,
    'sem_prazo', v_sem_prazo,
    'novos', case when p_ensaio then v_novos else null end);
end;
$$;

-- ⚠️ SECURITY DEFINER nova nasce executável por `anon` (default privileges do
-- Supabase). Só o cron (postgres) e a service role chamam.
revoke execute on function public.fin_receber_gerar_da_nf(boolean) from public, anon, authenticated;
grant  execute on function public.fin_receber_gerar_da_nf(boolean) to service_role;


-- 4.7 A BAIXA PELO BANCO — por IDENTIDADE, e só quando o casamento é ÚNICO.
-- Parada até a primeira integração gravar em `fin_banco_eventos`.
create or replace function public.fin_banco_conciliar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_alvo   uuid;
  v_qtd    int;
  v_ok     int := 0;
  v_sem    int := 0;
  v_amb    int := 0;
begin
  for e in
    select * from public.fin_banco_eventos
    where receivable_id is null and tipo = 'liquidacao'
    order by recebido_em
    for update skip locked
  loop
    select count(*), min(r.id::text)::uuid into v_qtd, v_alvo
    from public.receivables r
    where r.status <> 'cancelado'
      and (   (e.nosso_numero is not null and r.nosso_numero = e.nosso_numero
               and (e.conta_bancaria_id is null or r.conta_bancaria_id is not distinct from e.conta_bancaria_id))
           or (e.linha_digitavel is not null and r.linha_digitavel = e.linha_digitavel)
           or (e.txid is not null and r.txid = e.txid));

    if v_qtd = 1 then
      update public.receivables
         set status = 'recebido',
             received_at = coalesce((e.data_evento::text || 'T12:00:00-03:00')::timestamptz, now()),
             valor_recebido = e.valor,
             recebido_via = 'banco',
             updated_at = now()
       where id = v_alvo and status = 'programado';
      update public.fin_banco_eventos
         set receivable_id = v_alvo, conciliado_em = now(), conciliacao_nota = 'baixa automática'
       where id = e.id;
      v_ok := v_ok + 1;
    elsif v_qtd = 0 then
      update public.fin_banco_eventos set conciliacao_nota = 'sem título com esta identidade'
       where id = e.id;
      v_sem := v_sem + 1;
    else
      -- ⚠️ Dois títulos com a mesma identidade: não escolhe — escolher
      -- enterraria a dúvida.
      update public.fin_banco_eventos set conciliacao_nota = 'ambíguo: ' || v_qtd || ' títulos'
       where id = e.id;
      v_amb := v_amb + 1;
    end if;
  end loop;
  return jsonb_build_object('baixados', v_ok, 'sem_titulo', v_sem, 'ambiguos', v_amb);
end;
$$;
revoke execute on function public.fin_banco_conciliar() from public, anon, authenticated;
grant  execute on function public.fin_banco_conciliar() to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — ENSAIO (só leitura): o que a primeira rodada faria AGORA
-- Espera: um jsonb. Com o marco zero em hoje, `titulos` costuma ser 0 ou poucos
-- (só NF emitida hoje). `sem_prazo` lista o que vai precisar de vencimento à mão.
-- ════════════════════════════════════════════════════════════════════════════
select public.fin_receber_gerar_da_nf();


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 6 — LIGAR: primeira rodada de verdade + o cron de 10 em 10 min
-- (minutos 21/31/41/51 — fora da grade cheia; ver "Cadência" no CLAUDE.md).
-- SQL puro: o `succeeded` do pg_cron aqui SIGNIFICA que rodou.
-- Espera: o jsonb da rodada e, na consulta final, 1 linha do job ativo.
-- ════════════════════════════════════════════════════════════════════════════
select public.fin_receber_gerar_da_nf(false);

do $$ begin
  perform cron.unschedule('fin-receber-da-nf-10min');
exception when others then null; end $$;
select cron.schedule('fin-receber-da-nf-10min', '21-59/10 * * * *',
                     'select public.fin_receber_gerar_da_nf(false)');

select jobname, schedule, active from cron.job where jobname = 'fin-receber-da-nf-10min';


-- ════════════════════════════════════════════════════════════════════════════
-- (OPCIONAL) Voltar o marco zero para gerar títulos de NFs já emitidas.
-- ⚠️ Só faça se ninguém marca esses boletos como recebidos aqui — cada boleto
-- já pago no banco apareceria como VENCIDO até alguém dar baixa.
-- update public.fin_receber_config set gerar_a_partir_de = date '2026-10-01', atualizado_em = now();
-- select public.fin_receber_gerar_da_nf(false);
-- ════════════════════════════════════════════════════════════════════════════
