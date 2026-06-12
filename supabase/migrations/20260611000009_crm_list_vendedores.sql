-- ─────────────────────────────────────────────────────────────────────────────
-- Diretório de vendedores para os dropdowns do Carbo Sales/Ops.
--
-- PROBLEMA: a RLS de `profiles` (can_access_profile) só deixa um usuário comum
-- enxergar a si mesmo + o próprio departamento. Como "todo mundo vende" e os
-- vendedores estão espalhados por vários departamentos, os dropdowns liam apenas
-- o próprio nome. Esta RPC é SECURITY DEFINER (mesmo padrão de crm_vendas_agregado)
-- e expõe SÓ o mínimo do diretório (id, nome, avatar, depto, flag de vendedor) —
-- sem e-mail, telefone, status ou qualquer dado sensível.
--
-- Filtra org_only = false: membros de organograma sem conta de auth NÃO podem ser
-- vendedor_id (FK para auth.users em crm_vendas/crm_vendedor_metas).
-- Ordena: quem tem a flag is_vendedor primeiro; depois os "avulsos"; por nome.
--
-- ESCOPO (mesma regra do resto do CRM, via crm_is_gestor = head/command/ti_suporte):
--   • GESTOR  → vê o diretório inteiro (todos os vendedores/funcionários).
--   • DEMAIS  → vê apenas o próprio registro (colaborador só enxerga o próprio).
-- ─────────────────────────────────────────────────────────────────────────────
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
  where coalesce(p.org_only, false) = false
    and (public.crm_is_gestor() or p.id = auth.uid())
  order by coalesce(p.is_vendedor, false) desc,
           p.full_name asc nulls last;
$$;

revoke all on function public.crm_list_vendedores() from public, anon;
grant execute on function public.crm_list_vendedores() to authenticated;
