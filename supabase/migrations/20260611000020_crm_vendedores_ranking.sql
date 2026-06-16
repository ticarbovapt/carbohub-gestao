-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking de vendedores (placar do quadro de Metas).
-- Diferente de crm_list_vendedores (que é escopado por gestor), este devolve
-- TODOS os vendedores (is_vendedor) para QUALQUER autenticado — é o leaderboard
-- de competição (todo vendedor vê todos). Só nome/avatar/depto (sem dado sensível;
-- os valores R$ continuam escondidos no front pra quem não é gestor).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_vendedores_ranking()
returns table (
  id                   uuid,
  full_name            text,
  avatar_url           text,
  department           text,
  secondary_department text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.department::text, p.secondary_department::text
  from public.profiles p
  where coalesce(p.is_vendedor, false) = true
  order by p.full_name asc nulls last;
$$;
revoke all on function public.crm_vendedores_ranking() from public, anon;
grant execute on function public.crm_vendedores_ranking() to authenticated;
