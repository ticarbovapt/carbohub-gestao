-- ═══════════════════════════════════════════════════════════════════════════
-- O destravamento da recompra — em LOTES, e com o passado liberado de propósito
--
-- Pedido do dono do processo em 02/10/2026: *"temos que finalizar tudo e depois
-- destravar para enviar as mensagens, para não enviar mensagem antes de
-- finalizarmos tudo do sistema"*, e *"temos aqui 361 clientes que vão receber
-- essa mensagem"*.
--
-- ── ⚠️ NÃO são 361, e a diferença É o plano ──────────────────────────────
--
--   361  o que está na coluna "Hora de ofertar" da Esteira
--   268  quem tem TELEFONE e ainda não recebeu — os ~93 que faltam são o
--        "91 sem telefone" do cabeçalho da própria Esteira, quase todo ML,
--        que anonimiza o contato do comprador
--     0  o que sairia HOJE se alguém ligasse `recompra.ativo`
--
-- Esse zero é o marco zero de 21/09 (`carbo_msg_config.inicio_em`, posto pela
-- `20261016` para a fila travada não disparar de uma vez): a régua conta 30
-- dias DA ENTREGA, e as 268 entregas são de 30/06 a 02/09 — todas anteriores.
--
-- ⚠️ Ou seja: ligar o `ativo` sozinho NÃO MANDA NADA, e a tela diria "ligado"
-- com a fila vazia. Sem esta migração, os 268 nunca recebem — o marco zero os
-- exclui para sempre. Isso foi HERDADO de uma correção de emergência, nunca
-- decidido.
--
-- ── Por que LOTE, e não "liberar tudo" ───────────────────────────────────
--
-- ⚠️ O CarboZé Clube (`1274076859132981`) é um número NOVO na Meta. Número novo
-- começa num patamar baixo de conversas iniciadas por dia, e o patamar sobe com
-- a QUALIDADE. Estrear com 268 ofertas é a pior forma de começar: ou bate no
-- teto, ou uma fração marca como spam e a qualidade cai antes de o número ter
-- qualquer histórico — e aí o canal nasce morto.
--
-- É a mesma família das travas da pipeline de carrinho, que já estão escritas:
-- marco zero por DATA, e o relógio de cada passo começando no passo anterior.
-- Nenhuma delas existe por medo de laço; existem porque desfazê-las manda
-- WhatsApp para quem não pediu.
--
-- ⚠️ RODE EM BLOCOS. Nada aqui ENVIA: o `ativo` da recompra continua `false`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Uma de cada vez.                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os três números do plano, numa consulta só. ⚠️ `na_coluna` é o que a
--     Esteira mostra; `alcancaveis` é quem tem telefone e ainda não recebeu;
--     `sairiam_hoje` é o que o marco zero deixa passar. Planejar pelo primeiro
--     é planejar por um número que não vai acontecer.
-- with cfgmsg as (select inicio_em from public.carbo_msg_config where id)
-- select (select inicio_em from cfgmsg) as marco_zero,
--        count(*) as na_coluna,
--        count(*) filter (
--          where nullif(btrim(coalesce(p.cliente_fone,'')),'') is not null
--            and not exists (select 1 from public.carbo_msg_envios v
--                            where v.bling_id = p.bling_id and v.etapa = 'recompra'
--                              and v.status <> 'pendente')) as alcancaveis,
--        count(*) filter (
--          where nullif(btrim(coalesce(p.cliente_fone,'')),'') is not null
--            and p.entregue_em::date >= (select inicio_em from cfgmsg)
--            and not exists (select 1 from public.carbo_msg_envios v
--                            where v.bling_id = p.bling_id and v.etapa = 'recompra'
--                              and v.status <> 'pendente')) as sairiam_hoje
-- from public.carbo_recompra_pipeline p
-- where p.coluna = 'ofertar';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o teto e a liberação, por ETAPA                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Moram em `carbo_msg_templates`, junto de `canal_envio`, `instancia` e
-- `numero_id`. A etapa já é dona de por onde sai e por qual número; ser dona de
-- QUANTO POR DIA é a mesma pergunta. Tabela nova seria mais um lugar para
-- procurar quando alguém perguntar "por que não saiu?".

