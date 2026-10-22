-- ═══════════════════════════════════════════════════════════════════════════
-- 20261131 — FILIAL (Bling 2): baixa nos dois sentidos, ao vivo, e um espelho
--            que escala (22/10/2026)
--
-- Pedido do dono do processo: a baixa da filial "ao vivo nos dois caminhos,
-- indo e voltando", e tudo "pronto para escala, sem retrabalho".
--
--   sistema → Bling 2   a tela de Contas a pagar/receber (?empresa=filial) ganha
--                       "Dar baixa" e "Desfazer", que vão ao Bling NA HORA
--                       (função `bling2-contas`).
--   Bling 2 → sistema   cron de 10 min que lê SÓ os títulos EM ABERTO e, de quem
--                       saiu dessa lista, o detalhe e a data do borderô.
--
-- ⚠️ É ACRÉSCIMO: o `bling2-sync` (fases contas_*, cron `bling2-contas-30min`)
-- continua igual, como a varredura completa. O gatilho do BLOCO 1 impede que
-- ele — cuja listagem não traz data de pagamento — apague a data que o borderô
-- deu.
-- ⚠️ A baixa nasce DESLIGADA (`fin_bling2_baixa_config.ativo = false`) e se
-- testa com UM título (`teste_ids`) antes de ligar — o mesmo caminho da matriz.
-- O espelho não precisa de interruptor: ele só LÊ do Bling, e se o Bling
-- ignorar o filtro de abertos, a rodada não grava nada e diz isso no log.
--
-- Rode em BLOCOS, um de cada vez, nesta ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- BLOCO 0 — MEDIR (só leitura)
-- ════════════════════════════════════════════════════════════════
-- ESPERADO: uma linha por tipo. `abertos` é o que o espelho novo vai ler a cada
-- 10 min; `total` é o que o bling2-sync relê inteiro a cada 30. `quitados_com_data`
-- baixo é o que a fase do borderô vai preencher. `token_vence_em_min` > 0.
select 'receber' as tipo,
       count(*)                                                        as total,
       count(*) filter (where situacao in ('1','3'))                   as abertos,
       count(*) filter (where situacao in ('2','3'))                   as quitados,
       count(*) filter (where situacao in ('2','3') and data_pagamento is not null) as quitados_com_data,
       max(synced_at) at time zone 'America/Sao_Paulo'                 as ultima_sincronizacao,
       (select round(extract(epoch from (expires_at - now())) / 60)
          from public.bling2_integration where is_active
         order by connected_at desc limit 1)                           as token_vence_em_min
  from public.bling2_contas_receber
union all
select 'pagar', count(*), count(*) filter (where situacao in ('1','3')),
       count(*) filter (where situacao in ('2','3')),
       count(*) filter (where situacao in ('2','3') and data_pagamento is not null),
       max(synced_at) at time zone 'America/Sao_Paulo', null
  from public.bling2_contas_pagar;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 1 — colunas, o interruptor, os logs e a guarda da data
-- Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════
alter table public.bling2_contas_receber
  add column if not exists detalhe              jsonb,
  add column if not exists detalhe_em           timestamptz,
  add column if not exists cb_baixa_em          timestamptz,   -- a baixa feita AQUI chegou ao Bling 2
  add column if not exists cb_baixa_por         uuid,
  add column if not exists cb_baixa_por_nome    text,
  add column if not exists cb_baixa_bordero     bigint,        -- o borderô que NÓS criamos (só ele se desfaz daqui)
  add column if not exists cb_baixa_erro        text,          -- a última recusa, para a tela mostrar
  add column if not exists cb_baixa_tentando_em timestamptz;   -- trava: um envio por vez por título
alter table public.bling2_contas_pagar
  add column if not exists detalhe              jsonb,
  add column if not exists detalhe_em           timestamptz,
  add column if not exists cb_baixa_em          timestamptz,
  add column if not exists cb_baixa_por         uuid,
  add column if not exists cb_baixa_por_nome    text,
  add column if not exists cb_baixa_bordero     bigint,
  add column if not exists cb_baixa_erro        text,
  add column if not exists cb_baixa_tentando_em timestamptz;

-- A rodada lê os abertos do espelho: índice por situação.
create index if not exists bling2_contas_receber_situacao_idx on public.bling2_contas_receber (situacao);
create index if not exists bling2_contas_pagar_situacao_idx   on public.bling2_contas_pagar (situacao);

