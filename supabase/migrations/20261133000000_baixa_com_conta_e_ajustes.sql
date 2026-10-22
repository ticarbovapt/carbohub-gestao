-- ════════════════════════════════════════════════════════════════════════════
-- 20261133 — a baixa leva a CONTA (banco), juros, multa, desconto, tarifa e o
-- valor de fato; valor menor que o saldo é baixa PARCIAL.
--
-- Pedido do time do Finanças (22/10/2026): no Bling elas marcam o banco ao dar
-- baixa, e é isso que faz a lista de pagos/recebidos de cada banco bater; e há
-- pagamento com valor diferente (parcial, juros).
--
-- Só ACRESCENTA colunas. Quem fala com o Bling são as funções
-- `bling-contas-baixar` (matriz) e `bling2-contas` (filial), com a regra única
-- `decidirBaixa` + `conferirBaixa` (_shared/blingContasRegra.ts):
--   • a conta escolhida vence a do título, que vence a padrão;
--   • ⚠️ depois do envio o título é RELIDO no Bling e comparado com o esperado.
--     O Bling ignora campo desconhecido calado (medido por terceiros: valor
--     parcial mal nomeado quitou o título inteiro, com 200) — divergiu, o
--     borderô NOSSO é desfeito e a tela diz por quê;
--   • parcial não marca nada como pago aqui: o título fica aberto com o saldo
--     que o Bling disser.
--
-- ⚠️ Front e funções sobem ANTES deste SQL sem quebrar: o que lê ou grava estas
-- colunas tolera a ausência (a baixa continua; só os ajustes não ficam guardados).
-- ════════════════════════════════════════════════════════════════════════════


-- ── BLOCO 0 — MEDE: quais colunas já existem (devolve 5 linhas, true/false) ──
select t.tabela || '.' || t.coluna as coluna,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = t.coluna) as existe
from (values ('purchase_payables','baixa_ajustes'), ('receivables','baixa_ajustes'),
             ('bling2_contas_pagar','baixa_ajustes'), ('bling2_contas_receber','baixa_ajustes'),
             ('fin_bling2_baixa_log','ajustes')) as t(tabela, coluna)
order by 1;


-- ── BLOCO 1 — as colunas (idempotente; "Success. No rows returned") ─────────
-- { portador_id, portador_nome, juros, multa, desconto, tarifa, valor }
alter table public.purchase_payables     add column if not exists baixa_ajustes jsonb;
alter table public.receivables           add column if not exists baixa_ajustes jsonb;
alter table public.bling2_contas_pagar   add column if not exists baixa_ajustes jsonb;
alter table public.bling2_contas_receber add column if not exists baixa_ajustes jsonb;
alter table public.fin_bling2_baixa_log  add column if not exists ajustes jsonb;

comment on column public.purchase_payables.baixa_ajustes is
  'Conta (portador) e ajustes da baixa feita no Finanças: { portador_id, portador_nome, juros, multa, desconto, tarifa, valor }. O "tentar de novo" relê daqui. (20261133)';
comment on column public.receivables.baixa_ajustes is
  'Conta (portador) e ajustes da baixa feita no Finanças — ver purchase_payables.baixa_ajustes. (20261133)';


-- ── BLOCO 2 — CONFERE: as 5 têm de vir true ──────────────────────────────────
select t.tabela || '.' || t.coluna as coluna,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = t.coluna) as existe
from (values ('purchase_payables','baixa_ajustes'), ('receivables','baixa_ajustes'),
             ('bling2_contas_pagar','baixa_ajustes'), ('bling2_contas_receber','baixa_ajustes'),
             ('fin_bling2_baixa_log','ajustes')) as t(tabela, coluna)
order by 1;
