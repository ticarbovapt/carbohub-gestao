-- ═══════════════════════════════════════════════════════════════════════════
-- A NF de bonificação vai para a coluna DELA — e a de venda volta para a sua
--
-- Medido em 22/09/2026, investigando por que a logística não conseguia
-- imprimir as duas notas no Rastreio.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O SINAL ERA UM TEXTO QUE O BLING NÃO DEVOLVE
--
-- A `20260903` desenhou o fluxo certo: remessa de bonificação vira pedido
-- próprio no Bling com `<numero>-BON` na observação, e o `bling-sync` lê esse
-- sufixo para decidir em qual coluna gravar a nota.
--
-- **O Bling não herda a observação.** Ele substitui pelo texto fiscal padrão da
-- natureza, e o número do pedido reaparece no fim, em formatos variados:
--
--   REMESSA DE MERCADORIA EM BONIFICACAO,CONCEDIDA…COBRANCA.V2026090052 -
--   …COBRANCA. V2026090044 Vendedor: Weider Moura
--   …COBRANCA. <br />V2026080089-Vendedor: Weider Moura
--
-- Medição: 14 pedidos com remessa criada, `-BON` em **ZERO** notas.
--   • `bling_nf_bonificacao_id` nulo em 100% dos casos
--   • e, quando as duas notas casavam com o mesmo pedido, qual delas ficava em
--     `bling_nf_id` era SORTEIO — a ordem em que o sync as encontrava.
--
-- ⚠️ Sete pedidos deram sorte. No `V2026090052` a nota de bonificação
-- (R$ 208,80) tomou o lugar da de venda (R$ 2.088,00) — e o pedido caiu do
-- faturamento, porque a régua da natureza corretamente exclui bonificação.
-- Ou seja: o mesmo defeito produzia os dois erros opostos, e qual deles você
-- via dependia de sorte.
--
-- ⚠️ ESTA MIGRAÇÃO MUDA O FATURAMENTO — PARA CIMA. Vendas que sumiram por
-- carregar a nota errada voltam a contar. Quem fechou setembro vai ver outro
-- número, e isso é o objetivo, não efeito colateral.
--
-- O conserto do FUTURO é no `bling-sync` (mesmo push): a detecção passa a ser a
-- NATUREZA, que vem em 100% das notas, é cadastro do Bling e já governa o
-- faturamento. Um sinal para as duas decisões, em vez de dois que discordam.
-- O sufixo fica como rede.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO DO ANTES                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os pedidos que têm as DUAS notas casadas, e o que está vinculado hoje.
--     `errada` = a coluna principal está com a nota de bonificação.
with notas as (
  select n.order_id, n.bling_id, n.numero, n.chave_acesso, n.valor_total,
         public.carbo_natureza_e_bonificacao(
           n.raw_data -> 'naturezaOperacao' ->> 'id') as e_bonif
  from public.bling_nfe n
  where n.order_id is not null
)
select o.order_number, o.total as total_pedido,
       count(*) filter (where nt.e_bonif)     as notas_bonificacao,
       count(*) filter (where not nt.e_bonif) as notas_venda,
       o.bling_nf_id, o.bling_nf_bonificacao_id,
       bool_or(nt.e_bonif and nt.bling_id = o.bling_nf_id) as errada
from public.carboze_orders o
join notas nt on nt.order_id = o.id
group by o.id, o.order_number, o.total, o.bling_nf_id, o.bling_nf_bonificacao_id
having count(*) filter (where nt.e_bonif) > 0
order by o.order_number desc;

-- (b) O faturamento de HOJE, para comparar depois.
--     ⚠️ Anote o número COM o que ele contém: é o total de `conta_metrica`.
select count(*) as pedidos, sum(total) as faturamento, now() as agora
from public.carbo_vendas_metrica where conta_metrica;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — cada nota na sua coluna                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Só age onde há EXATAMENTE uma nota de cada tipo. Pedido com duas notas de
-- venda (reemissão, por exemplo) é ambiguidade, e escolher uma delas enterraria
-- a dúvida — o mesmo motivo pelo qual a carga de PDV não insere quando o nome
-- bate com duas linhas. Esses ficam de fora e aparecem no BLOCO 2 (c).

