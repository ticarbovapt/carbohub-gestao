-- ═══════════════════════════════════════════════════════════════════════════
-- PayT: o pedido é o CARRINHO, não a transação
--
-- ── O que foi medido em 01/09 ────────────────────────────────────────────
--
-- Primeiro pedido PayT que chegou ao Bling:
--
--     Bling  nº 615   numero_loja = PAYT_LYK2ZA_PK2279K   R$ 269,10
--     PayT   PK2279K  Kit 5 Frascos                       R$ 149,50
--     PayT   2877EQV  Kit 5 Frascos — 20% OFF             R$ 119,60
--                                                         ─────────
--                                                         R$ 269,10  exato
--
-- O order bump é transação SEPARADA na PayT, e o Bling funde as duas num
-- pedido só — nomeado pela primeira. Nossa tabela gravava `transaction_id` em
-- `platform_order_number`, e a `ecommerce_aguardando_bling` agrupa por essa
-- coluna: **duas linhas na coluna "Pago" para uma compra só**.
--
-- ⚠️ E casar por transação NÃO resolveria: sairia o `PK2279K` e o `2877EQV`
-- ficaria órfão PARA SEMPRE, porque o Bling não o referencia em lugar nenhum.
-- Trocaria duplicado por órfão permanente, que é pior — duplicado alguém vê.
--
-- Quem agrupa é o `cart_id`: venda, upsell, bump e carrinho recuperado da mesma
-- compra o repetem. A transação não se perde — continua no `order_id`
-- (`<transação>-<code>`), e é por ela que o `numero_loja` do Bling
-- (`PAYT_<seller_id>_<transação>`) vai casar quando essa junção existir.
--
-- ── O que esta migração faz, e o que ela NÃO faz ─────────────────────────
--
-- FAZ: corrige o `platform_order_number` das linhas JÁ gravadas, lendo o
-- `cart_id` do log cru (`payt_eventos`). O log existe exatamente para isto.
--
-- NÃO FAZ: a junção com o Bling. Ela depende do formato
-- `PAYT_<seller_id>_<transação>`, e eu tenho **UM** caso. Um exemplo não é
-- regra — foi assim que a porta 4 da conciliação do Melhor Envio nasceu com 0
-- acertos em 36. Entra depois do segundo pedido, com o formato conferido.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o estado de hoje                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) As linhas da PayT e o que cada uma tem hoje como "número do pedido".
select o.platform_order_number as numero_hoje,
       o.order_id,
       split_part(o.order_id, '-', 1) as transacao,
       o.total, o.status, o.ordered_at
from public.ecommerce_orders o
where o.platform = 'payt'
order by o.ordered_at desc;

-- (0.b) ⭐ O que o log cru sabe e a tabela não: o carrinho de cada transação.
--       Linha com `cart_id` nulo aqui é transação cujo postback não foi
--       guardado — ela NÃO será corrigida, e isso é melhor que inventar.
select e.transaction_id, e.cart_id, e.status, e.recebido_em,
       e.corpo->>'seller_id' as seller_id
from public.payt_eventos e
where e.transaction_id is not null
order by e.recebido_em desc;

-- (0.c) ⭐ Quantos cards a coluna "Pago" mostra HOJE, e quantos mostraria
--       depois. A diferença é o duplicado.
select count(distinct o.platform_order_number)          as cards_hoje,
       count(distinct coalesce(e.cart_id, o.platform_order_number)) as cards_depois
from public.ecommerce_orders o
left join public.payt_eventos e
       on e.transaction_id = split_part(o.order_id, '-', 1)
where o.platform = 'payt';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o histórico passa a apontar para o carrinho                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Só corrige o que o log CONFIRMA. Transação sem evento guardado fica como
-- está: `coalesce` no lugar de um `update` cego. Gravar vazio por cima de dado
-- bom é a regra que a carga de PDV por planilha já seguia e que o gatilho
-- `ecommerce_nao_apaga_com_vazio` passou a impor aqui.

update public.ecommerce_orders o
   set platform_order_number = e.cart_id