create table if not exists public.fin_bling2_baixa_config (
  id                 boolean primary key default true check (id),
  ativo              boolean not null default false,          -- ⚠️ nasce DESLIGADO
  teste_ids          uuid[]  not null default '{}',           -- títulos (id do espelho) liberados UM A UM
  portador_padrao_id bigint,                                  -- quando o título do Bling 2 não tem conta
  filtro_abertos     text    not null default 'situacoes[]=1&situacoes[]=3',  -- o filtro da listagem de abertos
  atualizado_em      timestamptz not null default now()
);
insert into public.fin_bling2_baixa_config (id) values (true) on conflict (id) do nothing;
alter table public.fin_bling2_baixa_config enable row level security;
drop policy if exists fin_bling2_baixa_config_financas_le on public.fin_bling2_baixa_config;
create policy fin_bling2_baixa_config_financas_le on public.fin_bling2_baixa_config
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));
-- Escrita: NENHUMA policy — liga e desliga pelo SQL Editor, de propósito.

-- Quem deu (ou desfez) cada baixa. Append-only: sem policy de escrita nenhuma,
-- quem grava é a função (service role). Auditoria que se pode editar não é auditoria.
create table if not exists public.fin_bling2_baixa_log (
  id         bigserial primary key,
  em         timestamptz not null default now(),
  acao       text not null check (acao in ('baixar','estornar')),
  tipo       text not null check (tipo in ('receber','pagar')),
  conta_id   uuid not null,
  bling_id   bigint,
  ok         boolean not null,
  mensagem   text,
  bordero    bigint,
  data_baixa date,
  user_id    uuid,
  user_nome  text
);
create index if not exists fin_bling2_baixa_log_conta_idx on public.fin_bling2_baixa_log (conta_id, em desc);
alter table public.fin_bling2_baixa_log enable row level security;
drop policy if exists fin_bling2_baixa_log_financas_le on public.fin_bling2_baixa_log;
create policy fin_bling2_baixa_log_financas_le on public.fin_bling2_baixa_log
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

-- O desfecho de cada rodada do espelho (cron.job_run_details só diz que o POST saiu).
create table if not exists public.bling2_contas_espelho_log (
  id       bigserial primary key,
  rodou_em timestamptz not null default now(),
  ok       boolean not null,
  ms       integer,
  resumo   jsonb
);
create index if not exists bling2_contas_espelho_log_rodou_idx on public.bling2_contas_espelho_log (rodou_em desc);
alter table public.bling2_contas_espelho_log enable row level security;
drop policy if exists bling2_contas_espelho_log_financas_le on public.bling2_contas_espelho_log;
create policy bling2_contas_espelho_log_financas_le on public.bling2_contas_espelho_log
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));

-- ⚠️ A listagem do bling2-sync não traz data de pagamento nem (às vezes) saldo:
-- o upsert dele gravaria NULO por cima do que o detalhe/borderô deram. Vazio
-- não apaga dado bom — a mesma regra do `ecommerce_nao_apaga_com_vazio`. A
-- exceção é o título que VOLTOU a aberto: aí a data de pagamento deixa de valer.
create or replace function public.bling2_contas_nao_apaga_pagamento()
returns trigger language plpgsql as $$
begin
  if new.data_pagamento is null and old.data_pagamento is not null
     and coalesce(new.situacao, '') in ('2','3') then
    new.data_pagamento := old.data_pagamento;
  end if;
  if new.saldo is null and old.saldo is not null then
    new.saldo := old.saldo;
  end if;
  return new;
end $$;
drop trigger if exists trg_bling2_contas_receber_nao_apaga on public.bling2_contas_receber;
create trigger trg_bling2_contas_receber_nao_apaga before update on public.bling2_contas_receber
  for each row execute function public.bling2_contas_nao_apaga_pagamento();
drop trigger if exists trg_bling2_contas_pagar_nao_apaga on public.bling2_contas_pagar;
create trigger trg_bling2_contas_pagar_nao_apaga before update on public.bling2_contas_pagar
  for each row execute function public.bling2_contas_nao_apaga_pagamento();


-- ════════════════════════════════════════════════════════════════
-- BLOCO 2 — ENSAIO (só lê: não escreve no Bling nem aqui)
-- ⚠️ Só depois do deploy (o push em main já subiu a função `bling2-contas`).
-- Rode, espere ~30 s e rode o BLOCO 3.
-- ════════════════════════════════════════════════════════════════
do $ensaio$
declare v_secret text; v_req bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi enviado.';
  end if;
  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-contas',
    body := '{"ensaio": true, "limite": 3}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 90000
  ) into v_req;
  raise notice 'Ensaio disparado (request_id %). Espere ~30 s e rode o BLOCO 3.', v_req;
