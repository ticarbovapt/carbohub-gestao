-- ─────────────────────────────────────────────────────────────────────────────
-- Posse de lead (responsável) — transferência por gestor + histórico (auditoria).
-- O "dono" do lead é assigned_to (cai pra created_by quando não atribuído).
-- Transferir só gestor (head/command/ti_suporte). Cada transferência grava um log
-- imutável: de quem → pra quem, quando e por quem (evita "safadezas").
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.crm_sales_lead_owner_log (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.crm_sales_leads(id) on delete cascade,
  from_user   uuid,
  to_user     uuid not null,
  changed_by  uuid not null,
  changed_at  timestamptz not null default now()
);
create index if not exists idx_crm_sales_lead_owner_log_lead
  on public.crm_sales_lead_owner_log (lead_id, changed_at desc);

alter table public.crm_sales_lead_owner_log enable row level security;

-- Leitura: gestor, ou quem é dono/criador do lead.
drop policy if exists crm_owner_log_select on public.crm_sales_lead_owner_log;
create policy crm_owner_log_select on public.crm_sales_lead_owner_log
  for select using (
    public.crm_is_gestor() or exists (
      select 1 from public.crm_sales_leads l
      where l.id = lead_id and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
    )
  );
-- Escrita só via RPC SECURITY DEFINER (sem policy de insert direto).

-- Transferência atômica (muda assigned_to + grava log). Só gestor.
create or replace function public.crm_sales_lead_transfer(p_lead uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_from uuid;
begin
  if not public.crm_is_gestor() then
    raise exception 'Apenas gestor (head/command/ti) pode transferir leads';
  end if;
  select coalesce(assigned_to, created_by) into v_from from public.crm_sales_leads where id = p_lead;
  update public.crm_sales_leads set assigned_to = p_to where id = p_lead;
  insert into public.crm_sales_lead_owner_log (lead_id, from_user, to_user, changed_by)
  values (p_lead, v_from, p_to, auth.uid());
end;
$$;
revoke all on function public.crm_sales_lead_transfer(uuid, uuid) from public, anon;
grant execute on function public.crm_sales_lead_transfer(uuid, uuid) to authenticated;
