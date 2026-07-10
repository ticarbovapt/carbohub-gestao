-- ─────────────────────────────────────────────────────────────────────────────
-- Pós-venda (Carbo Ops) × Faturamento (Carbo Finanças): etapa de Nota Fiscal.
--
-- Dois estágios novos ANTES de "Em Transporte":
--   • gerar_nf       → libera o pedido no Faturamento (Finanças) pra emitir a NF.
--   • nf_finalizada  → a NF foi vinculada (bling_nf_id) → o card avança sozinho.
--
-- Enquanto o card não chega em "gerar_nf", ele aparece no Faturamento mas o botão
-- "Criar no Bling" fica travado (o front mostra em que etapa do pós-venda está).
--
-- O avanço gerar_nf → nf_finalizada é automático: um trigger detecta quando o
-- bling_nf_id passa de nulo p/ preenchido (NF casada pela sincronização do Bling)
-- e move o estágio — imune a por qual caminho a NF foi vinculada.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_fulfillment_stage_check;

ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_fulfillment_stage_check
  CHECK (fulfillment_stage IN (
    'nova_venda', 'separacao_pendente', 'criar_op', 'separando', 'separado',
    'gerar_nf', 'nf_finalizada',
    'em_transporte', 'entregue', 'cancelado'
  ));

-- Quando a NF é vinculada (bling_nf_id vira não-nulo) e o card está aguardando
-- em "gerar_nf", avança pra "nf_finalizada". Só age nesse estágio: não puxa de
-- volta pedidos que já seguiram (em_transporte/entregue), nem mexe em Bling puro.
CREATE OR REPLACE FUNCTION public.carboze_orders_nf_autostage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bling_nf_id IS NOT NULL
     AND OLD.bling_nf_id IS NULL
     AND NEW.fulfillment_stage = 'gerar_nf' THEN
    NEW.fulfillment_stage := 'nf_finalizada';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carboze_orders_nf_autostage ON public.carboze_orders;
CREATE TRIGGER trg_carboze_orders_nf_autostage
  BEFORE UPDATE ON public.carboze_orders
  FOR EACH ROW EXECUTE FUNCTION public.carboze_orders_nf_autostage();
