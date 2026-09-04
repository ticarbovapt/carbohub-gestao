-- ═══════════════════════════════════════════════════════════════════════════
-- A Esteira do On-line passa a saber quem é on-line — e a PayT ganha nome
--
-- ── Dois sintomas, uma raiz ──────────────────────────────────────────────
--
-- Na coluna "Sem etiqueta" apareciam:
--
--   • pedidos da PayT rotulados "Venda direta (sem canal)"
--   • CERAMICA CITY LTDA, que é venda de balcão e não vem de canal nenhum
--
-- A raiz é a mesma: a `bling2_esteira` termina em `where bo.situacao_id in
-- (9,12)` e **não filtra canal**. Todo pedido do Bling 2 entra, inclusive o que
-- nunca passou por loja on-line.
--
-- E a loja `0` está cadastrada em `bling2_lojas` com o nome
-- `'Venda direta (sem canal)'` — então a PayT, que chega ao Bling com
-- `loja_id = 0`, herda esse nome. É a pendência nº 1 da PayT, registrada no
-- CLAUDE.md desde 01/09.
--
-- ⭐ Medido em 04/09, 30 dias, loja 0: **6 pedidos — 3 são PayT e 3 são venda
-- direta de verdade**. Os outros canais têm loja própria e nome certo.
--
-- ── O que distingue a PayT de uma venda de balcão, sendo as duas loja 0 ──
--
-- O `numero_loja`. A PayT chega como `PAYT_<seller_id>_<transação>`; a venda de
-- balcão, não. Esse formato está corroborado em TRÊS pedidos reais
-- (`PK2279K`, `O96XVN9`, `ZYG6M5M`), todos `situacao_id = 9` — não é mais um
-- exemplo só, como quando a regra foi criada.
--
-- ⚠️ O conserto DEFINITIVO é operacional: criar uma loja "PayT" no Bling, para
-- ela ter `loja_id` próprio e cair na regra geral. Enquanto isso não acontece,
-- a exceção mora aqui, num lugar só, e nomeada.
--
-- ── Por que uma COLUNA e não um filtro no `where` ───────────────────────
--
-- ⚠️ `bling2_esteira` alimenta a `carbo_msg_fila`, que NÃO filtra canal. Tirar
-- a venda direta do `where` a tiraria também da fila — e o cliente de balcão
-- pararia de receber "nota fiscal emitida" e "saiu para entrega", em silêncio.
--
-- Sumir da tela e parar de avisar o cliente são decisões diferentes. Esta
-- migração faz só a primeira: acrescenta `e_online`, a TELA filtra por ela, e a
-- fila de WhatsApp continua exatamente como está. Trocar para o filtro no
-- `where` é uma linha — mas é outra decisão, e ela é do dono do processo.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem a
-- cláusula APAGA as reloptions, e foi assim que esta MESMA view passou a rodar
-- com os privilégios do dono e RLS ignorada.
--
-- ⚠️ MESMAS colunas, MESMA ORDEM, e `e_online` entra NO FIM — `create or
-- replace` só acrescenta no fim. O corpo abaixo saiu de `pg_get_viewdef` da
-- definição VIVA, não do arquivo anterior.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — quem sai da tela, e o que ele recebe hoje                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ Os pedidos de loja 0, separados. `e_online_depois = false` é quem
--       vai sumir da tela.
select bo.bling_id, bo.numero, bo.numero_loja, bo.contato_nome, bo.total,
       bo.data, bo.situacao_id,
       (bo.numero_loja like 'PAYT!_%' escape '!') as e_payt
from public.bling2_orders bo
where coalesce(bo.loja_id, 0) = 0
  and bo.situacao_id in (9, 12)
  and bo.data >= (current_date - 30)::text
order by bo.data desc;

-- (0.b) ⚠️ O QUE ELES RECEBEM HOJE por WhatsApp. Esta migração NÃO mexe nisso —
--       a consulta existe para a decisão ser tomada com o número na mão.
select e.canal, e.etapa,
       count(*)                                                        as pedidos,
       count(*) filter (where coalesce(btrim(e.cliente_fone), '') <> '') as com_telefone
from public.bling2_esteira e
where e.canal = 'Venda direta (sem canal)'
  and e.pedido_loja not like 'PAYT!_%' escape '!'
