-- ═══════════════════════════════════════════════════════════════════════════
-- Registro dos avisos do Melhor Envio
--
-- O webhook "atualização das etiquetas" avisa quando algo muda, em vez de a
-- gente perguntar de hora em hora. Ele NÃO grava rastreio: extrai o código e
-- manda a `rastreio-sync` buscar a verdade na API. O aviso é o gatilho, a API
-- é a fonte — quem confia no corpo do webhook fica refém do formato dele.
--
-- Esta tabela existe por um motivo específico: o formato do payload não está
-- documentado de forma confiável, e aviso que chega num formato inesperado
-- some sem deixar rastro. Guardando o corpo cru, um aviso que não deu em nada
-- vira uma linha visível em vez de silêncio — e é dela que sai a correção.
--
-- ⚠️ Isto cresce. A limpeza dos 30 dias está no fim do arquivo, agendada.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rastreio_webhook_log (
  id          bigserial primary key,
  recebido_em timestamptz not null default now(),
  origem      text not null default 'melhorenvio',
  evento      text,
  -- Os códigos que consegui extrair. Vazio = não entendi o formato, e é esse
  -- o caso que interessa investigar.
  codigos     text[] not null default '{}',
  acao        text,
  payload     jsonb
);

create index if not exists rastreio_webhook_log_recebido_idx
  on public.rastreio_webhook_log (recebido_em desc);

-- Índice parcial: a consulta que importa é "o que chegou e não deu em nada".
create index if not exists rastreio_webhook_log_sem_codigo_idx
  on public.rastreio_webhook_log (recebido_em desc)
  where cardinality(codigos) = 0;

comment on table public.rastreio_webhook_log is
  'Avisos recebidos do Melhor Envio, com o corpo cru. O webhook não grava rastreio — ele dispara a rastreio-sync, que busca na API. Esta tabela existe para que aviso em formato inesperado apareça em vez de sumir.';

alter table public.rastreio_webhook_log enable row level security;

drop policy if exists rastreio_webhook_log_leitura on public.rastreio_webhook_log;
drop policy if exists rastreio_webhook_log_service on public.rastreio_webhook_log;

create policy rastreio_webhook_log_leitura on public.rastreio_webhook_log
  for select to authenticated using (true);
create policy rastreio_webhook_log_service on public.rastreio_webhook_log
  for all to service_role using (true) with check (true);

grant select on public.rastreio_webhook_log to authenticated;


-- ── Limpeza ────────────────────────────────────────────────────────────────
-- Sem isto a tabela cresce para sempre. Trinta dias é bem mais do que o
-- necessário para investigar um formato estranho.

create or replace function public.rastreio_webhook_log_limpar()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_apagados integer;
begin
  delete from public.rastreio_webhook_log
  where recebido_em < now() - interval '30 days';
  get diagnostics v_apagados = row_count;
  return v_apagados;
end $$;

select cron.schedule(
  'rastreio-webhook-log-limpar',
  '20 4 * * *',
  $cmd$ select public.rastreio_webhook_log_limpar(); $cmd$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select 'tabela criada' as ok, count(*) as linhas from public.rastreio_webhook_log;

select jobid, jobname, schedule, active
from cron.job where jobname = 'rastreio-webhook-log-limpar';

-- Depois que o webhook estiver recebendo, ESTA é a consulta que importa:
-- aviso que chegou e não virou código nenhum.
--
--   select recebido_em, evento, payload
--   from public.rastreio_webhook_log
--   where cardinality(codigos) = 0
--   order by recebido_em desc limit 10;
