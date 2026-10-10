-- =====================================================================
-- profiles: NINGUÉM SE PROMOVE SOZINHO.
--
-- Achado na auditoria do Marketing (10/10/2026), e não é do Marketing: TODA
-- porta "time interno" do ecossistema — `carbo_e_time_interno()`, as 14 tabelas
-- do Marketing, o bucket `mkt-anexos`, a esteira, o WhatsApp, a NFS-e — confia
-- em `profiles.allowed_interfaces`. E, pelo que está nas migrações, a policy de
-- UPDATE de `profiles` deixa cada um editar a PRÓPRIA linha sem limite de
-- coluna (`auth.uid() = id`, sem WITH CHECK, sem gatilho, sem grant por coluna).
--
-- Ou seja: um lojista ou licenciado logado (a MESMA `profiles`) poderia rodar
--   update profiles set allowed_interfaces = '{carbo_mkt}' where id = auth.uid()
-- pelo PostgREST e virar "time interno" — ler e escrever o Marketing e tudo o
-- mais guardado por essa regra. Idem `department = 'command'` (o
-- `seesEverything` dos apps) e `escopo = 'global'`.
--
-- ⚠️ A correção NÃO mexe na policy. Ela continua deixando cada um editar a
-- própria foto, telefone e senha-pendente — é disso que os oito `Profile.tsx` e
-- o `PasswordChangeModal` dependem. O que muda é um GATILHO que recusa mudança
-- nas colunas de ACESSO para quem não é administrador.
--
-- Quem PODE mudar acesso (as mesmas pessoas que a RLS já deixa editar perfil
-- alheio — nada de novo é aberto nem fechado para elas):
--   · servidor (service role: create-team-member, bulk-create-org-users…)
--   · sem usuário (SQL Editor, cron, gatilho de cadastro do Auth)
--   · has_role(uid,'admin') — a mesma regra da policy viva de UPDATE
-- ⚠️ Recusa FALA (exception), nunca reverte calado: a tela de Equipe mostra o
-- erro em vez de dizer "salvo" com o dado antigo no banco.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — as policies VIVAS de profiles                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: alguma policy de UPDATE com `auth.uid() = id` no qual (USING)
-- e with_check NULO. Se o with_check já travar as colunas, ou se não houver
-- self-update, o furo NÃO existe em produção — me mande o resultado antes do
-- BLOCO 1.
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — grants de COLUNA e gatilhos já existentes            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: zero linhas de grant por coluna (o UPDATE vale para a tabela
-- inteira) e só gatilhos de `updated_at`. Gatilho com nome de "guard",
-- "protege" ou "interfaces" = alguém já fechou isso fora do repositório.
select 'grant_coluna' as tipo, grantee || ' ' || privilege_type || ' ' || column_name as detalhe
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('authenticated','anon') and privilege_type in ('UPDATE','INSERT')
union all
select 'gatilho', tgname || ' → ' || p.proname
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
order by 1, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (c) — ALGUÉM JÁ SE PROMOVEU?                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Perfis que passam como "time interno" e têm sinal de NÃO serem:
--   · portal_* junto com carbo_* nas interfaces
--   · linha também em produtos.profiles (usuário do Portal de Vendas / md)
--   · sem departamento (todo interno cadastrado pela tela tem um)
-- ESPERADO: zero, ou só gente que você reconhece como funcionário. Linha
-- desconhecida = me mande ANTES de qualquer outra coisa.
select p.id, p.full_name, p.department::text as departamento, p.funcao,
       p.allowed_interfaces,
       (select u.email from auth.users u where u.id = p.id) as email,
       u.created_at::date as criado,
       array_remove(array[
         case when exists (select 1 from unnest(p.allowed_interfaces) i where lower(i) like 'portal\_%') then 'tem portal_*' end,
         case when to_regclass('produtos.profiles') is not null
               and exists (select 1 from produtos.profiles pp where pp.id = p.id) then 'tem perfil de portal' end,
         case when p.department is null then 'sem departamento' end
       ], null) as sinais
from public.profiles p
left join auth.users u on u.id = p.id
where public.carbo_interface_e_interna(p.allowed_interfaces)
  and (
       exists (select 1 from unnest(p.allowed_interfaces) i where lower(i) like 'portal\_%')
    or (to_regclass('produtos.profiles') is not null and exists (select 1 from produtos.profiles pp where pp.id = p.id))
    or p.department is null
  )
