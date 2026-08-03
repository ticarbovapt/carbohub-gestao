-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 5 — o e-commerce passa a deixar rastro no estoque (HUB-SP)
--
-- O HUB-SP é o hub mais cego dos três: o trigger `handle_ecommerce_order_sp_stock`
-- move `warehouse_stock` a cada mudança de status de pedido e nunca registra
-- nada. Das 115 movimentações que existiam antes desta série de etapas, só 6
-- eram do HUB-SP — e todas de ajuste manual. Toda venda de marketplace era
-- invisível.
--
-- ⚠️ ESTA ETAPA É DIFERENTE DAS DUAS ANTERIORES, e o motivo importa:
--
-- Nas funções de venda e de produção, o delta aplicado é sempre o pedido.
-- Aqui NÃO é. O trigger faz:
--
--     SET quantity = GREATEST(0, quantity - v_desired)
--
-- O `GREATEST(0, …)` TRUNCA NO ZERO: se o saldo é 10 e o pedido pede 30, o
-- estoque cai 10, não 30. E o `UPDATE ... WHERE` não é upsert — se o produto
-- não tem linha naquele hub, nada acontece.
--
-- Registrar `v_desired` seria mentir nos dois casos, e mentir de um jeito que
-- ninguém pega: o movimento diria 30, o saldo teria caído 10, e a diferença
-- viraria "sumiço de estoque" na primeira conferência de galpão.
--
-- Por isso aqui o movimento é registrado a partir do delta REAL, medido lendo
-- o saldo antes e depois. É mais código, e é a única forma honesta.
--
-- O truncamento em si NÃO é corrigido aqui — é comportamento antigo, e mudá-lo
-- é decisão de negócio (permitir saldo negativo no HUB-SP?). O que muda é que
-- ele deixa de ser invisível.
-- ═══════════════════════════════════════════════════════════════════════════

