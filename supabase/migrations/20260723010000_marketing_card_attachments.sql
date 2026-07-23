-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — anexos do cartão (C1). Modelo de REFERÊNCIA (não armazena
-- bytes): o anexo aponta para um arquivo do Google Drive (ou link externo).
--
-- Por que Drive por referência: quando o designer sobe uma nova versão do
-- arquivo no Drive ("Gerenciar versões"), o ID/link NÃO muda — então o cartão
-- passa a mostrar a nova versão sozinho, sem re-upload e sem pesar o banco.
--
-- Sem bucket de Storage. RLS/Realtime coerentes com o resto do módulo (Fase 1:
-- aberto a autenticado — espaço do time).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mkt_card_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('drive', 'link')),
  name          text NOT NULL,                 -- nome exibido
  external_url  text NOT NULL,                 -- link do Drive ou link externo
  drive_file_id text,                          -- ID extraído do link (kind='drive')
  thumbnail_url text,                          -- miniatura do Drive (se compartilhado)
  mime_type     text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_att_card ON public.mkt_card_attachments(card_id);

ALTER TABLE public.mkt_card_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_card_attachments_all ON public.mkt_card_attachments;
CREATE POLICY mkt_card_attachments_all ON public.mkt_card_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime (badge/lista atualiza ao vivo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mkt_card_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mkt_card_attachments;
  END IF;
END $$;
