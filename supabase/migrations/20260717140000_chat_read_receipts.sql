-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — recibos de leitura (enviada / entregue / lida).
-- Constrói sobre chat_channel_members.last_read_at (já existe, avançado pelo
-- chat_mark_read ao abrir). Adiciona last_delivered_at para o estado "entregue"
-- (antes de abrir): o cliente marca ao RECEBER a mensagem (via ChatAlerts).
-- A tabela já é REPLICA IDENTITY FULL e está na publication do Realtime, então
-- os UPDATEs de leitura/entrega já chegam ao vivo — nada a mudar lá.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_channel_members
  ADD COLUMN IF NOT EXISTS last_delivered_at timestamptz NOT NULL DEFAULT now();

-- Marca "entregue" para o usuário atual naquele canal (só avança no tempo).
CREATE OR REPLACE FUNCTION public.chat_mark_delivered(p_channel uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.chat_channel_members
     SET last_delivered_at = now()
   WHERE channel_id = p_channel AND user_id = auth.uid()
     AND last_delivered_at < now();
$$;

GRANT EXECUTE ON FUNCTION public.chat_mark_delivered(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