alter table public.carbo_msg_templates
  add column if not exists teto_diario int;

alter table public.carbo_msg_templates
  add column if not exists liberar_anteriores boolean not null default false;

comment on column public.carbo_msg_templates.teto_diario is
  'Maximo de mensagens desta etapa por dia (hora de Brasilia). NULL = sem teto, que e o comportamento das seis da esteira: aviso de servico nao se racionada, porque segurar um "saiu para entrega" e pior que manda-lo. O teto existe para o COMERCIAL, onde o volume e uma decisao e nao uma consequencia.';

comment on column public.carbo_msg_templates.liberar_anteriores is
  'Deixa esta etapa alcancar o que e ANTERIOR ao marco zero (carbo_msg_config.inicio_em). ⚠️ NASCE FALSE e e o unico jeito de os 268 da recompra receberem: o marco zero de 21/09 foi posto pela 20261016 para uma fila travada nao disparar de uma vez, e o efeito colateral e excluir para sempre quem foi entregue antes. Ligar isto SEM teto_diario e estrear um numero novo com um disparo em massa.';

-- A recompra nasce com teto e SEM liberação. ⚠️ 40/dia num número novo: 268
-- em ~7 dias, o que dá tempo de a qualidade do número se formar e de alguém
-- olhar as respostas antes do lote seguinte. O número é editável; o que não é
-- opcional é EXISTIR um.
update public.carbo_msg_templates
   set teto_diario = 40
 where etapa = 'recompra' and teto_diario is null;

-- Os três do carrinho também, pelo mesmo motivo — e o número é menor porque a
-- janela deles é de minutos/horas, não de 30 dias: um pico de abandono não pode
-- virar rajada.
update public.carbo_msg_templates
   set teto_diario = 60
 where etapa in ('carrinho_1','carrinho_2','carrinho_3') and teto_diario is null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila passa a RESPEITAR o teto e a liberação               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Escrita a partir do `pg_get_viewdef`, e com `security_invoker = true`
