-- =====================================================================
-- Quadros do Marketing: REAÇÕES nos comentários (👍 ❤️ 😂 …), como no Trello
-- (mapeamento Trello × sistema, prioridade MÉDIA, "Comentários").
--
-- ⚠️ TABELA própria, nunca coluna jsonb no comentário: duas pessoas reagindo
-- ao mesmo tempo gravariam o jsonb inteiro uma por cima da outra e uma reação
-- sumiria, calada. Linha por (comentário, pessoa, emoji) não tem corrida.
-- ⚠️ Cada um mexe SÓ na própria reação (insert/delete com user_id = eu);
-- ler é do time interno — é ver quem reagiu que dá sentido ao 👍.
-- ⚠️ Reação NÃO avisa no sininho: é o jeito de responder sem mandar
-- notificação (no Trello também não avisa). Avisar seria o sininho com 70 itens.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só lê)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: comentarios = true · ja_existe = false
select
  to_regclass('public.mkt_comments') is not null as comentarios,
  to_regclass('public.mkt_comment_reacoes') is not null as ja_existe;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.mkt_comment_reacoes (
  comment_id uuid not null references public.mkt_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index if not exists idx_mkt_comment_reacoes_comment on public.mkt_comment_reacoes(comment_id);
alter table public.mkt_comment_reacoes enable row level security;

drop policy if exists mkt_comment_reacoes_ler on public.mkt_comment_reacoes;
create policy mkt_comment_reacoes_ler on public.mkt_comment_reacoes
  for select to authenticated using (public.carbo_e_time_interno());

drop policy if exists mkt_comment_reacoes_minha_inserir on public.mkt_comment_reacoes;
create policy mkt_comment_reacoes_minha_inserir on public.mkt_comment_reacoes
  for insert to authenticated with check (user_id = auth.uid() and public.carbo_e_time_interno());

drop policy if exists mkt_comment_reacoes_minha_apagar on public.mkt_comment_reacoes;
create policy mkt_comment_reacoes_minha_apagar on public.mkt_comment_reacoes
  for delete to authenticated using (user_id = auth.uid());

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: tabela = true · policies = 3
select
  to_regclass('public.mkt_comment_reacoes') is not null as tabela,
  (select count(*) from pg_policies where tablename = 'mkt_comment_reacoes') as policies;
