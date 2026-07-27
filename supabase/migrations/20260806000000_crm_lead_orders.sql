-- =====================================================================
-- Fase 10 — o elo entre o card do CRM e o orçamento do /vender.
--
-- "quando for mover para ganho, já reabra esse orçamento preenchido para gerar
-- a venda sem precisar preencher de novo, e o sistema todo se conversar".
--
-- POR QUE TABELA DE LIGAÇÃO, e não uma coluna:
--
--   • um lead tem VÁRIOS orçamentos ao longo do tempo (v1, v2, revisão), o que
--     mata um `quote_id` em crm_sales_leads;
--   • uma coluna em carboze_orders acoplaria o ERP ao CRM — aquela tabela é
--     compartilhada por ops/financas/admin/ti, Bling, shipments e receivables.
--     A tabela de ligação tem ZERO superfície de contato com os outros apps.
--
-- É o mesmo padrão que o repo já usa em ops_shipments e bling_nfe.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1a — a tabela, SEM as FKs                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- As FKs entram uma a uma nos blocos seguintes, e não aqui, porque criar a
-- tabela com `references` para carboze_orders num único statement pega lock
-- numa tabela que o app está lendo AO VIVO — e deu deadlock 40P01 na primeira
-- tentativa. Separadas, cada uma abre e fecha o lock em milissegundos.
create table if not exists public.crm_lead_orders (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null,
  order_id   uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Um pedido pertence a UM lead. O contrário é livre: o lead pode ter vários
  -- orçamentos, que é justamente o motivo desta tabela existir.
  unique (order_id)
);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1b — FK para os leads                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.crm_lead_orders drop constraint if exists crm_lead_orders_lead_fk;
alter table public.crm_lead_orders
  add constraint crm_lead_orders_lead_fk
  foreign key (lead_id) references public.crm_sales_leads(id) on delete cascade;

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1c — FK para os pedidos (a que deu deadlock)                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Se este bloco falhar por lock_timeout, é só REENVIAR: o `drop constraint if
-- exists` torna o bloco repetível, e o timeout curto faz ele desistir limpo em
-- vez de travar quem está usando o sistema.
set lock_timeout = '5s';

alter table public.crm_lead_orders drop constraint if exists crm_lead_orders_order_fk;
alter table public.crm_lead_orders
  add constraint crm_lead_orders_order_fk
  foreign key (order_id) references public.carboze_orders(id) on delete cascade;

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1d — FK do autor e índice                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.crm_lead_orders drop constraint if exists crm_lead_orders_created_by_fk;
alter table public.crm_lead_orders
  add constraint crm_lead_orders_created_by_fk
  foreign key (created_by) references public.profiles(id);

create index if not exists idx_crm_lead_orders_lead
  on public.crm_lead_orders (lead_id, created_at desc);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1e — RLS                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.crm_lead_orders enable row level security;

-- Quem enxerga o LEAD enxerga o vínculo. Sem duplicar regra de acesso: a
-- verdade sobre quem pode ver o quê continua morando na policy do lead.
drop policy if exists crm_lead_orders_select on public.crm_lead_orders;
create policy crm_lead_orders_select on public.crm_lead_orders
  for select using (exists (
    select 1 from public.crm_sales_leads l
     where l.id = lead_id and l.deleted_at is null
       and (l.created_by = auth.uid() or l.assigned_to = auth.uid()
            or public.crm_is_gestor()
            or (l.origin_lead_id is not null and l.assigned_to is null))
  ));

drop policy if exists crm_lead_orders_insert on public.crm_lead_orders;
create policy crm_lead_orders_insert on public.crm_lead_orders
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.crm_sales_leads l
       where l.id = lead_id and l.deleted_at is null
         and (l.created_by = auth.uid() or l.assigned_to = auth.uid()
              or public.crm_is_gestor()
              or (l.origin_lead_id is not null and l.assigned_to is null))
    )
  );

drop policy if exists crm_lead_orders_delete on public.crm_lead_orders;
create policy crm_lead_orders_delete on public.crm_lead_orders
  for delete using (created_by = auth.uid() or public.crm_is_gestor());


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o orçamento vigente de um lead                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Devolve o orçamento mais recente do lead que AINDA É ORÇAMENTO.
--
-- O filtro por status = 'quote' é obrigatório e não é detalhe: o modo `?edit=`
-- do /vender NÃO valida status hoje. Reabrir um pedido já convertido e salvar
-- o REBAIXA de volta para orçamento — perder uma venda por causa de um botão
-- de conveniência seria o pior desfecho possível desta fase.
create or replace function public.crm_lead_orcamento_vigente(p_lead uuid)
returns table (
  order_id     uuid,
  order_number text,
  total        numeric,
  status       text,
  created_at   timestamptz
)
language sql stable security definer set search_path = public
as $$
  select o.id, o.order_number, o.total, o.status, o.created_at
    from public.crm_lead_orders lo
    join public.carboze_orders o on o.id = lo.order_id
   where lo.lead_id = p_lead
     and o.status = 'quote'
   order by o.created_at desc
   limit 1;
$$;

revoke all on function public.crm_lead_orcamento_vigente(uuid) from public, anon;
grant execute on function public.crm_lead_orcamento_vigente(uuid) to authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select count(*) as vinculos from public.crm_lead_orders;
--
-- Depois de gerar um orçamento a partir de um card:
-- select l.contact_name, o.order_number, o.status, o.total
--   from public.crm_lead_orders lo
--   join public.crm_sales_leads l on l.id = lo.lead_id
--   join public.carboze_orders  o on o.id = lo.order_id
--  order by lo.created_at desc limit 10;


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop function if exists public.crm_lead_orcamento_vigente(uuid);
-- drop table if exists public.crm_lead_orders;
