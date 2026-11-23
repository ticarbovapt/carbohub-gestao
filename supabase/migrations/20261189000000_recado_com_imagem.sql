-- ═══════════════════════════════════════════════════════════════════════════
-- Recado interno com IMAGEM (23/11/2026)
--
-- Chamado do Atendimento: o recado interno da conversa só aceitava texto, e o
-- que mais se quer anotar para o time é um print (o rastreio, a conversa com a
-- transportadora, a foto da avaria que chegou por outro canal).
--
-- 1. `carbo_wa_notas.anexos` (jsonb, lista de {path, nome, mime, tamanho}).
--    Recado pode ser SÓ imagem: a trava do texto passa a aceitar texto vazio
--    quando há anexo.
-- 2. Bucket PRIVADO `wa-recados`. Ler e subir: time interno (a MESMA porta do
--    recado). ⚠️ Sem UPDATE nem DELETE: o recado é registro de quem sabia o quê
--    e quando — apagar o recado é MARCAR (`apagada_em`), e o arquivo fica.
--
-- ⚠️ Separado do `wa-midia` de propósito: aquele é o arquivo do CLIENTE, só a
-- edge function o entrega (confere se a mídia é de uma mensagem nossa). Este é
-- do time, e quem atende lê direto com URL assinada.
-- ⚠️ Nada aqui passa pela Meta: nenhum caminho de envio lê `carbo_wa_notas` nem
-- este bucket.
-- ⚠️ Front antes do SQL: a tela manda `anexos` só quando há anexo; recado só de
-- texto continua gravando igual.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_wa_notas
  add column if not exists anexos jsonb not null default '[]'::jsonb;

-- A trava do texto nasceu inline (nome gerado pelo Postgres). Ela é achada pela
-- DEFINIÇÃO, não pelo nome, e trocada por uma que aceita "só anexo".
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.carbo_wa_notas'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%btrim(texto)%'
       and con.conname <> 'carbo_wa_notas_tem_conteudo'
  loop
    execute format('alter table public.carbo_wa_notas drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.carbo_wa_notas drop constraint if exists carbo_wa_notas_tem_conteudo;
alter table public.carbo_wa_notas add constraint carbo_wa_notas_tem_conteudo
  check (length(btrim(texto)) > 0 or jsonb_array_length(anexos) > 0);

alter table public.carbo_wa_notas drop constraint if exists carbo_wa_notas_anexos_lista;
alter table public.carbo_wa_notas add constraint carbo_wa_notas_anexos_lista
  check (jsonb_typeof(anexos) = 'array' and jsonb_array_length(anexos) <= 10);

-- ── O bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wa-recados', 'wa-recados', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wa_recados_ler on storage.objects;
create policy wa_recados_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'wa-recados' and (select public.carbo_e_time_interno()));

drop policy if exists wa_recados_subir on storage.objects;
create policy wa_recados_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wa-recados' and (select public.carbo_e_time_interno()));

-- ── Conferência: aborta se algo não ficou como devia ──────────────────────
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'wa-recados' and not public) then
    raise exception 'ABORTADO: bucket wa-recados não ficou privado';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.carbo_wa_notas'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%btrim(texto)%') <> 1 then
    raise exception 'ABORTADO: a trava do texto do recado não ficou única';
  end if;
end $$;

notify pgrst, 'reload schema';
