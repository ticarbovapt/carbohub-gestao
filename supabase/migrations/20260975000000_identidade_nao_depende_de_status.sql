-- ═══════════════════════════════════════════════════════════════════════════
-- O elo com o Bling não pode depender do STATUS da transação
--
-- ── O sintoma ────────────────────────────────────────────────────────────
--
-- O carrinho PayT `32BXNEP` ficou **100 h** na coluna "Pago" — travado — mesmo
-- com o pedido dele já faturado no Bling havia dias. A 20260971 tinha
-- resolvido exatamente isso, e voltou.
--
-- ── A causa: a correção anterior criou este defeito ──────────────────────
--
-- A 20260971 acrescentou, e com razão, `ecommerce_status_e_venda(e.status)` no
-- CTE que agrega o pedido — sem ele, transação cancelada dentro de um carrinho
-- pago inflava o total (medido: R$ 418,60 num pedido de R$ 269,10).
--
-- ⚠️ Só que o array `transacoes`, que é a CHAVE do elo com o Bling, era
-- calculado DENTRO desse mesmo CTE. Ou seja: o filtro de dinheiro passou a
-- governar também a IDENTIDADE.
--
-- O carrinho 32BXNEP tem três transações:
--
--     2877EQV   R$ 119,60   paga
--     PK2279K   R$ 149,50   ← CANCELADA depois
--     V877YKO   R$ 149,50   cancelada
--
-- e o pedido no Bling chama-se `PAYT_LYK2ZA_PK2279K` — nomeado pela transação
-- que **foi cancelada**. Com o filtro, `transacoes` virou `{2877EQV}`, o
-- `split_part` do Bling devolve `PK2279K`, e `PK2279K = any('{2877EQV}')` é
-- FALSO. O elo sumiu, o `not exists` passou a valer, e o card voltou para
-- "Pago" — para sempre, porque nada o tira de lá.
--
-- É o que o dono do processo descreveu: "esse pago desanexou depois de cancelar
-- uma das notas". Exatamente isso.
--
-- ── A regra que faltava estar escrita ───────────────────────────────────
--
--   DINHEIRO filtra por status.   IDENTIDADE, nunca.
--
-- Quanto o carrinho vendeu é pergunta sobre venda válida. QUAL pedido do Bling
-- é este carrinho é pergunta sobre identidade — e um pedido não deixa de ser o
-- mesmo pedido porque uma das transações dele foi cancelada. Misturar as duas
-- faz o vínculo evaporar no dia do estorno, que é justamente o dia em que
-- alguém está olhando.
--
-- ⚠️ Isto NÃO desfaz a 20260971: a soma continua só com linha de venda. O que
-- muda é que `transacoes` passa a ser calculado num CTE PRÓPRIO, sem filtro de
-- status.
--
-- ⚠️ E não há risco de esconder card por engano: incluir a transação cancelada
-- só torna o encontro MAIS provável, e o encontro exige que exista, no Bling,
-- um pedido com aquele identificador exato.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem a
-- cláusula APAGA as reloptions — foi assim que a `bling2_esteira` passou a
-- rodar com os privilégios do dono e RLS ignorada.
--
-- ⚠️ MESMAS colunas, MESMA ORDEM — `create or replace` só acrescenta no fim.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — provar a causa antes de mexer                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ As linhas do carrinho travado, com o status de cada transação.
--       Espera-se ver a transação que dá nome ao pedido do Bling CANCELADA.
select e.platform_order_number                as carrinho,
       split_part(e.order_id, '-', 1)         as transacao,
       e.status,
       public.ecommerce_status_e_venda(e.status) as conta_como_venda,
       e.total, e.ordered_at
from public.ecommerce_orders e
where e.platform = 'payt'
order by e.platform_order_number, 2;

-- (0.b) ⭐ O TESTE DA CAUSA. Para cada pedido PayT no Bling, compara o array
--       que a view usa HOJE (só venda) com o array COMPLETO.
--       `casa_hoje = false` e `casa_depois = true` é a prova.
with por_carrinho as (
  select e.platform_order_number as carrinho,
         array_agg(distinct split_part(e.order_id, '-', 1))
           filter (where public.ecommerce_status_e_venda(e.status))  as so_venda,
         array_agg(distinct split_part(e.order_id, '-', 1))          as todas
  from public.ecommerce_orders e
  where e.platform = 'payt' and e.platform_order_number is not null
  group by 1
)
select bo.numero_loja,
       split_part(bo.numero_loja, '_', 3) as transacao_no_bling,
       bo.situacao_id,
       c.carrinho,
       c.so_venda,
       c.todas,
       split_part(bo.numero_loja, '_', 3) = any(coalesce(c.so_venda, '{}')) as casa_hoje,
       split_part(bo.numero_loja, '_', 3) = any(c.todas)                    as casa_depois
from public.bling2_orders bo
join por_carrinho c
  on split_part(bo.numero_loja, '_', 3) = any(c.todas)
where bo.numero_loja like 'PAYT!_%' escape '!';

