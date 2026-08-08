-- ═══════════════════════════════════════════════════════════════════════════
-- Venda fake — para testar a esteira ao vivo sem cobrar de ninguém
--
-- ── O que ela exercita, e o que NÃO exercita ──────────────────────────────
--
-- Exercita: o gatilho de venda on-line (som + toast + sininho em todos os
-- apps), a coluna "Pago" da esteira e o telefone chegando junto do pedido.
--
-- NÃO exercita as etapas seguintes — Confirmado, NF, Etiqueta, Em trânsito.
-- Essas nascem no Bling, e não dá para forjá-las aqui sem escrever em
-- `bling2_orders`, que é ESPELHO: a próxima rodada do sync sobrescreveria a
-- linha inventada, e no meio do caminho a ponte poderia mandar um pedido
-- fantasma para `carboze_orders` — ou seja, para o faturamento. Teste que suja
-- número de faturamento não é teste, é incidente.
--
-- Para o fluxo completo o caminho honesto é um pedido de verdade, de valor
-- baixo, faturado no Bling.
--
-- ── Por que estes valores, e não outros ───────────────────────────────────
--
--   platform 'nuvemshop'  → é a única que traz telefone; as outras não
--   SKU 'FAKE-TESTE'      → não existe em `sku_product_mappings`, então NÃO
--                           mexe em estoque. Um SKU real daria baixa de
--                           verdade num produto de verdade.
--   order_id 'FAKE-...'   → prefixo que torna a limpeza exata e sem dúvida
--   status 'paid'         → é o que a coluna "Pago" exige
--
-- ⚠️ TROQUE O TELEFONE antes de rodar, senão você não recebe nada quando for
-- testar o disparo — e vai achar que o disparo está quebrado.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.ecommerce_orders (
  platform, order_id, platform_order_number,
  product_sku, product_name,
  quantity, units_real, unit_price, total,
  status, ordered_at, sync_source,
  cliente_nome, cliente_fone, cliente_email,
  raw
) values (
  'nuvemshop',
  'FAKE-' || to_char(now(), 'YYYYMMDDHH24MISS'),
  'FAKE-' || to_char(now(), 'HH24MISS'),
  'FAKE-TESTE',
  'Pedido de teste — Carbozé (não é venda real)',
  1, 1, 99.90, 99.90,
  'paid',
  now(),
  'teste-manual',
  'Cliente de Teste',
  '5584999999999',          -- ⚠️ TROQUE pelo seu número, com DDI 55
  'teste@carbohub.com.br',
  jsonb_build_object('fake', true, 'criado_em', now())
);

-- Deve aparecer aqui em segundos, e na tela na próxima atualização (30s).
select canal, pedido_loja, cliente, cliente_fone, total, minutos_parado
from public.ecommerce_aguardando_bling
where pedido_loja like 'FAKE-%';


-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza — rode DEPOIS do teste
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem isto a venda fake entra no faturamento do dia, na meta do mês e no mapa
-- de conquista. R$ 99,90 de mentira é pouco para se notar e o bastante para
-- ninguém nunca mais bater a conta com a loja.

-- delete from public.ecommerce_orders where order_id like 'FAKE-%';
