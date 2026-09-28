-- ═══════════════════════════════════════════════════════════════════════════
-- Tarja de status — o aviso DECLARADO pelo TI
--
-- Pedido do dono do processo em 28/09/2026, depois de uma queda do Supabase em
-- que todos os apps ficaram girando sem explicação: *"evitava das pessoas virem
-- perguntar, abrir ticket"*.
--
-- ⚠️ ESTE AVISO NÃO COBRE A QUEDA DO SUPABASE, e isso é por construção, não
-- esquecimento. Ele mora aqui porque é o único lugar que a tela do TI escreve e
-- os sete apps leem — e, com o Supabase fora, ninguém escreve nem lê. Quem
-- cobre esse caso é a detecção AUTOMÁTICA da tarja (`packages/shell`), que não
-- pergunta nada a ninguém: ela mede as próprias chamadas e acende sozinha.
--
--     Supabase fora                      → tarja AUTOMÁTICA
--     Bling fora, manutenção, lentidão   → tarja DECLARADA (esta tabela)
--
-- Aviso que depende do que ele anuncia é aviso que falha calado — a mesma
-- lição do `BloqueioAoVivo`, onde o sinal do Realtime NÃO substitui a trava.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_status_aviso (
  id            uuid primary key default gen_random_uuid(),

  -- ⚠️ `ativo` é a ÚNICA chave que decide se a tarja aparece. Ver `previsao_fim`.
  ativo         boolean not null default true,

  -- `manutencao` é planejada; os outros três são o que está acontecendo.
  severidade    text not null default 'instabilidade'
                check (severidade in ('info', 'instabilidade', 'queda', 'manutencao')),

  titulo        text not null,
  mensagem      text,

  -- ⚠️ Lista VAZIA significa TODOS os apps, de propósito. O caso comum é o
  -- sistema inteiro, e obrigar a marcar sete caixas para o caso comum é como
  -- se esquece uma. A tela do TI mostra isso como um botão "todos os apps".
  apps          text[] not null default '{}',

  inicio_em     timestamptz not null default now(),

  -- ⚠️ PREVISÃO, nunca interruptor. A tarja NÃO apaga sozinha quando esta hora
  -- chega: manutenção que se estende é exatamente quando o aviso mais importa,
  -- e sumir no horário combinado deixaria o sistema instável e a tela limpa.
  -- Quem apaga é o TI, mudando `ativo`.
  previsao_fim  timestamptz,

  encerrado_em  timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.carbo_status_aviso is
  'Aviso de instabilidade/manutenção declarado pelo TI, exibido como tarja nos apps. NÃO cobre a queda do próprio Supabase — esse caso é da detecção automática do packages/shell. Ver 20261011000000.';
comment on column public.carbo_status_aviso.apps is
  'Apps afetados (carbo_admin, carbo_ops…). VAZIO = todos.';
comment on column public.carbo_status_aviso.previsao_fim is
  'Previsão mostrada ao usuário. NÃO apaga a tarja: quem apaga é `ativo`.';

create index if not exists idx_status_aviso_ativo
  on public.carbo_status_aviso (ativo, inicio_em desc) where ativo;

-- ── updated_at ────────────────────────────────────────────────────────────
create or replace function public.carbo_status_aviso_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- Encerrar é um FATO com hora; `ativo = false` sozinho não diria quando.
  if new.ativo = false and old.ativo = true and new.encerrado_em is null then
    new.encerrado_em := now();
  end if;
  -- Reabrir limpa o carimbo: um aviso encerrado e reaberto não terminou.
  if new.ativo = true and old.ativo = false then
    new.encerrado_em := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_carbo_status_aviso_touch on public.carbo_status_aviso;
create trigger trg_carbo_status_aviso_touch
  before update on public.carbo_status_aviso
  for each row execute function public.carbo_status_aviso_touch();


-- ── Quem pode DECLARAR ────────────────────────────────────────────────────
--
-- ⚠️ Uma tarja vermelha em sete apps é a coisa mais barulhenta do ecossistema.
-- Não é `is_manager_or_admin` (todo gestor): é o TI, mais a direção.
create or replace function public.carbo_pode_avisar_status()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.department::text = 'ti_suporte' or p.funcao in ('head', 'ceo'))
  );
$$;

comment on function public.carbo_pode_avisar_status() is
  'Quem pode declarar aviso de status: TI (qualquer função) ou head/CEO. Uma tarja em sete apps é barulhenta demais para todo gestor.';

grant execute on function public.carbo_pode_avisar_status() to authenticated;


-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.carbo_status_aviso enable row level security;

-- ⚠️ Leitura ABERTA, inclusive para `anon`. Não há dado sensível aqui, e a
-- tarja precisa aparecer ANTES do login — quem não consegue entrar é
-- justamente quem mais precisa saber que o sistema está instável. Restringir a
-- `authenticated` faria o aviso sumir na única tela onde o problema aparece.
drop policy if exists carbo_status_aviso_leitura on public.carbo_status_aviso;
create policy carbo_status_aviso_leitura on public.carbo_status_aviso
  for select to anon, authenticated
  using (ativo);

-- O TI vê o histórico inteiro (encerrados inclusive) — policies de SELECT
-- combinam com OR, então isto SOMA à regra acima.
drop policy if exists carbo_status_aviso_historico on public.carbo_status_aviso;
create policy carbo_status_aviso_historico on public.carbo_status_aviso
  for select to authenticated
  using (public.carbo_pode_avisar_status());

drop policy if exists carbo_status_aviso_escreve on public.carbo_status_aviso;
create policy carbo_status_aviso_escreve on public.carbo_status_aviso
  for insert to authenticated
  with check (public.carbo_pode_avisar_status());

drop policy if exists carbo_status_aviso_edita on public.carbo_status_aviso;
create policy carbo_status_aviso_edita on public.carbo_status_aviso
  for update to authenticated
  using (public.carbo_pode_avisar_status())
  with check (public.carbo_pode_avisar_status());

-- ⚠️ SEM policy de DELETE. Aviso é histórico: encerrar é `ativo = false`, e
-- apagar apagaria a prova de que o sistema esteve fora — que é exatamente o
-- que alguém vai querer conferir depois.

grant select on public.carbo_status_aviso to anon, authenticated;
grant insert, update on public.carbo_status_aviso to authenticated;


-- ── Realtime ──────────────────────────────────────────────────────────────
-- Para a tarja acender sem esperar o próximo poll. ⚠️ Ela NÃO depende disto:
-- o componente também consulta de tempos em tempos. Realtime fora do ar não
-- pode ser o motivo de o aviso não aparecer.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'carbo_status_aviso'
  ) then
    alter publication supabase_realtime add table public.carbo_status_aviso;
  end if;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — rode UMA DE CADA VEZ                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As policies. ESPERADO: 4 linhas (2 select, 1 insert, 1 update) e NENHUMA
--     de delete.
select policyname, cmd, roles::text
from pg_policies where tablename = 'carbo_status_aviso' order by cmd, policyname;

-- (b) A tabela está no Realtime? ESPERADO: uma linha.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'carbo_status_aviso';

-- (c) Quem pode declarar, hoje. ESPERADO: o time de TI e a direção.
select p.full_name, p.department::text, p.funcao
from public.profiles p
where p.department::text = 'ti_suporte' or p.funcao in ('head', 'ceo')
order by p.department::text, p.full_name;