from (
  select distinct on (transaction_id) transaction_id, cart_id
  from public.payt_eventos
  where transaction_id is not null
    and cart_id is not null
    and btrim(cart_id) <> ''
  order by transaction_id, recebido_em desc
) e
where o.platform = 'payt'
  and split_part(o.order_id, '-', 1) = e.transaction_id
  and o.platform_order_number is distinct from e.cart_id;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ As transações da MESMA compra agora compartilham o número, e o total
--       do card passa a bater com o do Bling (R$ 269,10 no pedido 615).
select o.platform_order_number as carrinho,
       count(*)                as linhas,
       sum(o.total)            as total_do_card,
       string_agg(distinct split_part(o.order_id, '-', 1), ' + ') as transacoes,
       string_agg(distinct o.status, ', ')                        as status
from public.ecommerce_orders o
where o.platform = 'payt'
group by 1
order by 3 desc;

-- (2.b) A coluna "Pago" da esteira, agora agrupada por compra.
select * from public.ecommerce_aguardando_bling where platform = 'payt';

-- (2.c) ⚠️ Sobrou alguma linha sem correção? São as transações cujo postback
--       não está no log — ficam com a transação como número, e isso é o
--       honesto: o carrinho delas nós não sabemos.
select o.order_id, o.platform_order_number
from public.ecommerce_orders o
left join public.payt_eventos e on e.transaction_id = split_part(o.order_id, '-', 1)
where o.platform = 'payt' and e.cart_id is null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o que fica PENDENTE, com o dado para decidir                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) ⭐ A JUNÇÃO COM O BLING — a regra candidata, ainda NÃO aplicada.
--       Ela extrai a transação do `numero_loja` e procura o carrinho dela.
--       Rode depois do PRÓXIMO pedido PayT: se casar os dois, o formato está
--       confirmado e eu escrevo a view.
select bo.bling_id, bo.numero, bo.numero_loja, bo.total as total_bling,
       split_part(bo.numero_loja, '_', 3)              as transacao_no_bling,
       o.platform_order_number                         as carrinho_nosso,
       (select sum(x.total) from public.ecommerce_orders x
         where x.platform = 'payt'
           and x.platform_order_number = o.platform_order_number) as total_nosso
from public.bling2_orders bo
join public.ecommerce_orders o
  on o.platform = 'payt'
 and split_part(o.order_id, '-', 1) = split_part(bo.numero_loja, '_', 3)
where bo.numero_loja like 'PAYT!_%' escape '!'
group by bo.bling_id, bo.numero, bo.numero_loja, bo.total, o.platform_order_number;

-- (3.b) ⚠️ O pedido PayT entra no Bling com `loja_id = 0` — "venda direta".
--       A ponte só marca `segmento = 'online'` quando a loja é ≠ 0 e não
--       ignorada, então venda PayT NÃO está sendo contada como on-line.
--       Ou se cria uma loja "PayT" no Bling, ou a ponte ganha exceção.
select bo.bling_id, bo.numero, bo.numero_loja, bo.loja_id, bo.situacao_id
from public.bling2_orders bo
where bo.numero_loja like 'PAYT!_%' escape '!'
order by bo.bling_id desc;

-- (3.c) ⚠️ `ordered_at` inventado. O parser caía em `new Date()` calado quando
--       a data do payload não parseava; agora ele grita `PAYT_SEM_DATA` no log
--       da função. Esta consulta mostra o sintoma no dado: transações
--       diferentes com o MESMO segundo não são coincidência.
select o.ordered_at, count(*) as linhas,
       string_agg(distinct split_part(o.order_id, '-', 1), ', ') as transacoes
from public.ecommerce_orders o
where o.platform = 'payt'
group by 1 having count(*) > 1
order by 1 desc;

-- (3.d) A data VERDADEIRA de cada transação, do log cru. Serve para corrigir o
--       histórico depois de saber por que o parse falhou — o formato real está
--       aqui, e é ele que diz se o `Y-m-d H:i:s` esperado mudou.
select e.transaction_id,
       e.corpo->>'started_at' as started_at_cru,
       e.corpo->>'updated_at' as updated_at_cru,
       o.ordered_at           as o_que_gravamos
from public.payt_eventos e
left join public.ecommerce_orders o
       on o.platform = 'payt' and split_part(o.order_id, '-', 1) = e.transaction_id
where e.transaction_id is not null
order by e.recebido_em desc;
