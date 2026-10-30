-- ═══════════════════════════════════════════════════════════════════════════
-- Tentativas de login do bloqueado: CADA uma conta, e a aba atualiza AO VIVO
--
-- Teste do dono do processo (30/10/2026): vários Enter seguidos com um usuário
-- bloqueado viraram UMA tentativa — o "ignora repetição em 30 s" da `20261144`
-- engolia as outras. E a aba só mostrava depois do F5.
--
-- Agora:
--   • cada tentativa recusada é uma linha. A trava contra enxurrada (a função é
--     de `anon`) passa a ser um TETO: no máximo 30 linhas por usuário por
--     minuto — ninguém digita a senha mais rápido que isso;
--   • a tabela entra no Realtime, com leitura só para quem abre a aba
--     (gestor, CEO ou admin — a mesma porta da `carbo_bloqueados_acessos`).
--     O evento só avisa a tela; quem monta a lista continua sendo a RPC.
--
-- RODE EM BLOCOS: 1, depois 2 (conferência).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1                                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_registrar_tentativa_bloqueada(
  p_login text, p_origem text default null, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_login, '')));
  v_user  uuid;
begin
  if v_email = '' then return; end if;

  if position('@' in v_email) = 0 then
    begin
      v_email := lower(public.get_user_email_by_username(v_email));
    exception when others then
      return;
    end;
    if v_email is null then return; end if;
  end if;

  select u.id into v_user
    from auth.users u
   where lower(u.email) = v_email
     and u.banned_until is not null
     and u.banned_until > now();
  if v_user is null then return; end if;

  -- Teto contra enxurrada (quem chama é anônimo), nunca contra o uso normal.
  if (select count(*) from public.carbo_login_bloqueado_tentativas t
       where t.user_id = v_user and t.em > now() - interval '1 minute') >= 30 then
    return;
  end if;

  insert into public.carbo_login_bloqueado_tentativas (user_id, origem, user_agent)
  values (v_user, left(p_origem, 200), left(p_user_agent, 400));
exception when others then
  return;
end;
$$;

revoke execute on function public.carbo_registrar_tentativa_bloqueada(text, text, text) from public;
grant execute on function public.carbo_registrar_tentativa_bloqueada(text, text, text) to anon, authenticated, service_role;

-- Leitura (só para o Realtime entregar o evento a quem abre a aba).
drop policy if exists "gestao le tentativas de bloqueado" on public.carbo_login_bloqueado_tentativas;
create policy "gestao le tentativas de bloqueado"
  on public.carbo_login_bloqueado_tentativas for select to authenticated
  using ((select public.carbo_is_gestor(auth.uid()) or public.is_ceo(auth.uid()) or public.is_admin(auth.uid())));

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'carbo_login_bloqueado_tentativas') then
    alter publication supabase_realtime add table public.carbo_login_bloqueado_tentativas;
  end if;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Esperado: true, true                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and tablename = 'carbo_login_bloqueado_tentativas') as no_realtime,
  exists (select 1 from pg_policies
           where tablename = 'carbo_login_bloqueado_tentativas'
             and policyname = 'gestao le tentativas de bloqueado') as policy_ok;