end $ensaio$;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 3 — a resposta do ensaio
-- ESPERADO: status 200; `receber_filtro`/`pagar_filtro` com "funciona": true;
-- e um exemplo de corpo de baixa em cada tipo. Mande a linha inteira.
-- ════════════════════════════════════════════════════════════════
select r.status_code, r.timed_out, r.error_msg,
       r.created at time zone 'America/Sao_Paulo'        as quando,
       r.content::jsonb -> 'receber' -> 'filtro'         as receber_filtro,
       r.content::jsonb -> 'pagar'   -> 'filtro'         as pagar_filtro,
       r.content::jsonb -> 'receber' -> 'contagem'       as receber_contagem,
       r.content::jsonb -> 'pagar'   -> 'contagem'       as pagar_contagem,
       r.content::jsonb -> 'receber' -> 'titulos' -> 0   as exemplo_receber,
       r.content::jsonb -> 'pagar'   -> 'titulos' -> 0   as exemplo_pagar,
       r.content::jsonb -> 'receber' -> 'bordero_amostra' as receber_bordero,
       r.content::jsonb -> 'pagar'   -> 'bordero_amostra' as pagar_bordero,
       coalesce(r.content::jsonb ->> 'mensagem', r.content::jsonb -> 'receber' ->> 'erro') as mensagem
  from net._http_response r
 where r.content like '%bling2-contas-ensaio%'
 order by r.created desc
 limit 1;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 4 — LIGAR O ESPELHO de 10 min (só depois do ensaio dizer que o filtro funciona)
-- Espera: 1 linha, `bling2-contas-ao-vivo-10min`, ativo.
-- ⚠️ Minuto 19 (19, 29, 39, 49, 59): fora da grade dos jobs vizinhos.
-- ════════════════════════════════════════════════════════════════
do $cron$
declare v_secret text; v_cmd text; j bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi agendado.';
  end if;
  for j in select jobid from cron.job where jobname = 'bling2-contas-ao-vivo-10min' loop
    perform cron.unschedule(j);
  end loop;
  v_cmd := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 150000) as request_id;',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-contas',
    'Content-Type', 'application/json',
    'X-Cron-Secret', v_secret,
    '{"acao":"espelho"}'
  );
  perform cron.schedule('bling2-contas-ao-vivo-10min', '19-59/10 * * * *', v_cmd);
end $cron$;
select jobname, schedule, active from cron.job where jobname = 'bling2-contas-ao-vivo-10min';


-- ════════════════════════════════════════════════════════════════
-- BLOCO 5 — conferir o espelho (depois de ~10 min)
-- ESPERADO: as últimas rodadas com ok = true e, em cada tipo, `abertos_no_bling`
-- perto do `abertos` do BLOCO 0 e `lista_completa: true`.
-- ════════════════════════════════════════════════════════════════
select rodou_em at time zone 'America/Sao_Paulo' as quando, ok, ms, resumo
  from public.bling2_contas_espelho_log order by rodou_em desc limit 5;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 6 — o TESTE com UM título (antes de ligar a baixa para todos)
-- ⚠️ EDITE: troque null pelo número do título a receber da filial que será
-- baixado de verdade (o "Número" da tela). Com null, o bloco RECUSA rodar.
-- Depois disso, só ESTE título mostra "Dar baixa" na tela.
-- ════════════════════════════════════════════════════════════════
do $teste$
declare v_numero text := null;   -- ⚠️ EDITE: ex. '000123'
        v_id uuid; v_qtd int;
begin
  if v_numero is null then raise exception 'Edite v_numero com o número do título antes de rodar. Nada foi feito.'; end if;
  select count(*), min(id::text)::uuid into v_qtd, v_id
    from public.bling2_contas_receber where numero = v_numero and situacao in ('1','3');
  if v_qtd <> 1 then
    raise exception 'O número % casa com % título(s) em aberto a receber na filial — precisa ser exatamente 1. Nada foi feito.', v_numero, v_qtd;
  end if;
  update public.fin_bling2_baixa_config
     set teste_ids = array(select distinct unnest(teste_ids || v_id)), atualizado_em = now();
  raise notice 'Título % (id %) liberado para o teste.', v_numero, v_id;
end $teste$;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 7 — conferir o teste (depois de dar a baixa na tela)
-- ESPERADO: a linha do título com ok = true e um borderô; e no Bling 2 o título quitado.
-- ════════════════════════════════════════════════════════════════
select em at time zone 'America/Sao_Paulo' as quando, acao, tipo, bling_id, ok, mensagem, bordero, data_baixa, user_nome
  from public.fin_bling2_baixa_log order by em desc limit 5;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 8 — LIGAR a baixa para todos (só depois de o teste conferir no Bling)
-- Espera: 1 linha com ativo = true.
-- ════════════════════════════════════════════════════════════════
update public.fin_bling2_baixa_config set ativo = true, atualizado_em = now();
select ativo, teste_ids, portador_padrao_id, filtro_abertos from public.fin_bling2_baixa_config;
