-- ═══════════════════════════════════════════════════════════════════════════
-- A coluna "Pago" enxerga a PayT — e para de somar linha cancelada
--
-- ── Medido em 01/09, depois da 20260970 ──────────────────────────────────
--
--     total_nosso   R$ 418,60   =  119,60 + 149,50 + 149,50
--     total_bling   R$ 269,10   =  119,60 + 149,50
--                                            └── V877YKO, CANCELADA
--
-- Duas coisas erradas, e as duas ficam visíveis só agora que o pedido é o
-- carrinho (20260970).
--
-- ── DEFEITO 1: a view soma linha que não é venda ─────────────────────────
--
-- O CTE `pedido` agrega TODAS as linhas do `platform_order_number` e só depois
-- filtra por `avanco >= 1` — que é o estágio MÁXIMO entre elas. Uma transação
-- cancelada dentro de um pedido pago passava pelo filtro de carona e entrava
-- na soma.
--
-- ⚠️ Isso NÃO é defeito só da PayT: qualquer canal com item cancelado no meio
-- de um pedido pago já inflava o card. Só não aparecia porque, com uma linha
-- por transação, a cancelada virava um card próprio e era descartada inteira.
-- Agrupar por carrinho a trouxe para dentro.
--
-- A correção usa `ecommerce_status_e_venda` — a MESMA lista branca do sininho,
-- da dedução de estoque e do resumo mensal. Uma pergunta, uma lista. Escrever
-- outra cópia aqui é o defeito que a 20260967 acabou de consertar.
--
-- ── DEFEITO 2: o card da PayT nunca saía de "Pago" ───────────────────────
--
-- A saída depende de achar o pedido no Bling por
-- `bo.numero_loja = p.platform_order_number`. O Bling grava
-- `PAYT_<seller_id>_<transação>` (`PAYT_LYK2ZA_PK2279K`), e nós guardamos o
-- CARRINHO (`32BXNEP`). Nunca casa — o pedido ficava eternamente na primeira
-- coluna mesmo já faturado, e por isso apareciam dois cards da mesma compra.
--
-- A regra nova extrai a transação do `numero_loja` e a procura entre as
-- transações daquele carrinho (`order_id` = `<transação>-<code>`).
--
-- ⚠️ Continua sendo UM caso real. O que autoriza aplicá-la agora é que o total
-- FECHA exatamente (269,10 = 269,10 depois do defeito 1) — não é semelhança,
-- é identidade. Ainda assim: se o próximo pedido PayT não sair da coluna
-- "Pago" sozinho, o formato mudou e a regra precisa ser revista, não afrouxada.
-- Afrouxar comparação sem apertar unicidade troca "não casa nunca" por "casa
-- errado", que foi a lição da porta 4 do Melhor Envio.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem a
-- cláusula APAGA as reloptions, e foi assim que a `bling2_esteira` passou a
-- rodar com os privilégios do dono e RLS ignorada.
--
-- ⚠️ Mesmas colunas, MESMA ORDEM — `create or replace` só acrescenta no fim.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o estado errado, para comparar depois                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ O card da PayT hoje: R$ 418,60 e 3 itens, com uma cancelada dentro.
select platform, pedido_loja, canal, total, itens, minutos_parado
from public.ecommerce_aguardando_bling
order by ordered_at desc;

-- (0.b) A prova de que a cancelada está na soma.
select o.platform_order_number, split_part(o.order_id, '-', 1) as transacao,
       o.status, o.total,
       public.ecommerce_status_e_venda(o.status) as conta_como_venda
from public.ecommerce_orders o
where o.platform = 'payt'
order by o.platform_order_number, 2;

-- (0.c) ⚠️ Isto NÃO é só da PayT. Pedidos de QUALQUER canal com linha que não
--       é venda no meio — cada um está com o card inflado hoje.
select o.platform, o.platform_order_number,
       sum(o.total)                                                          as total_hoje,
       sum(o.total) filter (where public.ecommerce_status_e_venda(o.status))  as total_certo
from public.ecommerce_orders o
where o.ordered_at > now() - interval '30 days'
  and o.platform_order_number is not null
group by 1, 2
having count(*) filter (where not public.ecommerce_status_e_venda(o.status)) > 0
   and count(*) filter (where public.ecommerce_status_e_venda(o.status)) > 0
