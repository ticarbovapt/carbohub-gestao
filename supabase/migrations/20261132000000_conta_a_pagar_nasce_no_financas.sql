-- ═══════════════════════════════════════════════════════════════════════════
-- 20261132 — Conta a pagar NASCE no Finanças e é criada NO BLING (22/10/2026)
--
-- Pedido do dono do processo: conta a pagar manual feita aqui, refletida no
-- Bling. Matriz (Bling 1) e filial (Bling 2), pelo seletor de empresa da tela.
--
-- O desenho (função `fin-contas-pagar`):
--   1. O BLING PRIMEIRO, e o id dele é a identidade: a linha daqui nasce com o
--      `bling_id` devolvido (source = 'bling'), e o espelho a ATUALIZA em vez
--      de criar outra.
--   2. O espelho é escrito na hora — sem isso o aplicador da matriz leria "não
--      está mais no Bling" e cancelaria a conta recém-criada.
--   3. Parcelada = N contas de ocorrência ÚNICA (tipo 1, a forma de 1.342 das
--      contas medidas). Falhou no meio ⇒ as já criadas são excluídas de volta.
--   4. Excluir daqui só conta criada AQUI e ainda em aberto lá.
--
-- ⚠️ Nasce DESLIGADA, por empresa (`fin_contas_pagar_config`). Teste com uma
-- conta de R$ 1,00 e exclua pela tela antes de deixar ligado.
-- Rode em BLOCOS, um de cada vez.
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- BLOCO 0 — MEDIR (só leitura)
-- ESPERADO: `purchase_order_id` e `invoice_id` com is_nullable = YES (as contas
-- do Bling já nascem sem OC); `bling_id` com uma restrição ÚNICA.
-- ════════════════════════════════════════════════════════════════
select c.column_name, c.is_nullable,
       exists (select 1 from pg_indexes i
                where i.schemaname = 'public' and i.tablename = 'purchase_payables'
                  and i.indexdef ilike '%unique%' and i.indexdef ilike '%(bling_id)%') as bling_id_unico
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'purchase_payables'
   and c.column_name in ('purchase_order_id','invoice_id','bling_id','parcela','parcelas_total')
 order by c.column_name;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 1 — colunas, o interruptor por empresa e o log
-- Espera: "Success. No rows returned".
-- ════════════════════════════════════════════════════════════════
alter table public.purchase_payables
  add column if not exists criado_aqui_por  uuid,   -- conta criada pelo Finanças no Bling
  add column if not exists criado_aqui_nome text;
alter table public.bling2_contas_pagar
  add column if not exists cb_criado_por  uuid,
  add column if not exists cb_criado_nome text;

create table if not exists public.fin_contas_pagar_config (
  conta         smallint primary key check (conta in (1, 2)),   -- 1 = matriz · 2 = filial
  ativo         boolean not null default false,                  -- ⚠️ nasce DESLIGADO
  atualizado_em timestamptz not null default now()
);
insert into public.fin_contas_pagar_config (conta) values (1), (2) on conflict (conta) do nothing;
alter table public.fin_contas_pagar_config enable row level security;
drop policy if exists fin_contas_pagar_config_financas_le on public.fin_contas_pagar_config;
create policy fin_contas_pagar_config_financas_le on public.fin_contas_pagar_config
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));
-- Escrita: NENHUMA policy — liga e desliga pelo SQL Editor, de propósito.

-- Quem criou ou excluiu cada conta. Append-only (sem policy de escrita): é
-- também a PROVA de que a conta nasceu aqui, que é o que libera o "Excluir".
create table if not exists public.fin_contas_pagar_log (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  conta       smallint not null,
  acao        text not null check (acao in ('criar','excluir')),
  ok          boolean not null,
  lote        uuid,
  bling_id    bigint,
  contato_id  bigint,
  valor       numeric(14,2),
  vencimento  date,
  mensagem    text,
  user_id     uuid,
  user_nome   text
);
create index if not exists fin_contas_pagar_log_bling_idx on public.fin_contas_pagar_log (conta, bling_id);
alter table public.fin_contas_pagar_log enable row level security;
drop policy if exists fin_contas_pagar_log_financas_le on public.fin_contas_pagar_log;
create policy fin_contas_pagar_log_financas_le on public.fin_contas_pagar_log
  for select to authenticated using ((select public.carbo_tem_app(array['carbo_financas'])));


