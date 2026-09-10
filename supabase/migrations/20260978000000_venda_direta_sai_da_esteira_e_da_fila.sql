-- ═══════════════════════════════════════════════════════════════════════════
-- Venda direta sai da esteira DE VERDADE — e para de receber WhatsApp
--
-- ── A decisao, e a minha que ela corrige ────────────────────────────────
--
-- A 20260976 tirou a venda direta da TELA e deixou a `carbo_msg_fila` intacta,
-- de propriedade minha: separei "sumir da tela" de "parar de avisar o cliente"
-- e escolhi so a primeira, sem perguntar.
--
-- O dono do processo decidiu as duas, em 04/09, e lembrou que ja tinha dito
-- isso antes: "não é para ir para esteira essas vendas diretas, logo, não
-- devem receber whatsapp".
--
-- A Esteira do On-line e o painel do comercio eletronico. Pedido que nao veio
-- de canal on-line nao pertence a ela, e um cliente de balcao recebendo
-- "saiu para entrega" automatico e a mesma coisa vista do outro lado.
--
-- ── O que muda ──────────────────────────────────────────────────────────
--
-- A expressao que ja existia na coluna `e_online` passa a valer tambem no
-- WHERE. Uma expressao so, dois lugares, e nao ha como divergirem: a coluna
-- vira sempre `true` a partir daqui.
--
-- ⚠️ `carbo_msg_fila` le desta view. Tirar a linha do WHERE a tira da fila —
-- e ESSE e o objetivo, ao contrario da 20260976, onde teria sido acidente.
--
-- ⚠️ A PayT FICA. Ela e on-line e so cai na loja 0 por pendencia de cadastro
-- no Bling; o que a distingue de uma venda de balcao e o `numero_loja`.
-- Criar uma loja "PayT" no Bling torna esta excecao redundante.
--
-- ⚠️ A coluna `e_online` NAO e removida. O hook dos tres apps filtra por ela
-- e `create or replace` nao remove coluna — sairia so derrubando a view, o que
-- levaria junto as permissoes e as views dependentes.
--
-- ⚠️ Aqui NAO se aplica o "grave `ignorado` antes de republicar": aquela regra
-- protege card que ENTRA numa etapa com template. Estes SAEM da view, entao
-- nao ha etapa nova para disparar — e o que este bloco faz e justamente parar
-- de mandar.
--
-- ⚠️ `security_invoker = true` REPETIDO. ⚠️ MESMAS colunas, MESMA ORDEM.
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — quem sai da esteira e da fila, e o que ja recebeu           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ As linhas que vao desaparecer da view. Espera-se so
--       `Venda direta (sem canal)` — NENHUM Nuvemshop, ML, Amazon, Shopee ou
--       PayT. Se aparecer qualquer um desses, PARE: a expressao esta errada e
--       o pedido sumiria da esteira E da fila de WhatsApp.
select pedido_loja, canal, cliente, etapa, total, data_pedido
from public.bling2_esteira
where e_online = false
order by data_pedido desc;

-- (0.b) O tamanho da fila ANTES. Anote: o BLOCO 2 compara com este numero.
select count(*) as na_fila_antes from public.carbo_msg_fila;

