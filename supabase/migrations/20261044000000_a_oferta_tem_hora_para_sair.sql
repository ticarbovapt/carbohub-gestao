-- ═══════════════════════════════════════════════════════════════════════════
-- A oferta tem HORA para sair — e o teto diário cai
--
-- Duas coisas ditas pelo dono do processo em 02/10/2026, e a segunda é a que
-- importa:
--
--   *"meu teto está 2000 pela meta, pode disparar tudo sem problemas, tire o
--    teto"*
--   *"mas hoje é sexta 16h, o expediente encerra 17h e só volta segunda de
--    manhã, não posso disparar nada agora"*
--
-- ── O teto sai, e a razão dele some junto ────────────────────────────────
--
-- O `teto_diario = 40` da `20261043` existia por UMA hipótese: número novo na
-- Meta começa no patamar mais baixo (250 conversas iniciadas por 24 h), e 268
-- não caberia. O painel desmentiu — o CarboZé Clube está em **2.000/24 h**. Com
-- isso as 268 cabem de uma vez, e o teto passaria a segurar sem motivo.
--
-- ⚠️ Medir antes de supor, de novo: eu tinha escolhido 40 por raciocínio sobre
-- o patamar de um número novo, e o número real estava a um clique no WhatsApp
-- Manager. É a lição do limiar de 3 dias da etiqueta morta — *"limiar se MEDE,
-- não se supõe"*.
--
-- ── E a HORA, que não existia ────────────────────────────────────────────
--
-- ⚠️ Até aqui nada impedia a fila de disparar fora do expediente. Ligada numa
-- sexta às 16h59, ela continuaria achando elegível no sábado, no domingo e às
-- 3h da manhã — e a oferta termina em *"Bora repor?"*, sem link: quem manda o
-- link é UMA PESSOA, dentro da janela de 24 h. Mensagem de marketing de
-- madrugada é geradora de bloqueio e denúncia, que é exatamente o que derruba a
-- qualidade do número e faz o patamar de 2.000 CAIR.
--
-- ⚠️ E o custo maior não é a Meta: é o cliente que responde "bora" às 22h de
-- sexta e é atendido na segunda. Pior que não ter sido contactado.
--
-- ⚠️ A JANELA ATRASA, NUNCA PULA. A fila é uma view do estado ATUAL e só ganha
-- linha em `carbo_msg_envios` quando o envio acontece — então quem não sai às
-- 3h continua elegível às 9h. Ninguém é perdido. Era a dúvida óbvia, e a
-- resposta é a construção.
--
-- ── O que NÃO ganha janela, e por quê ────────────────────────────────────
--
-- ⚠️ As SEIS da esteira ficam com `hora_inicio` NULO = sem janela, e isso é
-- decisão: "seu pedido saiu para entrega" às 20h é serviço, é esperado, e
-- segurá-lo até as 9h do dia seguinte é pior que mandá-lo. A janela existe para
-- o COMERCIAL, onde falar é uma escolha — a mesma separação do `teto_diario`.
--
-- ⚠️ RODE EM BLOCOS. Nada aqui ENVIA: `recompra.ativo` continua false.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a janela de horário, e o teto que sai                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_msg_templates
  add column if not exists hora_inicio int check (hora_inicio between 0 and 23);
alter table public.carbo_msg_templates
  add column if not exists hora_fim    int check (hora_fim between 1 and 24);
alter table public.carbo_msg_templates
  add column if not exists dias_uteis  boolean not null default false;

comment on column public.carbo_msg_templates.hora_inicio is
  'A partir de que hora (Brasilia) esta etapa pode sair. NULL = sem janela, que e o caso das SEIS da esteira: "saiu para entrega" as 20h e servico, e e esperado — segura-lo ate as 9h do dia seguinte e pior que manda-lo. A janela existe para o COMERCIAL, onde falar e uma escolha.';
comment on column public.carbo_msg_templates.hora_fim is
  'Ate que hora (exclusivo). hora_fim = 18 significa que as 17h59 ainda sai e as 18h00 nao.';
comment on column public.carbo_msg_templates.dias_uteis is
  '⚠️ So de segunda a sexta. A oferta termina em "Bora repor?" SEM link: quem manda o link e uma PESSOA, dentro da janela de 24h da Meta. Disparar na sexta a noite ou no sabado e colher resposta que so sera lida na segunda — e cliente que respondeu "bora" e foi ignorado e pior que cliente nao contactado. A JANELA ATRASA, NUNCA PULA: a fila e view do estado ATUAL, entao quem nao saiu continua elegivel na proxima hora valida.';

-- ⚠️ O TETO SAI. O painel da Meta mostra 2.000/24 h para o CarboZe Clube, entao
-- as 268 cabem de uma vez. O 40 da `20261043` vinha de uma hipotese sobre
-- numero novo (patamar de 250) que o dado desmentiu.
update public.carbo_msg_templates
   set teto_diario = null
 where etapa = 'recompra';

-- A oferta sai em horario comercial, de segunda a sexta.
update public.carbo_msg_templates
   set hora_inicio = 9, hora_fim = 18, dias_uteis = true
 where etapa = 'recompra';

