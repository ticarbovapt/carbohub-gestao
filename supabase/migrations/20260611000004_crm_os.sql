-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Sales — domínio de ORDENS DE SERVIÇO / Descarbonização (ilha isolada).
-- Fase de lógica inicial: a OS é APENAS SALVA/LIDA. NÃO dispara agenda de máquina,
-- execução, faturamento ou qualquer efeito no resto do sistema — isso vem depois.
-- Prefixo crm_ = mesma ilha de dados do CRM (crm_leads, crm_vendas etc.).
-- Reusa public.crm_vendas_touch() e public.crm_is_gestor() (já existem no banco).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_os (
  id              uuid primary key default gen_random_uuid(),
  criado_por      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null check (tipo in ('b2c','b2b','frota')),
  stage           text not null default 'nova'
                    check (stage in ('nova','qualificacao','agendamento','confirmada','em_execucao','pos_servico','concluida')),
  cliente_nome    text,
  cnpj            text,
  placa           text,
  modelo          text,
  data_prevista   timestamptz,
  prioridade      int not null default 3,
  titulo          text,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_crm_os_criado_por    on public.crm_os(criado_por);
create index if not exists idx_crm_os_created        on public.crm_os(created_at desc);
create index if not exists idx_crm_os_data_prevista  on public.crm_os(data_prevista);

-- updated_at automático (reusa a função já existente de crm_vendas)
drop trigger if exists trg_crm_os_touch on public.crm_os;
create trigger trg_crm_os_touch
  before update on public.crm_os
  for each row execute function public.crm_vendas_touch();

-- ── RLS: criador mexe no próprio; gestor vê/edita tudo ───────────────────────
alter table public.crm_os enable row level security;

drop policy if exists crm_os_select on public.crm_os;
create policy crm_os_select on public.crm_os
  for select using (criado_por = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_os_insert on public.crm_os;
create policy crm_os_insert on public.crm_os
  for insert with check (criado_por = auth.uid());

drop policy if exists crm_os_update on public.crm_os;
create policy crm_os_update on public.crm_os
  for update using (criado_por = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_os_delete on public.crm_os;
create policy crm_os_delete on public.crm_os
  for delete using (criado_por = auth.uid() or public.crm_is_gestor());
