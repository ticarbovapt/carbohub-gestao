-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — foto de grupo. Bucket PÚBLICO (a avatar_url é exibida direto,
-- sem assinar). Upload restrito a funcionários; leitura pública.
-- Trocar a foto = update chat_channels.avatar_url (RLS já permite owner/admin).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-avatars', 'chat-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat-avatars read" ON storage.objects;
CREATE POLICY "chat-avatars read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-avatars');

DROP POLICY IF EXISTS "chat-avatars write" ON storage.objects;
CREATE POLICY "chat-avatars write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-avatars' AND public.is_employee(auth.uid()));

DROP POLICY IF EXISTS "chat-avatars update" ON storage.objects;
CREATE POLICY "chat-avatars update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-avatars' AND public.is_employee(auth.uid()));