-- repetido — `create or replace view` sem `with` APAGA as reloptions.
--
-- ⚠️ `numero_id` continua sendo a ULTIMA coluna: coluna nova no meio da
-- `42P16 cannot change name of view column`.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
 WITH cfg AS (
         SELECT carbo_carrinho_config.minutos_1, carbo_carrinho_config.horas_2,
            carbo_carrinho_config.horas_3, carbo_carrinho_config.valor_minimo,
            carbo_carrinho_config.inicio_em
           FROM carbo_carrinho_config
          WHERE carbo_carrinho_config.id
        ), cfgmsg AS (
         SELECT carbo_msg_config.inicio_em
           FROM carbo_msg_config
          WHERE carbo_msg_config.id
        ),
        -- ⚠️ Quais etapas podem alcancar o passado. Sai do CADASTRO, nao de uma
        -- lista aqui: etapa nova nao precisa de deploy para entrar.
        libera AS (
         SELECT t.etapa
           FROM carbo_msg_templates t
          WHERE t.liberar_anteriores
        ),
        -- ⚠️ Quanto JA SAIU hoje, por etapa, em hora de BRASILIA. `date_trunc`
        -- em UTC viraria o dia as 21h e o lote da noite contaria no dia
        -- seguinte — a armadilha de fuso do `ordered_at::date`.
        hoje AS (
         SELECT v.etapa, count(*) AS n
           FROM carbo_msg_envios v
          WHERE v.status = ANY (ARRAY['enviado'::text, 'entregue'::text, 'lido'::text])
            AND v.enviado_em >= date_trunc('day'::text, timezone('America/Sao_Paulo'::text, now()))
          GROUP BY v.etapa
        ), base AS (
         SELECT e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja,
            e.pedido_numero, e.pedido_codigo, e.canal, e.total, e.nf_numero,
            e.nf_pdf, e.transportadora, e.servico, e.rastreio,
            e.entrega_cidade, e.entrega_uf,
            NULL::text AS link_carrinho, NULL::text AS produtos,
            e.rastreio_transportadora,
            e.me_situacao = 'cancelado'::text AS etiqueta_cancelada,
            e.data_pedido::timestamptz AS ordem_fila
           FROM bling2_esteira e
          WHERE e.etapa <> 'cancelado'::text AND e.data_pedido >= (( SELECT cfgmsg.inicio_em FROM cfgmsg))
        UNION ALL
         SELECT e.bling_id, 'saiu_entrega'::text, e.cliente_fone, e.cliente,
            e.pedido_loja, e.pedido_numero, e.pedido_codigo, e.canal, e.total,
            e.nf_numero, e.nf_pdf, e.transportadora, e.servico, e.rastreio,
            e.entrega_cidade, e.entrega_uf,
            NULL::text AS text, NULL::text AS text,
            e.rastreio_transportadora, false, e.data_pedido::timestamptz
           FROM bling2_esteira e
             JOIN rastreio_card r_1 ON r_1.codigo = e.rastreio
          WHERE r_1.status = 'saiu_entrega'::text AND r_1.entregue_em IS NULL
            AND e.etapa <> 'cancelado'::text
            AND e.data_pedido >= (( SELECT cfgmsg.inicio_em FROM cfgmsg))
        UNION ALL
         -- ⚠️ AQUI MORA A LIBERACAO. Sem `liberar_anteriores`, a condicao e a
         -- mesma de antes e nada muda. Com ela, a entrega ANTERIOR ao marco
         -- zero passa a ser candidata — e o teto do BLOCO 2 e o que impede que
         -- isso vire um disparo de 268 de uma vez.
         SELECT p.bling_id, 'recompra'::text, p.cliente_fone, p.cliente,
            p.pedido_loja, NULL::text AS text, NULL::text AS text, p.canal,
            p.total, NULL::text AS text, NULL::text AS text, NULL::text AS text,
            NULL::text AS text, NULL::text AS text, p.entrega_cidade,
            p.entrega_uf, NULL::text AS text, NULL::text AS text,
            NULL::text AS text, false, p.entregue_em::timestamptz
           FROM carbo_recompra_pipeline p
          WHERE p.coluna = 'ofertar'::text
            AND (p.entregue_em::date >= (( SELECT cfgmsg.inicio_em FROM cfgmsg))
                 OR EXISTS ( SELECT 1 FROM libera l WHERE l.etapa = 'recompra'::text))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_1'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false,
            c.abandonado_em::timestamptz
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'aberto'::text
            AND now() >= (c.abandonado_em + (((( SELECT cfg.minutos_1 FROM cfg)) || ' minutes'::text)::interval))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_2'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false,
            p.msg1_em::timestamptz
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'msg1'::text
            AND now() >= (p.msg1_em + (((( SELECT cfg.horas_2 FROM cfg)) || ' hours'::text)::interval))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_3'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false,
            p.msg2_em::timestamptz
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'msg2'::text
            AND now() >= (p.msg2_em + (((( SELECT cfg.horas_3 FROM cfg)) || ' hours'::text)::interval))
        ), elegivel AS (
 SELECT b.bling_id, b.etapa, t.titulo, t.texto, t.atraso_min,
    b.cliente_fone AS telefone, b.cliente AS nome,
    split_part(TRIM(BOTH FROM b.cliente), ' '::text, 1) AS primeiro_nome,
    COALESCE(b.pedido_codigo, b.pedido_loja, b.pedido_numero, ''::text) AS pedido,
    b.canal, b.total::numeric(12,2) AS valor, b.nf_numero AS nf,
    b.nf_pdf AS link_nota, b.transportadora, b.servico, b.rastreio,
    b.entrega_cidade AS cidade, b.entrega_uf AS uf,
    r.url_rastreio AS link_rastreio, r.previsao_entrega AS previsao,
    t.instancia, b.link_carrinho, b.produtos,
        CASE
            WHEN b.etapa = ANY (ARRAY['carrinho_1'::text, 'carrinho_2'::text, 'carrinho_3'::text, 'recompra'::text]) THEN 1
            ELSE 0
        END AS prioridade,
    t.canal_envio, t.meta_template_nome, t.meta_idioma, t.meta_variaveis,
    t.meta_botao_url_de, t.meta_status, b.rastreio_transportadora,
    b.pedido_codigo,
    COALESCE(t.numero_id, '1255756280958635'::text) AS numero_id,
    t.teto_diario,
    COALESCE(h.n, 0::bigint) AS ja_hoje,
    -- ⚠️ A ORDEM do lote e o MAIS ANTIGO primeiro, e isso nao e detalhe: quem
    -- foi entregue ha mais tempo e quem esta mais perto de nao voltar nunca.
    -- Ordem acidental faria o lote de hoje e o de amanha se sobreporem de um
    -- jeito que ninguem consegue conferir.
    row_number() OVER (PARTITION BY b.etapa ORDER BY b.ordem_fila, b.bling_id) AS posicao
   FROM base b
     JOIN carbo_msg_templates t ON t.etapa = b.etapa AND t.ativo
     LEFT JOIN rastreio_card r ON r.codigo = b.rastreio
     LEFT JOIN carbo_wa_numeros n ON n.phone_number_id = t.numero_id
     LEFT JOIN hoje h ON h.etapa = b.etapa
  WHERE NOT (EXISTS ( SELECT 1
           FROM carbo_msg_envios v
          WHERE v.bling_id = b.bling_id AND v.etapa = b.etapa AND v.status <> 'pendente'::text))
    AND NULLIF(TRIM(BOTH FROM COALESCE(b.cliente_fone, ''::text)), ''::text) IS NOT NULL
    AND (t.canal_envio <> 'meta'::text OR t.meta_status = 'APPROVED'::text)
    AND NOT (b.etapa = 'em_transito'::text AND b.etiqueta_cancelada)
    AND (t.canal_envio <> 'meta'::text OR t.numero_id IS NULL OR n.ativo)
)
 SELECT bling_id, etapa, titulo, texto, atraso_min, telefone, nome,
    primeiro_nome, pedido, canal, valor, nf, link_nota, transportadora,
    servico, rastreio, cidade, uf, link_rastreio, previsao, instancia,
    link_carrinho, produtos, prioridade, canal_envio, meta_template_nome,
    meta_idioma, meta_variaveis, meta_botao_url_de, meta_status,
    rastreio_transportadora, pedido_codigo, numero_id
   FROM elegivel
  -- ⚠️ O TETO. `teto_diario` nulo = sem teto, que e o caso das seis da esteira:
  -- aviso de servico nao se raciona, porque segurar um "saiu para entrega" e
  -- pior que manda-lo.
  WHERE teto_diario IS NULL OR posicao <= (teto_diario - ja_hoje);