order by u.created_at desc;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (d) — QUEM tem acesso ao Marketing                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Três números diferentes, e a diferença É a resposta:
--   entra_no_app   tem `carbo_mkt` (ou é head/CEO/TI, que o app deixa entrar)
--   le_os_dados    passa em carbo_e_time_interno() — é quem o BANCO deixa
--                  ler e escrever os quadros, com ou sem o app
--   so_dados       lê os quadros pelo banco SEM ter o app (o recorte que um
--                  "quadro privado" ou "só carbo_mkt" fecharia)
select
  count(*) filter (where exists (select 1 from unnest(allowed_interfaces) i where lower(i) = 'carbo_mkt')
                      or department::text in ('command','ti_suporte') or funcao in ('head','ceo','command')) as entra_no_app,
  count(*) filter (where public.carbo_interface_e_interna(allowed_interfaces))                                  as le_os_dados,
  count(*) filter (where public.carbo_interface_e_interna(allowed_interfaces)
                     and not exists (select 1 from unnest(allowed_interfaces) i where lower(i) = 'carbo_mkt')) as so_dados,
  count(*)                                                                                                      as perfis_total
from public.profiles;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (e) — as duas regras de "admin" existem?                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: true · true. Falso em alguma = o BLOCO 1 falha ao criar a função
-- (nada muda) — me mande e eu ajusto para a regra que existe.
select to_regprocedure('public.has_role(uuid, app_role)') is not null as tem_has_role,
       to_regclass('public.carbo_user_roles') is not null           as tem_carbo_user_roles;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (f) — quem perderia `bling-sync` e `send-email`            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- As duas edge functions aceitam hoje QUALQUER logado (`bling-sync`, que emite
-- NF) ou qualquer um com linha em profiles (`send-email`, o que inclui o
-- licenciado). A regra certa é "time interno" — mas funcionário antigo do
-- `controle` pode ter departamento e NENHUMA interface interna, e perderia
-- emitir nota no dia do deploy. Esta lista é exatamente quem perderia.
-- ESPERADO: zero linhas de gente que trabalha hoje. Cada linha aqui ganha a
-- interface certa no Admin ANTES de eu apertar as duas funções.
select p.id, p.full_name, p.department::text as departamento, p.funcao, p.status,
       p.allowed_interfaces, u.email, u.last_sign_in_at::date as ultimo_login
from public.profiles p
left join auth.users u on u.id = p.id
where not public.carbo_interface_e_interna(p.allowed_interfaces)
  and not exists (select 1 from unnest(p.allowed_interfaces) i where lower(i) like 'portal\_%')
  and coalesce(p.status, '') not in ('deleted','rejected')
order by u.last_sign_in_at desc nulls last;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a trava                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_pode_editar_acesso()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null                                     -- SQL Editor, cron, cadastro do Auth
      or coalesce(auth.role(), '') = 'service_role'             -- edge functions com a chave de serviço
      or public.has_role(auth.uid(), 'admin'::app_role);
$$;
-- ⚠️ `carbo_user_roles` NÃO existe em produção (BLOCO 0 (e), 10/10/2026) — a
-- `20260408` que a cita nunca chegou lá. A regra é a MESMA da policy viva de
-- UPDATE: `has_role(uid, 'admin')`. Quem a policy já deixava editar perfil
-- alheio continua podendo; ninguém novo ganha.
revoke all on function public.carbo_pode_editar_acesso() from public, anon;
grant execute on function public.carbo_pode_editar_acesso() to authenticated;

-- ⚠️ Compara pelo JSON da linha, nunca por `new.coluna`: coluna que não exista
-- em produção faria o gatilho falhar em TODO update de perfil (foto, senha…).
create or replace function public.trg_profiles_acesso_protegido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cols  text[] := array['allowed_interfaces','department','secondary_department','funcao',
                          'secondary_funcao','escopo','manager_user_id','status'];
  v_novo  jsonb := to_jsonb(new);
  v_velho jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_mudou text[] := '{}';
  c text;
begin
  if public.carbo_pode_editar_acesso() then return new; end if;
  foreach c in array v_cols loop
    if tg_op = 'INSERT' then
      -- Linha criada pelo próprio usuário nasce SEM acesso; quem dá é o admin.
      -- `status` fica de fora no insert: ele tem default de cadastro pendente.
      if c <> 'status' and coalesce(v_novo -> c, 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb) then
        v_mudou := v_mudou || c;
      end if;
    elsif (v_novo -> c) is distinct from (v_velho -> c) then
      v_mudou := v_mudou || c;
    end if;
  end loop;
  if cardinality(v_mudou) > 0 then
    raise exception 'Só um administrador muda acesso de usuário (%).', array_to_string(v_mudou, ', ')
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_acesso_protegido on public.profiles;
create trigger trg_profiles_acesso_protegido
  before insert or update on public.profiles
  for each row execute function public.trg_profiles_acesso_protegido();

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: gatilho = 1 · funcao = true. O teste de verdade é na tela: com
-- um usuário NÃO admin, trocar a própria foto continua funcionando.
select
  (select count(*) from pg_trigger where tgname = 'trg_profiles_acesso_protegido') as gatilho,
  to_regprocedure('public.carbo_pode_editar_acesso()') is not null               as funcao;
