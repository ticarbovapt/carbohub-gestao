-- ============================================================================
-- 20261130 — Os leads do Marcio (20261129) ligados aos pedidos (20261119)
--
-- O elo é por IDENTIDADE, nunca por CNPJ nem por nome: no md a venda aponta o
-- lead (`produtos.sales.customer_lead_id`); no Sales o pedido carrega
-- `md:<sale_id>` em `internal_notes` e o lead carrega `md-lead:<lead_id>` em
-- `notes`. A cadeia pedido → venda do md → lead do md → lead do Sales é exata.
-- O CNPJ aparece só para CONFERIR.
--
-- ⚠️ `crm_lead_orders` tem `unique (order_id)`: um pedido é de UM lead. Pedido
-- já ligado a OUTRO lead aborta tudo — trocar o dono do pedido é decisão.
-- ⚠️ Idempotente: o mesmo par já ligado é pulado.
-- ============================================================================

-- ── BLOCO 0 — medir (só lê) ─────────────────────────────────────────────────
with pares as (
  select o.id as order_id, o.order_number, o.customer_name, o.cnpj as cnpj_pedido,
         s.id as lead_id, s.trade_name, s.cnpj as cnpj_lead
    from public.carboze_orders o
    join produtos.sales ms
      on ms.id = substring(o.internal_notes from 'md:([0-9a-f-]{36})')::uuid
    join public.crm_sales_leads s
      on substring(s.notes from 'md-lead:([0-9a-f-]{36})')::uuid = ms.customer_lead_id
   where o.internal_notes like '%md:%'
     and s.notes like '%md-lead:%'
)
select p.order_number, p.customer_name, p.trade_name,
       regexp_replace(coalesce(p.cnpj_pedido, ''), '\D', '', 'g')
         = regexp_replace(coalesce(p.cnpj_lead, ''), '\D', '', 'g') as cnpj_bate,
       (select l.lead_id from public.crm_lead_orders l where l.order_id = p.order_id) as ja_ligado_a,
       (select l.lead_id from public.crm_lead_orders l where l.order_id = p.order_id) = p.lead_id as ja_ligado_certo
  from pares p
 order by p.order_number;

-- ── BLOCO 1 — ligar ─────────────────────────────────────────────────────────
do $$
declare
  v_dono   uuid := '7e43dfe3-6635-4d11-817c-a971696a1503';
  r        record;
  v_feitos int := 0;
begin
  for r in
    select o.id as order_id, o.order_number, s.id as lead_id
      from public.carboze_orders o
      join produtos.sales ms
        on ms.id = substring(o.internal_notes from 'md:([0-9a-f-]{36})')::uuid
      join public.crm_sales_leads s
        on substring(s.notes from 'md-lead:([0-9a-f-]{36})')::uuid = ms.customer_lead_id
     where o.internal_notes like '%md:%'
       and s.notes like '%md-lead:%'
     order by o.order_number
  loop
    if exists (select 1 from public.crm_lead_orders l
                where l.order_id = r.order_id and l.lead_id <> r.lead_id) then
      raise exception 'Pedido % já está ligado a OUTRO lead. Nada foi gravado.', r.order_number;
    end if;
    if exists (select 1 from public.crm_lead_orders l
                where l.order_id = r.order_id and l.lead_id = r.lead_id) then
      raise notice '% já ligado, pulado', r.order_number;
      continue;
    end if;

    insert into public.crm_lead_orders (lead_id, order_id, created_by)
    values (r.lead_id, r.order_id, v_dono);
    v_feitos := v_feitos + 1;
    raise notice '% ligado ao lead', r.order_number;
  end loop;

  raise notice 'Pedidos ligados: %', v_feitos;
end $$;

-- ── BLOCO 2 — conferir: rode o BLOCO 0 de novo (7 linhas, ja_ligado_certo = true)
