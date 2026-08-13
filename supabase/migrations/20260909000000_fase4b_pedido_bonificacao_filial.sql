-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4B — a coluna que faltou na 4A
--
-- A 4A criou `bling2_pedido_id`, mas o que a emissão grava é o id do pedido de
-- BONIFICAÇÃO (o segundo pedido, o de remessa) — e esse precisa de coluna
-- própria por conta, como já existe para a matriz
-- (`bling_pedido_bonificacao_id`).
--
-- ⚠️ Sem esta coluna, faturar em SP um pedido com brinde criaria os dois
-- pedidos no Bling e falharia ao gravar o id do segundo: o pedido pago já
-- existiria lá, o de remessa também, e o sistema não saberia de nenhum dos
-- dois. Pior que falhar antes.
--
-- `bling2_pedido_id` fica: é o id do pedido PAGO na filial, e ainda que hoje o
-- `external_ref` já carregue isso, ter a coluna explícita evita depender de
-- parsear string quando alguém precisar consultar a nota.
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists bling2_pedido_bonificacao_id bigint;

reset lock_timeout;

comment on column public.carboze_orders.bling2_pedido_bonificacao_id is
  'Id do pedido de REMESSA DE BONIFICAÇÃO na filial SP. Espelho de bling_pedido_bonificacao_id, que é o da matriz — cada conta numera do zero.';

-- Conferência: as quatro colunas de pedido/NF por conta.
select column_name from information_schema.columns
where table_schema='public' and table_name='carboze_orders'
  and column_name like '%bling%pedido%' or column_name in
      ('bling_nf_id','bling2_nf_id','nf_access_key','nf2_access_key','invoice_number','invoice2_number')
order by column_name;
