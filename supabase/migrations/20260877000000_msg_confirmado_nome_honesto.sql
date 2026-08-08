-- ═══════════════════════════════════════════════════════════════════════════
-- "Compra identificada" não é o que essa mensagem faz
--
-- ── O que a investigação mostrou ──────────────────────────────────────────
--
-- A dúvida era: dá para disparar o primeiro aviso no MINUTO da compra, lendo
-- `ecommerce_orders` (que captura a venda em ~2 segundos, pelo webhook), em vez
-- de esperar o pedido virar `Atendido` no Bling?
--
-- Não dá. A consulta ao `raw` de `ecommerce_orders` voltou ZERO telefone em
-- TODAS as plataformas:
--
--     mercadolivre  17 pedidos   0 com telefone
--     nuvemshop     43 pedidos   0 com telefone
--     amazon         1 pedido    0 com telefone
--
-- No Mercado Livre isso é política (o telefone do comprador não é exposto); na
-- Nuvemshop e na Amazon o payload que a gente guarda não traz o campo. Sem
-- telefone não há WhatsApp — a origem alternativa está descartada, não é
-- questão de escrever mais código.
--
-- O telefone só aparece rio abaixo, quando o Bling cria/vincula o contato:
-- `bling2_esteira.cliente_fone`, alimentado por `bling2_contacts`. Ou seja, a
-- etapa mais cedo em que existe alguém para avisar É a que já está no ar.
--
-- ── O conserto, então, é o nome ───────────────────────────────────────────
--
-- A etapa `confirmado` dispara quando o pedido vira `situacao_id = 9`
-- (Atendido) no Bling — que pode ser horas depois da compra. O título
-- "Compra identificada" promete um aviso de recebimento imediato e não é isso
-- que acontece; quem for ligar a mensagem vai ligar achando outra coisa.
--
-- Muda só o RÓTULO (`titulo`), que é interno — aparece no cartão da tela
-- `/ecommerce/mensagens` e vai como `etapa_titulo` no payload do n8n. O texto
-- que o cliente recebe já estava correto ("já está em separação") e não é
-- tocado.
--
-- Como sempre: se alguém já editou o título, a redação da pessoa fica.
-- ═══════════════════════════════════════════════════════════════════════════

update public.carbo_msg_templates
set titulo = 'Pedido em separação'
where etapa = 'confirmado'
  and titulo = 'Compra identificada';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select etapa, ativo, titulo
from public.carbo_msg_templates
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue'],
  etapa);
