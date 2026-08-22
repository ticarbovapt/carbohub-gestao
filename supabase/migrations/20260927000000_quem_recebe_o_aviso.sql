-- ═══════════════════════════════════════════════════════════════════════════
-- Quem recebe o aviso de mensagem nova — lista explícita, começando VAZIA
--
-- ── Por que ──────────────────────────────────────────────────────────────
--
-- O aviso saía para as 30 pessoas com alguma interface interna. Estava certo
-- enquanto o volume era zero, e vira ruído assim que os clientes começarem a
-- responder de verdade. E aviso ruidoso não é aviso: ele treina a equipe a
-- ignorar o sininho, que é o oposto do que ele existe para fazer.
--
-- ⚠️ NASCE VAZIA. Ninguém recebe até alguém marcar — e marcar é um clique na
-- tela, não uma migração. A ausência FECHA, como no `CRON_SECRET` e no
-- `meta_status`: ligar o aviso é decisão de gente.
--
-- ── ⚠️ E a lista de interfaces passa a existir UMA vez ───────────────────
--
-- Ela estava escrita no `notify_time_interno` e no `carbo_e_time_interno`, e
-- este arquivo precisaria de uma terceira cópia. O CLAUDE.md já avisa: duas
-- listas divergem, e divergir aqui ABRE acesso em vez de fechar — interface
-- interna nova esquecida numa delas tira a pessoa do aviso sem erro nenhum, e
-- interface de portal esquecida põe lojista onde não devia estar.
--
-- `carbo_interface_e_interna(text[])` passa a ser a única, e as duas funções
-- antigas passam a chamá-la.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a lista de interfaces, num lugar só                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_interface_e_interna(p_interfaces text[])
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(coalesce(p_interfaces, '{}')) x
    -- ⚠️ Conferida contra os perfis REAIS, não contra o nome dos apps. O Ops
    -- aparece como `carbo_ops_app` em quase todo mundo e como `carbo_ops` num
    -- perfil — os dois valem. `carbo_sales` NÃO existe: o Sales é `carbo_crm`.
    -- `portal_pdv` e `portal_licenciado` ficam DE FORA de propósito: são os
    -- portais externos, que compartilham a tabela `profiles`.
    where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                       'carbo_financas','carbo_mkt','carbo_ti')
  );
$$;

comment on function public.carbo_interface_e_interna is
  'A lista de interfaces INTERNAS, num lugar só. Antes estava copiada no notify_time_interno e no carbo_e_time_interno — duas listas divergem, e divergir aqui abre acesso em vez de fechar. Interface interna nova entra AQUI e em nenhum outro lugar.';

-- As duas antigas passam a chamá-la. Comportamento idêntico; some a cópia.
create or replace function public.carbo_e_time_interno()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.carbo_interface_e_interna(p.allowed_interfaces)
  );
$$;

create or replace function public.notify_time_interno(
  p_type text, p_title text, p_body text, p_ref_type text, p_ref_id uuid,
  p_exceto uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id, p_type, p_title, p_body, p_ref_type, p_ref_id, false
  from public.profiles p
  where public.carbo_interface_e_interna(p.allowed_interfaces)
    and (p_exceto is null or p.id is distinct from p_exceto);
end $$;

comment on function public.notify_time_interno is
  'Fan-out de notificação para todo usuário com alguma interface INTERNA liberada. Exclui portal de lojas/licenciados, que compartilham a tabela profiles. A lista mora em carbo_interface_e_interna.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — quem recebe                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_notificados (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  -- Existe separado de "estar na tabela" porque desligar sem perder o registro
  -- de quem já esteve é o que permite religar sem redescobrir a lista.
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid
);

comment on table public.carbo_wa_notificados is
  'Quem recebe o aviso de mensagem nova do cliente. ⚠️ NASCE VAZIA: ausência não avisa ninguém. Marcar é um clique na tela de Conversas, não uma migração.';

alter table public.carbo_wa_notificados enable row level security;
drop policy if exists carbo_wa_notificados_leitura on public.carbo_wa_notificados;
drop policy if exists carbo_wa_notificados_escrita on public.carbo_wa_notificados;
drop policy if exists carbo_wa_notificados_service on public.carbo_wa_notificados;

-- Ler e escrever: time interno.
--
-- ⚠️ NÃO exige gestor de propósito. O modelo de acesso deste projeto é "se a
-- pessoa tem acesso ao app, ela vê" — o bloqueio de tela mora no Admin, não
-- dentro da tela. Exigir `carbo_admin` aqui criaria uma segunda régua de
-- permissão vivendo num lugar onde ninguém iria procurá-la.
create policy carbo_wa_notificados_leitura on public.carbo_wa_notificados
  for select to authenticated using (public.carbo_e_time_interno());