-- ⚠️ O carrinho e DIFERENTE e nao herda isso. A janela dele e de minutos
-- ("esqueceu algo?"), entao `dias_uteis` o estragaria: carrinho abandonado no
-- sabado e justamente quando a loja vende. Ele ganha so a borda da madrugada.
update public.carbo_msg_templates
   set hora_inicio = 8, hora_fim = 22, dias_uteis = false
 where etapa in ('carrinho_1','carrinho_2','carrinho_3');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila respeita a hora                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `security_invoker = true` repetido: `create or replace view` sem `with`
-- APAGA as reloptions. E `numero_id` segue sendo a ULTIMA coluna.

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
        ), agora AS (
         -- ⚠️ UM relogio so, em BRASILIA, calculado UMA vez. Repetir
         -- `timezone(...)` em tres condicoes seriam tres lugares para divergir
         -- — e um deles ficaria em UTC sem ninguem notar, que e a armadilha do
         -- `ordered_at::date`.
         SELECT extract(hour   from timezone('America/Sao_Paulo'::text, now()))::int AS hora,
                extract(isodow from timezone('America/Sao_Paulo'::text, now()))::int AS dia_semana
        ), libera AS (
         SELECT t.etapa FROM carbo_msg_templates t WHERE t.liberar_anteriores
        ), hoje AS (
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
    row_number() OVER (PARTITION BY b.etapa ORDER BY b.ordem_fila, b.bling_id) AS posicao
   FROM base b
     JOIN carbo_msg_templates t ON t.etapa = b.etapa AND t.ativo
     LEFT JOIN rastreio_card r ON r.codigo = b.rastreio
     LEFT JOIN carbo_wa_numeros n ON n.phone_number_id = t.numero_id
     LEFT JOIN hoje h ON h.etapa = b.etapa
     CROSS JOIN agora a
  WHERE NOT (EXISTS ( SELECT 1
           FROM carbo_msg_envios v
          WHERE v.bling_id = b.bling_id AND v.etapa = b.etapa AND v.status <> 'pendente'::text))
    AND NULLIF(TRIM(BOTH FROM COALESCE(b.cliente_fone, ''::text)), ''::text) IS NOT NULL
    AND (t.canal_envio <> 'meta'::text OR t.meta_status = 'APPROVED'::text)
    AND NOT (b.etapa = 'em_transito'::text AND b.etiqueta_cancelada)
    AND (t.canal_envio <> 'meta'::text OR t.numero_id IS NULL OR n.ativo)
    -- ⚠️ A JANELA DE HORÁRIO. `hora_inicio` nulo = sem janela (as seis da
    -- esteira). `hora_fim` é EXCLUSIVO: 18 significa que 17h59 sai e 18h00 não.
    AND (t.hora_inicio IS NULL
         OR (a.hora >= t.hora_inicio AND a.hora < COALESCE(t.hora_fim, 24)))
    -- ⚠️ E o dia. `isodow` é 1=segunda … 7=domingo.
    AND (NOT t.dias_uteis OR a.dia_semana BETWEEN 1 AND 5)
)
 SELECT bling_id, etapa, titulo, texto, atraso_min, telefone, nome,
    primeiro_nome, pedido, canal, valor, nf, link_nota, transportadora,
    servico, rastreio, cidade, uf, link_rastreio, previsao, instancia,
    link_carrinho, produtos, prioridade, canal_envio, meta_template_nome,
    meta_idioma, meta_variaveis, meta_botao_url_de, meta_status,
    rastreio_transportadora, pedido_codigo, numero_id
   FROM elegivel
  WHERE teto_diario IS NULL OR posicao <= (teto_diario - ja_hoje);

grant select on public.carbo_msg_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Uma de cada vez. NADA foi enviado.             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A fila das SEIS da esteira NÃO PODE TER MUDADO — elas não têm janela.
--     Se alguma sumir, a condição de horário vazou para o serviço.
-- select etapa, count(*) from public.carbo_msg_fila group by etapa order by 1;

-- (b) O cadastro. ESPERADO: recompra sem teto, 9–18, dias úteis, ativo FALSE.
-- select etapa, ativo, canal_envio, numero_id, meta_template_nome,
--        teto_diario, liberar_anteriores, hora_inicio, hora_fim, dias_uteis
-- from public.carbo_msg_templates order by etapa;

-- (c) ⚠️ O RELÓGIO, para a janela não ser uma suposição. Numa sexta às 16h a
--     recompra está DENTRO (9 ≤ 16 < 18, isodow 5); às 17h01 do mesmo dia
--     também; às 18h01 e no sábado, FORA.
-- select extract(hour   from timezone('America/Sao_Paulo', now()))::int as hora_brasilia,
--        extract(isodow from timezone('America/Sao_Paulo', now()))::int as dia_semana,
--        timezone('America/Sao_Paulo', now())                            as agora_brasilia;

-- (d) ⚠️ O QUE SAIRIA no primeiro minuto depois de ligar, SEM ligar nada. Este
--     número tem de ser lido ANTES do interruptor — e ele muda com a hora, que
--     é o objetivo.
-- with cfgmsg as (select inicio_em from public.carbo_msg_config where id)
-- select count(*) as sairiam_se_ligasse_agora
-- from public.carbo_recompra_pipeline p
-- where p.coluna = 'ofertar'
--   and nullif(btrim(coalesce(p.cliente_fone,'')),'') is not null
--   and not exists (select 1 from public.carbo_msg_envios v
--                   where v.bling_id = p.bling_id and v.etapa = 'recompra'
--                     and v.status <> 'pendente');