-- (0.c) ⭐ Quais desses estao na fila AGORA, ou seja, o que deixa de ser
--       enviado. Este e o efeito pretendido, nao um dano colateral.
select f.bling_id, e.cliente, e.canal, f.etapa
from public.carbo_msg_fila f
join public.bling2_esteira e on e.bling_id = f.bling_id
where e.e_online = false;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view                                                      ║
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
            max(ecommerce_orders.cliente_email) AS cliente_email,
            -- ⭐ 20260977: o status CRU, para a esteira enxergar cancelamento.
            -- `avanco` e uma escada que so SOBE (delivered 3 / shipped 2 /
            -- paid 1 / resto 0), entao `cancelled` cai no mesmo 0 de
            -- `pending` — indistinguiveis. Sem esta coluna, pedido cancelado
            -- na loja fica em "Confirmado" PARA SEMPRE, sem saida.
            -- ⚠️ `bool_and`, NUNCA `bool_or`. A tabela tem uma linha por ITEM,
            -- e um item cancelado dentro de um pedido pago cancelaria o card
            -- inteiro — a mesma armadilha que ja custou R$ 418,60 num pedido
            -- de R$ 269,10 na PayT. Pedido cancelado e quando TODAS as linhas
            -- cairam; cancelamento parcial nao e cancelamento.
            bool_and(lower(ecommerce_orders.status) LIKE 'cancel%'
                  OR lower(ecommerce_orders.status) IN ('refunded', 'voided', 'estornado'))
              AS cancelado_na_loja
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
        WHEN COALESCE(bo.numero_loja, ''::text) LIKE 'PAYT!_%' ESCAPE '!' THEN 'PayT'::text
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
            -- ⭐ 20260977: a loja cancelou, e nada saiu fisicamente daqui.
            -- ⚠️ A POSICAO e a regra. Ela vem DEPOIS de `entregue` e
            -- `em_transito` de proposito: carimbo de postagem e de entrega e
            -- FATO, e nao deixa de ser verdade porque cancelaram depois —
            -- a mesma licao ja paga na etiqueta morta (20260947). Medido em
            -- 04/09: 2 pedidos entregues e 1 em transito estao cancelados na
            -- Nuvemshop; subir esta linha apagaria a entrega dos tres.
            -- ⚠️ Lista EXPLICITA, nunca `not ecommerce_status_e_venda(...)`:
            -- aquela funcao devolve false tambem para `pending`, e a regra
            -- marcaria como cancelado todo pedido ainda nao pago.
            WHEN p.cancelado_na_loja THEN 'cancelado'::text
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
    -- ⚠️ 20260978: a MESMA expressao passou a valer no WHERE abaixo, entao
    -- esta coluna e sempre `true` a partir daqui. Ela fica porque o hook dos
    -- tres apps filtra por ela e `create or replace` nao remove coluna.
    -- Mudou uma, mude a outra — deixa-las diferentes traria de volta a linha
    -- que a tela esconde e a fila envia.
    -- ⚠️ `coalesce(numero_loja, '')` NAO e estilo. Medido no BLOCO 0: os tres
    -- pedidos de venda direta tem `numero_loja = null`, e `null like '...'` e
    -- NULL, nao false. `NULL or false` continua NULL, o campo chegaria NULL a
    -- tela, e o filtro `e_online !== false` MOSTRA a ausencia — ou seja, nada
    -- teria mudado, sem erro nenhum. Mesma armadilha do `= any(null)`.
    (COALESCE(bo.numero_loja, ''::text) LIKE 'PAYT!_%' ESCAPE '!'
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
  WHERE bo.situacao_id = ANY (ARRAY[9::bigint, 12::bigint])
    -- ⭐ 20260978: SO VENDA ON-LINE. A mesma expressao da coluna `e_online`,
    -- agora tambem no WHERE — decidido pelo dono do processo em 04/09:
    -- "não é para ir para esteira essas vendas diretas, logo, não devem
    -- receber whatsapp".
    -- ⚠️ Isto NAO e so cosmetica de tela: `carbo_msg_fila` le desta view, entao
    -- a linha some tambem da fila e o cliente de balcao deixa de receber
    -- "nota fiscal emitida" e "saiu para entrega". E o efeito PRETENDIDO.
    -- ⚠️ A coluna `e_online` continua existindo e agora e sempre `true`. Ela
    -- fica porque o hook dos tres apps filtra por ela (`e_online !== false`) e
    -- porque `create or replace` nao remove coluna sem derrubar a view.
    AND (COALESCE(bo.numero_loja, ''::text) LIKE 'PAYT!_%' ESCAPE '!'
         OR (COALESCE(bo.loja_id, 0) <> 0 AND NOT COALESCE(l.ignorar, false)));

comment on view public.bling2_esteira is
  'Cards da Esteira do On-line. SO VENDA ON-LINE: o WHERE exige loja != 0 e nao ignorada, com excecao da PayT, que e on-line e chega com loja_id = 0 (distinguida pelo numero_loja PAYT_<seller>_<transacao>; o conserto definitivo e criar uma loja PayT no Bling). ⚠️ `carbo_msg_fila` le desta view, entao venda direta tambem NAO recebe WhatsApp — decidido pelo dono do processo em 04/09, e as duas coisas andam juntas de proposito. A etapa le CARIMBO: postagem e entrega sao fato e nao deixam de ser verdade porque cancelaram depois, por isso `cancelado_na_loja` entra no CASE DEPOIS de entregue e em_transito. A lista de cancelamento e explicita, nunca `not ecommerce_status_e_venda`, que tambem e false para `pending`; e `bool_and`, nunca `bool_or`, porque a tabela tem uma linha por item. `e_online` continua na saida (sempre true agora) porque o hook dos tres apps filtra por ela. security_invoker = true — repita a clausula em toda republicacao.';

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferencia                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) ⭐ Nao existe mais venda direta na esteira. Tem de vir ZERO linhas.
select count(*) as venda_direta_na_esteira
from public.bling2_esteira where e_online = false;

-- (2.b) ⭐ Os canais que sobraram, com a contagem. Nuvemshop, Mercado Livre,
--       Amazon, Shopee e PayT — e nada mais.
select canal, count(*) as pedidos
from public.bling2_esteira group by 1 order by 2 desc;

-- (2.c) ⚠️ A PayT NAO foi levada junto. Tem de continuar com os 3.
select pedido_loja, canal, etapa, total
from public.bling2_esteira where canal = 'PayT' order by pedido_loja;

-- (2.d) A fila DEPOIS. Comparada com o `na_fila_antes` do 0.b, a diferenca tem
--       de ser exatamente o numero de linhas do 0.c — nem uma a mais.
select count(*) as na_fila_depois from public.carbo_msg_fila;

-- (2.e) A view nao perdeu o `security_invoker` na republicacao.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (2.f) O cancelamento da loja (20260977) continua valendo: 477 e 478
--       cancelados, e os entregues/em transito preservados.
select pedido_loja, cliente, etapa from public.bling2_esteira
where pedido_loja in ('477', '478', '480') order by pedido_loja;
