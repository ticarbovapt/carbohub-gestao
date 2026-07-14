-- Garantias da re-auditoria — Onda 2 (sem mudar o fluxo).

-- ── A) Dwell do Rastreio: coluna própria (updated_at é poluído por outros
--       triggers, ex. op_sync_production_done, e zerava o "parado há X").
--       Adicionada SEM reescrever a tabela (nullable → default → backfill).
ALTER TABLE public.carboze_orders ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;
ALTER TABLE public.carboze_orders ALTER COLUMN stage_changed_at SET DEFAULT now();
UPDATE public.carboze_orders
  SET stage_changed_at = coalesce(updated_at, created_at, now())
  WHERE stage_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_carboze_stage_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fulfillment_stage IS DISTINCT FROM OLD.fulfillment_stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_carboze_stage_changed ON public.carboze_orders;
CREATE TRIGGER trg_carboze_stage_changed
BEFORE UPDATE OF fulfillment_stage ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_carboze_stage_changed();

-- ── B) Última movimentação por OP no servidor (DISTINCT ON) — o cliente parava
--       de puxar o histórico inteiro a cada 60s.
CREATE OR REPLACE FUNCTION public.op_last_moves(p_ids uuid[])
RETURNS TABLE (op_id uuid, to_status text, moved_by uuid, moved_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (m.op_id) m.op_id, m.to_status, m.moved_by, m.moved_at
  FROM public.production_order_moves m
  WHERE m.op_id = ANY (p_ids)
  ORDER BY m.op_id, m.moved_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.op_last_moves(uuid[]) TO authenticated;

-- ── C) Auditoria de exclusão de OP: antes o CASCADE apagava todo o histórico e
--       a exclusão não era registrada. Agora o histórico sobrevive (FK SET NULL
--       + op_number denormalizado) e a exclusão vira um evento "excluída · por".
ALTER TABLE public.production_order_moves ADD COLUMN IF NOT EXISTS op_number text;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.production_order_moves'::regclass AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%production_orders%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.production_order_moves DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE public.production_order_moves
  ADD CONSTRAINT production_order_moves_op_id_fkey
  FOREIGN KEY (op_id) REFERENCES public.production_orders(id) ON DELETE SET NULL;

-- log de move passa a gravar op_number (identifica a OP mesmo após excluída)
CREATE OR REPLACE FUNCTION public.trg_op_log_move()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.op_status IS DISTINCT FROM OLD.op_status THEN
    INSERT INTO public.production_order_moves (op_id, op_number, from_status, to_status, moved_by)
      VALUES (NEW.id, NEW.op_number, OLD.op_status, NEW.op_status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_op_log_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.production_order_moves (op_id, op_number, from_status, to_status, moved_by)
    VALUES (NULL, OLD.op_number, OLD.op_status, 'excluida', auth.uid());
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_op_log_delete ON public.production_orders;
CREATE TRIGGER trg_op_log_delete
AFTER DELETE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_op_log_delete();
