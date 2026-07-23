-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — "Trello interno" (Fase 1: fundação).
--
-- Hierarquia: Área de trabalho → Quadro → Lista → Cartão. O CARTÃO é modelado
-- rico desde já (datas, capa, etiquetas, checklists, membros, comentários) para
-- que as views futuras (calendário, timeline, tabela, mapa) sejam só camadas de
-- apresentação sobre o MESMO modelo.
--
-- Padrão Trello: ARQUIVAR em vez de excluir (is_archived); a exclusão definitiva
-- parte dos itens arquivados. Ordenação por `position` (numeric) — insere entre
-- dois itens fazendo a média, sem reindexar tudo.
--
-- Acesso (Fase 1): o app já é gated por allowed_interfaces=carbo_mkt no
-- ProtectedRoute; aqui as tabelas liberam para qualquer autenticado (espaço
-- compartilhado do time de marketing). Permissões finas (workspace/quadro) ficam
-- para a fase de governança.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger util de updated_at (idempotente).
CREATE OR REPLACE FUNCTION public.mkt_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ── Área de trabalho ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Quadro ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_boards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.mkt_workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  background   text NOT NULL DEFAULT 'blue',  -- cor/gradiente do fundo
  position     double precision NOT NULL DEFAULT 0,
  is_archived  boolean NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_boards_workspace ON public.mkt_boards(workspace_id) WHERE NOT is_archived;

-- ── Lista (coluna) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid NOT NULL REFERENCES public.mkt_boards(id) ON DELETE CASCADE,
  title       text NOT NULL,
  position    double precision NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_lists_board ON public.mkt_lists(board_id) WHERE NOT is_archived;

-- ── Cartão (o objeto rico) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id      uuid NOT NULL REFERENCES public.mkt_lists(id) ON DELETE CASCADE,
  board_id     uuid NOT NULL REFERENCES public.mkt_boards(id) ON DELETE CASCADE, -- denormalizado p/ queries/views
  title        text NOT NULL,
  description  text,
  position     double precision NOT NULL DEFAULT 0,
  start_date   timestamptz,
  due_date     timestamptz,
  is_complete  boolean NOT NULL DEFAULT false,   -- status concluído/incompleto da data
  cover        text,                              -- cor da capa (ou null)
  -- Localização (p/ view de Mapa futura, sem custo agora):
  location_lat double precision,
  location_lng double precision,
  location_name text,
  is_archived  boolean NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_cards_list ON public.mkt_cards(list_id) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_mkt_cards_board ON public.mkt_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_mkt_cards_due ON public.mkt_cards(board_id, due_date) WHERE due_date IS NOT NULL AND NOT is_archived;

-- ── Etiquetas (por quadro) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_labels (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id  uuid NOT NULL REFERENCES public.mkt_boards(id) ON DELETE CASCADE,
  name      text NOT NULL DEFAULT '',
  color     text NOT NULL,   -- ex.: 'green','yellow','orange','red','purple','blue'...
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_labels_board ON public.mkt_labels(board_id);

CREATE TABLE IF NOT EXISTS public.mkt_card_labels (
  card_id  uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.mkt_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

-- ── Membros do cartão ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_card_members (
  card_id uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, user_id)
);

-- ── Checklists e itens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_checklists (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id   uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  title     text NOT NULL DEFAULT 'Checklist',
  position  double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_checklists_card ON public.mkt_checklists(card_id);

CREATE TABLE IF NOT EXISTS public.mkt_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.mkt_checklists(id) ON DELETE CASCADE,
  text         text NOT NULL,
  is_done      boolean NOT NULL DEFAULT false,
  position     double precision NOT NULL DEFAULT 0,
  due_date     timestamptz,                         -- checklist avançado (item com data)
  assignee_id  uuid REFERENCES public.profiles(id), -- checklist avançado (responsável)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_checklist_items_cl ON public.mkt_checklist_items(checklist_id);

-- ── Comentários ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    uuid NOT NULL REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_comments_card ON public.mkt_comments(card_id);

-- ── Log de atividade (por quadro/cartão) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES public.mkt_boards(id) ON DELETE CASCADE,
  card_id    uuid REFERENCES public.mkt_cards(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES public.profiles(id),
  type       text NOT NULL,     -- ex.: 'card.create','card.move','card.archive','comment.add'
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_activity_board ON public.mkt_activity(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_activity_card ON public.mkt_activity(card_id, created_at DESC);

-- ── updated_at triggers ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mkt_boards_touch ON public.mkt_boards;
CREATE TRIGGER trg_mkt_boards_touch BEFORE UPDATE ON public.mkt_boards
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mkt_lists_touch ON public.mkt_lists;
CREATE TRIGGER trg_mkt_lists_touch BEFORE UPDATE ON public.mkt_lists
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mkt_cards_touch ON public.mkt_cards;
CREATE TRIGGER trg_mkt_cards_touch BEFORE UPDATE ON public.mkt_cards
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

-- ── RLS (Fase 1: aberto a autenticado — espaço do time) ──────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mkt_workspaces','mkt_boards','mkt_lists','mkt_cards','mkt_labels',
    'mkt_card_labels','mkt_card_members','mkt_checklists','mkt_checklist_items',
    'mkt_comments','mkt_activity'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ── Realtime: colaboração ao vivo (vários marqueteiros no mesmo quadro) ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mkt_boards','mkt_lists','mkt_cards','mkt_card_labels','mkt_card_members','mkt_checklist_items','mkt_comments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Área de trabalho padrão do time ──────────────────────────────────────────
INSERT INTO public.mkt_workspaces (name)
SELECT 'Marketing'
WHERE NOT EXISTS (SELECT 1 FROM public.mkt_workspaces);
