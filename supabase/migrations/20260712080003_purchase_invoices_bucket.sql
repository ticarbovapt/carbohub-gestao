-- Bucket pra anexos de NF de compra (PDF/XML). Público pra leitura (getPublicUrl
-- funciona no download); escrita só autenticado. O vínculo NF↔arquivo fica em
-- purchase_invoices.file_url.
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-invoices', 'purchase-invoices', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "purchase_invoices_read" ON storage.objects;
CREATE POLICY "purchase_invoices_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'purchase-invoices');

DROP POLICY IF EXISTS "purchase_invoices_write" ON storage.objects;
CREATE POLICY "purchase_invoices_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'purchase-invoices');

DROP POLICY IF EXISTS "purchase_invoices_update" ON storage.objects;
CREATE POLICY "purchase_invoices_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'purchase-invoices');
