-- ─────────────────────────────────────────────────────────────────────────────
-- Flag "é vendedor?" no perfil — define quem entra no quadro de Metas do Sales.
-- Lógica nova (não importada do Controle): em vez de passar pela edge function
-- compartilhada, a marcação é feita por uma RPC dedicada, que só um gestor
-- (head / command / ti_suporte) pode chamar. A coluna profiles.is_vendedor já
-- existe no CORE; o add column é idempotente só por segurança.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists is_vendedor boolean not null default false;

create or replace function public.set_is_vendedor(p_user_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Só gestor (head / command / ti_suporte) marca quem é vendedor.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and ( p.funcao = 'head' or p.secondary_funcao = 'head'
         or p.department in ('command','ti_suporte')
         or p.secondary_department in ('command','ti_suporte') )
  ) then
    raise exception 'Sem permissão para alterar a flag de vendedor.';
  end if;

  update public.profiles
  set is_vendedor = coalesce(p_value, false)
  where id = p_user_id;
end; $$;

revoke all on function public.set_is_vendedor(uuid, boolean) from public, anon;
grant execute on function public.set_is_vendedor(uuid, boolean) to authenticated;
