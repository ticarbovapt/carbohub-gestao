-- ═══════════════════════════════════════════════════════════════════════════
-- O ensaio dizia "deduziria" para o que JÁ FOI e para o que NUNCA SERÁ
--
-- ── O sintoma, medido em 08-09/09 ────────────────────────────────────────
--
-- `carbo_estoque_ensaio` mostrava QUATRO linhas da Shopee como `deduziria`:
--
--     2609057JJ78MDX…  04/09   ← ja deduzida em 08/09 as 14:48
--     260828GCGGSDR7…  27/08   ← anterior ao marco zero, nunca sera
--     260826BYK2B3XR…  26/08   ← idem
--     2608210JRNF666…  21/08   ← idem
--
-- O cron roda de 10 em 10 min desde 28/08 — onze dias — e deduziu UMA. Ou
-- seja, a funcao aplica as duas regras e a VIEW nao aplica nenhuma.
--
-- ── O que estava errado ─────────────────────────────────────────────────
--
-- A view perguntava "esta linha resolve para um produto?" e chamava a resposta
-- de "o que a deducao faria". Sao perguntas diferentes. Faltavam:
--
--   1. o MARCO ZERO  (`ordered_at > deduz_a_partir_de`, e nulo NAO deduz)
--   2. o LEDGER      (`carbo_estoque_consumo` — "esta saida ja foi contada?")
--
-- ⚠️ A consequencia nao e cosmetica: a lista NUNCA esvazia. Tres linhas de
-- trabalho que nao existem ficariam ali para sempre, e lista que nao zera e
-- lista que ninguem abre. E o inverso da doenca da 20260941 — em vez de so
-- concordar consigo mesma, ela discorda para sempre do que o sistema faz.
--
-- ⚠️ Nenhum saldo muda. Nenhuma deducao muda. Nenhum ledger e tocado. Esta
-- migracao conserta um RELATORIO.
--
-- ── As duas perguntas continuam separadas, e isso e o ponto ─────────────
--
--   anterior_ao_marco   a venda e ANTIGA          (filtro por DATA)
--   ja_deduzido         a saida ja foi CONTADA    (o ledger)
--
-- Elas coincidem no primeiro dia e divergem depois — foi confundi-las que
-- quase fez o marco zero "andar" em 31/08 e criar um vazamento permanente.
-- Por isso sao dois vereditos, nunca um.
--
-- ⚠️ `SEM MAPEAMENTO` continua PRIMEIRO no CASE e com o texto intacto: a aba
-- "SKUs vendidos sem mapa" do Ops filtra por `ilike '%SEM MAPEAMENTO%'`.
-- Mudar essa string esvazia a aba sem dar erro.
--
-- ⚠️ `security_invoker = true` REPETIDO — conferido em `pg_class` antes desta
-- migracao. `create or replace view` sem a clausula APAGA as reloptions.
--
-- ⚠️ MESMAS colunas, MESMA ORDEM. O corpo saiu de `pg_get_viewdef` da
-- definicao VIVA; o que muda e o CASE e dois joins novos de leitura.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a foto do antes                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ O ensaio HOJE, por veredito. Guarde: o BLOCO 2 compara com isto.
select veredito, count(*) as linhas
from public.carbo_estoque_ensaio
group by 1 order by 2 desc;

-- (0.b) ⭐ A prova do defeito, em numeros: quantas linhas o ensaio chama de
--       `deduziria` e o ledger ja registrou, e quantas sao anteriores ao marco.
select
  count(*) filter (where e.veredito = 'deduziria')                     as diz_deduziria,
  count(*) filter (where e.veredito = 'deduziria' and k.origem_chave is not null) as mas_ja_deduzida,
  count(*) filter (where e.veredito = 'deduziria'
                     and (c.deduz_a_partir_de is null
                          or e.ordered_at <= c.deduz_a_partir_de))     as mas_anterior_ao_marco
from public.carbo_estoque_ensaio e
left join public.carbo_canal_estoque c on c.platform = e.platform
left join public.carbo_estoque_consumo k
       on k.origem_tipo = 'ecommerce'
      and k.origem_chave = e.platform || ':' || e.order_id;

