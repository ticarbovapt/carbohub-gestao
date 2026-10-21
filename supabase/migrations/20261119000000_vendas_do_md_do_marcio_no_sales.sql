-- ============================================================================
-- 20261119 — As 7 vendas que o Marcio Cajahiba fechou no md passam para o Sales
-- (aplicada em 21/10/2026; resultado V2026100054..V2026100060, R$ 9.408,00)
--
-- Pedido do dono do processo: o Marcio era microdistribuidor no md
-- (produtos.profiles 522ee0bf…, papel `micro`) e virou VENDEDOR interno
-- (public.profiles 7e43dfe3…, carbo_crm), com comissão como os outros. As
-- vendas de 20/10 (V2026000034..40 do md) passam a ser pedidos da Carbo.
--
-- ⚠️ Os dois catálogos são SEPARADOS: CARBOZE-100ML (md) → CZ100 (Sales),
-- CARBOZE-SACHE (md) → CARB-SACH-10ML (o sachê AVULSO, nunca o kit de 10).
-- O preço vai o do md (o que foi vendido), não o do catálogo.
-- ⚠️ Idempotente: o marcador `md:<sale_id>` em internal_notes impede duplicar.
-- ⚠️ As vendas do md NÃO foram canceladas: lá elas baixaram o estoque do
-- depósito do Marcio. Se a mercadoria sai da Carbo, cancelá-las é decisão
-- separada (devolve o estoque do depósito).
-- ============================================================================

do $$
declare
  v_vendedor   uuid := '7e43dfe3-6635-4d11-817c-a971696a1503';
  v_cod_100    text := 'CZ100';
  v_cod_sache  text := 'CARB-SACH-10ML';
  v_vend_nome  text;
  p100   record;
  psache record;
  r      record;
  v_items jsonb;
  v_total numeric;
  v_sem_mapa int;
  v_num  text;
  v_feitas int := 0;
begin
  select full_name into v_vend_nome from public.profiles where id = v_vendedor;
  if v_vend_nome is null then
    raise exception 'Perfil interno do Marcio (%) não encontrado. Nada foi gravado.', v_vendedor;
  end if;

  select m.id, m.product_code, to_jsonb(m)->>'name' as nome into p100
    from public.mrp_products m
   where m.product_code = v_cod_100 and m.bonificacao_de is null and m.preco_de is null;
  if p100.id is null then raise exception 'Produto % não encontrado. Nada foi gravado.', v_cod_100; end if;

  select m.id, m.product_code, to_jsonb(m)->>'name' as nome into psache
    from public.mrp_products m
   where m.product_code = v_cod_sache and m.bonificacao_de is null and m.preco_de is null;
  if psache.id is null then raise exception 'Produto % não encontrado. Nada foi gravado.', v_cod_sache; end if;

  for r in
    select s.id as sale_id, s.numero as numero_md, s.total_amount, s.notes as notas_md,
           coalesce(nullif(btrim(l.legal_name), ''), l.trade_name)          as cliente,
           regexp_replace(coalesce(l.cnpj, ''), '\D', '', 'g')              as doc,
           l.ie, l.email, l.contact_phone,
           l.logradouro, l.numero as num_end, l.bairro, l.city, l.state,
           regexp_replace(coalesce(l.cep, ''), '\D', '', 'g')               as cep
      from produtos.sales s
      join produtos.leads l on l.id = s.customer_lead_id
     where s.id in ('d0dc95ff-aa43-46f3-9e67-7fe4ea0a723a','bb78d22f-6643-44a6-a432-4a85fdb2ef6b',
                    'b42827e8-90cc-4eb1-a336-3bfaa44c434f','2ac6f251-797a-4f98-b9ae-1f121721c7fb',
                    '50ac8c9c-4215-4a94-b58f-cc099b830100','51340a07-1863-4e19-9afa-2cc851f3a11f',
                    '1befffd1-8abb-4126-a30d-3fce8a8497b5')
       and s.status = 'venda'
     order by s.sold_at
  loop
    if exists (select 1 from public.carboze_orders o
                where o.internal_notes like '%md:' || r.sale_id::text || '%') then
      raise notice '% já importada, pulada', r.numero_md;
      continue;
    end if;

    select count(*) into v_sem_mapa
      from produtos.sale_items i
      join produtos.products pr on pr.id = i.product_id
     where i.sale_id = r.sale_id and pr.sku not in ('CARBOZE-100ML', 'CARBOZE-SACHE');
    if v_sem_mapa > 0 then
      raise exception 'Venda % tem produto sem equivalente no Sales. Nada foi gravado.', r.numero_md;
    end if;

    select jsonb_agg(jsonb_build_object(
             'name',            case pr.sku when 'CARBOZE-100ML' then p100.nome else psache.nome end,
             'quantity',        i.quantity,
             'unit_price',      i.unit_price,
             'bonificacao',     0,
             'discount_type',   'none',
             'discount_value',  0,
             'discount_amount', 0,
             'total',           i.subtotal,
             'product_id',      case pr.sku when 'CARBOZE-100ML' then p100.id else psache.id end,
             'product_code',    case pr.sku when 'CARBOZE-100ML' then p100.product_code else psache.product_code end,
             'is_bonificacao',  false) order by i.id),
           sum(i.subtotal)
      into v_items, v_total
      from produtos.sale_items i
      join produtos.products pr on pr.id = i.product_id
     where i.sale_id = r.sale_id;

    if v_total is distinct from r.total_amount then
      raise exception 'Venda %: itens somam % e o total é %. Nada foi gravado.', r.numero_md, v_total, r.total_amount;
    end if;

    insert into public.carboze_orders (
      order_number, status,
      customer_name, customer_email, customer_phone, cnpj, customer_ie,
      delivery_address, delivery_city, delivery_state, delivery_zip, billing_address,
      payment_terms, freight_type,
      items, subtotal, shipping_cost, discount, total,
      discount_type, discount_percent, discount_requested_by,
      notes, internal_notes,
      vendedor_id, vendedor_name
    ) values (
      '', 'pending',
      r.cliente, nullif(r.email, ''), nullif(r.contact_phone, ''), nullif(r.doc, ''), nullif(r.ie, ''),
      nullif(concat_ws(', ', nullif(btrim(r.logradouro), ''), nullif(btrim(r.num_end), ''))
             || coalesce(' - ' || nullif(btrim(r.bairro), ''), ''), ''),
      r.city, r.state, nullif(r.cep, ''), null,
      'Boleto faturado (30/60 dias)', null,
      v_items, v_total, 0, 0, v_total,
      'none', 0, v_vendedor,
      r.notas_md,
      'Importada do Portal de Microdistribuidores (md) — venda ' || r.numero_md || ' · md:' || r.sale_id::text,
      v_vendedor, v_vend_nome
    ) returning order_number into v_num;

    v_feitas := v_feitas + 1;
    raise notice '% (%) → %', r.numero_md, r.cliente, v_num;
  end loop;

  raise notice 'Vendas criadas: %', v_feitas;
end $$;

-- Conferência: 7 linhas, Marcio Cajahiba, total R$ 9.408,00.
-- select order_number, customer_name, total, vendedor_name
--   from public.carboze_orders where internal_notes like '%md:%' order by created_at;
