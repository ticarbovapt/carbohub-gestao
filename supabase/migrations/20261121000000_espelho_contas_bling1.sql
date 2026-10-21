-- ─────────────────────────────────────────────────────────────────────────────
-- Espelho das contas a RECEBER e a PAGAR do Bling 1 (matriz) — ACRÉSCIMO
-- (21/10/2026)
--
-- Medido no código: o `bling-sync` SABE ler `/contas/pagar` e `/contas/receber`,
-- mas o cron (`bling-auto-sync`, 2×/dia) NUNCA roda essas fases — roda só
-- produtos, estoque, contatos e pedidos. Por isso `receivables` (Bling) está
-- vazia e as 1.455 contas a pagar são de UMA carga manual antiga, nunca
-- atualizada: os "vencidos desde 2024" podem estar pagos no Bling.
--
-- Decisão do dono do processo: "não é para quebrar nada que funciona, eu quero
-- aditivo". Então:
--   • função NOVA (`bling-contas-espelho`), tabelas NOVAS; `bling-sync`,
--     `receivables` e `purchase_payables` NÃO são tocados;
--   • ⚠️ a função NUNCA renova o token do Bling (a renovação troca o
--     refresh_token e, falhando, o `bling-sync` desativa a integração — duas
--     funções renovando derrubariam a EMISSÃO DE NF). Token perto de vencer ⇒
--     a rodada pula e diz isso no log;
--   • só LÊ do Bling. Dar baixa lá é a etapa seguinte, com aprovação.
--
-- Rode em BLOCOS, nesta ordem.
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — tabelas espelho + log. Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.bling_contas_receber (
  bling_id           bigint primary key,
  situacao           text,          -- id do Bling: 1 aberto · 2 recebido · 3 parcial · 4 devolvido · 5 cancelado
  valor              numeric(14,2),
  saldo              numeric(14,2),
  vencimento         date,
  data_emissao       date,
  data_pagamento     date,
  numero             text,
  contato_id         bigint,
  contato_nome       text,
  contato_documento  text,
  origem_id          bigint,        -- o PEDIDO/NF de origem, quando o Bling diz
  origem_tipo        text,
  origem_numero      text,
  historico          text,
  listagem           jsonb not null default '{}'::jsonb,   -- o CRU da listagem
  detalhe            jsonb,                                -- o CRU do detalhe
  detalhe_em         timestamptz,
  visto_em           timestamptz not null default now()
);
create table if not exists public.bling_contas_pagar (like public.bling_contas_receber including all);

create index if not exists bling_contas_receber_venc_idx on public.bling_contas_receber (vencimento);
create index if not exists bling_contas_receber_sem_detalhe_idx on public.bling_contas_receber (bling_id) where detalhe_em is null;
create index if not exists bling_contas_receber_origem_idx on public.bling_contas_receber (origem_id);
create index if not exists bling_contas_pagar_venc_idx on public.bling_contas_pagar (vencimento);
create index if not exists bling_contas_pagar_sem_detalhe_idx on public.bling_contas_pagar (bling_id) where detalhe_em is null;

create table if not exists public.bling_contas_espelho_log (
  id        bigserial primary key,
  rodou_em  timestamptz not null default now(),
  ok        boolean not null,
  ms        integer,
  resumo    jsonb
);
create index if not exists bling_contas_espelho_log_quando_idx on public.bling_contas_espelho_log (rodou_em desc);

-- Leitura: quem tem o app Finanças. Escrita: só a service role (sem policy).
do $$
declare t text;
begin
  foreach t in array array['bling_contas_receber','bling_contas_pagar','bling_contas_espelho_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_financas_le', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.carbo_tem_app(array[''carbo_financas''])))',
      t || '_financas_le', t);
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — agenda a cada 10 min (minutos 23/33/43/53), com o segredo COPIADO
-- do job que provadamente funciona (molde da `20261036`). ⚠️ Rode DEPOIS de o
-- deploy da função terminar no GitHub Actions — antes, a chamada cai em 404.
-- Espera: a NOTICE e, na consulta final, 1 linha com active = true.
-- ════════════════════════════════════════════════════════════════════════════
do $fix$
declare
  v_secret text;
  v_cmd    text;
  j        bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job
   where jobname = 'bling2-sync-incremental'
   limit 1;

  if v_secret is null or btrim(v_secret) = '' then
    raise exception
      'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. '
      'Confira se ele existe ANTES de seguir — agendar sem segredo troca um 401 visivel por uma falha calada.';
  end if;

  for j in select jobid from cron.job where jobname = 'bling-contas-espelho-10min' loop
    perform cron.unschedule(j);
  end loop;

  v_cmd := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 140000) as request_id;',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-contas-espelho',
    'Content-Type',  'application/json',
    'X-Cron-Secret', v_secret,
    '{}'
  );
  perform cron.schedule('bling-contas-espelho-10min', '23-59/10 * * * *', v_cmd);
  raise notice 'bling-contas-espelho-10min agendado com o segredo do job que funciona.';
end $fix$;

select jobname, schedule, active from cron.job where jobname = 'bling-contas-espelho-10min';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — CONFERÊNCIA (só leitura), depois de ~20 min.
-- ⚠️ O desfecho real está no LOG desta função, não no `cron.job_run_details`:
-- o `succeeded` de lá só diz que o POST saiu (`net.http_post` é assíncrono).
-- Espera: linhas com ok = true e `resumo` com lidos/detalhados por tipo.
-- "token perto de vencer" de vez em quando é NORMAL (quem renova é o bling-sync).
-- ════════════════════════════════════════════════════════════════════════════
select rodou_em, ok, ms, resumo from public.bling_contas_espelho_log order by rodou_em desc limit 10;
