-- ─────────────────────────────────────────────────────────────────────────────
-- Quadros do Marketing: o TIME sobe, substitui e exclui arquivo no cartão.
--
-- Até aqui só a função `trello-migrar` (service role) gravava no bucket
-- `mkt-anexos`. Agora quem está no quadro sobe direto do computador — é o que
-- tira o time do ciclo "subir no Drive, voltar ao cartão, trocar o link em
-- todo lugar".
--
--   1. ESCRITA no bucket para o time interno (insert e delete). Sem UPDATE de
--      propósito: SUBSTITUIR grava um objeto NOVO e apaga o antigo, então o
--      cache do navegador nunca serve a versão velha com o nome novo.
--   2. `poster_path`: a CAPA (jpeg ~30 KB) gerada no navegador. É ela que a
--      lista mostra — nenhum vídeo é baixado até alguém clicar nele.
--   3. `tamanho`, `atualizado_em`, `atualizado_por`: o "substituído por quem,
--      quando" que aparece no anexo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.mkt_card_attachments
  add column if not exists poster_path    text,
  add column if not exists tamanho        bigint,
  add column if not exists atualizado_em  timestamptz,
  add column if not exists atualizado_por uuid references public.profiles(id);

-- ⚠️ Mesma guarda da leitura (`mkt_anexos_leitura`, 20261060): o portal de lojas
-- e o de licenciados usam a MESMA tabela profiles — sem ela um lojista logado
-- poderia gravar no bucket do Marketing.
drop policy if exists mkt_anexos_envio on storage.objects;
create policy mkt_anexos_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mkt-anexos' and public.carbo_e_time_interno());

drop policy if exists mkt_anexos_exclusao on storage.objects;
create policy mkt_anexos_exclusao on storage.objects
  for delete to authenticated
  using (bucket_id = 'mkt-anexos' and public.carbo_e_time_interno());
