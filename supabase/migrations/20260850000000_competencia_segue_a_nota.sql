-- A venda conta no mês em que foi FATURADA, não no que foi vendida
--
-- Pedido fechado em 31/07 com NF emitida em 03/08 é faturamento de AGOSTO. Hoje
-- ele fica em julho, porque o mês sai de `sale_date ?? created_at` e ninguém
-- mexia no sale_date quando a nota saía.
--
-- Por que usar `sale_date` em vez de criar coluna nova: ele JÁ é a data efetiva
-- da venda — o comentário original diz "data corrigida da venda (head/command
-- podem alterar para ajuste de mês/semana)" — e praticamente todo consumidor já
-- lê `coalesce(sale_date, created_at)`: a RPC ops_comercial_dashboard, as metas
-- de vendedor, o Faturamento, as telas de venda. Preenchendo aqui, os vinte e
-- poucos lugares passam a acertar juntos, sem cada um implementar a regra —
-- que é exatamente como as divergências deste repo começaram.
--
-- NF cancelada NÃO define competência: ela não é faturamento. Nesse caso o
-- pedido permanece com a data que tinha.
--
-- head/command continuam podendo corrigir o sale_date à mão depois; nada aqui
-- trava o campo.

-- ── 1) Mantém a competência colada na nota, daqui pra frente ─────────────────
CREATE OR REPLACE FUNCTION public.carbo_competencia_da_nf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NULL
     OR NEW.data_emissao IS NULL
     OR coalesce(NEW.situacao, '') ILIKE '%cancel%'
  THEN
    RETURN NEW;
  END IF;

  UPDATE public.carboze_orders
  SET sale_date  = NEW.data_emissao,
      updated_at = now()
  WHERE id = NEW.order_id
    AND sale_date IS DISTINCT FROM NEW.data_emissao;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.carbo_competencia_da_nf IS
  'Ao casar/atualizar uma NF, joga a competência do pedido para a data de '
  'emissão dela. NF cancelada não mexe — não é faturamento.';

DROP TRIGGER IF EXISTS trg_carbo_competencia_da_nf ON public.bling_nfe;
CREATE TRIGGER trg_carbo_competencia_da_nf
AFTER INSERT OR UPDATE OF order_id, data_emissao, situacao ON public.bling_nfe
FOR EACH ROW EXECUTE FUNCTION public.carbo_competencia_da_nf();

-- ── 2) Corrige o que já está no banco ───────────────────────────────────────
-- Alcança os pedidos de 31/07 faturados em agosto, que foi o que motivou isto.
WITH nf AS (
  SELECT DISTINCT ON (n.order_id)
         n.order_id, n.data_emissao
  FROM public.bling_nfe n
  WHERE n.order_id IS NOT NULL
    AND n.data_emissao IS NOT NULL
    AND coalesce(n.situacao, '') NOT ILIKE '%cancel%'
  ORDER BY n.order_id, n.data_emissao ASC   -- a 1ª nota válida define o mês
)
UPDATE public.carboze_orders o
SET sale_date  = nf.data_emissao,
    updated_at = now()
FROM nf
WHERE nf.order_id = o.id
  AND o.sale_date IS DISTINCT FROM nf.data_emissao;

NOTIFY pgrst, 'reload schema';
