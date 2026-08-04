-- Pedido é editável enquanto NÃO tiver nota faturada
--
-- Regra do negócio: se a NF ainda não saiu, dá para mexer em quantidade, item e
-- preço. Depois que a nota existe, o pedido está congelado — a NF já foi para a
-- SEFAZ e o pedido tem de continuar sendo o espelho dela.
--
-- Isso é o que torna a recorrência útil de verdade: o cliente pode aumentar ou
-- reduzir a quantidade de um mês futuro até a véspera do faturamento daquele
-- mês, sem precisar cancelar e refazer o pedido.
--
-- A trava mora no BANCO, não na tela. A tela /vender existe em seis apps e o
-- pedido também é alterado por outros caminhos (Bling, importação, pós-venda);
-- regra só no front seria regra que vale em alguns lugares.
--
-- Trava o COMERCIAL (itens, valores, desconto). Não trava o OPERACIONAL
-- (rastreio, etapa, entrega) — depois da NF esses campos ainda precisam andar,
-- e é justamente aí que o pedido caminha para a entrega.

CREATE OR REPLACE FUNCTION public.carbo_pedido_faturado(o public.carboze_orders)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT o.invoice_number  IS NOT NULL
      OR o.nf_access_key   IS NOT NULL
      OR o.bling_nf_id     IS NOT NULL
      OR o.status IN ('invoiced', 'shipped', 'delivered')
$$;

COMMENT ON FUNCTION public.carbo_pedido_faturado IS
  'Pedido já tem nota? Qualquer marca de NF (número, chave, id Bling) ou status '
  'de invoiced em diante. Enquanto for false, o comercial do pedido é editável.';

CREATE OR REPLACE FUNCTION public.carbo_bloqueia_edicao_pos_nf()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Só interessa o estado ANTERIOR: se ainda não estava faturado, libera.
  IF NOT public.carbo_pedido_faturado(OLD) THEN
    RETURN NEW;
  END IF;

  -- Cancelamento continua permitido: é a saída legítima de um pedido faturado
  -- (a RPC de cancelamento estorna estoque e marca a etapa).
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.items    IS DISTINCT FROM OLD.items
  OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
  OR NEW.total    IS DISTINCT FROM OLD.total
  OR NEW.discount IS DISTINCT FROM OLD.discount THEN
    RAISE EXCEPTION
      'Pedido % já foi faturado (NF %) — itens e valores não podem mais mudar. '
      'Para corrigir, cancele e refaça, ou emita nota complementar.',
      OLD.order_number, coalesce(OLD.invoice_number, OLD.nf_access_key, 'emitida');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carbo_bloqueia_edicao_pos_nf ON public.carboze_orders;
CREATE TRIGGER trg_carbo_bloqueia_edicao_pos_nf
BEFORE UPDATE ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.carbo_bloqueia_edicao_pos_nf();

NOTIFY pgrst, 'reload schema';
