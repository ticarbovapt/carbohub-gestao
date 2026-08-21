-- ═══════════════════════════════════════════════════════════════════════════
-- SHOPEE — o canal entra na esteira
--
-- Primeira venda pela Shopee em 21/08/2026. A loja chega ao espelho pelo
-- `bling2-sync` com `loja_id = 206191275`, mas sem linha em `bling2_lojas` ela
-- é "Canal 206191275" na tela — e, o que é pior, o `segmento` da ponte fica
-- errado.
--
-- ⚠️ Isto NÃO é cosmético. `bling2_lojas` é quem decide o canal na ponte do
-- Bling 2: loja ≠ 0 e não ignorada → `segmento = 'online'`. Sem a linha, a
-- venda entra como venda direta e cai no lugar errado do faturamento.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o cadastro                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

insert into public.bling2_lojas (bling_id, nome, ignorar)
values (206191275, 'Shopee', false)
on conflict (bling_id) do update
  set nome = excluded.nome, updated_at = now();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — marco zero para os pedidos que JÁ existem                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O canal nasce com pedidos já em andamento — o primeiro deles chegou ao
-- Bling antes deste cadastro. Assim que eles aparecem na esteira com nome de
-- canal, entram em `carbo_msg_fila` como qualquer outro pedido, e o template
-- ativo da etapa dispara WhatsApp por uma mudança que foi de CADASTRO, não de
-- mundo.
--
-- Mesma trava do marco zero do Melhor Envio e do carrinho abandonado: carimba
-- como `ignorado` o que já existe. Pedido novo, daqui para frente, avisa
-- normalmente.
--
-- Só carimba o que existe HOJE: o `select` é sobre linhas já gravadas.

insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, e.etapa, 'ignorado',
       'canal Shopee cadastrado depois do pedido — marco zero', now()
from public.bling2_esteira e
where e.loja_id = 206191275
  and e.etapa not in ('cancelado')
on conflict (bling_id, etapa) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A loja está cadastrada e não ignorada?
select bling_id, nome, ignorar from public.bling2_lojas where bling_id = 206191275;

-- (b) Os pedidos da Shopee na esteira — canal com NOME, e a etapa de cada um.
select pedido_numero, pedido_loja, canal, data_pedido, total, cliente,
       etapa, rastreio, rastreio_origem, transportadora
from public.bling2_esteira
where loja_id = 206191275
order by data_pedido desc;

-- (c) ⚠️ O segmento na ponte. Tem de ser 'online'. Se vier 'consumo' ou
--     'revenda', o pedido atravessou ANTES do cadastro e ficou com o canal
--     errado no faturamento — a correção é uma linha, mas tem de ser vista.
select o.external_ref, o.order_number, o.segmento, o.total_amount
from public.carboze_orders o
join public.bling2_orders bo on 'bling2-' || bo.bling_id = o.external_ref
where bo.loja_id = 206191275
order by o.created_at desc;

-- (d) ⚠️ Quem, da Shopee, receberia WhatsApp daqui para frente. A Shopee
--     intermedia o contato do comprador: confira se o telefone é REAL antes de
--     deixar qualquer template ativo alcançar este canal.
select pedido_numero, cliente, cliente_fone, etapa
from public.bling2_esteira
where loja_id = 206191275
order by data_pedido desc;
