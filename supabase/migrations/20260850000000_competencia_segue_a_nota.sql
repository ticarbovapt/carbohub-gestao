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

  -- ⚠️ JANELA DE SANIDADE (45 dias)
  --
  -- Ao medir no banco real apareceram notas emitidas ANTES da venda existir —
  -- uma "venda de jun/2026" com NF de set/2025. Investigado: NÃO é vínculo
  -- errado. Os valores batem exatamente e o casamento foi manual. São pedidos
  -- BLING-*, importados: o `created_at` deles é a data em que o sync os trouxe,
  -- não a data da venda. A NF é que sabe o mês certo.
  --
  -- Ou seja, esses pedidos já estão no mês errado hoje, e a regra os
  -- consertaria. A janela existe mesmo assim porque consertá-los mexe em mês
  -- FECHADO (set e nov de 2025), o que pode desencontrar de contabilidade e
  -- comissão já pagas. Decisão do negócio, não do código.
  --
  -- A janela cobre o caso corrente (fechou 31/07, faturou 03/08) e deixa o
  -- resto visível para alguém decidir:
  --   select * from public.carbo_competencia_suspeita;
  IF NEW.data_emissao < (SELECT coalesce(o.sale_date, o.created_at::date)
                         FROM public.carboze_orders o WHERE o.id = NEW.order_id)
     OR NEW.data_emissao > (SELECT coalesce(o.sale_date, o.created_at::date) + 45
                            FROM public.carboze_orders o WHERE o.id = NEW.order_id)
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
  AND o.sale_date IS DISTINCT FROM nf.data_emissao
  -- Mesma janela do trigger: só ajusta o que é plausivelmente a mesma venda.
  AND nf.data_emissao >= coalesce(o.sale_date, o.created_at::date)
  AND nf.data_emissao <= coalesce(o.sale_date, o.created_at::date) + 45;

NOTIFY pgrst, 'reload schema';

-- ── 3) O que precisa de olho humano ─────────────────────────────────────────
-- Duas coisas diferentes, e misturá-las faz a lista virar ruído:
--
--   valor_pedido ≠ valor_nf  → VÍNCULO ERRADO. Nota casada com o pedido errado.
--                              Não é problema de competência — é faturamento
--                              pendurado no lugar errado. Prioridade.
--
--   mês diferente            → competência a corrigir, mas fora da janela.
--                              Típico de BLING-* importado, cujo created_at é a
--                              data da importação. Corrigir mexe em mês fechado.
--
-- De propósito NÃO entra aqui a nota emitida poucos dias antes do pedido
-- aparecer no sistema: em pedido importado isso é rotina (a nota é anterior ao
-- sync) e o mês costuma ser o mesmo. Sinalizar isso só ensinava a ignorar a lista.
CREATE OR REPLACE VIEW public.carbo_competencia_suspeita AS
SELECT o.order_number,
       o.customer_name,
       CASE
         WHEN abs(coalesce(n.valor_total, 0) - coalesce(o.total, 0)) > 0.01
           THEN 'VÍNCULO ERRADO'
         ELSE 'competência fora da janela'
       END                                                           AS problema,
       coalesce(o.sale_date, o.created_at::date)                     AS data_venda,
       n.numero                                                      AS nf,
       n.data_emissao                                                AS data_nf,
       (n.data_emissao - coalesce(o.sale_date, o.created_at::date))  AS dias_de_distancia,
       o.total                                                       AS valor_pedido,
       n.valor_total                                                 AS valor_nf,
       n.match_status
FROM public.carboze_orders o
JOIN public.bling_nfe n ON n.order_id = o.id
WHERE n.data_emissao IS NOT NULL
  AND coalesce(n.situacao, '') NOT ILIKE '%cancel%'
  AND o.status IN ('pending', 'confirmed', 'invoiced', 'shipped', 'delivered')
  AND (
    -- Valor divergente: sempre vale olhar, mesmo com data batendo.
    abs(coalesce(n.valor_total, 0) - coalesce(o.total, 0)) > 0.01
    -- Ou a competência mudaria de MÊS e ficou fora da janela.
    OR (
      to_char(n.data_emissao, 'YYYY-MM')
        <> to_char(coalesce(o.sale_date, o.created_at::date), 'YYYY-MM')
      AND (
        n.data_emissao < coalesce(o.sale_date, o.created_at::date)
        OR n.data_emissao > coalesce(o.sale_date, o.created_at::date) + 45
      )
    )
  )
ORDER BY (abs(coalesce(n.valor_total, 0) - coalesce(o.total, 0)) > 0.01) DESC,
         abs(n.data_emissao - coalesce(o.sale_date, o.created_at::date)) DESC;

GRANT SELECT ON public.carbo_competencia_suspeita TO authenticated;

COMMENT ON VIEW public.carbo_competencia_suspeita IS
  'O que a regra de competência não resolve sozinha. problema=VÍNCULO ERRADO: '
  'nota casada com pedido errado (valores não batem) — faturamento no lugar '
  'errado, prioridade. problema=competência fora da janela: vínculo certo, mas '
  'corrigir o mês mexeria em período fechado. Nenhum dos dois foi alterado.';

NOTIFY pgrst, 'reload schema';
