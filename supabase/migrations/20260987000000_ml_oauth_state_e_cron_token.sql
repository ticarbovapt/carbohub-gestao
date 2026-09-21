-- ═══════════════════════════════════════════════════════════════════════════
-- OAuth do ML: `state` com dono, e o cron que renova token sozinho
--
-- Duas coisas pequenas e independentes que a Fase 0 exige.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — `ml_oauth_states`: o state tem de ser NOSSO                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O `state` do OAuth carrega para QUAL conta a autorização é (LogHouse ou
-- Full). A versão anterior aceitava o valor cru da query string — `?state=full`
-- —, e isso tem dois problemas:
--
-- 1. ⚠️ Qualquer um pode chamar o callback com `state` à escolha. Não é o fim
--    do mundo (sem `code` válido nada acontece), mas é uma decisão nossa
--    tomada por um parâmetro de terceiro.
-- 2. ⚠️ O pior: um link de autorização SALVO por alguém, com o state antigo,
--    reconectaria a conta errada meses depois. O sintoma seria a conta
--    LogHouse virando `mercadolivre_full` — faturamento no canal errado E
--    estoque deixando de ser deduzido, porque o Full não deduz.
--
-- Com a tabela, o `state` é um valor aleatório que NÓS geramos e que só vale
-- uma vez, por 10 minutos. Link velho não reconecta nada: o state já expirou.

create table if not exists public.ml_oauth_states (
  state        text primary key,
  platform_key text not null
               check (platform_key in ('mercadolivre', 'mercadolivre_full')),
  label        text,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '10 minutes',
  -- ⚠️ USO ÚNICO. Sem isto, o mesmo `state` serviria a duas trocas de código —
  -- e a segunda poderia vir de outro lugar.
  usado_em     timestamptz
);

comment on table public.ml_oauth_states is
  'State do OAuth do Mercado Livre: valor aleatorio gerado por NOS, valido 10 min e de USO UNICO. Existe para o `state` nao ser um parametro de terceiro — sem ele, um link de autorizacao salvo por alguem reconectaria a conta errada meses depois, e o sintoma seria a conta LogHouse virando mercadolivre_full: faturamento no canal errado E estoque deixando de ser deduzido.';

create index if not exists idx_ml_oauth_states_expira
  on public.ml_oauth_states (expira_em);

alter table public.ml_oauth_states enable row level security;

-- Só a função (service_role) escreve e lê. O front nunca toca nisto.
drop policy if exists "service usa ml_oauth_states" on public.ml_oauth_states;
create policy "service usa ml_oauth_states"
  on public.ml_oauth_states for all to service_role using (true) with check (true);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o cron do `ml-token-refresh`                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O segredo é LIDO do job que já existe, em vez de digitado aqui. Duas
-- razões: não repetir credencial em arquivo versionado, e não errar de
-- digitação — um segredo errado aqui daria 401 a cada 30 min com o `pg_cron`
-- marcando `succeeded`, porque o sucesso dele é ter POSTADO. Foi exatamente
-- esse disfarce que custou 20 h no `ecommerce-sync`.
--
-- ⚠️ Minuto :09 e :39, ímpares e fora da grade cheia. A grade real (conferida
-- em 21/09/2026) ocupa: :00 e todos os pares (`bling2-bridge` é `*/2`), :05 e
-- múltiplos (`*/5` do ecommerce-sync, rastreio e melhorenvio-conciliar), :03
-- (order_details), :04 (carrinhos), :06 (melhor-envio-envios), :07
-- (nfe_recheck), :08 (deduz-estoque). Empilhar jobs no mesmo minuto não dá
-- erro — dá dois picos de CPU que ninguém liga a nada.

do $$
declare
  v_segredo text;
  v_url     text := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/ml-token-refresh';
begin
  select (regexp_match(j.command, '''X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_segredo
  from cron.job j
  where j.jobname = 'ecommerce-sync-5min';

  -- ⚠️ ABORTA em vez de agendar sem segredo. Um job sem a chave bateria 401 a
  -- cada 30 min, e o pg_cron marcaria `succeeded` o tempo todo. Ausência FECHA.
  if v_segredo is null or btrim(v_segredo) = '' then
    raise exception
      'Nao consegui ler o CRON_SECRET do job ecommerce-sync-5min. Confira se o job existe com esse nome e se o header se chama X-Cron-Secret.';
  end if;

  -- Idempotente: re-agendar substitui, sem duplicar.
  if exists (select 1 from cron.job where jobname = 'ml-token-refresh-30min') then
    perform cron.unschedule('ml-token-refresh-30min');
  end if;

  perform cron.schedule(
    'ml-token-refresh-30min',
    '9-59/30 * * * *',
    format($cmd$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_url, v_segredo)
  );

  raise notice 'ml-token-refresh-30min agendado para :09 e :39.';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O job existe, está ativo e no minuto certo? Esperado: 1 linha,
--     schedule = '9-59/30 * * * *', active = true.
select jobid, jobname, schedule, active
from cron.job where jobname = 'ml-token-refresh-30min';

-- (b) ⚠️ O comando levou o segredo? Esperado: tem_segredo = true.
--     NÃO imprime o valor — a pergunta é "tem", não "qual".
select jobname,
       command ilike '%X-Cron-Secret%'                   as tem_header,
       (regexp_match(command, '''X-Cron-Secret''\s*,\s*''([^'']+)''') is not null)
                                                          as tem_segredo
from cron.job where jobname = 'ml-token-refresh-30min';

-- (c) Nenhum outro job no minuto :09 ou :39? Esperado: só o nosso.
select jobname, schedule from cron.job
where schedule like '%9-59/30%' or schedule like '9 %' or schedule like '39 %'
order by jobname;

-- (d) ⚠️ Depois da PRIMEIRA rodada (espere até :09 ou :39), confira que ele
--     rodou de verdade. `succeeded` no pg_cron significa só que o POST saiu —
--     o retorno da função está no log da Edge Function, não aqui.
select jobname, status, start_time, return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'ml-token-refresh-30min'
order by start_time desc
limit 5;

-- (e) E o efeito REAL: nenhuma conta com token vencendo nos próximos 90 min.
--     Esperado: zero linhas depois que o cron rodar ao menos uma vez.
select platform_key, status, expires_at, last_refresh_at, last_error
from public.ml_accounts
where status = 'active'
  and (expires_at is null or expires_at < now() + interval '90 minutes')
order by platform_key;
