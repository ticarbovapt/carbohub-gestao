-- ═══════════════════════════════════════════════════════════════════════════
-- RTM · bucket das fotos de visita
--
-- ⚠️ RODE EM BLOCOS SEPARADOS no SQL Editor. As policies de `storage.objects`
-- pedem lock exclusivo numa tabela que o serviço de Storage usa o tempo todo;
-- tudo numa transação só dá "deadlock detected". Mesma lição do
-- `bug-attachments`, que já custou uma rodada.
--
-- ── Por que privado ───────────────────────────────────────────────────────
--
-- A foto do expositor mostra o interior de um cliente, com placa, fachada,
-- às vezes gente. Bucket público significa URL que funciona para qualquer um
-- que a receba, para sempre, fora de qualquer controle nosso. O custo do
-- privado é ter de assinar link na hora de exibir; o custo do público é não
-- ter como voltar atrás.
--
-- ── O caminho carrega a autorização ───────────────────────────────────────
--
--   <vendedor_id>/<visita_id>/<arquivo>
--
-- A primeira pasta é o dono. É ela que a policy de INSERT compara com
-- auth.uid() — assim a autorização de escrita não depende de consultar outra
-- tabela, e continua valendo se a linha em `rtm_visita_fotos` ainda não
-- existir (que é exatamente o caso: o arquivo sobe ANTES do registro).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOCO 1 — o bucket ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('rtm-visitas', 'rtm-visitas', false)
on conflict (id) do update set public = false;


-- ── BLOCO 2 — envio ────────────────────────────────────────────────────────
-- ⚠️ COLE, NÃO DIGITE: o autocomplete do SQL Editor troca "authenticated" por
-- "authentication_method" e o create falha com 'role does not exist'.
--
-- O `TO authenticated` é proposital. Restringir por ROLE é uma barreira
-- independente da expressão: sem ele, a privacidade passaria a depender de a
-- expressão continuar correta para sempre.
drop policy if exists rtm_fotos_insert on storage.objects;
create policy rtm_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rtm-visitas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── BLOCO 3 — leitura ──────────────────────────────────────────────────────
-- O dono e o gestor. O gestor precisa ver porque é ele quem confere a
-- execução — foto que só o autor enxerga não é evidência de nada.
drop policy if exists rtm_fotos_select on storage.objects;
create policy rtm_fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rtm-visitas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_manager_or_admin(auth.uid())
    )
  );


-- ── BLOCO 4 — apagar ───────────────────────────────────────────────────────
-- Só o dono, e o trigger de congelamento já impede que a linha correspondente
-- em `rtm_visita_fotos` saia depois do check-out. Aqui o alvo é o caso real de
-- foto errada ANTES de fechar: dedo na lente, print do WhatsApp por engano.
drop policy if exists rtm_fotos_delete on storage.objects;
create policy rtm_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rtm-visitas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── Conferência ────────────────────────────────────────────────────────────
select id, name, public from storage.buckets where id = 'rtm-visitas';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'rtm_fotos%'
order by policyname;
