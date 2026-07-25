-- ─────────────────────────────────────────────────────────────────────────────
-- Reporte de bug/sugestão — anexos (print) e contexto automático.
--
-- Motivo: "não sei explicar" é o problema nº1 de quem reporta. Um print resolve
-- o que três parágrafos não resolvem, e o contexto (tela, navegador, tamanho)
-- sai de graça — o solicitante não precisa digitar nada disso.
--
-- ⚠️ O bucket é PRIVADO: prints do CRM/Finanças contêm nome de cliente e valor.
-- A leitura é sempre por URL assinada, nunca por link público adivinhável.
--
-- ⚠️ NO SQL EDITOR DO SUPABASE, RODE EM BLOCOS SEPARADOS. O editor executa tudo
-- numa transação só, e as policies de storage.objects pedem lock exclusivo numa
-- tabela que o serviço de Storage usa o tempo todo → "deadlock detected".
-- Ordem: (1) as colunas abaixo · (2) o bucket · (3) cada policy sozinha.
-- (Aplicado pelo CLI/migração normal, isso não acontece.)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── BLOCO 1 ─────────────────────────────────────────────────────────────────
alter table public.carbo_bug_reports
  add column if not exists attachments    jsonb not null default '[]'::jsonb,
  add column if not exists client_context jsonb;

comment on column public.carbo_bug_reports.attachments is
  'Prints anexados: [{path, name, size}] — path é a chave no bucket bug-attachments.';
comment on column public.carbo_bug_reports.client_context is
  'Capturado automaticamente: tela, navegador, viewport, fuso, build.';

-- ── BLOCO 2 — bucket (ou crie pela interface: Storage › New bucket, sem Public)
insert into storage.buckets (id, name, public)
values ('bug-attachments', 'bug-attachments', false)
on conflict (id) do update set public = false;

-- ── BLOCO 3 — policies: rode UMA DE CADA VEZ ────────────────────────────────
-- Qualquer autenticado ENVIA o próprio anexo (a pasta é o id do usuário).
drop policy if exists bug_anexos_insert on storage.objects;
create policy bug_anexos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leitura: o dono do anexo e o time de TI (que precisa ver pra resolver).
drop policy if exists bug_anexos_select on storage.objects;
create policy bug_anexos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bug-attachments'
    and ( (storage.foldername(name))[1] = auth.uid()::text or public.carbo_is_ti() )
  );

-- Apagar: o dono ou o TI.
drop policy if exists bug_anexos_delete on storage.objects;
create policy bug_anexos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bug-attachments'
    and ( (storage.foldername(name))[1] = auth.uid()::text or public.carbo_is_ti() )
  );
