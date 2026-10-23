-- ════════════════════════════════════════════════════════════════════════════
-- 20261134 — a conta a RECEBER também nasce no Finanças e é lançada NO BLING
-- (matriz e filial), no formulário do Bling, e com "Salvar e dar baixa".
--
-- Pedido do time do Finanças (23/10/2026): o lançamento igual ao do Bling
-- (emissão, competência, histórico, forma de pagamento, conta financeira,
-- categoria, nº do documento, vendedor no receber) e o botão "Salvar e dar
-- baixa". Quem fala com o Bling é a função `fin-contas-pagar` (agora com `tipo`).
--
-- Só ACRESCENTA colunas:
--   • fin_contas_pagar_log.tipo — o log é a PROVA que libera o "Excluir no
--     Bling"; com receber junto, a prova precisa dizer de qual lado é;
--   • quem criou AQUI no receber da matriz (receivables) e da filial
--     (bling2_contas_receber) — o pagar já tinha (20261132).
-- ⚠️ O interruptor é o MESMO do pagar (`fin_contas_pagar_config`, por empresa):
--    "lançar no Bling desta empresa" é uma decisão só.
-- ⚠️ Front e função sobem ANTES deste SQL sem quebrar: quem grava estas colunas
--    repete sem elas quando faltam.
-- ════════════════════════════════════════════════════════════════════════════


-- ── BLOCO 0 — MEDE (só leitura): devolve 5 linhas, true/false ────────────────
select t.tabela || '.' || t.coluna as coluna,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = t.coluna) as existe
from (values ('fin_contas_pagar_log','tipo'),
             ('receivables','criado_aqui_por'), ('receivables','criado_aqui_nome'),
             ('bling2_contas_receber','cb_criado_por'), ('bling2_contas_receber','cb_criado_nome')) as t(tabela, coluna)
order by 1;


-- ── BLOCO 1 — as colunas (idempotente; "Success. No rows returned") ─────────
alter table public.fin_contas_pagar_log
  add column if not exists tipo text not null default 'pagar';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_contas_pagar_log_tipo_check') then
    alter table public.fin_contas_pagar_log
      add constraint fin_contas_pagar_log_tipo_check check (tipo in ('pagar', 'receber'));
  end if;
end $$;
create index if not exists fin_contas_pagar_log_tipo_idx on public.fin_contas_pagar_log (conta, tipo, bling_id);

alter table public.receivables           add column if not exists criado_aqui_por  uuid;
alter table public.receivables           add column if not exists criado_aqui_nome text;
alter table public.bling2_contas_receber add column if not exists cb_criado_por    uuid;
alter table public.bling2_contas_receber add column if not exists cb_criado_nome   text;

comment on column public.fin_contas_pagar_log.tipo is
  'pagar | receber — de qual lado é a conta criada/excluída no Bling pelo Finanças. (20261134)';
comment on column public.receivables.criado_aqui_por is
  'Quem lançou este título no Bling da matriz pelo Finanças (fin-contas-pagar). Libera o "Excluir no Bling". (20261134)';


-- ── BLOCO 2 — CONFERE: as 5 têm de vir true ──────────────────────────────────
select t.tabela || '.' || t.coluna as coluna,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = t.coluna) as existe
from (values ('fin_contas_pagar_log','tipo'),
             ('receivables','criado_aqui_por'), ('receivables','criado_aqui_nome'),
             ('bling2_contas_receber','cb_criado_por'), ('bling2_contas_receber','cb_criado_nome')) as t(tabela, coluna)
order by 1;


-- ── BLOCO 3 — O interruptor de cada empresa (só leitura) ─────────────────────
-- ativo = true ⇒ os botões "Nova conta a pagar" e "Nova conta a receber"
-- aparecem para aquela empresa, e lançam no Bling dela.
select conta, case conta when 1 then 'matriz' else 'filial' end as empresa, ativo
  from public.fin_contas_pagar_config order by conta;


-- ── BLOCO 4 — ENSAIO (só lê): os cadastros que o formulário mostra ───────────
-- Formas de pagamento (com juros e multa), categorias e vendedores de cada
-- Bling, e o corpo que SERIA enviado. ⚠️ Só depois do deploy da função.
-- Rode, espere ~30 s e rode o BLOCO 5.
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
    timeout_milliseconds := 120000
  ) into v_req;
  raise notice 'Ensaio disparado (request_id %). Espere ~30 s e rode o BLOCO 5.', v_req;
end $ensaio$;


-- ── BLOCO 5 — a resposta do ensaio ───────────────────────────────────────────
-- ESPERADO: status 200; `formas` com nomes e juros/multa; `categorias` e
-- `vendedores` com nomes; `erros_cadastros` = {}.
select r.status_code, r.created at time zone 'America/Sao_Paulo' as quando,
       r.content::jsonb -> 'matriz' -> 'formas'           as matriz_formas,
       r.content::jsonb -> 'matriz' -> 'categorias'       as matriz_categorias,
       r.content::jsonb -> 'matriz' -> 'vendedores'       as matriz_vendedores,
       r.content::jsonb -> 'matriz' -> 'erros_cadastros'  as matriz_erros,
       r.content::jsonb -> 'filial' -> 'formas'           as filial_formas,
       r.content::jsonb -> 'filial' -> 'erros_cadastros'  as filial_erros,
       coalesce(r.content::jsonb -> 'matriz' ->> 'erro', r.content::jsonb -> 'filial' ->> 'erro') as erro
  from net._http_response r
 where r.content like '%fin-contas-pagar-ensaio%'
 order by r.created desc
 limit 1;
