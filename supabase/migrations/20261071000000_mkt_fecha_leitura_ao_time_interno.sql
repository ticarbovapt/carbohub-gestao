-- =====================================================================
-- Quadros do Marketing: FECHA as 14 tabelas que nasceram abertas.
--
-- Medido em 10/10/2026 (BLOCO 0 (b) da `20261070`): a `20260723` criou as
-- tabelas do Marketing com `FOR ALL TO authenticated USING (true) WITH CHECK
-- (true)`. Qualquer sessão logada — inclusive de PORTAL (lojista,
-- licenciado, microdistribuidor), que entra pelo mesmo Auth — lia E ESCREVIA
-- quadros, cartões, comentários e anexos pelo PostgREST. As tabelas novas
-- (versões, modelos, seguidores, reações) já nasceram com
-- `carbo_e_time_interno()`; estas 14 ficaram para trás.
--
-- ⚠️ A troca é a MESMA regra das tabelas novas, nada mais: o time interno
-- continua vendo e editando TODOS os quadros, como hoje. Quadro privado é
-- outra decisão.
-- ⚠️ Quem roda com a chave de serviço (edge functions `trello-migrar`,
-- `mkt-video-web`) e as funções SECURITY DEFINER (gatilhos de aviso,
-- `mkt_cartao_mover` é invoker e é chamada por gente do time) não mudam.
-- ⚠️ O risco é o OPOSTO do vazamento: alguém que usa o Marketing e NÃO passa
-- em `carbo_e_time_interno()` perderia o quadro inteiro, calado — a tela
-- abriria VAZIA. O BLOCO 0 mede exatamente isso ANTES.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — quem USA o Marketing e NÃO é time interno            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: ZERO linhas. Qualquer linha é alguém que perderia o acesso —
-- NÃO rode o BLOCO 1 sem antes dar a essa pessoa a interface certa no Admin.
with quem_usa as (
  select created_by as uid from public.mkt_cards where created_by is not null
  union select user_id from public.mkt_comments
  union select user_id from public.mkt_card_members
  union select created_by from public.mkt_boards where created_by is not null
)
select p.id, p.full_name, p.department::text, p.allowed_interfaces
from quem_usa q
join public.profiles p on p.id = q.uid
where not public.carbo_interface_e_interna(p.allowed_interfaces);

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — o tamanho do furo                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Logins que hoje leem o Marketing e não deveriam: sem perfil interno.
-- (Usuário de portal mora em outra tabela de perfil, então conta aqui.)
select
  (select count(*) from auth.users u
    where not exists (select 1 from public.profiles p
                       where p.id = u.id and public.carbo_interface_e_interna(p.allowed_interfaces))) as logins_fora_do_time,
  (select count(*) from auth.users) as logins_total;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — fechar (só depois do BLOCO 0 (a) voltar VAZIO)           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Atômico: as 14 trocam juntas, ou nenhuma. Sai a policy `<tabela>_all`
-- (USING true) e entra `<tabela>_time`, com a mesma regra das tabelas novas.
do $$
declare t text;
begin
  foreach t in array array[
    'mkt_workspaces','mkt_boards','mkt_lists','mkt_cards','mkt_labels',
    'mkt_card_labels','mkt_card_members','mkt_checklists','mkt_checklist_items',
    'mkt_comments','mkt_activity','mkt_card_attachments','mkt_custom_fields',
    'mkt_card_field_values'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_time', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno())', t || '_time', t);
  end loop;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: abertas = 0 (nenhuma tabela do Marketing com USING true).
select count(*) as abertas
from pg_policies
where schemaname = 'public' and tablename like 'mkt\_%' and qual = 'true';
