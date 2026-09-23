-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e Nacional (ADN) — FASE 2: a rodada
--
-- A Fase 1 criou o log cru e a leitura. Aqui entra quem o ALIMENTA: a edge
-- function `nfse-nacional?ingerir=1`, chamada de hora em hora.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE DE HORA EM HORA, e não a cada 5 min como os outros syncs
--
-- O ADN não tem webhook: a gente PERGUNTA. E ele pune quem pergunta demais sem
-- ter o que receber — a família de regras de "consumo indevido" dos serviços
-- fiscais. Nota de serviço não chega de minuto em minuto; o ganho de perguntar
-- 12× mais é zero e o risco é a porta fechar.
--
-- ⚠️ Minuto :13, ÍMPAR e fora da grade cheia. Ocupados hoje: :00 e todos os
-- pares (`bling2-bridge` é */2), :05 e múltiplos (os três */5), :03
-- order_details, :04 carrinhos, :06 melhor-envio, :07 nfe_recheck, :08
-- deduz-estoque, :09 ml-token-refresh, :11 ml-estoque-full. Empilhar não dá
-- erro — dá dois picos que ninguém liga a nada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O SEGREDO NÃO É DIGITADO AQUI
--
-- O bloco abaixo LÊ o `X-Cron-Secret` de um job que já existe, em vez de pedir
-- que alguém o cole. Dois motivos, e o segundo é o que importa:
--
--   1. segredo colado em migração fica no repositório para sempre;
--   2. segredo colado à mão pode vir DIFERENTE do que os outros jobs usam — e
--      o sintoma disso é 401 a cada rodada com o `pg_cron` marcando
--      `succeeded` o tempo todo, porque o sucesso dele é ter POSTADO. Foram
--      25 h de sincronismo morto da última vez.
--
-- ⚠️ E ele ABORTA se não achar. Agendar um job que vai levar 401 para sempre é
-- pior que não agendar: cria a aparência de integração funcionando.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O LOG DE RODADAS
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Existe porque `cron.job_run_details` mede a coisa errada: ele diz que o
-- POST saiu, não que o ADN respondeu nem que algo foi gravado. Rodada que morre
-- no meio e rodada sem documento novo deixam exatamente o mesmo rastro lá — e
-- foi esse disfarce que escondeu o `CRON_SECRET` ausente por 25 h.
create table if not exists public.carbo_nfse_sync_log (
  id          bigserial primary key,
  ambiente    text        not null default 'producao',
  nsu_antes   bigint,
  nsu_depois  bigint,
  lotes       int,
  gravados    int,
  repetidos   int,
  malformados int,
  status      text,
  erro        text,
  ms          int,
  em          timestamptz not null default now()
);

comment on table public.carbo_nfse_sync_log is
  'Uma linha por rodada da ingestao do ADN, inclusive as que FALHARAM. cron.job_run_details diz apenas que o POST saiu — aqui se ve se o ADN respondeu e o que entrou.';

create index if not exists carbo_nfse_sync_log_em_idx
  on public.carbo_nfse_sync_log (em desc);

alter table public.carbo_nfse_sync_log enable row level security;

drop policy if exists "time interno le o sync da nfse" on public.carbo_nfse_sync_log;
create policy "time interno le o sync da nfse"
  on public.carbo_nfse_sync_log for select
  using (public.carbo_e_time_interno());

-- Sem policy de escrita: quem grava é a edge function com service role.

grant select on public.carbo_nfse_sync_log to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SAÚDE DA INTEGRAÇÃO — para a tela, e para responder "está rodando?"
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.carbo_nfse_saude
with (security_invoker = true) as
select
  (select coalesce(max(nsu), 0) from public.carbo_nfse_dfe
    where ambiente = 'producao')                                as ultimo_nsu,
  (select count(*) from public.carbo_nfse_dfe
    where ambiente = 'producao' and tipo_documento = 'NFSE')    as notas,
  (select count(*) from public.carbo_nfse_dfe
    where ambiente = 'producao' and tipo_documento = 'EVENTO')  as eventos,
  (select count(*) from public.carbo_nfse_dfe
    where ambiente = 'producao' and not xml_ok)                 as malformados,
  l.em                                                          as ultima_rodada,
  l.status                                                      as ultimo_status,
  l.erro                                                        as ultimo_erro,
  -- ⚠️ O limiar anda JUNTO com o agendamento (cron de 1 h ⇒ 3 h de folga).
  -- Mudou a cadência, mude aqui — deixar o limiar velho faz a tela levar horas
  -- para acusar um espelho parado, que é a doença dos comentários de cron que
  -- já não valem.
  (l.em is null or l.em < now() - interval '3 hours')           as parada
from (
  select em, status, erro
  from public.carbo_nfse_sync_log
  where ambiente = 'producao'
  order by em desc
  limit 1
) l;

comment on view public.carbo_nfse_saude is
  'Retrato da integracao do ADN: ate que NSU leu, quanto tem, e se a ultima rodada foi ha muito tempo. `parada` usa 3 h porque o cron e de 1 h.';

grant select on public.carbo_nfse_saude to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O AGENDAMENTO
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_secret text;
  v_url    text := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/nfse-nacional?ingerir=1';
begin
  -- Pega o X-Cron-Secret de um job que já funciona.
  select (regexp_match(command, '[Xx]-[Cc]ron-[Ss]ecret[^,]*,\s*''([^'']+)'''))[1]
    into v_secret
  from cron.job
  where command ilike '%cron-secret%'
  limit 1;

  if v_secret is null or v_secret = '' then
    raise exception
      'Nao encontrei o X-Cron-Secret em nenhum job de cron.job. Abortei de proposito: agendar sem o segredo certo produz 401 a cada hora com o pg_cron marcando succeeded — integracao que parece viva e nao le nada.';
  end if;

  perform cron.unschedule('nfse-nacional-1h')
  where exists (select 1 from cron.job where jobname = 'nfse-nacional-1h');

  perform cron.schedule(
    'nfse-nacional-1h',
    '13 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret',%L),
        body := '{}'::jsonb
      );$cmd$,
      v_url, v_secret)
  );
end $$;
