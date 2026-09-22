-- ═══════════════════════════════════════════════════════════════════════════
-- Bloquear o acesso SEM apagar a pessoa
--
-- Pedido do dono do processo em 22/09/2026: *"preciso bloquear usuários do
-- sistema sem excluir os dados deles… caso volte para a empresa,
-- desbloqueamos"*.
--
-- Hoje o único botão é **Apagar usuário e liberar a vaga**, e ele é
-- irreversível: remove `profiles`, `user_roles`, `org_chart_nodes` e o usuário
-- de `auth`. Quem saiu da empresa some do sistema junto com o rastro do que
-- fez — e a saída de alguém não apaga as vendas, as OS e os leads que levam o
-- nome dele.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ONDE O BLOQUEIO MORDE: no AUTH, não numa coluna de perfil
--
-- A trava é `auth.users.banned_until`, ligada pela Admin API na edge function
-- `create-team-member` (`ban_duration`). Não é uma coluna nossa em `profiles`
-- checada por cada app, e a diferença NÃO é estilo:
--
--   coluna em `profiles`   → cada um dos SETE apps, mais o Hub, mais os dois
--                            portais, precisa lembrar de checar. O app que
--                            esquecer deixa entrar, e esquecer não dá erro.
--   `banned_until`         → o GoTrue recusa ANTES de existir sessão. Vale para
--                            todo app do ecossistema no mesmo instante, sem
--                            nenhum deles saber que a regra existe.
--
-- É a mesma razão pela qual a dedução de estoque mora na RPC e não no
-- `/vender`: regra que vive na tela é regra que o próximo app esquece de
-- copiar.
--
-- ⚠️ E NADA é apagado. `profiles`, `user_roles`, `org_chart_nodes`, vendas,
-- leads e OS ficam exatamente onde estão. Desbloquear é `ban_duration: 'none'`
-- — **a senha continua sendo a mesma**, porque nunca foi tocada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ A SESSÃO JÁ ABERTA morre em até 1 HORA, não na hora
--
-- O GoTrue confere o banimento no LOGIN e na RENOVAÇÃO do token. Quem está com
-- a aba aberta segue com o access token que já tem até ele expirar (1 h no
-- padrão do Supabase); na renovação seguinte é recusado e cai para o login.
--
-- Isso não é ajustável daqui e **é preciso dizer**, não descobrir depois:
-- bloquear alguém que está logado naquele instante não o derruba da cadeira.
-- Para o caso urgente, some ao bloqueio um **Redefinir senha** — a senha nova
-- não vai para ninguém e fecha o caminho de voltar a entrar.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO DO ANTES (leitura pura)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Alguém já está banido hoje? ESPERADO: ZERO — o recurso não existia.
--     Se vier gente aqui, PARE: alguém foi banido pelo painel do Supabase à
--     mão e a tela nova vai passar a mostrar isso pela primeira vez.
select u.id, u.email, u.banned_until, p.full_name
from auth.users u
left join public.profiles p on p.id = u.id
where u.banned_until is not null and u.banned_until > now();

-- (b) ⚠️ `profiles.status` JÁ EXISTE e NÃO é isto. Veja que valores ele tem —
--     é o fluxo de aprovação de cadastro, outro assunto. O bloqueio não mexe
--     nele: sobrecarregar uma coluna que já significa outra coisa é como se
--     perde o sentido das duas.
select coalesce(status, '(nulo)') as status, count(*)
from public.profiles group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o REGISTRO de quem bloqueou, quando e por quê               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Isto NÃO é um espelho do estado. `banned_until` continua sendo a única
-- fonte da verdade sobre "está bloqueado agora"; esta tabela guarda o
-- HISTÓRICO, que o `banned_until` não tem como guardar — ele é um carimbo só,
-- e sobrescrever não deixa rastro.
--
-- Duas coisas diferentes, duas moradas. Guardar o estado aqui TAMBÉM criaria o
-- par que diverge: a tela diria bloqueado e o login deixaria entrar, ou o
-- contrário, e nenhum dos dois daria erro.