order by (sum(o.total) - sum(o.total) filter (where public.ecommerce_status_e_venda(o.status))) desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view corrigida                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.ecommerce_aguardando_bling
with (security_invoker = true) as
with pedido as (
  select
    e.platform,
    e.platform_order_number,
    min(e.ordered_at)                          as ordered_at,
    sum(e.total)                               as total,
    sum(e.quantity)                            as itens,
    max(e.cliente_nome)                        as cliente,
    max(e.cliente_fone)                        as cliente_fone,
    max(e.cliente_email)                       as cliente_email,
    max(case lower(e.status)
          when 'delivered' then 3
          when 'shipped'   then 2
          when 'paid'      then 1
          else 0
        end)                                   as avanco,
    string_agg(distinct e.product_name, ' · ') as produtos,
    -- ⭐ As transações deste pedido. Só a PayT precisa disso hoje (o Bling
    --    grava `PAYT_<seller>_<transação>` e nós agrupamos por carrinho), mas
    --    a coluna é geral: `<algo>-<code>` é o desenho de order_id de todos os
    --    canais, e o primeiro segmento é sempre o identificador do pedido na
    --    origem.
    array_agg(distinct split_part(e.order_id, '-', 1))          as transacoes
  from public.ecommerce_orders e
  where e.platform_order_number is not null
    -- ⭐ SÓ LINHA QUE É VENDA. A lista branca é a `ecommerce_status_e_venda`, a
    --    mesma do sininho, da dedução de estoque e do resumo mensal.
    --    Sem isto, uma transação cancelada dentro de um pedido pago entra na
    --    soma de carona pelo `avanco` máximo: medido em R$ 418,60 num pedido
    --    de R$ 269,10.
    and public.ecommerce_status_e_venda(e.status)
    and e.ordered_at > now() - interval '30 days'
  group by 1, 2
)
select
  p.platform,
  p.platform_order_number                      as pedido_loja,
  case p.platform
    when 'nuvemshop'    then 'Loja Nuvemshop'
    when 'mercadolivre' then 'Mercado Livre'
    when 'amazon'       then 'Amazon'
    when 'payt'         then 'PayT'
    when 'shopee'       then 'Shopee'
    else initcap(p.platform)
  end                                          as canal,
  (p.ordered_at at time zone 'America/Sao_Paulo')::date as data_pedido,
  p.ordered_at,
  p.total,
  p.itens,
  p.produtos,
  p.cliente,
  p.cliente_fone,
  p.cliente_email,
  extract(epoch from (now() - p.ordered_at))::bigint / 60 as minutos_parado
from pedido p
where p.avanco >= 1
  and not exists (
    select 1
    from public.bling2_orders bo
    where bo.situacao_id in (9, 12)
      and (
        -- O caminho normal: a loja grava o número do pedido tal como o temos.
        bo.numero_loja = p.platform_order_number
        -- ⭐ PayT: o Bling grava `PAYT_<seller_id>_<transação>` e nós guardamos
        --    o CARRINHO, que agrupa as transações da mesma compra (venda +
        --    order bump viram UM pedido no Bling). Casa pela transação.
        --    ⚠️ O prefixo é exigido: sem ele, `split_part` de um número comum
        --    devolveria a string inteira e casaria por acaso.
        or (bo.numero_loja like 'PAYT!_%' escape '!'
            and split_part(bo.numero_loja, '_', 3) = any(p.transacoes))
      )
  );

comment on view public.ecommerce_aguardando_bling is
  'Pedido pago na plataforma que ainda NÃO virou Atendido no Bling — a primeira coluna da Esteira do On-line. ⚠️ Soma SÓ linha que é venda (`ecommerce_status_e_venda`, a mesma lista do sininho e do estoque): transação cancelada dentro de um pedido pago entrava de carona pelo `avanco` máximo e inflava o card. ⚠️ A PayT sai daqui pela TRANSAÇÃO: o Bling grava `PAYT_<seller_id>_<transação>` e nós agrupamos por `cart_id` (venda + order bump = um pedido no Bling). ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.ecommerce_aguardando_bling to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ O TESTE QUE IMPORTA: a PayT SUMIU da coluna "Pago", porque o pedido
--       615 do Bling foi encontrado. Zero linhas de `payt` aqui.
select platform, pedido_loja, canal, total, itens, minutos_parado
from public.ecommerce_aguardando_bling
order by ordered_at desc;

-- (2.b) A view não perdeu o `security_invoker` na republicação.
select relname, reloptions
from pg_class where relname = 'ecommerce_aguardando_bling';

-- (2.c) ⚠️ Se a PayT AINDA aparecer no (2.a), é aqui que se vê por quê: o
--       `casou` tem de ser `true`. `false` significa que o formato do
--       `numero_loja` mudou — REVISE a regra, não afrouxe a comparação.
select bo.numero_loja,
       split_part(bo.numero_loja, '_', 3) as transacao_no_bling,
       bo.situacao_id,
       exists (
         select 1 from public.ecommerce_orders o
         where o.platform = 'payt'
           and split_part(o.order_id, '-', 1) = split_part(bo.numero_loja, '_', 3)
       ) as casou
from public.bling2_orders bo
where bo.numero_loja like 'PAYT!_%' escape '!';

-- (2.d) O total do card, quando houver PayT pendente de novo, agora exclui a
--       cancelada. Serve de referência para a próxima venda.
select o.platform_order_number,
       sum(o.total)                                                         as soma_de_tudo,
       sum(o.total) filter (where public.ecommerce_status_e_venda(o.status)) as soma_de_venda
from public.ecommerce_orders o
where o.platform = 'payt'
group by 1;