create policy carbo_wa_notificados_escrita on public.carbo_wa_notificados
  for all to authenticated
  using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());
create policy carbo_wa_notificados_service on public.carbo_wa_notificados
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.carbo_wa_notificados to authenticated;


-- ── A lista para a tela ───────────────────────────────────────────────────
--
-- Só gente do time interno aparece como candidata. Um lojista nunca pode ser
-- marcado, nem por engano — a tela não o oferece e o gatilho não o entrega.

create or replace view public.carbo_wa_notificaveis
with (security_invoker = true) as
select
  p.id                                   as user_id,
  p.full_name,
  p.allowed_interfaces,
  coalesce(n.ativo, false)               as recebe,
  n.criado_em                            as marcado_em
from public.profiles p
left join public.carbo_wa_notificados n on n.user_id = p.id
where public.carbo_interface_e_interna(p.allowed_interfaces);

comment on view public.carbo_wa_notificaveis is
  'Quem PODE receber o aviso de mensagem nova (time interno) e quem de fato recebe. Lojista e licenciado não aparecem: a tela não os oferece e o gatilho não os entrega.';

grant select on public.carbo_wa_notificaveis to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o gatilho passa a respeitar a lista                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_wa_notifica_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome   text;
  v_previa text;
begin
  if new.direcao <> 'entrada' then return new; end if;

  -- ⚠️ Rajada vira UM aviso, não cinco. A janela conta a partir da mensagem
  -- NOVA: suprime a rajada sem silenciar uma conversa que recomeça horas depois.
  if exists (
    select 1 from public.carbo_wa_mensagens m
    where m.wa_id = new.wa_id
      and m.direcao = 'entrada'
      and m.wamid <> new.wamid
      and m.ocorrido_em > new.ocorrido_em - interval '10 minutes'
  ) then
    return new;
  end if;

  select coalesce(nullif(trim(c.nome), ''), new.wa_id) into v_nome
  from public.carbo_wa_contatos c where c.wa_id = new.wa_id;
  v_nome := coalesce(v_nome, new.wa_id);

  v_previa := coalesce(
    nullif(left(regexp_replace(coalesce(new.texto, ''), '\s+', ' ', 'g'), 120), ''),
    case when new.midia_id is not null then 'enviou um arquivo (' || new.tipo || ')'
         else 'enviou uma mensagem' end);

  -- ⚠️ A lista explícita, e a checagem de interface interna JUNTO.
  --
  -- Não é redundância: a tela só oferece gente interna, mas a tabela é escrita
  -- por qualquer um do time, e alguém pode ficar marcado depois de perder o
  -- acesso. A segunda trava faz o aviso parar de sair sozinho quando isso
  -- acontece, em vez de continuar entregando conversa de cliente a quem já
  -- saiu.
  --
  -- Tabela vazia = insert de zero linhas. Ninguém recebe, e não há erro.
  insert into public.notifications
    (user_id, type, title, body, reference_type, reference_id, is_read)
  select n.user_id, 'wa_inbound', '💬 ' || v_nome || ' respondeu', v_previa,
         'wa_conversa', null, false
  from public.carbo_wa_notificados n
  join public.profiles p on p.id = n.user_id
  where n.ativo
    and public.carbo_interface_e_interna(p.allowed_interfaces);

  return new;
end $$;

comment on function public.carbo_wa_notifica_inbound is
  'Avisa quem está marcado em carbo_wa_notificados quando o cliente responde. Rajada de mensagens seguidas gera UM aviso (janela de 10 min). Lista vazia = ninguém recebe, sem erro. A checagem de interface interna é repetida aqui de proposito: quem perdeu o acesso para de receber sozinho.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A lista tem de nascer VAZIA. Tem de vir ZERO.
select count(*) as recebem_hoje
from public.carbo_wa_notificados where ativo;

-- (b) Quem pode ser marcado, e o estado de cada um. Todos com `recebe = false`.
select full_name, recebe, allowed_interfaces
from public.carbo_wa_notificaveis
order by recebe desc, full_name;

-- (c) ⚠️ A prova de que a consolidação da lista não mudou nada: este número tem
--     de ser o MESMO que o `receberiam` de antes (30). Se mudou, alguma
--     interface saiu da lista na hora de unificar.
select count(*) as time_interno from public.carbo_wa_notificaveis;
