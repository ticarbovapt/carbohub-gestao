-- ═══════════════════════════════════════════════════════════════════════════
-- Cancelar venda ≠ excluir venda
--
-- Hoje o Carbo Sales só oferece EXCLUIR: a linha some, o número volta pra fila
-- e o histórico morre. Só que a maior parte dos casos reais não é "essa venda
-- nunca existiu" — é "essa venda existiu e caiu". O cliente desistiu, o boleto
-- não foi pago, a NF foi cancelada. Isso precisa ficar registrado.
--
-- E tem um segundo problema, mais sério, que esta migração também fecha:
--
--   `carboze_order_delete` APAGA o pedido sem estornar o estoque.
--
-- Pedido que passou por "Separado" teve o HUB-RN debitado (pos_venda_deduct_
-- stock) e carrega `stock_deducted = true`. Ao excluir, a linha some com o
-- flag — e o débito fica no warehouse_stock para sempre, sem nenhum documento
-- apontando pra ele. Estoque a menos que ninguém consegue explicar nem
-- desfazer, porque o pedido que justificaria o estorno não existe mais.
--
-- As duas funções abaixo passam a estornar antes de agir. `pos_venda_restore_
-- stock` é idempotente (só age com stock_deducted = true), então chamar em
-- pedido que nunca foi separado não faz nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Cancelar ───────────────────────────────────────────────────────────
create or replace function public.carboze_order_cancel(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.carboze_orders;
  v_estornado int;
begin
  select * into v_row from public.carboze_orders where id = p_id;
  if not found then
    raise exception 'Venda não encontrada';
  end if;

  -- Quem pode cancelar: gestor, ou o vendedor DONO da venda. Cancelar é
  -- reversível e deixa rastro — não precisa da mesma trava de excluir, que é
  -- destrutivo e só gestor faz.
  if not (public.carbo_is_gestor(auth.uid()) or v_row.vendedor_id = auth.uid()) then
    raise exception 'Só o vendedor da venda ou um gestor pode cancelar';
  end if;

  -- Idempotente: cancelar duas vezes não estorna estoque duas vezes.
  if v_row.status = 'cancelled' then
    return;
  end if;

  -- ⚠️ ESTORNO ANTES da mudança de status. É o ponto do pedido do usuário:
  -- venda cancelada não pode deixar dedução de estoque pendurada. A RPC só
  -- age se stock_deducted = true, então pedido que nunca foi separado passa
  -- batido.
  v_estornado := public.pos_venda_restore_stock(p_id);

  -- `status` é o que TODA métrica lê (carbo_vendas_metrica filtra
  -- `status not in ('quote','cancelled')`). `fulfillment_stage` é só a etapa
  -- do kanban. Os dois juntos, sempre — mexer em um só foi exatamente o bug
  -- que deixou uma venda cancelada somando no faturamento.
  update public.carboze_orders
  set status = 'cancelled',
      fulfillment_stage = 'cancelado',
      updated_at = now()
  where id = p_id;

  -- Espelha na remessa da Logística, se houver. Best-effort: remessa ausente
  -- ou tabela inexistente não pode derrubar o cancelamento.
  begin
    update public.ops_shipments set status = 'cancelado', updated_at = now()
    where order_id = p_id;
  exception when others then null;
  end;

  begin
    insert into public.order_status_history (order_id, status, notes, changed_by)
    values (
      p_id, 'cancelled',
      coalesce(nullif(trim(p_reason), ''), 'Venda cancelada')
        || case when v_estornado > 0
             then ' · ' || v_estornado || ' item(ns) estornado(s) no HUB-RN'
             else '' end,
      auth.uid()
    );
  exception when others then null;
  end;
end $$;

comment on function public.carboze_order_cancel is
  'Cancela uma venda: estorna a dedução de estoque (se houver), marca status=cancelled + fulfillment_stage=cancelado e registra no histórico. Gestor ou o vendedor dono. Idempotente.';

revoke all  on function public.carboze_order_cancel(uuid, text) from public, anon;
grant execute on function public.carboze_order_cancel(uuid, text) to authenticated;

-- ── 2) Excluir passa a estornar também ────────────────────────────────────
-- Mesma função de 20260703000000, com UMA linha nova (marcada abaixo). O resto
-- é idêntico de propósito: é substituição, não reescrita.
create or replace function public.carboze_order_delete(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.carboze_orders;
  v_name text;
begin
  if not public.carbo_is_gestor(auth.uid()) then
    raise exception 'Apenas gestor pode excluir vendas';
  end if;

  select * into v_row from public.carboze_orders where id = p_id;
  if not found then
    raise exception 'Venda não encontrada';
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();

  -- ⭐ NOVO: devolve o estoque ANTES de apagar. Depois do DELETE é tarde —
  -- some o `items` e o `stock_deducted`, e o débito no HUB-RN vira órfão
  -- permanente. Idempotente: pedido nunca separado não move nada.
  perform public.pos_venda_restore_stock(p_id);

  insert into public.carboze_order_deletions (
    order_id, order_number, customer_name, vendedor_id, vendedor_name, total, status,
    order_snapshot, reason, deleted_by, deleted_by_name
  ) values (
    v_row.id, v_row.order_number, v_row.customer_name, v_row.vendedor_id, v_row.vendedor_name,
    v_row.total, v_row.status, to_jsonb(v_row), p_reason, auth.uid(), v_name
  );

  begin update public.credit_transactions   set order_id = null         where order_id = p_id;         exception when undefined_table then null; end;
  begin update public.licensee_requests     set carboze_order_id = null where carboze_order_id = p_id; exception when undefined_table then null; end;
  begin update public.licensee_commissions  set carboze_order_id = null where carboze_order_id = p_id; exception when undefined_table then null; end;

  delete from public.carboze_orders where id = p_id;
end $$;

revoke all  on function public.carboze_order_delete(uuid, text) from public, anon;
grant execute on function public.carboze_order_delete(uuid, text) to authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Passivo do bug antigo: pedido CANCELADO que ainda carrega dedução de
-- estoque. Cada linha é produto debitado do HUB-RN por uma venda que não
-- aconteceu. Não estorno automático aqui de propósito — o número do estoque
-- físico é decisão de quem conta o galpão, não de uma migração.
select order_number, customer_name, total, status, fulfillment_stage,
       stock_deducted, coalesce(sale_date, created_at::date) as data
from public.carboze_orders
where status = 'cancelled' and stock_deducted = true
order by total desc;
