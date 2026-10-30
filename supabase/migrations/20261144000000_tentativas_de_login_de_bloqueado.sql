-- ═══════════════════════════════════════════════════════════════════════════
-- Último acesso → aba "Bloqueados": quando o bloqueado TENTOU entrar
--
-- Pedido do dono do processo (30/10/2026): "ver quando esse bloqueado tentou
-- logar … para garantir que ele está bloqueado ainda e vermos se ele tentou
-- logar no sistema depois de bloqueado".
--
-- ⚠️ O Auth NÃO registra a tentativa. O GoTrue recusa o banido ANTES de gravar
-- qualquer coisa em `auth.audit_log_entries` (o log só tem login que deu
-- certo). Então quem registra é a TELA DE LOGIN: o Hub e os oito apps, ao
-- receberem "User is banned", chamam `carbo_registrar_tentativa_bloqueada`.
-- Consequência: tentativa por fora das nossas telas (API direta) não aparece —
-- e continua barrada do mesmo jeito, porque a trava é o Auth.
--
-- ⚠️ A função é chamada SEM sessão (a tentativa falhou), logo é executável
-- por `anon`. Por isso ela:
--   • só grava se a conta está BLOQUEADA AGORA (banned_until no futuro) —
--     e-mail qualquer não vira linha;
--   • não devolve nada (não responde "existe"/"está bloqueado");
--   • ignora repetição do mesmo usuário em 30 s (duplo clique, Enter + clique).
--
-- "Ainda está bloqueado?" continua sendo `auth.users.banned_until` — a aba lê
-- de lá, não desta tabela (a lição do `carbo_usuario_bloqueio_log`).
--
-- RODE EM BLOCOS: 1, depois 2 (conferência).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — tabela, registro e a leitura da aba                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_login_bloqueado_tentativas (
  id          bigserial primary key,
  user_id     uuid not null,
  origem      text,          -- o endereço de onde tentou (carbohub.com.br, sales.…)
  user_agent  text,
  em          timestamptz not null default now()
);

create index if not exists idx_login_bloqueado_user
  on public.carbo_login_bloqueado_tentativas (user_id, em desc);

comment on table public.carbo_login_bloqueado_tentativas is
  'Tentativas de login de quem estava BLOQUEADO (o GoTrue não registra). Gravada só por carbo_registrar_tentativa_bloqueada, chamada pelas telas de login. Append-only.';

alter table public.carbo_login_bloqueado_tentativas enable row level security;
-- Sem policy nenhuma: escrita só pela função; leitura só pela RPC da aba.

create or replace function public.carbo_registrar_tentativa_bloqueada(
  p_login text, p_origem text default null, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_login, '')));
  v_user  uuid;
begin
  if v_email = '' then return; end if;

  -- Usuário em vez de e-mail: a MESMA resolução do login.
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
  if v_user is null then return; end if;   -- não está bloqueado: nada a registrar

  if exists (select 1 from public.carbo_login_bloqueado_tentativas t
              where t.user_id = v_user and t.em > now() - interval '30 seconds') then
    return;
  end if;

  insert into public.carbo_login_bloqueado_tentativas (user_id, origem, user_agent)
  values (v_user, left(p_origem, 200), left(p_user_agent, 400));
exception when others then
  return;   -- registrar é best-effort: nunca muda a resposta do login
end;
$$;

revoke execute on function public.carbo_registrar_tentativa_bloqueada(text, text, text) from public;
grant execute on function public.carbo_registrar_tentativa_bloqueada(text, text, text) to anon, authenticated, service_role;

-- A aba: quem está bloqueado AGORA, desde quando, por quem, e o que aconteceu
-- depois. Mesma porta do get_last_login_summary (gestor, CEO ou admin).
-- jsonb (nunca setof): o teto de 1.000 do PostgREST vale para RPC.
create or replace function public.carbo_bloqueados_acessos()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.carbo_is_gestor(auth.uid()) or public.is_ceo(auth.uid()) or public.is_admin(auth.uid())) then
    raise exception 'Access denied';
  end if;

  return coalesce((
    select jsonb_agg(x order by x->>'bloqueado_em' desc nulls last)
    from (
      select jsonb_build_object(
        'user_id', u.id,
        'nome', coalesce(p.full_name, u.email),
        'email', u.email,
        'departamento', p.department::text,
        'funcao', p.funcao,
        'bloqueado_ate', u.banned_until,
        'bloqueado_em', b.em,
        'bloqueado_por', pb.full_name,
        'motivo', b.motivo,
        'ultimo_login', u.last_sign_in_at,
        'ultimo_app', p.last_app,
        'ultimo_app_em', p.last_app_at,
        'tentativas', coalesce(t.n, 0),
        'ultima_tentativa', t.ultima,
        'lista', coalesce(t.lista, '[]'::jsonb)
      ) as x
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join lateral (
        select l.em, l.motivo, l.por
          from public.carbo_usuario_bloqueio_log l
         where l.user_id = u.id and l.acao = 'bloqueado'
         order by l.em desc limit 1
      ) b on true
      left join public.profiles pb on pb.id = b.por
      left join lateral (
        -- Só o que veio DEPOIS do bloqueio vigente (bloqueio antigo,
        -- desbloqueado e refeito, não conta tentativa do período livre).
        select count(*) as n, max(tt.em) as ultima,
               (select jsonb_agg(jsonb_build_object('em', z.em, 'origem', z.origem, 'user_agent', z.user_agent) order by z.em desc)
                  from (select * from public.carbo_login_bloqueado_tentativas z0
                         where z0.user_id = u.id and z0.em >= coalesce(b.em, '-infinity')
                         order by z0.em desc limit 30) z) as lista
          from public.carbo_login_bloqueado_tentativas tt
         where tt.user_id = u.id and tt.em >= coalesce(b.em, '-infinity')
      ) t on true
      where u.banned_until is not null and u.banned_until > now()
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.carbo_bloqueados_acessos() from public, anon;
grant execute on function public.carbo_bloqueados_acessos() to authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA (só leitura)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) as duas funções existem (esperado: true, true)
select
  ((select count(*) from pg_proc where proname = 'carbo_registrar_tentativa_bloqueada') = 1) as registra_existe,
  ((select count(*) from pg_proc where proname = 'carbo_bloqueados_acessos') = 1)           as aba_existe;

-- (b) quem a aba vai mostrar (a função da aba recusa no SQL Editor — sem
-- usuário logado —, então a conferência pergunta direto ao Auth)
select u.email, p.full_name, u.banned_until, u.last_sign_in_at,
       (select max(l.em) from public.carbo_usuario_bloqueio_log l
         where l.user_id = u.id and l.acao = 'bloqueado') as bloqueado_em
from auth.users u
left join public.profiles p on p.id = u.id
where u.banned_until > now()
order by bloqueado_em desc nulls last;
