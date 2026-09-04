-- ═══════════════════════════════════════════════════════════════════════════
-- A esteira aprende a ler cancelamento DA LOJA — e o carimbo continua vencendo
--
-- ── O sintoma ────────────────────────────────────────────────────────────
--
-- Tres pedidos parados em "Confirmado" ha 15-16 dias, Atendidos no Bling e sem
-- NF. Dois deles (Anderson Liska 477, Tatiane Carbo 478, R$ 1.047 cada) estao
-- `cancelled` na Nuvemshop desde 19/08 e a esteira nao sabia.
--
-- ── A causa ──────────────────────────────────────────────────────────────
--
-- O CTE `plataforma` so exportava `avanco`, e `avanco` e uma escada que SO
-- SOBE:  delivered 3 · shipped 2 · paid 1 · qualquer outra coisa 0.
--
-- `cancelled` cai no mesmo 0 de `pending`. Sao indistinguiveis. E o CASE so
-- sabia cancelar por `situacao_id = 12` (cancelado no BLING) ou por NF
-- invalida — nenhum dos dois acontece quando quem cancela e a LOJA.
--
-- Resultado: card sem saida, igual ao 32BXNEP. Nada o tira de la.
--
-- ── A regra, e por que a POSICAO dela no CASE e a decisao inteira ────────
--
-- Medido em 04/09, na esteira: 3 pedidos cancelados na loja JA ANDARAM
-- fisicamente — 2 entregues e 1 em transito. Uma regra simples ("cancelou na
-- loja ⇒ card cancelado") apagaria uma entrega que aconteceu.
--
-- Por isso a condicao entra DEPOIS de `entregue` e `em_transito`:
--
--     situacao 12 / NF invalida  → cancelado
--     entregue  (carimbo)        → entregue      ← 2 sobrevivem aqui
--     em transito (carimbo)      → em_transito   ← 1 sobrevive aqui
--     loja cancelou              → cancelado     ← NOVO, move 5 cards
--     etiqueta / NF / confirmado → como antes
--
-- E a mesma licao da etiqueta morta (20260947): postagem e fato, e nao deixa
-- de ser verdade porque cancelaram depois.
--
-- ⚠️ A lista de cancelamento e EXPLICITA. `not ecommerce_status_e_venda(...)`
-- pareceria mais limpo e esta ERRADO: aquela funcao devolve false tambem para
-- `pending`, e a regra marcaria como cancelado todo pedido ainda nao pago.
-- Medido: o vocabulario e uma palavra so (`cancelled`) nas cinco plataformas;
-- `refunded`/`voided`/`estornado` entram como rede para o proximo canal.
--
-- ⚠️ O que esta migracao NAO conserta: o pedido 480 (Miramon) continua `paid`
-- na Nuvemshop. Ele foi comprado por fora e esta a caminho, mas ninguem
-- cancelou na loja — o sistema nao tem como saber. E o caso "premissa, nao
-- dado". Cancelar la e o que o tira daqui.
--
-- ⚠️ Esta migracao MOVE CARD, entao o BLOCO 1 grava `ignorado` em
-- `carbo_msg_envios` ANTES de republicar a view. Aqui o card sai de uma etapa
-- com template e vai para `cancelado`, que nao tem — o risco e a JANELA entre
-- os dois blocos, em que o `whatsapp-meta-1min` pode disparar.
--
-- ⚠️ `security_invoker = true` REPETIDO. ⚠️ MESMAS colunas, MESMA ORDEM.
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — quais cards vao se mover, um a um                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ Espera-se 5 linhas: 2 `confirmado`, 2 `nf_emitida`, 1 `etiqueta`.
--       NENHUMA `entregue` ou `em_transito` — se aparecer alguma, a condicao
--       ficou na posicao errada e a entrega seria apagada. PARE.
select e.bling_id, e.pedido_loja, e.cliente, e.canal, e.etapa, e.total, e.data_pedido
from public.bling2_esteira e
join lateral (
  select o.status from public.ecommerce_orders o
  where o.platform_order_number = e.pedido_loja
  order by o.ordered_at desc limit 1
) o on true
where e.etapa not in ('cancelado', 'entregue', 'em_transito')
  and (lower(o.status) like 'cancel%' or lower(o.status) in ('refunded','voided','estornado'))
order by e.data_pedido;

-- (0.b) As colunas de `carbo_msg_envios`, para o BLOCO 1 nao errar o nome.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'carbo_msg_envios'
order by ordinal_position;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — trancar a mensagem ANTES de mover o card                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Estes cards vao para `cancelado`, que nao tem template — depois de mover,
-- nenhum deles volta a fila. O que este bloco protege e a JANELA: o
-- `whatsapp-meta-1min` roda a cada minuto, e entre ler isto e rodar o BLOCO 2
-- ele pode disparar "nota fiscal emitida" para um pedido que a loja cancelou.
--
-- `on conflict do nothing`: envio real ja registrado NAO e sobrescrito.

insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, x.etapa, 'ignorado',
       'cancelado na loja (20260977)', now()
from public.bling2_esteira e
join lateral (
  select o.status from public.ecommerce_orders o
  where o.platform_order_number = e.pedido_loja
  order by o.ordered_at desc limit 1
) o on true
cross join (values ('confirmado'), ('nf_emitida'), ('etiqueta'),
                   ('em_transito'), ('saiu_entrega'), ('entregue')) as x(etapa)
where e.etapa not in ('cancelado', 'entregue', 'em_transito')
  and (lower(o.status) like 'cancel%' or lower(o.status) in ('refunded','voided','estornado'))
on conflict (bling_id, etapa) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view                                                      ║
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
    -- ⚠️ Ela NÃO filtra nada aqui: quem filtra é a tela. A `carbo_msg_fila` lê
    -- esta view e continua vendo todos os pedidos, então nenhum cliente deixa
    -- de ser avisado por causa desta migração.
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
  WHERE bo.situacao_id = ANY (ARRAY[9::bigint, 12::bigint]);

comment on view public.bling2_esteira is
  'Cards da Esteira do On-line. A etapa le CARIMBO: postagem e entrega sao fato e nao deixam de ser verdade porque cancelaram depois — por isso `cancelado_na_loja` entra no CASE DEPOIS de entregue e em_transito (medido em 04/09: 2 entregues e 1 em transito estao cancelados na Nuvemshop). A lista de cancelamento e explicita, nunca `not ecommerce_status_e_venda`, que tambem e false para `pending`. `canal` tem excecao para a PayT (loja_id 0, distinguida pelo `numero_loja` PAYT_<seller>_<transacao>); o conserto definitivo e criar uma loja PayT no Bling. `e_online` diz se veio de canal on-line — a TELA filtra por ela, a view NAO, porque `carbo_msg_fila` le daqui e tirar venda direta do where pararia o WhatsApp desses clientes em silencio; `coalesce(numero_loja, \'\')` e obrigatorio ali, porque venda direta tem numero_loja null e `null like` da NULL. security_invoker = true — repita a clausula em toda republicacao.';

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferencia                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) ⭐ Os cinco sairam de "Confirmado"/"NF emitida"/"Etiqueta".
--       Anderson (477) e Tatiane (478) tem de aparecer como `cancelado`.
--       ⚠️ Miramon (480) tem de continuar `confirmado`: a loja diz `paid`.
select pedido_loja, cliente, canal, etapa, total, data_pedido
from public.bling2_esteira
where pedido_loja in ('477', '478', '480')
order by pedido_loja;

