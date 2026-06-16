-- ─────────────────────────────────────────────────────────────────────────────
-- Leads PRÓPRIOS do Carbo Sales (ilha isolada — NÃO compartilha com o Controle).
--
-- O Sales reusava a tabela crm_leads (que é do Controle). Aqui criamos tabelas
-- próprias do Sales, com a MESMA estrutura (LIKE ... INCLUDING ALL copia colunas,
-- defaults, checks e índices atuais), e RLS de escopo:
--   • membro vê só os próprios (created_by/assigned_to);
--   • gestor (head/command/ti_suporte via crm_is_gestor) vê tudo.
-- Começa VAZIA — leads do Controle não vêm pra cá (e vice-versa).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_sales_leads
  (like public.crm_leads including all);

create table if not exists public.crm_sales_lead_activities
  (like public.crm_lead_activities including all);

-- FK das atividades para os leads do Sales (integridade + cascade)
alter table public.crm_sales_lead_activities
  drop constraint if exists crm_sales_lead_activities_lead_fk;
alter table public.crm_sales_lead_activities
  add constraint crm_sales_lead_activities_lead_fk
  foreign key (lead_id) references public.crm_sales_leads(id) on delete cascade;

-- updated_at automático (reusa a função genérica crm_vendas_touch)
drop trigger if exists trg_crm_sales_leads_touch on public.crm_sales_leads;
create trigger trg_crm_sales_leads_touch
  before update on public.crm_sales_leads
  for each row execute function public.crm_vendas_touch();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.crm_sales_leads          enable row level security;
alter table public.crm_sales_lead_activities enable row level security;

-- Leads: dono (criador OU atribuído) ou gestor
drop policy if exists crm_sales_leads_select on public.crm_sales_leads;
create policy crm_sales_leads_select on public.crm_sales_leads
  for select using (created_by = auth.uid() or assigned_to = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_sales_leads_insert on public.crm_sales_leads;
create policy crm_sales_leads_insert on public.crm_sales_leads
  for insert with check (created_by = auth.uid());

drop policy if exists crm_sales_leads_update on public.crm_sales_leads;
create policy crm_sales_leads_update on public.crm_sales_leads
  for update using (created_by = auth.uid() or assigned_to = auth.uid() or public.crm_is_gestor());

drop policy if exists crm_sales_leads_delete on public.crm_sales_leads;
create policy crm_sales_leads_delete on public.crm_sales_leads
  for delete using (created_by = auth.uid() or public.crm_is_gestor());

-- Atividades: acesso herdado do lead
drop policy if exists crm_sales_lead_act_select on public.crm_sales_lead_activities;
create policy crm_sales_lead_act_select on public.crm_sales_lead_activities
  for select using (exists (
    select 1 from public.crm_sales_leads l
    where l.id = lead_id
      and (l.created_by = auth.uid() or l.assigned_to = auth.uid() or public.crm_is_gestor())
  ));

drop policy if exists crm_sales_lead_act_insert on public.crm_sales_lead_activities;
create policy crm_sales_lead_act_insert on public.crm_sales_lead_activities
  for insert with check (created_by = auth.uid());
