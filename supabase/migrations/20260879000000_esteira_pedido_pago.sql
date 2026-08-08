-- ═══════════════════════════════════════════════════════════════════════════
-- A cabeça da esteira não pode depender do Bling
--
-- ── O diagnóstico ─────────────────────────────────────────────────────────
--
-- A queixa era "o pedido demora a cair na esteira, sincronizar de 15 em 15
-- minutos não serve". A frequência do sync é uma pista falsa, e eu quase saí
-- ajustando cron por causa dela. A última linha da view é que manda:
--
--     where bo.situacao_id in (9, 12)     -- 9 = Atendido, 12 = Cancelado
--
-- A esteira só enxerga pedido ATENDIDO no Bling. Pedido recém-comprado nasce
-- "Em aberto" lá e só vira Atendido quando alguém fatura — que pode ser horas
-- depois. Com sync a cada 10 SEGUNDOS ele continuaria sem aparecer, porque o
-- Bling ainda não diz Atendido. Não é latência de sincronismo, é estado de
-- negócio.
--
-- Enquanto isso, `ecommerce_orders` já tem o pedido em ~2 segundos, pelo
-- webhook (a venda de 08/08: ordered_at 12:01:32 → synced_at 12:01:34).
--
-- ── A correção ────────────────────────────────────────────────────────────
--
-- Uma etapa ANTES de "Confirmado", alimentada direto da plataforma. O pedido
-- aparece na hora da compra; quando o Bling alcança e fatura, ele some daqui e
-- entra no fluxo normal — sem ninguém arrastar nada.
--
-- A chave da junção já existia e foi criada exatamente para isto:
-- `ecommerce_orders.platform_order_number` ↔ `bling2_orders.numero_loja`.
--
-- ── Por que uma view SEPARADA, e não mais um CASE na bling2_esteira ───────
--
-- Porque `bling2_esteira` alimenta `carbo_msg_fila`, que alimenta o disparo de
-- WhatsApp. Enfiar dezenas de pedidos novos lá dentro é, na prática, apertar o
-- gatilho de um envio em massa — o mesmo acidente que o "marco zero" da
-- 20260873 existe para impedir. Fora que esses pedidos não têm `bling_id`, e
-- `carbo_msg_envios` tem PK `(bling_id, etapa)`: não haveria como registrar o
-- que foi avisado.
--
-- Separada, a tela ganha a coluna e o disparo continua exatamente como está.
-- Ligar mensagem nesta etapa passa a ser uma decisão à parte, deliberada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.ecommerce_aguardando_bling
with (security_invoker = true) as
with pedido as (
  -- A tabela tem uma linha por ITEM (ver CLAUDE.md). Agregar aqui é o que
  -- transforma item em pedido; `count(*)` cru contaria produto como venda.
  select
    e.platform,
    e.platform_order_number,
    min(e.ordered_at)                          as ordered_at,
    sum(e.total)                               as total,
    sum(e.quantity)                            as itens,
    -- O contato vem repetido em todas as linhas do mesmo pedido; qualquer uma
    -- serve, e `max` evita depender de ordenação.
    max(e.cliente_nome)                        as cliente,
    max(e.cliente_fone)                        as cliente_fone,
    max(e.cliente_email)                       as cliente_email,
    -- Estágio mais avançado entre as linhas, mesma regra da bling2_esteira.
    max(case lower(e.status)
          when 'delivered' then 3
          when 'shipped'   then 2
          when 'paid'      then 1
          else 0
        end)                                   as avanco,
    string_agg(distinct e.product_name, ' · ') as produtos
  from public.ecommerce_orders e
  where e.platform_order_number is not null
    -- Janela curta de propósito: pedido que nunca foi faturado não pode ficar
    -- entulhando a primeira coluna para sempre. Depois de 30 dias, o lugar
    -- dele é um relatório de pendência, não o quadro da operação.
    and e.ordered_at > now() - interval '30 days'
  group by 1, 2
)
select
  p.platform,
  p.platform_order_number                      as pedido_loja,
  -- Rótulo do canal na mesma linguagem da esteira do Bling.
  case p.platform
    when 'nuvemshop'    then 'Loja Nuvemshop'
    when 'mercadolivre' then 'Mercado Livre'
    when 'amazon'       then 'Amazon'
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
  -- Há quanto tempo pago e ainda sem faturamento. É a informação que faz esta
  -- coluna valer: pedido pago há 3 horas sem nota é alguém para cutucar.
  extract(epoch from (now() - p.ordered_at))::bigint / 60 as minutos_parado
from pedido p
where p.avanco >= 1                            -- pago para cima; 'pending' não entra
  and not exists (
    -- Já chegou ao Bling como Atendido/Cancelado? Então é da esteira normal.
    select 1
    from public.bling2_orders bo
    where bo.numero_loja = p.platform_order_number
      and bo.situacao_id in (9, 12)
  );

comment on view public.ecommerce_aguardando_bling is
  'Pedido pago na plataforma que ainda NÃO virou Atendido no Bling. É a primeira coluna da Esteira do On-line, e aparece ~2s depois da compra (webhook), sem esperar o faturamento. Sai sozinha quando o Bling alcança. Separada da bling2_esteira de propósito: não alimenta carbo_msg_fila.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Quem está esperando o Bling agora, e há quanto tempo.
select canal, pedido_loja, cliente,
       coalesce(cliente_fone, '— sem telefone —') as fone,
       total, minutos_parado
from public.ecommerce_aguardando_bling
order by minutos_parado desc;

-- (b) Sanidade: nenhum pedido pode aparecer nos dois lugares ao mesmo tempo.
--     Tem de voltar ZERO.
select a.pedido_loja
from public.ecommerce_aguardando_bling a
join public.bling2_esteira e on e.pedido_loja = a.pedido_loja;