-- Registro do movimento de e-commerce. Assinatura própria porque a origem não
-- é `carboze_orders`: o pedido de marketplace vive em `ecommerce_orders` e não
-- tem card no Rastreio. Vai em `origem_id` (o par polimórfico que já existia),
-- com `order_id`/`op_id` nulos — não há card para apontar.
create or replace function public.carbo_reg_mov_ecommerce(
  p_eco_id uuid, p_wh uuid, p_product uuid, p_delta numeric,
  p_plataforma text, p_pedido text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_product is null or coalesce(p_delta, 0) = 0 or p_wh is null then return; end if;

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
  values
    (p_product, p_wh,
     case when p_delta > 0 then 'entrada' else 'saida' end,
     abs(p_delta), 'venda', p_eco_id,
     'E-commerce'
       || coalesce(' · ' || initcap(p_plataforma), '')
       || coalesce(' · pedido ' || p_pedido, ''),
     -- Sempre null aqui: quem dispara é webhook/cron, não pessoa logada.
     null);
exception when others then
  -- Histórico não trava a sincronização do marketplace. Este trigger é BEFORE
  -- e roda em TODA mudança de status: derrubá-lo perderia o pedido inteiro.
  return;
end $$;

comment on function public.carbo_reg_mov_ecommerce is
  'Registra em stock_movements a baixa/devolução de estoque de um pedido de e-commerce (origem=venda, origem_id=ecommerce_orders.id). Nunca levanta exceção.';


CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_new_product   uuid;
  v_units_per_kit numeric;
  v_warehouse_id  uuid;
  v_consumes      boolean;
  v_desired       numeric;   -- quanto este pedido DEVE baixar agora (produto atual)
  v_old_product   uuid;      -- de qual produto baixou da última vez
  v_old_units     numeric;   -- quanto baixou da última vez
  v_antes         numeric;   -- saldo antes do UPDATE (para medir o delta REAL)
  v_depois        numeric;   -- saldo depois
BEGIN
  SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'HUB-SP' AND is_active = true LIMIT 1;

  -- Produto + multiplicador ATUAIS do SKU (específico da plataforma vence o genérico).
  IF NEW.product_sku IS NOT NULL THEN
    SELECT sm.product_id, sm.units_per_kit
      INTO v_new_product, v_units_per_kit
    FROM sku_product_mappings sm
    WHERE sm.platform_sku = NEW.product_sku
      AND sm.is_active = true
      AND (sm.platform = NEW.platform OR sm.platform IS NULL)
    ORDER BY (sm.platform = NEW.platform) DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_consumes := (NEW.status IN ('paid', 'shipped', 'delivered'));

  IF v_consumes AND v_new_product IS NOT NULL AND COALESCE(NEW.quantity, 0) <> 0 THEN
    v_desired := NEW.quantity * COALESCE(v_units_per_kit, 1);
  ELSE
    v_desired := 0;
  END IF;

  v_old_product := CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock_deducted_product_id ELSE NULL END;
  v_old_units   := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.stock_deducted_units, 0) ELSE 0 END;

  IF v_warehouse_id IS NOT NULL THEN
    -- 1) Devolve a baixa anterior ao produto de antes.
    IF v_old_product IS NOT NULL AND v_old_units <> 0 THEN
      SELECT quantity INTO v_antes FROM warehouse_stock
        WHERE warehouse_id = v_warehouse_id AND product_id = v_old_product FOR UPDATE;
      UPDATE warehouse_stock
        SET quantity = quantity + v_old_units, updated_at = NOW()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_old_product
      RETURNING quantity INTO v_depois;
      -- Delta REAL, não o pretendido. Se a linha não existia, v_antes e
      -- v_depois vêm nulos e nada é registrado — que é a verdade.
      IF v_antes IS NOT NULL AND v_depois IS NOT NULL AND v_depois <> v_antes THEN
        PERFORM public.carbo_reg_mov_ecommerce(
          NEW.id, v_warehouse_id, v_old_product, v_depois - v_antes,
          NEW.platform, NEW.order_id);
      END IF;
    END IF;

    -- 2) Aplica a baixa atual ao produto de agora.
    IF v_desired <> 0 AND v_new_product IS NOT NULL THEN
      SELECT quantity INTO v_antes FROM warehouse_stock
        WHERE warehouse_id = v_warehouse_id AND product_id = v_new_product FOR UPDATE;
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, quantity - v_desired), updated_at = NOW()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_new_product
      RETURNING quantity INTO v_depois;
      -- ⚠️ Aqui o GREATEST(0, …) pode ter truncado: o saldo caiu menos do que
      -- o pedido pediu. `v_depois - v_antes` captura o que REALMENTE saiu.
      IF v_antes IS NOT NULL AND v_depois IS NOT NULL AND v_depois <> v_antes THEN
        PERFORM public.carbo_reg_mov_ecommerce(
          NEW.id, v_warehouse_id, v_new_product, v_depois - v_antes,
          NEW.platform, NEW.order_id);
      END IF;
    END IF;
  END IF;

  NEW.stock_deducted_units      := v_desired;
  NEW.stock_deducted_product_id := CASE WHEN v_desired <> 0 THEN v_new_product ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- O trigger continua o mesmo (BEFORE INSERT OR UPDATE) — só a função mudou,
-- então não é preciso recriá-lo. Recriar pegaria AccessExclusiveLock em
-- ecommerce_orders, que o webhook escreve a qualquer momento.


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Nada retroativo: o HUB-SP deve continuar só com os 6 'ajuste' até que
--     um pedido de marketplace mude de status.
select w.code as hub, m.origem, count(*) as movimentos
from public.stock_movements m
left join public.warehouses w on w.id = m.warehouse_id
group by 1, 2
order by 1 nulls last, 3 desc;

-- (b) Quanto o e-commerce diz ter baixado hoje, por produto. É a base de
--     comparação: daqui pra frente, cada mudança de status gera movimento.
select p.name as produto,
       count(*) as pedidos,
       sum(o.stock_deducted_units) as unidades_baixadas
from public.ecommerce_orders o
join public.mrp_products p on p.id = o.stock_deducted_product_id
where o.stock_deducted_units > 0
group by 1
order by 3 desc;

-- (c) O truncamento tem mordido? Produto do HUB-SP zerado com pedido pedindo
--     baixa é o sintoma de saldo que parou no zero e venda que saiu mesmo
--     assim. Se vier linha aqui, o estoque do SP está devendo.
select p.name as produto, ws.quantity as saldo_sp
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id and w.code = 'HUB-SP'
join public.mrp_products p on p.id = ws.product_id
where ws.quantity <= 0
order by 1;
