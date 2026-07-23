-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — Campos Personalizados por quadro (C2).
--
-- Schema flexível: cada quadro define seus campos; cada cartão guarda o valor
-- num `value jsonb` (formato varia pelo tipo). Assim, adicionar um tipo novo no
-- futuro não exige migration. Opções de seleção têm id estável (renomear rótulo
-- não quebra valores já salvos).
--
-- Formato do value por tipo:
--   text/url  → "texto"        number → 42        date → "2026-07-23"
--   checkbox  → true/false     select → "opt_id"  multiselect → ["opt_id", ...]
--
-- RLS/Realtime coerentes com o resto do módulo (Fase 1: aberto a autenticado).
-- ─────────────────────────────────────────────────────────────────────────────

-- Definição do campo (por quadro).
CREATE TABLE IF NOT EXISTS public.mkt_custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES public.mkt_boards(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  type       text NOT NULL CHECK (type IN ('text','number','date','select','multiselect','checkbox','url')),
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,label,color?}] p/ select/multiselect
  position   double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_custom_fields_board ON public.mkt_custom_fields(board_id);

-- Valor do campo (por cartão).
CREATE TABLE IF NOT EXISTS public.mkt_card_field_values (
  card_id    uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  field_id   uuid NOT NULL REFERENCES public.mkt_custom_fields(id) ON DELETE CASCADE,
  value      jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, field_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_cfv_card ON public.mkt_card_field_values(card_id);

DROP TRIGGER IF EXISTS trg_mkt_cfv_touch ON public.mkt_card_field_values;
CREATE TRIGGER trg_mkt_cfv_touch BEFORE UPDATE ON public.mkt_card_field_values
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

-- RLS (autenticado).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mkt_custom_fields','mkt_card_field_values'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Realtime.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mkt_custom_fields','mkt_card_field_values'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
