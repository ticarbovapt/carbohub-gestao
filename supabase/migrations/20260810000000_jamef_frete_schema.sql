-- ═══════════════════════════════════════════════════════════════════════════
-- FRETE JAMEF — tabela de contrato (NÃO passa por API)
--
-- Contrato: 36.060.692/0001-00 CARBO SOLUCOES LTDA
-- Tabela "1500 - Especial e Exclusiva" · origem NAT (Natal/RN) · vig. 2026-04-20
--
-- A Jamef não cota por API: o preço sai desta tabela. O cálculo mora no banco
-- (jamef_cotar) e não no front, para que /logistica, /vender e qualquer app
-- futuro cotem pelo MESMO código — a tabela é a fonte de verdade única.
--
-- ⚠️ ORIGEM: esta tabela vale SÓ para saída de Natal/RN. Cotação a partir do
-- CD SP tem que ser recusada explicitamente, nunca calculada com estes valores.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tarifários (94 siglas: capital, interior 1, interior 2) ────────────────
create table if not exists public.jamef_tarifas (
  sigla               text primary key,
  nome                text not null,
  regiao              text,
  uf                  text not null,
  tipo                text,                       -- CAPITAL/CIDADE | INTERIOR-1 | INTERIOR-2
  ate_10kg            numeric(10,2) not null,
  de_10_20kg          numeric(10,2) not null,
  de_20_30kg          numeric(10,2) not null,
  de_30_50kg          numeric(10,2) not null,
  de_50_75kg          numeric(10,2) not null,
  de_75_100kg         numeric(10,2) not null,
  acima_100kg_por_kg  numeric(10,2) not null,
  ad_valorem          numeric(8,6)  not null      -- fração sobre o valor da NF
);

-- ── Faixas de CEP → tarifário ──────────────────────────────────────────────
-- Denormalizado de propósito: a busca por CEP é o caminho quente e não deve
-- precisar de join. `sigla` pode ser NULL (Florínea/SP veio sem sigla na
-- planilha) — nesse caso a cotação recusa com motivo específico, que é bem
-- diferente de "CEP não encontrado".
create table if not exists public.jamef_cep_faixas (
  id           bigserial primary key,
  cep_ini      char(8) not null,
  cep_fim      char(8) not null,
  sigla        text references public.jamef_tarifas(sigla),
  municipio    text not null,
  uf           char(2) not null,
  ibge         text,                              -- 28 municípios vieram sem IBGE
  atendimento  char(1),                           -- S = direto · R = redespacho
  constraint jamef_cep_faixa_ordem check (cep_ini <= cep_fim),
  constraint jamef_cep_faixa_unica unique (cep_ini, cep_fim, sigla, ibge)
);

-- Busca por CEP: cep_ini <= X <= cep_fim. O índice em cep_ini já poda quase
-- tudo (as faixas não se sobrepõem entre municípios diferentes — verificado:
-- 0 conflitos de sigla nas 12 sobreposições, todas linhas idênticas).
create index if not exists jamef_cep_faixas_ini_fim_idx
  on public.jamef_cep_faixas (cep_ini, cep_fim);
create index if not exists jamef_cep_faixas_ibge_idx
  on public.jamef_cep_faixas (ibge) where ibge is not null;

-- ── Parâmetros do contrato (taxas fixas e regra de cubagem) ────────────────
-- Em tabela, não em constante no código: quando a Jamef reajustar, é UPDATE —
-- não deploy.
create table if not exists public.jamef_parametros (
  id                    boolean primary key default true check (id),
  vigencia              date    not null,
  origem_uf             char(2) not null default 'RN',
  origem_label          text    not null default 'NAT (Natal/RN)',
  tabela                text    not null,
  cubagem_fator         numeric(10,2) not null,   -- m³ × fator = kg cubado
  gris_percentual       numeric(8,6)  not null,
  gris_minimo           numeric(10,2) not null,
  pedagio_por_100kg     numeric(10,2) not null,
  tas_valor             numeric(10,2) not null,   -- só interestadual
  taxa_ctrc             numeric(10,2) not null,
  atualizado_em         timestamptz not null default now()
);

-- ── ICMS por UF de destino ─────────────────────────────────────────────────
-- A planilha da Jamef diz apenas "ICMS aplicado conforme legislação vigente do
-- destino" — não veio alíquota nenhuma. Estes valores são o PADRÃO LEGAL para
-- saída do RN (12% interestadual, 18% interno) e ficam editáveis: conferir com
-- a contabilidade e corrigir por UPDATE, sem deploy.
-- ICMS de frete é calculado "por dentro": total = base / (1 - alíquota).
create table if not exists public.jamef_icms_uf (
  uf         char(2) primary key,
  aliquota   numeric(6,4) not null,
  observacao text
);

-- ── RLS: leitura para qualquer autenticado; escrita só service_role ────────
alter table public.jamef_tarifas     enable row level security;
alter table public.jamef_cep_faixas  enable row level security;
alter table public.jamef_parametros  enable row level security;
alter table public.jamef_icms_uf     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='jamef_tarifas'
                   and policyname='jamef_tarifas_select') then
    create policy jamef_tarifas_select on public.jamef_tarifas
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='jamef_cep_faixas'
                   and policyname='jamef_cep_faixas_select') then
    create policy jamef_cep_faixas_select on public.jamef_cep_faixas
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='jamef_parametros'
                   and policyname='jamef_parametros_select') then
    create policy jamef_parametros_select on public.jamef_parametros
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='jamef_icms_uf'
                   and policyname='jamef_icms_uf_select') then
    create policy jamef_icms_uf_select on public.jamef_icms_uf
      for select to authenticated using (true);
  end if;
end $$;

-- ── Parâmetros e ICMS ──────────────────────────────────────────────────────
insert into public.jamef_parametros
  (id, vigencia, tabela, cubagem_fator, gris_percentual, gris_minimo,
   pedagio_por_100kg, tas_valor, taxa_ctrc)
values
  (true, '2026-04-20', '1500 - Especial e Exclusiva', 300, 0.0011, 4.79,
   16.14, 7.71, 27.11)
on conflict (id) do update set
  vigencia = excluded.vigencia,
  tabela = excluded.tabela,
  cubagem_fator = excluded.cubagem_fator,
  gris_percentual = excluded.gris_percentual,
  gris_minimo = excluded.gris_minimo,
  pedagio_por_100kg = excluded.pedagio_por_100kg,
  tas_valor = excluded.tas_valor,
  taxa_ctrc = excluded.taxa_ctrc,
  atualizado_em = now();

insert into public.jamef_icms_uf (uf, aliquota, observacao)
select uf, case when uf = 'RN' then 0.18 else 0.12 end,
       case when uf = 'RN' then 'Interno RN — CONFERIR com a contabilidade'
            else 'Interestadual saindo do RN — CONFERIR com a contabilidade' end
from unnest(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                  'SP','SE','TO']) as uf
on conflict (uf) do nothing;

comment on table public.jamef_icms_uf is
  'Alíquotas PADRÃO LEGAL de saída do RN, não fornecidas pela Jamef. Conferir com a contabilidade.';
