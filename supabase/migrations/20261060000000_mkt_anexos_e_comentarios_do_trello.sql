-- ─────────────────────────────────────────────────────────────────────────────
-- Quadros do Marketing: trazer do Trello o que o export em JSON não traz.
--
--   1. ARQUIVOS: anexo enviado ao Trello virou LINK para o Trello na
--      importação (abre só com login lá, e morre com o quadro de lá). Agora o
--      arquivo é copiado para o bucket PRIVADO `mkt-anexos` e a linha passa a
--      `kind = 'arquivo'` com `storage_path`. A `external_url` FICA (é a
--      procedência do arquivo, e a coluna é NOT NULL).
--   2. COMENTÁRIOS: o export traz só as últimas 1.000 ações. O resto vem pela
--      API; `trello_action_id` impede que rodar duas vezes duplique.
--
-- Quem baixa e grava é a função `trello-migrar` (service role). O navegador só
-- LÊ o arquivo, por URL assinada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Anexo que é arquivo NOSSO ────────────────────────────────────────────
alter table public.mkt_card_attachments
  add column if not exists storage_path text;

-- ⚠️ O CHECK de nascimento é ('drive','link'). Valor novo fora dele é INSERT /
-- UPDATE falhando — e a função diria "erro" para cada um dos 481 arquivos.
-- ⚠️ E ele é procurado pelo CONTEÚDO, não pelo nome: se o nome no banco não
-- for o que se supõe, `drop if exists` não faz nada e o CHECK antigo continua
-- recusando 'arquivo' — com o novo convivendo ao lado.
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.mkt_card_attachments'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%drive%'
  loop
    execute format('alter table public.mkt_card_attachments drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.mkt_card_attachments
  add constraint mkt_card_attachments_kind_check
  check (kind in ('drive', 'link', 'arquivo'));

-- Arquivo sem caminho seria um anexo que não abre, calado.
alter table public.mkt_card_attachments
  drop constraint if exists mkt_card_attachments_arquivo_tem_caminho;
alter table public.mkt_card_attachments
  add constraint mkt_card_attachments_arquivo_tem_caminho
  check (kind <> 'arquivo' or storage_path is not null);

-- ── 2. O bucket ─────────────────────────────────────────────────────────────
-- PRIVADO: material de campanha e de cliente não pode virar link público.
-- 300 MB por arquivo (o maior do primeiro quadro tem 243 MB). ⚠️ Existe também
-- o limite GLOBAL em Storage → Settings, e o menor dos dois manda.
insert into storage.buckets (id, name, public, file_size_limit)
values ('mkt-anexos', 'mkt-anexos', false, 314572800)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

-- Leitura: só o time interno (o portal de lojas e o de licenciados usam a MESMA
-- tabela profiles). Escrita: nenhuma policy — só a service role grava.
drop policy if exists mkt_anexos_leitura on storage.objects;
create policy mkt_anexos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'mkt-anexos' and public.carbo_e_time_interno());

-- ── 3. Comentário com procedência ───────────────────────────────────────────
alter table public.mkt_comments
  add column if not exists trello_action_id text;

create unique index if not exists mkt_comments_trello_action_uniq
  on public.mkt_comments (trello_action_id)
  where trello_action_id is not null;
