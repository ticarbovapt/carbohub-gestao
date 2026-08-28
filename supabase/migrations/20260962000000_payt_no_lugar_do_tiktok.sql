-- ═══════════════════════════════════════════════════════════════════════════
-- PayT — a plataforma entra nas telas, e o banco precisa aceitá-la ANTES
--
-- A PayT (checkout próprio, app.payt.com.br) toma nas telas o lugar do TikTok
-- Shop, que nunca foi integrado e aparecia cinza, "em breve". Diferente dele,
-- ela nasce ATIVA — e canal ativo que o banco não aceita é INSERT recusado no
-- fundo de um `catch`: o sintoma é "a PayT não aparece", nunca um erro.
--
-- É a mesma armadilha já paga três vezes aqui: `'online'` no CHECK de
-- `segmento`, `'shopee'` no CHECK de `rastreio_envios.fonte`, e o comentário
-- da tabela de mapas que citava um `'lp'` que nenhum CHECK aceitava.
--
-- ⚠️ Rode ANTES do deploy do front. Front aceitando e banco recusando é a
-- ordem errada.
--
-- ⚠️ O TikTok NÃO é removido dos CHECKs. Retirar valor de CHECK faz o ALTER
-- falhar se alguma linha histórica ainda o usar, e o ganho seria zero: ele já
-- não é oferecido em tela nenhuma. Ele sai da INTERFACE, não do histórico.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — 'payt' entra no CHECK de ecommerce_orders.platform          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem isto, nenhum pedido da PayT entra: nem por webhook, nem por sync, nem à
-- mão. A tela mostraria "Aguardando integração" para sempre, com a integração
-- funcionando do outro lado.

alter table public.ecommerce_orders
  drop constraint if exists ecommerce_orders_platform_check;

alter table public.ecommerce_orders
  add constraint ecommerce_orders_platform_check
  check (platform in ('mercadolivre', 'amazon', 'tiktok', 'shopee', 'nuvemshop', 'payt'));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — 'payt' entra no CHECK de sku_product_mappings.platform      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A tela de Mapeamento SKU (Ops → Suprimentos → CD SP) passou a oferecer a
-- PayT no seletor. Sem esta linha, salvar o mapa é INSERT recusado.
--
-- ⚠️ Lembrete do que já está escrito no CLAUDE.md: mapa com `platform = null`
-- vale para TODAS as plataformas, e a PayT vende os MESMOS SKUs da loja
-- própria (`124`, `120`). Na prática ela provavelmente não precisa de mapa
-- próprio — o mapa "todas" já a cobre. Cadastrar um específico só faz sentido
-- se o SKU do checkout dela for diferente.

alter table public.sku_product_mappings
  drop constraint if exists sku_platform_valida;

alter table public.sku_product_mappings
  add constraint sku_platform_valida
  check (platform is null
         or platform in ('mercadolivre','amazon','tiktok','shopee','nuvemshop','payt'));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2b — 'payt' entra no CHECK de carbo_canal_estoque.platform     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- É o TERCEIRO CHECK com a mesma lista de plataformas escrita à mão. Não há
-- linha da PayT aqui (ver BLOCO 3.1) e nem deve haver hoje — mas o CHECK é o
-- que decidiria, no dia em que alguém for ligar a dedução, se o INSERT passa
-- ou se ele é recusado sem que ninguém entenda por quê. A porta se abre agora,
-- com o resto; a decisão de entrar continua sendo humana.

alter table public.carbo_canal_estoque
  drop constraint if exists carbo_canal_estoque_platform_check;

alter table public.carbo_canal_estoque
  add constraint carbo_canal_estoque_platform_check
  check (platform in ('mercadolivre','amazon','tiktok','shopee','nuvemshop','payt'));


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o que esta migração NÃO faz, de propósito                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- 1. NÃO cria linha em `carbo_canal_estoque`. Enquanto ela não existir, venda
--    da PayT não deduz estoque — que é o estado seguro. Ligar a dedução exige
--    duas decisões humanas que ninguém tomou ainda: de QUAL galpão sai, e o
--    MARCO ZERO (`deduz_a_partir_de`). Nulo não deduz nem com `ativo = true`,
--    e é isso que impede a primeira rodada de baixar todo o histórico de uma
--    vez — foi assim que a Nuvemshop quase foi a −1.319.
--
-- 2. NÃO mexe em `trg_ecommerce_numero_da_loja`. O gatilho preenche
--    `platform_order_number` para ML, Amazon e Shopee, e é ele que faz o card
--    andar na esteira. A PayT só entra ali quando se souber que o Bling grava
--    o mesmo número em `numero_loja` para essa loja — preencher com um valor
--    ERRADO é pior que deixar nulo: o pedido pareceria ligado à plataforma e
--    nunca casaria. Mesma decisão já tomada para a Nuvemshop.
--
-- 3. NÃO cadastra taxa de comissão. `PLATFORM_FEE_DEFAULT.payt` é `null` no
--    front (= NÃO MEDIDA) e a tela diz "taxa não cadastrada" em vez de
--    imprimir um chute com duas casas decimais. A taxa real entra pelo cartão
--    "Comissão da Plataforma", com a data a partir da qual vale.
--
-- 4. `ecommerce_pedido_raiz` NÃO precisa de mudança: o `else split_part(...)`
--    já corta no primeiro hífen, que é a regra de todas as plataformas menos a
--    Amazon. Se um dia o número de pedido da PayT tiver hífen próprio, é AQUI
--    que se conserta — e no `pedidoRaiz()` de `useDashEcommerce.ts` junto.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os dois CHECKs aceitam 'payt'? Pergunte ao BANCO, não à migração que
--     criou a tabela — já houve afirmação errada por ler a definição de
--     nascimento em vez de pg_get_constraintdef.
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conname in ('ecommerce_orders_platform_check', 'sku_platform_valida',
                  'carbo_canal_estoque_platform_check');

-- (b) O que existe hoje por plataforma. A PayT deve aparecer com 0 linhas até
--     a primeira venda — 0 linhas é o estado esperado, não uma falha.
select platform, count(*) as linhas, min(ordered_at) as primeira, max(ordered_at) as ultima
from public.ecommerce_orders
group by platform
order by platform;

-- (c) A PayT NÃO deduz estoque enquanto não houver linha aqui (ver BLOCO 3.1).
select platform, warehouse_code, ativo, deduz_a_partir_de
from public.carbo_canal_estoque
order by platform;