-- (0.c) O que está na coluna "Pago" agora — para comparar depois do BLOCO 1.
select platform, pedido_loja, canal, total, itens,
       (minutos_parado / 60) as horas_parado
from public.ecommerce_aguardando_bling
order by minutos_parado desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a identidade sai do filtro de status                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.ecommerce_aguardando_bling
with (security_invoker = true) as
-- ⭐ CTE PRÓPRIO, e de propósito SEM `ecommerce_status_e_venda`.
--    Este array responde "quais transações formam este carrinho", que é
--    IDENTIDADE. Transação cancelada continua fazendo parte do carrinho — e é
--    justamente ela que às vezes dá nome ao pedido no Bling.
with transacoes_do_pedido as (
  select
    e.platform,
    e.platform_order_number,
    array_agg(distinct split_part(e.order_id, '-', 1)) as transacoes
  from public.ecommerce_orders e
  where e.platform_order_number is not null
    -- A MESMA janela do CTE de baixo: os dois falam do mesmo conjunto.
    and e.ordered_at > now() - interval '30 days'
  group by 1, 2
),
pedido as (
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
    string_agg(distinct e.product_name, ' · ') as produtos
  from public.ecommerce_orders e
  where e.platform_order_number is not null
    -- ⚠️ AQUI o filtro CONTINUA e deve continuar: dinheiro e contagem só somam
    --    linha que é venda. Foi o que impediu R$ 418,60 num pedido de
    --    R$ 269,10. O que saiu daqui foi só o array de transações.
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
left join transacoes_do_pedido t
       on t.platform = p.platform
      and t.platform_order_number = p.platform_order_number
where p.avanco >= 1
  and not exists (
    select 1
    from public.bling2_orders bo
    where bo.situacao_id in (9, 12)
      and (
        -- O caminho normal: a loja grava o número do pedido tal como o temos.
        bo.numero_loja = p.platform_order_number
        -- ⭐ PayT: o Bling grava `PAYT_<seller_id>_<transação>` e nós guardamos
        --    o CARRINHO. Casa por QUALQUER transação do carrinho — inclusive
        --    cancelada, que é a correção desta migração.
        --    ⚠️ O prefixo é exigido: sem ele, `split_part` de um número comum
        --    devolveria a string inteira e casaria por acaso.
        --    ⚠️ `coalesce` para array vazio: `= any(null)` devolve NULL, e NULL
        --    no OR faria o `not exists` decidir por acaso.
        or (bo.numero_loja like 'PAYT!_%' escape '!'
            and split_part(bo.numero_loja, '_', 3)
                = any(coalesce(t.transacoes, '{}'::text[])))
      )
  );

comment on view public.ecommerce_aguardando_bling is
  'Pedido pago na plataforma que ainda NÃO virou Atendido no Bling — a primeira coluna da Esteira do On-line. ⚠️ DINHEIRO filtra por status (`ecommerce_status_e_venda`), IDENTIDADE nunca: o array de transações que casa com o `numero_loja` do Bling sai de um CTE SEM filtro, porque o pedido do Bling pode ser nomeado por uma transação depois CANCELADA — foi assim que o carrinho 32BXNEP ficou 100 h travado em "Pago" com a nota já emitida. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.ecommerce_aguardando_bling to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ O carrinho travado SUMIU da coluna "Pago". Nenhuma linha `payt`
--       cujo pedido já exista no Bling.
select platform, pedido_loja, canal, total, itens,
       (minutos_parado / 60) as horas_parado
from public.ecommerce_aguardando_bling
order by minutos_parado desc;

-- (2.b) A view não perdeu o `security_invoker` na republicação.
select relname, reloptions
from pg_class where relname = 'ecommerce_aguardando_bling';

-- (2.c) ⚠️ A 20260971 CONTINUA valendo: a soma ignora linha cancelada.
--       `soma_de_tudo` maior que `soma_de_venda` é o esperado; o card mostra a
--       segunda.
select o.platform_order_number,
       sum(o.total)                                                         as soma_de_tudo,
       sum(o.total) filter (where public.ecommerce_status_e_venda(o.status)) as soma_de_venda
from public.ecommerce_orders o
where o.platform = 'payt'
group by 1 order by 1;

-- (2.d) ⚠️ A rede permanente: carrinho PayT que tem pedido no Bling e AINDA
--       aparece em "Pago". Tem de vir ZERO. Se voltar a aparecer, o formato do
--       `numero_loja` mudou — REVISE a regra, não afrouxe a comparação.
select a.pedido_loja, a.total, (a.minutos_parado / 60) as horas
from public.ecommerce_aguardando_bling a
where a.platform = 'payt'
  and exists (
    select 1 from public.bling2_orders bo
    join public.ecommerce_orders e
      on e.platform = 'payt'
     and e.platform_order_number = a.pedido_loja
     and split_part(e.order_id, '-', 1) = split_part(bo.numero_loja, '_', 3)
    where bo.numero_loja like 'PAYT!_%' escape '!'
      and bo.situacao_id in (9, 12)
  );