-- ════════════════════════════════════════════════════════════════
-- BLOCO 2 — ENSAIO (só lê): os portadores de cada Bling e o corpo que SERIA
-- enviado. ⚠️ Só depois do deploy da função `fin-contas-pagar`.
-- Rode, espere ~20 s e rode o BLOCO 3.
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
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/fin-contas-pagar',
    body := '{"ensaio": true}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_req;
  raise notice 'Ensaio disparado (request_id %). Espere ~20 s e rode o BLOCO 3.', v_req;
end $ensaio$;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 3 — a resposta do ensaio
-- ESPERADO: status 200; em cada empresa, `portadores` com NOMES (não só
-- "Conta 1489…"), `erro_portadores` nulo, e o corpo do POST.
-- ════════════════════════════════════════════════════════════════
select r.status_code, r.created at time zone 'America/Sao_Paulo' as quando,
       r.content::jsonb -> 'matriz' -> 'portadores'       as matriz_portadores,
       r.content::jsonb -> 'matriz' ->> 'erro_portadores' as matriz_erro,
       r.content::jsonb -> 'matriz' -> 'enviaria'         as matriz_enviaria,
       r.content::jsonb -> 'filial' -> 'portadores'       as filial_portadores,
       r.content::jsonb -> 'filial' ->> 'erro_portadores' as filial_erro,
       coalesce(r.content::jsonb -> 'matriz' ->> 'erro', r.content::jsonb -> 'filial' ->> 'erro') as erro
  from net._http_response r
 where r.content like '%fin-contas-pagar-ensaio%'
 order by r.created desc
 limit 1;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 4 — LIGAR na MATRIZ (para o teste). Espera: 2 linhas, a 1 ativa.
-- Depois: na tela, "Nova conta a pagar" de R$ 1,00 com histórico "TESTE",
-- conferir no Bling, e EXCLUIR pela tela (o "Cancelar" da linha).
-- ════════════════════════════════════════════════════════════════
do $liga$
declare v_resp jsonb;
begin
  select r.content::jsonb into v_resp from net._http_response r
   where r.content like '%fin-contas-pagar-ensaio%' order by r.created desc limit 1;
  if v_resp is null then
    raise exception 'Nenhuma resposta do ensaio encontrada. Rode o BLOCO 2, espere 20 s e tente de novo. Nada foi ligado.';
  end if;
  if v_resp -> 'matriz' ? 'erro' then
    raise exception 'O ensaio da matriz deu erro: %. Nada foi ligado.', v_resp -> 'matriz' ->> 'erro';
  end if;
  update public.fin_contas_pagar_config set ativo = true, atualizado_em = now() where conta = 1;
end $liga$;
select conta, ativo from public.fin_contas_pagar_config order by conta;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 5 — conferir o teste
-- ESPERADO: uma linha `criar` ok = true com o bling_id, e uma `excluir` ok = true.
-- ════════════════════════════════════════════════════════════════
select em at time zone 'America/Sao_Paulo' as quando, conta, acao, ok, bling_id, valor, vencimento, mensagem, user_nome
  from public.fin_contas_pagar_log order by em desc limit 10;


-- ════════════════════════════════════════════════════════════════
-- BLOCO 6 — LIGAR na FILIAL (só depois do teste da matriz conferir)
-- ════════════════════════════════════════════════════════════════
do $liga$
begin
  if not exists (select 1 from public.fin_contas_pagar_log where conta = 1 and acao = 'criar' and ok) then
    raise exception 'Ainda não houve conta de teste criada na matriz (BLOCOS 4 e 5). Nada foi ligado.';
  end if;
  update public.fin_contas_pagar_config set ativo = true, atualizado_em = now() where conta = 2;
end $liga$;
select conta, ativo from public.fin_contas_pagar_config order by conta;