group by 1, 2
order by 3 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view: PayT ganha nome, e nasce `e_online`                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.bling2_esteira
with (security_invoker = true) as
 WITH plataforma AS (
         SELECT ecommerce_orders.platform_order_number,
            max(
                CASE lower(ecommerce_orders.status)
                    WHEN 'delivered'::text THEN 3
                    WHEN 'shipped'::text THEN 2
                    WHEN 'paid'::text THEN 1
                    ELSE 0
                END) AS avanco,
            max(ecommerce_orders.ordered_at) AS ordered_at,
            max(ecommerce_orders.cliente_fone) AS cliente_fone,
            max(ecommerce_orders.cliente_email) AS cliente_email
           FROM ecommerce_orders
          WHERE ecommerce_orders.platform_order_number IS NOT NULL
          GROUP BY ecommerce_orders.platform_order_number
        )
 SELECT bo.bling_id,
    bo.numero AS pedido_numero,
    bo.numero_loja AS pedido_loja,
    -- ⭐ A PayT chega com `loja_id = 0` e herdava o nome da loja 0
    -- ("Venda direta (sem canal)"). O `numero_loja` é o que a distingue de uma
    -- venda de balcão, que também é loja 0.
    CASE
        WHEN bo.numero_loja LIKE 'PAYT!_%' ESCAPE '!' THEN 'PayT'::text
        ELSE COALESCE(NULLIF(l.nome, ''::text), 'Canal '::text || bo.loja_id::text)
    END AS canal,
    bo.loja_id,
    bo.data::date AS data_pedido,
    bo.total,
    COALESCE(NULLIF(btrim(c.nome), ''::text), bo.contato_nome) AS cliente,
    c.cpf_cnpj AS cliente_doc,
    COALESCE(c.telefone, c.celular, p.cliente_fone) AS cliente_fone,
    NULLIF(TRIM(BOTH FROM concat_ws(', '::text, NULLIF(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'endereco'::text, ''::text), NULLIF(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'numero'::text, ''::text))), ''::text) AS entrega_endereco,
    NULLIF(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'bairro'::text, ''::text) AS entrega_bairro,
    NULLIF(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'municipio'::text, ''::text) AS entrega_cidade,
    upper("left"(COALESCE(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'uf'::text, ''::text), 2)) AS entrega_uf,
    NULLIF(regexp_replace(COALESCE(((bo.raw_detalhe -> 'transporte'::text) -> 'etiqueta'::text) ->> 'cep'::text, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) AS entrega_cep,
    nf.numero AS nf_numero,
    nf.chave_acesso AS nf_chave,
    nf.situacao AS nf_situacao,
    nf.data_emissao AS nf_data,
    nf.pdf_url AS nf_pdf,
    COALESCE(NULLIF(((bo.raw_detalhe -> 'transporte'::text) -> 'contato'::text) ->> 'nome'::text, ''::text), me.transportadora) AS transportadora,
    COALESCE(NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'servico'::text, ''::text), me.servico) AS servico,
    COALESCE(NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'codigoRastreamento'::text, ''::text), me.codigo) AS rastreio,
    (((bo.raw_detalhe -> 'transporte'::text) ->> 'quantidadeVolumes'::text)::numeric)::integer AS volumes,
    ((bo.raw_detalhe -> 'transporte'::text) ->> 'pesoBruto'::text)::numeric AS peso_kg,
    bo.items,
    o.id AS carboze_order_id,
    o.order_number AS carboze_order_number,
        CASE
            WHEN bo.situacao_id = 12 OR nf.situacao IS NOT NULL AND NOT bling2_nf_e_valida(nf.situacao) THEN 'cancelado'::text
            WHEN p.avanco >= 3 OR r.entregue_em IS NOT NULL OR me.entregue_em IS NOT NULL THEN 'entregue'::text
            WHEN p.avanco = 2 OR r.postado_em IS NOT NULL OR me.postado_em IS NOT NULL THEN 'em_transito'::text
            WHEN NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'codigoRastreamento'::text, ''::text) IS NOT NULL OR me.situacao = 'gerado'::text THEN 'etiqueta'::text
            WHEN nf.id IS NOT NULL AND bling2_nf_e_valida(nf.situacao) THEN 'nf_emitida'::text
            ELSE 'confirmado'::text
        END AS etapa,
    p.platform_order_number IS NOT NULL AS tem_status_da_plataforma,
    pc.codigo AS pedido_codigo,
        CASE
            WHEN NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'codigoRastreamento'::text, ''::text) IS NOT NULL THEN 'bling'::text
            WHEN me.codigo IS NOT NULL THEN 'melhorenvio'::text
            WHEN p.platform_order_number IS NOT NULL AND p.avanco >= 2 THEN 'plataforma'::text
            ELSE NULL::text
        END AS rastreio_origem,
    me.situacao AS me_situacao,
    me.gerado_em AS me_gerado_em,
    me.expirado_em AS me_expirado_em,
    COALESCE(NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'codigoRastreamento'::text, ''::text), mev.tracking) AS rastreio_transportadora,
    me.tem_ativo AS me_tem_ativo,
    -- ⭐ COLUNA NOVA, no fim (é a única posição que `create or replace` aceita).
    -- "Este pedido veio de canal on-line?" — a mesma regra da ponte do Bling 2
    -- (loja ≠ 0 e não ignorada), MAIS a exceção da PayT, que é on-line e chega
    -- com loja 0.
    -- ⚠️ Ela NÃO filtra nada aqui: quem filtra é a tela. A `carbo_msg_fila` lê
    -- esta view e continua vendo todos os pedidos, então nenhum cliente deixa
    -- de ser avisado por causa desta migração.
    (bo.numero_loja LIKE 'PAYT!_%' ESCAPE '!'
     OR (COALESCE(bo.loja_id, 0) <> 0 AND NOT COALESCE(l.ignorar, false))) AS e_online
   FROM bling2_orders bo
     LEFT JOIN bling2_nfe nf ON nf.bling_id = bo.nf_bling_id
     LEFT JOIN bling2_contacts c ON c.bling_id = bo.contato_id
     LEFT JOIN bling2_lojas l ON l.bling_id = bo.loja_id
     LEFT JOIN carboze_orders o ON o.external_ref = ('bling2-'::text || bo.bling_id)
     LEFT JOIN plataforma p ON p.platform_order_number = bo.numero_loja
     LEFT JOIN rastreio_envios r ON r.codigo = NULLIF((((bo.raw_detalhe -> 'transporte'::text) -> 'volumes'::text) -> 0) ->> 'codigoRastreamento'::text, ''::text)
     LEFT JOIN carbo_pedido_codigo pc ON pc.bling_id = bo.bling_id
     LEFT JOIN melhorenvio_envio_vigente me ON me.bling_id = bo.bling_id
     LEFT JOIN melhorenvio_envios mev ON mev.me_id = me.me_id
  WHERE bo.situacao_id = ANY (ARRAY[9::bigint, 12::bigint]);

