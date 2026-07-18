-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: fotos do mural (bucket chat-media, prefixo feed/) não subiam porque a
-- policy de escrita exigia que o caminho começasse com um channel_id válido
-- (chat_path_channel) — regra das mídias de conversa. Aqui liberamos o prefixo
-- 'feed/' para qualquer interno (leitura e escrita), sem afetar as policies das
-- conversas (policies são permissivas = OR).
--
-- Observação: o caminho da imagem só chega ao cliente via chat_feed_list, que já
-- filtra por audiência — então quem não é do público não obtém o path.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "chat-media feed read" ON storage.objects;
CREATE POLICY "chat-media feed read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-media' AND public.is_employee(auth.uid())
  AND (storage.foldername(name))[1] = 'feed'
);

DROP POLICY IF EXISTS "chat-media feed write" ON storage.objects;
CREATE POLICY "chat-media feed write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-media' AND public.is_employee(auth.uid())
  AND (storage.foldername(name))[1] = 'feed'
);
