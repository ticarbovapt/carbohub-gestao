-- ═══════════════════════════════════════════════════════════════════════════
-- Shopee — os dois lugares do banco que a integração precisa antes de existir
--
-- O `pullShopee` grava em duas tabelas que hoje NÃO aceitam a Shopee. Nenhuma
-- das duas dá erro visível na tela: uma recusa o INSERT no fundo de um catch,
-- a outra deixa o card parado numa coluna para sempre. Migração antes do
-- deploy, portanto.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — 'shopee' entra no CHECK de rastreio_envios.fonte            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Hoje: check (fonte in ('mercadolivre','melhorenvio','desconhecida')).
-- Gravar rastreio da Shopee ali é INSERT recusado — e o `gravarRastreio` loga e
-- segue, então o sintoma é "o rastreio da Shopee não aparece", sem erro na
-- tela. É a MESMA armadilha do `segmento = 'online'`, que precisou entrar no
-- CHECK de `carboze_orders` quando a operação on-line passou para o Bling 2.
--
-- A Shopee usa logística própria (SPX) e não passa pelo Melhor Envio. O
-- `rastreio-sync` corta este canal na `montarFila()` de propósito — sem o
-- corte, o código entra na fila, não é encontrado, e grava erro no card de hora
-- em hora, para sempre. Esse corte CONTINUA valendo: quem traz o rastreio da
-- Shopee é o `ecommerce-sync`, direto da API dela.

alter table public.rastreio_envios drop constraint if exists rastreio_envios_fonte_check;
alter table public.rastreio_envios add constraint rastreio_envios_fonte_check
  check (fonte in ('mercadolivre', 'melhorenvio', 'shopee', 'desconhecida'));

comment on column public.rastreio_envios.fonte is
  'Quem nos contou do envio. ⚠️ Valor novo aqui exige valor novo no tipo EnvioRastreio de _shared/rastreio.ts — o tipo aceitar e o banco recusar é INSERT falhando calado.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o card da Shopee passa a poder andar                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ ESTE É O BLOCO QUE FAZ A DIFERENÇA VISÍVEL. A `bling2_esteira` só avança o
-- card quando encontra o pedido em `ecommerce_orders` pela junção
-- `platform_order_number = bling2_orders.numero_loja`. Quem preenche esse campo
-- é o gatilho `trg_ecommerce_numero_da_loja` — e ele cobre apenas
-- ('mercadolivre', 'amazon').
--
-- Sem a Shopee na lista, o pedido entra, o `tem_status_da_plataforma` fica
-- falso, e o card PARA em "etiqueta": nada o leva a em trânsito ou entregue.
-- Era o comportamento documentado no CLAUDE.md, e é ele que esta linha resolve.
--
-- ⚠️ A Nuvemshop continua FORA, e isso não é esquecimento: lá a raiz do
-- `order_id` é o id interno da loja, que não bate com nada do Bling. Preencher
-- com ele daria um valor não-nulo e ERRADO — o pedido pareceria ligado à
-- plataforma e nunca casaria. Nulo e honesto é melhor.
--
-- ⚠️ Para a Shopee a raiz é o `order_sn` (ex.: 2411AB12CD34EF), e a premissa é
-- que o Bling grava esse mesmo valor em `numero_loja` para a loja 206191275.
-- CONFIRA na primeira venda com a consulta (c) abaixo — se não bater, o card
-- continua parado e a causa é esta linha, não a integração.

create or replace function public.trg_ecommerce_numero_da_loja()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.platform_order_number is null
     and NEW.platform in ('mercadolivre', 'amazon', 'shopee') then
    NEW.platform_order_number := public.ecommerce_pedido_raiz(NEW.platform, NEW.order_id);
  end if;
  return NEW;
end $$;

-- ⚠️ O `pullShopee` também atribui `platform_order_number` explicitamente, e a
-- redundância é de propósito: o painel do Supabase publica uma função por vez,
-- e o gatilho é a rede de segurança do caminho do WEBHOOK, que não passa pelo
-- mapeamento do sync.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O CHECK aceita 'shopee'.
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.rastreio_envios'::regclass and conname like '%fonte%';

-- (b) O gatilho cobre as três plataformas.
select pg_get_functiondef('public.trg_ecommerce_numero_da_loja()'::regprocedure);

-- (c) ⚠️ DEPOIS DA PRIMEIRA VENDA: o order_sn da Shopee casa com o numero_loja
--     do Bling? Se `casaram` vier 0 com pedidos dos dois lados, a premissa do
--     BLOCO 2 está errada e o card vai continuar parado em "etiqueta".
select
  (select count(*) from public.ecommerce_orders where platform = 'shopee')      as linhas_shopee,
  (select count(distinct platform_order_number) from public.ecommerce_orders
    where platform = 'shopee' and platform_order_number is not null)            as pedidos_shopee,
  (select count(*) from public.bling2_orders where loja_id = 206191275)         as pedidos_bling_shopee,
  (select count(*) from public.bling2_orders bo
     where bo.loja_id = 206191275
       and exists (select 1 from public.ecommerce_orders e
                    where e.platform = 'shopee'
                      and e.platform_order_number = bo.numero_loja))            as casaram;

-- (d) O rastreio da Shopee chegou?
select fonte, count(*) as envios, count(*) filter (where status is not null) as com_status
from public.rastreio_envios group by fonte order by fonte;
