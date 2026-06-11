-- ─────────────────────────────────────────────────────────────────────────────
-- Metas de vendedores do Carbo Sales.
--  • crm_vendedor_metas: a META por vendedor/mês (gestor define).
--  • crm_vendas_agregado(): RPC que devolve o REALIZADO por vendedor num período
--    (soma/contagem de vendas com status 'pedido'). É SECURITY DEFINER para o
--    quadro do time funcionar para todos sem expor as linhas de venda individuais
--    (estas continuam restritas pela RLS de crm_vendas).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_vendedor_metas (
  id            uuid primary key default gen_random_uuid(),
  vendedor_id   uuid not null references auth.users(id) on delete cascade,
  ano           int  not null,
  mes           int  not null check (mes between 1 and 12),
  target_amount numeric(14,2) not null default 0,
  target_qty    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (vendedor_id, ano, mes)
);
create index if not exists idx_crm_vendedor_metas_periodo on public.crm_vendedor_metas(ano, mes);

-- updated_at automático (reusa a função genérica criada para crm_vendas)
drop trigger if exists trg_crm_vendedor_metas_touch on public.crm_vendedor_metas;
create trigger trg_crm_vendedor_metas_touch
  before update on public.crm_vendedor_metas
  for each row execute function public.crm_vendas_touch();

-- RLS: todos autenticados LEEM as metas (quadro do time); só gestor ESCREVE.
alter table public.crm_vendedor_metas enable row level security;

drop policy if exists crm_metas_select on public.crm_vendedor_metas;
create policy crm_metas_select on public.crm_vendedor_metas
  for select using (auth.uid() is not null);

drop policy if exists crm_metas_write on public.crm_vendedor_metas;
create policy crm_metas_write on public.crm_vendedor_metas
  for all using (public.crm_is_gestor()) with check (public.crm_is_gestor());

-- Realizado por vendedor num intervalo [p_from, p_to) — só vendas (status 'pedido').
create or replace function public.crm_vendas_agregado(p_from timestamptz, p_to timestamptz)
returns table (vendedor_id uuid, total numeric, qtd bigint)
language sql stable security definer set search_path = public as $$
  select v.vendedor_id,
         coalesce(sum(v.total), 0)::numeric as total,
         count(*)::bigint as qtd
  from public.crm_vendas v
  where v.status = 'pedido'
    and v.created_at >= p_from
    and v.created_at <  p_to
  group by v.vendedor_id;
$$;

revoke all on function public.crm_vendas_agregado(timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_vendas_agregado(timestamptz, timestamptz) to authenticated;
