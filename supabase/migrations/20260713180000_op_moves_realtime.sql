-- Kanban de Produção compartilhado: tempo real + log de quem moveu + tempo
-- parado na etapa. Triggers garantem o registro em QUALQUER caminho (arraste,
-- diálogo, RPC de conclusão) — não depende do front lembrar de gravar.

-- 1) Momento em que a OP entrou na etapa atual (para "parado há X").
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS stage_since timestamptz NOT NULL DEFAULT now();

-- 2) Log de movimentações (auditoria de quem moveu o card, de onde pra onde).
CREATE TABLE IF NOT EXISTS public.production_order_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id       uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text,
  moved_by    uuid,
  moved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_moves_op ON public.production_order_moves(op_id, moved_at DESC);

ALTER TABLE public.production_order_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS op_moves_read ON public.production_order_moves;
CREATE POLICY op_moves_read ON public.production_order_moves FOR SELECT TO authenticated USING (true);

-- 3) BEFORE: ao mudar de etapa, zera o cronômetro "parado há X".
CREATE OR REPLACE FUNCTION public.trg_op_stage_since()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.op_status IS DISTINCT FROM OLD.op_status THEN
    NEW.stage_since := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_op_stage_since ON public.production_orders;
CREATE TRIGGER trg_op_stage_since
BEFORE UPDATE OF op_status ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_op_stage_since();

-- 4) AFTER: registra a movimentação com quem fez (auth.uid()). SECURITY DEFINER
--    para gravar o log mesmo com a RLS de escrita fechada na tabela de log.
CREATE OR REPLACE FUNCTION public.trg_op_log_move()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.op_status IS DISTINCT FROM OLD.op_status THEN
    INSERT INTO public.production_order_moves (op_id, from_status, to_status, moved_by)
      VALUES (NEW.id, OLD.op_status, NEW.op_status, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_op_log_move ON public.production_orders;
CREATE TRIGGER trg_op_log_move
AFTER UPDATE OF op_status ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_op_log_move();

-- 5) Realtime: o kanban assina production_orders para mover ao vivo na tela de
--    todos os logados. production_order_moves também, para o "movido por" vivo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['production_orders','production_order_moves'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
