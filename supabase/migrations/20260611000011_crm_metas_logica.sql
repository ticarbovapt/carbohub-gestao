-- ─────────────────────────────────────────────────────────────────────────────
-- Lógica de metas: meta PADRÃO com vigência (degraus) + EXCEÇÃO por mês.
--
-- Resolução da meta de (vendedor, ano, mes), por prioridade:
--   1) EXCEÇÃO do mês  → crm_vendedor_metas(ano, mes)         [source = 'mes']
--   2) DEGRAU de padrão vigente → maior valido_a_partir <= 1º dia do mês [ 'padrao' ]
--   3) senão → 0                                              [source = 'none']
--
-- Histórico imutável: uma nova meta padrão criada em Ago tem valido_a_partir
-- = 2026-08-01; meses anteriores resolvem o degrau anterior (não mudam).
-- Só faturamento (R$). Escrita só por gestor (crm_is_gestor).
-- ─────────────────────────────────────────────────────────────────────────────

-- Limpeza dos dados de teste (todas as metas atuais eram testes).
delete from public.crm_vendedor_metas;

-- ── Degraus de meta padrão (vigência a partir de um mês) ─────────────────────
create table if not exists public.crm_vendedor_meta_default (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null references public.profiles(id) on delete cascade,
  valido_a_partir date not null,                 -- sempre o 1º dia do mês
  target_amount   numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vendedor_id, valido_a_partir)
);
create index if not exists idx_crm_meta_default_vend
  on public.crm_vendedor_meta_default (vendedor_id, valido_a_partir desc);

drop trigger if exists trg_crm_meta_default_touch on public.crm_vendedor_meta_default;
create trigger trg_crm_meta_default_touch
  before update on public.crm_vendedor_meta_default
  for each row execute function public.crm_vendas_touch();

alter table public.crm_vendedor_meta_default enable row level security;

drop policy if exists crm_meta_default_select on public.crm_vendedor_meta_default;
create policy crm_meta_default_select on public.crm_vendedor_meta_default
  for select using (auth.uid() is not null);

drop policy if exists crm_meta_default_write on public.crm_vendedor_meta_default;
create policy crm_meta_default_write on public.crm_vendedor_meta_default
  for all using (public.crm_is_gestor()) with check (public.crm_is_gestor());

-- ── Resolução de um mês ──────────────────────────────────────────────────────
create or replace function public.crm_metas_resolvidas(p_ano int, p_mes int)
returns table (vendedor_id uuid, target_amount numeric, source text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(ex.target_amount, df.target_amount, 0)::numeric,
         case when ex.target_amount is not null then 'mes'
              when df.target_amount is not null then 'padrao'
              else 'none' end
  from public.profiles p
  left join public.crm_vendedor_metas ex
    on ex.vendedor_id = p.id and ex.ano = p_ano and ex.mes = p_mes
  left join lateral (
    select d.target_amount
    from public.crm_vendedor_meta_default d
    where d.vendedor_id = p.id
      and d.valido_a_partir <= make_date(p_ano, p_mes, 1)
    order by d.valido_a_partir desc
    limit 1
  ) df on true
  where coalesce(p.is_vendedor, false) = true;
$$;
revoke all on function public.crm_metas_resolvidas(int, int) from public, anon;
grant execute on function public.crm_metas_resolvidas(int, int) to authenticated;

-- ── Resolução do ano inteiro (12 meses) — para a linha de meta do Dashboard ──
create or replace function public.crm_metas_resolvidas_ano(p_ano int)
returns table (vendedor_id uuid, mes int, target_amount numeric, source text)
language sql stable security definer set search_path = public as $$
  select p.id, m.mes,
         coalesce(ex.target_amount, df.target_amount, 0)::numeric,
         case when ex.target_amount is not null then 'mes'
              when df.target_amount is not null then 'padrao'
              else 'none' end
  from public.profiles p
  cross join generate_series(1, 12) as m(mes)
  left join public.crm_vendedor_metas ex
    on ex.vendedor_id = p.id and ex.ano = p_ano and ex.mes = m.mes
  left join lateral (
    select d.target_amount
    from public.crm_vendedor_meta_default d
    where d.vendedor_id = p.id
      and d.valido_a_partir <= make_date(p_ano, m.mes, 1)
    order by d.valido_a_partir desc
    limit 1
  ) df on true
  where coalesce(p.is_vendedor, false) = true;
$$;
revoke all on function public.crm_metas_resolvidas_ano(int) from public, anon;
grant execute on function public.crm_metas_resolvidas_ano(int) to authenticated;