comment on view public.bling2_esteira is
  'Cards da Esteira do On-line. ⚠️ `canal` tem exceção para a PayT: ela chega ao Bling com `loja_id = 0` e herdaria o nome da loja 0 ("Venda direta (sem canal)"); o que a distingue de uma venda de balcão é o `numero_loja` no formato `PAYT_<seller_id>_<transação>`. O conserto definitivo é criar uma loja "PayT" no Bling. ⚠️ `e_online` diz se o pedido veio de canal on-line — a TELA filtra por ela; a view NÃO filtra, porque `carbo_msg_fila` lê daqui e tirar venda direta do `where` pararia o WhatsApp desses clientes em silêncio. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ A PayT tem nome, e a venda direta está marcada como não-on-line.
select canal, e_online, count(*) as pedidos
from public.bling2_esteira
group by 1, 2
order by 3 desc;

-- (2.b) Os seis da loja 0, um a um: os 3 da PayT viram canal 'PayT' e
--       `e_online = true`; os 3 de balcão ficam `false`.
select pedido_loja, canal, e_online, cliente, total, data_pedido
from public.bling2_esteira
where loja_id = 0
order by data_pedido desc;

-- (2.c) A view não perdeu o `security_invoker` na republicação.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (2.d) ⚠️ A fila de WhatsApp NÃO encolheu — esta migração não mexe nela.
--       Rode antes e depois: o número tem de ser o mesmo.
select count(*) as na_fila from public.carbo_msg_fila;