create table if not exists public.carbo_usuario_bloqueio_log (
  id        bigserial primary key,
  user_id   uuid not null,
  acao      text not null check (acao in ('bloqueado','desbloqueado')),
  motivo    text,
  por       uuid,
  em        timestamptz not null default now()
);

create index if not exists idx_bloqueio_log_user
  on public.carbo_usuario_bloqueio_log (user_id, em desc);

comment on table public.carbo_usuario_bloqueio_log is
  'Histórico de bloqueio/desbloqueio de acesso. NÃO é o estado — quem responde '
  '"está bloqueado?" é auth.users.banned_until. Append-only: sem policy de '
  'UPDATE nem de DELETE, de propósito.';

alter table public.carbo_usuario_bloqueio_log enable row level security;

-- ⚠️ SÓ leitura, e só para quem é time interno. Quem ESCREVE é a edge function
-- com service role, que ignora RLS — por isso não há policy de INSERT: uma
-- policy de insert abriria o log para o front forjar linha de auditoria.
drop policy if exists "time interno le o log de bloqueio" on public.carbo_usuario_bloqueio_log;
create policy "time interno le o log de bloqueio"
  on public.carbo_usuario_bloqueio_log for select
  using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a tela precisa SABER quem está bloqueado                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `auth.users` não é exposta pelo PostgREST, então a tela não tem como ler
-- `banned_until` sozinha. A view resolve isso — e é o MESMO molde da
-- `ml_accounts_public`:
--
-- 1. ⚠️ Roda como DONO (sem `security_invoker`), porque é isso que lhe permite
--    ler `auth.users`. Ligar invoker aqui a esvaziaria para todo mundo.
-- 2. ⚠️ Lista as colunas UMA A UMA, nunca `select *`: em `auth.users` moram
--    `encrypted_password`, tokens de recuperação e `raw_user_meta_data`. Com
--    `*`, tudo isso sairia pelo PostgREST.
-- 3. ⚠️ O guarda mora no `WHERE`. Como a view roda como dono, é a ÚNICA coisa
--    entre a lista e qualquer autenticado — e o portal de lojas e o de
--    licenciados usam a MESMA tabela `profiles`.

create or replace view public.carbo_usuarios_bloqueados as
select u.id           as user_id,
       u.banned_until as bloqueado_ate
from auth.users u
where u.banned_until is not null
  and u.banned_until > now()
  and public.carbo_e_time_interno();

comment on view public.carbo_usuarios_bloqueados is
  'Quem está com o acesso bloqueado AGORA (auth.users.banned_until no futuro). '
  'Roda como DONO — é como ela alcança auth.users — e por isso lista as colunas '
  'uma a uma e guarda o acesso no WHERE com carbo_e_time_interno().';

revoke all on public.carbo_usuarios_bloqueados from public, anon;
grant select on public.carbo_usuarios_bloqueados to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ A view NÃO pode ter `security_invoker`. ESPERADO: reloptions nulo.
--     Vindo `{security_invoker=true}`, ela não enxerga `auth.users` e a tela
--     mostra "ninguém bloqueado" para sempre, sem erro.
select relname, reloptions
from pg_class where relname in ('carbo_usuarios_bloqueados');

-- (b) A view responde. Agora ainda deve vir VAZIA — nada foi bloqueado.
select * from public.carbo_usuarios_bloqueados;

-- (c) O log existe e está vazio.
select count(*) as linhas_no_log from public.carbo_usuario_bloqueio_log;

-- (d) ⭐ O TESTE DE VERDADE só existe depois do deploy da edge function:
--     bloqueie alguém no Admin e rode (b) e (c) de novo — um id em cada.
--     Depois desbloqueie: (b) volta a vazio, (c) fica com DUAS linhas.
--     ⚠️ (c) NUNCA diminui. Se diminuir, alguém deu DELETE no histórico.
