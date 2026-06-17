-- ─────────────────────────────────────────────────────────────────────────────
-- "Minha Equipe" — visualização (somente leitura) dos colegas do MESMO
-- departamento do usuário logado, considerando o 1º E o 2º departamento.
-- SECURITY DEFINER: funciona para qualquer usuário (inclusive membro), sem
-- depender da RLS de profiles. Não expõe nada além de identificação básica.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.carbo_team_members()
returns table (
  id                   uuid,
  full_name            text,
  avatar_url           text,
  username             text,
  email                text,
  department           text,
  funcao               text,
  secondary_department text,
  secondary_funcao     text
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select department, secondary_department
    from public.profiles
    where id = auth.uid()
  )
  select p.id, p.full_name, p.avatar_url, p.username, p.email,
         p.department, p.funcao, p.secondary_department, p.secondary_funcao
  from public.profiles p, me
  where coalesce(p.status, 'approved') = 'approved'
    and (
      p.department           in (me.department, me.secondary_department)
      or p.secondary_department in (me.department, me.secondary_department)
    )
  order by p.full_name;
$$;

grant execute on function public.carbo_team_members() to authenticated;