-- (0.c) A view nao pode perder isto na republicacao.
select relname, reloptions from pg_class where relname = 'carbo_estoque_ensaio';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o ensaio passa a responder o que o nome promete             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.carbo_estoque_ensaio
with (security_invoker = true) as
 SELECT o.platform,
    o.order_id,
    o.platform_order_number,
    o.product_sku,
    o.product_name,
    o.quantity AS qtd_vendida,
    o.units_real,
    o.status,
    o.ordered_at,
    r.unidades_por_venda AS fator,
    o.quantity::numeric * r.unidades_por_venda AS unidades_a_deduzir,
    COALESCE(pr.bonificacao_de, r.product_id) AS product_id_alvo,
    COALESCE(pai.product_code, pr.product_code) AS produto_alvo,
    COALESCE(pai.name, pr.name) AS nome_alvo,
    c.warehouse_code,
    c.ativo AS canal_deduz,
        CASE
            -- ⚠️ PRIMEIRO, e com o texto intacto: a aba "SKUs vendidos sem
            -- mapa" do Ops filtra por `ilike '%SEM MAPEAMENTO%'`. Mudar esta
            -- string esvazia a aba sem erro nenhum.
            WHEN r.product_id IS NULL THEN '⚠️ SKU SEM MAPEAMENTO — não deduziria nada'::text
            -- ⭐ O LEDGER decide antes de qualquer outra coisa: saída já
            -- contada é FATO, e continua sendo verdade mesmo que o canal seja
            -- desligado depois.
            WHEN k.origem_chave IS NOT NULL THEN 'já deduzido'::text
            WHEN c.platform IS NULL THEN '⚠️ canal sem configuração de galpão'::text
            WHEN NOT c.ativo THEN 'canal desligado — não deduz'::text
            -- ⭐ Marco zero NULO não deduz, mesmo com o canal ativo. Era esta
            -- a trava que impediu a primeira rodada baixar 90 dias de uma vez.
            WHEN c.deduz_a_partir_de IS NULL THEN 'canal sem marco zero — não deduz'::text
            -- ⭐ E ela é DIFERENTE de "já deduzido": esta pergunta é sobre a
            -- DATA da venda, aquela é sobre a saída já ter sido contada. As
            -- duas coincidem no primeiro dia e divergem depois.
            WHEN o.ordered_at <= c.deduz_a_partir_de THEN 'anterior ao marco zero — nunca será deduzido'::text
            WHEN pr.bonificacao_de IS NOT NULL THEN 'gêmeo de bonificação — baixa do produto pai'::text
            ELSE 'deduziria'::text
        END AS veredito
   FROM ecommerce_orders o
     LEFT JOIN LATERAL carbo_ecommerce_sku_resolve(o.platform, o.product_sku) r(product_id, unidades_por_venda, via) ON true
     LEFT JOIN mrp_products pr ON pr.id = r.product_id
     LEFT JOIN mrp_products pai ON pai.id = pr.bonificacao_de
     LEFT JOIN carbo_canal_estoque c ON c.platform = o.platform
     -- ⚠️ A chave do ledger é `<plataforma>:<order_id>`, conferida no dado
     -- real: `shopee:2609057JJ78MDX-58214879240-0`. É a MESMA expressão da
     -- consulta de garantia que mora no CLAUDE.md — mudou uma, mude a outra.
     LEFT JOIN public.carbo_estoque_consumo k
            ON k.origem_tipo = 'ecommerce'
           AND k.origem_chave = o.platform || ':' || o.order_id
  WHERE ecommerce_status_e_venda(o.status);

comment on view public.carbo_estoque_ensaio is
  'O que a dedução de estoque FARIA, sem fazer. ⚠️ O veredito respeita as MESMAS travas da função: SKU sem mapa, canal sem configuração, canal desligado, marco zero (nulo ou posterior à venda) e o LEDGER (`carbo_estoque_consumo`). Sem elas a view dizia "deduziria" para venda já deduzida e para venda anterior ao marco — uma lista de trabalho que nunca esvazia. ⚠️ "anterior ao marco zero" e "já deduzido" são vereditos SEPARADOS de propósito: um pergunta se a venda é antiga (data), o outro se a saída já foi contada (ledger); confundi-los é o que quase fez o marco zero andar e criar vazamento permanente. ⚠️ O texto "SEM MAPEAMENTO" é contrato com a aba do Ops, que filtra por ilike. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_estoque_ensaio to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ Os vereditos agora. Comparado com o 0.a, o que era `deduziria`
--       indevido virou `já deduzido` ou `anterior ao marco zero`.
select veredito, count(*) as linhas
from public.carbo_estoque_ensaio
group by 1 order by 2 desc;

-- (2.b) ⭐ A Shopee, uma a uma. Esperado: a de 04/09 `já deduzido`, as três de
--       agosto `anterior ao marco zero`. NENHUMA `deduziria`.
select order_id, ordered_at, veredito
from public.carbo_estoque_ensaio
where platform = 'shopee'
order by ordered_at desc;

-- (2.c) ⭐ A PROVA CRUZADA, e é ela que vale: tudo que o ensaio ainda chama de
--       `deduziria` tem de ser exatamente o que a função vai pegar. Com o
--       ledger em dia, `carbo_ecommerce_deduzir_estoque()` volta vazia — então
--       este número tem de ser ZERO. Se não for, a regra que copiei diverge da
--       função, e é a função que manda.
select count(*) as ainda_pendente_no_ensaio
from public.carbo_estoque_ensaio
where veredito = 'deduziria';

-- (2.d) ⚠️ A aba "SKUs vendidos sem mapa" do Ops não pode ter esvaziado: ela
--       filtra por `ilike '%SEM MAPEAMENTO%'`.
select count(*) as linhas_sem_mapa
from public.carbo_estoque_ensaio
where veredito ilike '%SEM MAPEAMENTO%';

-- (2.e) A view não perdeu o `security_invoker`.
select relname, reloptions from pg_class where relname = 'carbo_estoque_ensaio';