with notas as (
  select n.order_id, n.bling_id, n.numero, n.chave_acesso,
         public.carbo_natureza_e_bonificacao(
           n.raw_data -> 'naturezaOperacao' ->> 'id') as e_bonif
  from public.bling_nfe n
  where n.order_id is not null
),
par as (
  select order_id,
         max(bling_id)     filter (where e_bonif)     as bon_id,
         max(numero)       filter (where e_bonif)     as bon_numero,
         max(chave_acesso) filter (where e_bonif)     as bon_chave,
         max(bling_id)     filter (where not e_bonif) as venda_id,
         max(numero)       filter (where not e_bonif) as venda_numero,
         max(chave_acesso) filter (where not e_bonif) as venda_chave
  from notas
  group by order_id
  having count(*) filter (where e_bonif) = 1
     and count(*) filter (where not e_bonif) = 1
)
update public.carboze_orders o
   set bling_nf_bonificacao_id  = par.bon_id,
       invoice_bonificacao_number = par.bon_numero,
       nf_bonificacao_access_key  = par.bon_chave,
       bling_nf_id    = par.venda_id,
       invoice_number = par.venda_numero,
       nf_access_key  = par.venda_chave
from par
where par.order_id = o.id
  and (o.bling_nf_bonificacao_id is distinct from par.bon_id
    or o.bling_nf_id             is distinct from par.venda_id);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ Nenhuma coluna principal com nota de bonificação. ESPERADO: ZERO.
select o.order_number, o.bling_nf_id
from public.carboze_orders o
join public.bling_nfe n on n.bling_id = o.bling_nf_id
where public.carbo_natureza_e_bonificacao(n.raw_data -> 'naturezaOperacao' ->> 'id');

-- (b) Os pares agora completos — as duas colunas preenchidas, cada uma com a
--     nota certa. Compare com a lista do BLOCO 0 (a).
select o.order_number, o.total as total_pedido,
       o.invoice_number as nf_venda, nv.valor_total as valor_venda,
       o.invoice_bonificacao_number as nf_bonif, nb.valor_total as valor_bonif
from public.carboze_orders o
left join public.bling_nfe nv on nv.bling_id = o.bling_nf_id
left join public.bling_nfe nb on nb.bling_id = o.bling_nf_bonificacao_id
where o.bling_nf_bonificacao_id is not null
order by o.order_number desc;

-- (c) ⚠️ Os que a migração NÃO tocou por ambiguidade — mais de uma nota de um
--     dos tipos. Não é defeito: é dúvida que precisa de gente. ESPERADO: vazio
--     ou pouquíssimos.
with notas as (
  select n.order_id,
         public.carbo_natureza_e_bonificacao(
           n.raw_data -> 'naturezaOperacao' ->> 'id') as e_bonif
  from public.bling_nfe n where n.order_id is not null
)
select o.order_number,
       count(*) filter (where nt.e_bonif)     as notas_bonificacao,
       count(*) filter (where not nt.e_bonif) as notas_venda
from public.carboze_orders o
join notas nt on nt.order_id = o.id
group by o.id, o.order_number
having count(*) filter (where nt.e_bonif) > 1
    or (count(*) filter (where nt.e_bonif) = 1 and count(*) filter (where not nt.e_bonif) <> 1)
order by o.order_number desc;

-- (d) ⭐ O faturamento DEPOIS. Ele tem de SUBIR — as vendas que carregavam a
--     nota errada voltam a contar. Compare com o BLOCO 0 (b).
select count(*) as pedidos, sum(total) as faturamento, now() as agora
from public.carbo_vendas_metrica where conta_metrica;
