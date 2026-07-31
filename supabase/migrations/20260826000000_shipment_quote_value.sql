-- ═══════════════════════════════════════════════════════════════════════════
-- Valor da cotação de frete no pedido
--
-- O Rastreio pergunta transportadora, mas nunca perguntou QUANTO ela cobrou.
-- Sem isso não dá para comparar o frete cotado com o `shipping_cost` que foi
-- repassado ao cliente, nem para saber quanto do frete a Carbo absorveu.
--
-- Opcional de propósito: em boa parte dos envios a cotação sai depois, ou o
-- frete é FOB e o número é do cliente. Campo obrigatório aqui viraria zero
-- digitado pra fechar o popup — que é pior que nulo, porque zero parece dado.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carboze_orders
  add column if not exists shipment_quote_value numeric;

comment on column public.carboze_orders.shipment_quote_value is
  'Valor cotado com a transportadora (R$), informado no Rastreio ao ir para Gerar NF. Opcional. Não confundir com shipping_cost, que é o frete cobrado do cliente.';