grant select on public.carbo_msg_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Uma de cada vez. NADA foi enviado.             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A fila NÃO PODE TER MUDADO: `recompra` continua `ativo = false`, e as
--     seis da esteira não têm teto. Qualquer diferença aqui significa que o
--     teto pegou quem não devia.
-- select etapa, count(*) from public.carbo_msg_fila group by etapa order by 1;

-- (b) O cadastro do lote. ESPERADO: recompra com teto 40 e
--     `liberar_anteriores = false`; os três do carrinho com 60.
-- select etapa, ativo, canal_envio, numero_id, teto_diario, liberar_anteriores
-- from public.carbo_msg_templates order by etapa;

-- (c) ⚠️ O ENSAIO do lote, SEM ligar nada. Responde "quantos sairiam no
--     primeiro dia, e quem são" — e é isto que se olha antes do 3e.
-- with cfgmsg as (select inicio_em from public.carbo_msg_config where id)
-- select p.cliente, p.cliente_fone, p.entregue_em::date as entregue,
--        p.total, p.canal
-- from public.carbo_recompra_pipeline p
-- where p.coluna = 'ofertar'
--   and nullif(btrim(coalesce(p.cliente_fone,'')),'') is not null
--   and not exists (select 1 from public.carbo_msg_envios v
--                   where v.bling_id = p.bling_id and v.etapa = 'recompra'
--                     and v.status <> 'pendente')
-- order by p.entregue_em
-- limit 40;
