-- ─────────────────────────────────────────────────────────────────────────────
-- Vendedor = QUALQUER perfil (inclusive membros do organograma sem login).
--
-- Contexto: na Carbo "todo mundo vende", e boa parte dos vendedores existe só
-- como perfil de organograma (org_only=true, sem conta em auth.users). As tabelas
-- de venda/meta apontavam a FK de vendedor_id para auth.users, o que (1) escondia
-- esses vendedores e (2) impediria atribuir venda/meta a eles. Aqui:
--   • repontamos as FKs de vendedor_id de auth.users → profiles(id);
--   • a RPC do diretório deixa de filtrar org_only (mostra todos os perfis).
-- Quem cria a venda continua sendo o usuário logado (default auth.uid()); a
-- ATRIBUIÇÃO a um vendedor do organograma passa a ser válida.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Remove qualquer FK de vendedor_id que aponte para auth.users (nome variável).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid in ('public.crm_vendas'::regclass, 'public.crm_vendedor_metas'::regclass)
      and c.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 2) (Re)cria as FKs apontando para profiles(id). Idempotente.
alter table public.crm_vendas
  drop constraint if exists crm_vendas_vendedor_id_profiles_fkey;
alter table public.crm_vendas
  add  constraint crm_vendas_vendedor_id_profiles_fkey
  foreign key (vendedor_id) references public.profiles(id) on delete cascade;

alter table public.crm_vendedor_metas
  drop constraint if exists crm_vendedor_metas_vendedor_id_profiles_fkey;
alter table public.crm_vendedor_metas
  add  constraint crm_vendedor_metas_vendedor_id_profiles_fkey
  foreign key (vendedor_id) references public.profiles(id) on delete cascade;

-- 3) Diretório de vendedores SEM o filtro org_only (mostra todos os perfis).
--    Escopo mantido: gestor (head/command/ti_suporte) vê todos; demais só o próprio.
create or replace function public.crm_list_vendedores()
returns table (
  id                   uuid,
  full_name            text,
  avatar_url           text,
  department           text,
  secondary_department text,
  is_vendedor          boolean
)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.full_name,
         p.avatar_url,
         p.department::text,
         p.secondary_department::text,
         coalesce(p.is_vendedor, false) as is_vendedor
  from public.profiles p
  where public.crm_is_gestor() or p.id = auth.uid()
  order by coalesce(p.is_vendedor, false) desc,
           p.full_name asc nulls last;
$$;

revoke all on function public.crm_list_vendedores() from public, anon;
grant execute on function public.crm_list_vendedores() to authenticated;
