-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Sales — domínio de VENDAS (ilha isolada do CRM).
-- Fase de lógica inicial: a venda/orçamento é APENAS SALVA. NÃO dispara estoque,
-- produção, faturamento, Bling ou qualquer efeito no resto do sistema — isso vem
-- depois, quando formos consumir/organizar a informação salva.
-- Prefixo crm_ = mesma ilha de dados do CRM (crm_leads etc.).
-- ─────────────────────────────────────────────────────────────────────────────

-- Cabeçalho da venda/orçamento
create table if not exists public.crm_vendas (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null default 'venda'    check (tipo   in ('venda','promo')),
  status          text not null default 'orcamento' check (status in ('orcamento','pedido','cancelado')),
  customer_name   text,
  customer_doc    text,                 -- CNPJ ou CPF (texto livre por hora)
  customer_email  text,
  customer_phone  text,
  is_licenciado   boolean not null default false,
  endereco        jsonb,                -- {logradouro, numero, bairro, cidade, uf, cep}
  payment_terms   text,
  freight_type    text,
  total           numeric(14,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Itens da venda
create table if not exists public.crm_venda_itens (
  id              uuid primary key default gen_random_uuid(),
  venda_id        uuid not null references public.crm_vendas(id) on delete cascade,
  produto         text,
  quantidade      integer not null default 1,
  preco_unitario  numeric(14,2) not null default 0,
  bonificacao     integer not null default 0,
  subtotal        numeric(14,2) not null default 0
);

create index if not exists idx_crm_vendas_vendedor    on public.crm_vendas(vendedor_id);
create index if not exists idx_crm_vendas_created      on public.crm_vendas(created_at desc);
create index if not exists idx_crm_venda_itens_venda   on public.crm_venda_itens(venda_id);

-- updated_at automático
create or replace function public.crm_vendas_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_crm_vendas_touch on public.crm_vendas;
create trigger trg_crm_vendas_touch
  before update on public.crm_vendas
  for each row execute function public.crm_vendas_touch();

-- Helper: o usuário logado é GESTOR? (head / command / ti_suporte) — espelha o
-- seesEverything do front. SECURITY DEFINER para ler profiles sem expor a tabela.
create or replace function public.crm_is_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and ( p.funcao = 'head' or p.secondary_funcao = 'head'
         or p.department in ('command','ti_suporte')
         or p.secondary_department in ('command','ti_suporte') )
  );
$$;

-- ── RLS: vendedor mexe no próprio; gestor vê/edita tudo ──────────────────────
alter table public.crm_vendas      enable row level security;
alter table public.crm_venda_itens enable row level security;

drop policy if exists crm_vendas_select on public.crm_vendas;
create policy crm_vendas_select on public.crm_vendas
  for select using (vendedor_id = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_vendas_insert on public.crm_vendas;
create policy crm_vendas_insert on public.crm_vendas
  for insert with check (vendedor_id = auth.uid());

drop policy if exists crm_vendas_update on public.crm_vendas;
create policy crm_vendas_update on public.crm_vendas
  for update using (vendedor_id = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_vendas_delete on public.crm_vendas;
create policy crm_vendas_delete on public.crm_vendas
  for delete using (vendedor_id = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_venda_itens_select on public.crm_venda_itens;
create policy crm_venda_itens_select on public.crm_venda_itens
  for select using (exists (
    select 1 from public.crm_vendas v
    where v.id = venda_id and (v.vendedor_id = auth.uid() or public.crm_is_gestor())
  ));

drop policy if exists crm_venda_itens_insert on public.crm_venda_itens;
create policy crm_venda_itens_insert on public.crm_venda_itens
  for insert with check (exists (
    select 1 from public.crm_vendas v
    where v.id = venda_id and v.vendedor_id = auth.uid()
  ));

drop policy if exists crm_venda_itens_modify on public.crm_venda_itens;
create policy crm_venda_itens_modify on public.crm_venda_itens
  for update using (exists (
    select 1 from public.crm_vendas v
    where v.id = venda_id and (v.vendedor_id = auth.uid() or public.crm_is_gestor())
  ));

drop policy if exists crm_venda_itens_delete on public.crm_venda_itens;
create policy crm_venda_itens_delete on public.crm_venda_itens
  for delete using (exists (
    select 1 from public.crm_vendas v
    where v.id = venda_id and (v.vendedor_id = auth.uid() or public.crm_is_gestor())
  ));