-- (3.b) ⭐ A prova de que o carimbo venceu: nenhum pedido cancelado na loja
--       perdeu a entrega. Tem de continuar mostrando 2 `entregue` e
--       1 `em_transito`.
select e.etapa, count(*) as cancelados_na_loja
from public.bling2_esteira e
join lateral (
  select o.status from public.ecommerce_orders o
  where o.platform_order_number = e.pedido_loja
  order by o.ordered_at desc limit 1
) o on true
where lower(o.status) like 'cancel%' or lower(o.status) in ('refunded','voided','estornado')
group by 1 order by 2 desc;

-- (3.c) ⚠️ NENHUM pedido `pending` virou cancelado. Tem de vir ZERO — era o
--       que aconteceria com `not ecommerce_status_e_venda(...)`.
select count(*) as pendente_marcado_cancelado
from public.bling2_esteira e
join lateral (
  select o.status from public.ecommerce_orders o
  where o.platform_order_number = e.pedido_loja
  order by o.ordered_at desc limit 1
) o on true
where e.etapa = 'cancelado'
  and lower(o.status) = 'pending';

-- (3.d) A view nao perdeu o `security_invoker`.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (3.e) `e_online` continua sem NULL (a armadilha da 20260976).
select count(*) as e_online_nulo from public.bling2_esteira where e_online is null;

-- (3.f) A fila nao ganhou nada de surpresa.
select count(*) as na_fila from public.carbo_msg_fila;
