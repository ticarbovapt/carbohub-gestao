-- ═══════════════════════════════════════════════════════════════════════════
-- Tarja de status — a SONDA EXTERNA e o histórico
--
-- Complementa a `20261011000000` (o aviso declarado) e a detecção automática
-- do `packages/shell`. As três respondem perguntas diferentes:
--
--     tarja automática   "o meu navegador alcança o Supabase AGORA?"
--     aviso declarado    "o TI sabe de algo e avisou"
--     esta tabela        "como o sistema se comportou nas últimas 24 h"
--
-- Quem escreve aqui é um job do GitHub Actions (a sonda externa), com a
-- service role — de FORA da infraestrutura, que é o ponto: medição feita de
-- dentro do próprio sistema não sabe dizer que o sistema caiu.
--
-- ⚠️ E ela tem um limite HONESTO, que não dá para desenhar de outro jeito:
-- **com o Supabase fora, a sonda não consegue registrar que ele está fora.**
-- O que sobra é o BURACO na série — e é assim que a página de status lê:
-- "sem medição desde HH:MM" é o sinal, não a ausência de linha vermelha.
-- Prometer o contrário seria um relatório que só sabe concordar consigo
-- mesmo, a doença da `20260941`.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_status_sonda (
  id         bigserial primary key,
  medido_em  timestamptz not null default now(),

  -- `supabase`, `app:ti`, `app:ops`… — texto livre de propósito: alvo novo
  -- entra mudando só o workflow, sem migração. CHECK aqui seria a quarta
  -- cópia da lista de apps, e divergir dela recusa a medição em silêncio.
  alvo       text not null,

  ok         boolean not null,
  ms         integer,
  detalhe    text,

  created_at timestamptz not null default now()
);

comment on table public.carbo_status_sonda is
  'Medições da sonda externa (GitHub Actions). ⚠️ Supabase fora NÃO gera linha: o sinal é o BURACO na série. Ver 20261012000000.';

create index if not exists idx_status_sonda_alvo_tempo
  on public.carbo_status_sonda (alvo, medido_em desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.carbo_status_sonda enable row level security;

-- Leitura aberta, inclusive `anon`: a página pública de status tem de
-- funcionar sem login — quem não consegue entrar é quem mais precisa dela.
-- Não há dado sensível: alvo, se respondeu, e em quantos milissegundos.
drop policy if exists carbo_status_sonda_leitura on public.carbo_status_sonda;
create policy carbo_status_sonda_leitura on public.carbo_status_sonda
  for select to anon, authenticated using (true);

-- ⚠️ NENHUMA policy de escrita. Quem grava é a service role do workflow, que
-- passa por cima da RLS. Sem policy não existe caminho pelo PostgREST para
-- alguém forjar uma queda — ou, pior, forjar que estava tudo bem.
grant select on public.carbo_status_sonda to anon, authenticated;

-- ── O último estado de cada alvo, para a página ───────────────────────────
-- ⚠️ `security_invoker` REPETIDO: `create or replace view` sem `WITH` apaga as
-- reloptions (a lição da `bling2_esteira`). Aqui a tabela é aberta a `anon`, de
-- modo que invoker é o certo — e é o que mantém a view honesta se um dia a
-- tabela deixar de ser.
create or replace view public.carbo_status_ultimo
with (security_invoker = true) as
select distinct on (s.alvo)
  s.alvo,
  s.ok,
  s.ms,
  s.detalhe,
  s.medido_em
from public.carbo_status_sonda s
order by s.alvo, s.medido_em desc;

grant select on public.carbo_status_ultimo to anon, authenticated;

-- ── Faxina ────────────────────────────────────────────────────────────────
-- 12 sondas/hora × ~10 alvos × 30 dias ≈ 86 mil linhas. O teto existe para a
-- tabela não virar um custo que ninguém lembra de ter criado.
create or replace function public.carbo_status_sonda_faxina()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.carbo_status_sonda
  where medido_em < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ⚠️ Minuto ÍMPAR e fora da grade cheia (ver "Cadência" no CLAUDE.md): :17,
-- de madrugada. Empilhar não dá erro — dá um pico que ninguém liga a nada.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('status-sonda-faxina')
      where exists (select 1 from cron.job where jobname = 'status-sonda-faxina');
    perform cron.schedule('status-sonda-faxina', '17 3 * * *',
      $cron$select public.carbo_status_sonda_faxina();$cron$);
  end if;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — rode UMA DE CADA VEZ                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A tabela NÃO pode ter policy de escrita. ESPERADO: 1 linha, cmd SELECT.
select policyname, cmd, roles::text
from pg_policies where tablename = 'carbo_status_sonda';

-- (b) A view ficou com security_invoker? ESPERADO: {security_invoker=true}.
select relname, reloptions from pg_class where relname = 'carbo_status_ultimo';

-- (c) A faxina está agendada? ESPERADO: 1 linha, '17 3 * * *'.
select jobname, schedule, active from cron.job where jobname = 'status-sonda-faxina';
