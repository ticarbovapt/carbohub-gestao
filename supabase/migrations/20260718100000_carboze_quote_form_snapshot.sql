-- ─────────────────────────────────────────────────────────────────────────────
-- Editar orçamento: guarda um SNAPSHOT do formulário do /vender (JSON) para
-- reabrir o orçamento e pré-preencher TUDO fielmente (forma de pagamento,
-- endereço estruturado, campos estratégicos etc.), sem depender do "achatado".
-- Aditivo; não afeta nada existente. Orçamentos antigos ficam com NULL (o app
-- cai num preenchimento best-effort pelas colunas).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS quote_form_snapshot jsonb;

NOTIFY pgrst, 'reload schema';
