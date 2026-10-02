-- ═══════════════════════════════════════════════════════════════════════════
-- A janela de 24 h passa a ser por PAR (nosso número ↔ cliente)
--
-- Fase 2 do "três números no mesmo WABA" (`20261041`). A fase 1 criou o
-- cadastro e a coluna, inertes. Esta é a que muda CHAVE, e por isso ela vem
-- partida em DOIS momentos com um deploy no meio.
--
-- ── Por que não dá para fazer de uma vez ─────────────────────────────────
--
-- O `whatsapp-meta-webhook` grava o contato com `onConflict: "wa_id"`. Então:
--
--   trocar a PK antes do deploy  -> o upsert do webhook quebra, e o que ele
--                                   não grava existe só no celular do cliente
--   trocar o código antes do SQL -> `onConflict: "numero_id,wa_id"` aponta
--                                   para um índice que ainda não existe
--
-- A saída é a de sempre neste repo: **a chave primeiro**. O BLOCO A cria o
-- índice composto CONVIVENDO com a PK antiga — nada quebra, a PK velha continua
-- mandando. O deploy passa a escrever no alvo novo. Só então o BLOCO C derruba
-- a PK antiga.
--
-- ⚠️ ENQUANTO A PK ANTIGA VIVE, a mesma pessoa não pode existir nos dois
-- números. Isso é seguro AGORA e só agora: o CarboZé Clube ainda não envia nada
-- (`recompra` está `ativo = false`), então não há de onde vir resposta por ele.
-- Fazer isto depois de ligar a recompra seria perder mensagem de cliente.
--
-- ── A medição que autorizou ──────────────────────────────────────────────
--
--   456 mensagens · 153 contatos · 128 atendimentos · 17 recados · 4 agendadas
--   `metadata.phone_number_id` gravado em ZERO das 456 — o webhook nunca o leu
--   backfill: todas do 1255756280958635, o único número que existia
--
-- ⚠️ RODE EM BLOCOS. O BLOCO C só DEPOIS de eu confirmar que o deploy saiu.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO A — as colunas e o índice composto. CONVIVE com a PK antiga.    ║
-- ║            Nada quebra: a PK velha continua mandando.                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_wa_contatos    add column if not exists numero_id text;
alter table public.carbo_wa_atendimento add column if not exists numero_id text;
alter table public.carbo_wa_resolvidas  add column if not exists numero_id text;
alter table public.carbo_wa_notas       add column if not exists numero_id text;
alter table public.carbo_wa_conversa_tag add column if not exists numero_id text;
alter table public.carbo_msg_envios     add column if not exists numero_id text;

-- Backfill: tudo o que existe é do número de serviço. Medido no BLOCO 0 da
-- `20261041` — `metadata` nulo nas 456, porque o webhook nunca o gravou.
update public.carbo_wa_contatos     set numero_id = '1255756280958635' where numero_id is null;
update public.carbo_wa_atendimento  set numero_id = '1255756280958635' where numero_id is null;
update public.carbo_wa_resolvidas   set numero_id = '1255756280958635' where numero_id is null;
update public.carbo_wa_notas        set numero_id = '1255756280958635' where numero_id is null;
update public.carbo_wa_conversa_tag set numero_id = '1255756280958635' where numero_id is null;
update public.carbo_msg_envios      set numero_id = '1255756280958635' where numero_id is null;

-- ⚠️ Os índices compostos nascem AGORA para o deploy ter onde apontar o
-- `onConflict`. Eles coexistem com a PK antiga sem conflito: a PK é mais
-- restritiva, então enquanto ela viver nada muda de comportamento.
create unique index if not exists carbo_wa_contatos_par_uk
  on public.carbo_wa_contatos (numero_id, wa_id);
create unique index if not exists carbo_wa_atendimento_par_uk
  on public.carbo_wa_atendimento (numero_id, wa_id);
create unique index if not exists carbo_wa_resolvidas_par_uk
  on public.carbo_wa_resolvidas (numero_id, wa_id);

-- ── De qual número cada ETAPA sai ────────────────────────────────────────
-- ⚠️ A etapa é dona do número, como já é dona do `canal_envio` e da
-- `instancia` da Evolution (`20260893`). O sistema não precisa saber qual
-- número é qual; ele precisa saber QUAL FUNÇÃO está falando.
alter table public.carbo_msg_templates
  add column if not exists numero_id text references public.carbo_wa_numeros(phone_number_id);

comment on column public.carbo_msg_templates.numero_id is
  'De qual numero da Cloud API esta etapa sai. NULL = o numero de SERVICO (compatibilidade: era o unico que existia). Mesma ideia da coluna `instancia`, que faz isso do lado da Evolution desde a 20260893 — separar o canal de SERVICO do COMERCIAL, para que quem bloqueia por causa da campanha nao perca o aviso de entrega junto.';

-- As seis da esteira ficam no número de serviço, explicitamente. `null` daria
-- o mesmo resultado hoje, mas cadastro implícito é cadastro que ninguém
-- confere — e a pergunta "por qual número sai o aviso de entrega?" passa a ter
-- resposta na tabela.
update public.carbo_msg_templates
   set numero_id = '1255756280958635'
 where etapa in ('confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue')
   and numero_id is null;

-- ⚠️ A recompra aponta para o CarboZé Clube. Isto NÃO liga nada: `ativo`
-- continua false e `canal_envio` continua 'evolution'. Ligar é a fase 3, e
-- medido antes: `sairiam_ao_ligar = 0`, porque as 268 entregas da coluna
-- "Hora de ofertar" sao de 30/06 a 02/09, anteriores ao marco zero de 21/09.
update public.carbo_msg_templates
   set numero_id = '1274076859132981'
 where etapa = 'recompra' and numero_id is null;

-- Os três do carrinho apontam para o número de carrinho, que está DESLIGADO e
-- NAO REGISTRADO. Apontar para ele agora é o certo: a tela mostra para onde
-- aquilo vai quando for ligado, em vez de parecer que vai pelo serviço.
update public.carbo_msg_templates
   set numero_id = '1347087218483622'
 where etapa in ('carrinho_1','carrinho_2','carrinho_3') and numero_id is null;

comment on column public.carbo_wa_contatos.numero_id is
  'Por qual numero NOSSO esta pessoa escreveu. ⚠️ E ele que torna a janela de 24h correta: a janela da Meta e por PAR (nosso numero ↔ cliente), e com a PK so em wa_id o cliente que respondesse a OFERTA abriria no nosso banco a janela do numero de SERVICO — a tela ofereceria texto livre que a Meta recusa com 131047, depois de a pessoa ter escrito a resposta inteira.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO B — CONFERÊNCIA do A. Rode UMA DE CADA VEZ.                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ESPERADO: zero linhas. Linha aqui e coluna que o backfill nao alcancou.
-- select 'contatos' t, count(*) n from public.carbo_wa_contatos where numero_id is null
-- union all select 'atendimento', count(*) from public.carbo_wa_atendimento where numero_id is null
-- union all select 'resolvidas',  count(*) from public.carbo_wa_resolvidas  where numero_id is null
-- union all select 'notas',       count(*) from public.carbo_wa_notas       where numero_id is null
-- union all select 'conversa_tag',count(*) from public.carbo_wa_conversa_tag where numero_id is null
-- union all select 'msg_envios',  count(*) from public.carbo_msg_envios     where numero_id is null;

-- (b) ⚠️ Cada etapa com o numero dela, e a RECOMPRA apontando para o Clube
--     MAS ainda desligada. `ativo` true na recompra aqui significaria que ela
--     ja esta enviando — e nao e isso que este bloco faz.
-- select t.etapa, t.canal_envio, t.ativo, t.numero_id, n.rotulo, n.ativo as numero_ativo
-- from public.carbo_msg_templates t
-- left join public.carbo_wa_numeros n on n.phone_number_id = t.numero_id
-- order by t.etapa;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO C — ⚠️ SÓ DEPOIS DO DEPLOY. Troca a chave e republica as views. ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Rodar isto antes do deploy quebra o upsert do webhook, e o que ele nao grava
-- existe so no celular do cliente.

-- A PK antiga sai; a composta entra. ⚠️ `drop constraint` pelo nome padrao do
-- Postgres (`<tabela>_pkey`); se alguem renomeou, o `if exists` deixa passar e
-- a conferencia (c) acusa.
alter table public.carbo_wa_contatos    drop constraint if exists carbo_wa_contatos_pkey;
alter table public.carbo_wa_atendimento drop constraint if exists carbo_wa_atendimento_pkey;
alter table public.carbo_wa_resolvidas  drop constraint if exists carbo_wa_resolvidas_pkey;

alter table public.carbo_wa_contatos    alter column numero_id set not null;
alter table public.carbo_wa_atendimento alter column numero_id set not null;
alter table public.carbo_wa_resolvidas  alter column numero_id set not null;

alter table public.carbo_wa_contatos
  add constraint carbo_wa_contatos_pkey primary key (numero_id, wa_id);
alter table public.carbo_wa_atendimento
  add constraint carbo_wa_atendimento_pkey primary key (numero_id, wa_id);
alter table public.carbo_wa_resolvidas
  add constraint carbo_wa_resolvidas_pkey primary key (numero_id, wa_id);

alter table public.carbo_wa_mensagens alter column numero_id set not null;

-- A etiqueta por conversa: a mesma pessoa em dois numeros sao duas conversas,
-- e cada uma tem as etiquetas dela.
alter table public.carbo_wa_conversa_tag drop constraint if exists carbo_wa_conversa_tag_pkey;
alter table public.carbo_wa_conversa_tag alter column numero_id set not null;
alter table public.carbo_wa_conversa_tag
  add constraint carbo_wa_conversa_tag_pkey primary key (numero_id, wa_id, tag_id);


-- ── carbo_wa_conversas ───────────────────────────────────────────────────
-- ⚠️ ESCRITA A PARTIR DO `pg_get_viewdef`, nunca da migracao que a criou. A
-- `20261019` levou `42P16` por fazer isso, e o erro foi SORTE: com as colunas
-- batendo, o `create or replace` teria apagado em silencio um gate de
-- seguranca que ninguem sabia que existia.
--
-- ⚠️ `numero_id` entra NO FIM — coluna nova no meio da um
-- `42P16 cannot change name of view column`.
--
-- ⚠️ E `with (security_invoker = true)` REPETIDO: `create or replace view` sem
-- `with` APAGA as reloptions. Foi assim que a `bling2_esteira` vazou.
create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
 WITH tudo AS (
         SELECT m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
            m.ocorrido_em, m.responde_a,
            NULL::bigint AS envio_bling_id,
            NULL::text AS envio_etapa,
            NULL::text AS botao,
            m.status AS msg_status,
            m.erro_codigo AS msg_erro_codigo,
            m.erro_detalhe AS msg_erro_detalhe,
            m.enviado_por_nome AS msg_autor,
            m.numero_id
           FROM carbo_wa_mensagens m
        UNION ALL
         SELECT v.wamid, v.wa_id, 'saida'::text, 'template'::text,
            COALESCE(NULLIF(carbo_wa_texto_do_template(t.texto, v.payload), ''::text), t.titulo, v.etapa) AS "coalesce",
            NULL::text AS text,
            v.enviado_em,
            NULL::text AS text,
            v.bling_id,
            v.etapa,
            carbo_wa_botao_do_template(v.payload) AS carbo_wa_botao_do_template,
            v.status, v.erro_codigo, v.erro_detalhe,
            NULL::text AS text,
            v.numero_id
           FROM carbo_msg_envios v
             LEFT JOIN carbo_msg_templates t ON t.etapa = v.etapa
          WHERE v.canal = 'meta'::text AND v.wamid IS NOT NULL AND v.wa_id IS NOT NULL
            AND v.enviado_em IS NOT NULL
            AND (v.status = ANY (ARRAY['enviado'::text, 'entregue'::text, 'lido'::text]))
        ), resolvido AS (
         SELECT x.wamid, x.wa_id, c.nome AS nome_whatsapp, x.direcao, x.tipo,
            x.texto, x.midia_id, x.ocorrido_em,
            COALESCE(x.envio_bling_id, e.bling_id, u.bling_id) AS bling_id,
            COALESCE(x.envio_etapa, e.etapa, u.etapa) AS sobre_a_etapa,
            x.envio_bling_id IS NOT NULL OR e.bling_id IS NOT NULL AS vinculo_exato,
            x.botao, x.msg_status, x.msg_erro_codigo, x.msg_erro_detalhe,
            x.msg_autor, x.numero_id
           FROM tudo x
             -- ⚠️ O contato agora casa pelo PAR. Casar so por `wa_id` traria o
             -- nome e a janela do OUTRO numero.
             LEFT JOIN carbo_wa_contatos c
               ON c.numero_id = x.numero_id AND c.wa_id = x.wa_id
             LEFT JOIN LATERAL ( SELECT v.bling_id, v.etapa
                   FROM carbo_msg_envios v
                  WHERE v.wamid = x.responde_a
                 LIMIT 1) e ON true
             -- ⚠️ E o vinculo APROXIMADO ("o ultimo aviso enviado a este
             -- numero") tambem passa a exigir o MESMO numero nosso. Sem isso,
             -- uma resposta no Clube seria ligada ao pedido anunciado pelo
             -- numero de SERVICO — aproximacao que atravessa canal e se passa
             -- por certeza e como alguem responde sobre o pedido errado.
             LEFT JOIN LATERAL ( SELECT v.bling_id, v.etapa
                   FROM carbo_msg_envios v
                  WHERE v.canal = 'meta'::text AND v.wa_id = x.wa_id
                    AND v.numero_id = x.numero_id
                    AND v.enviado_em IS NOT NULL AND v.enviado_em <= x.ocorrido_em
                  ORDER BY v.enviado_em DESC
                 LIMIT 1) u ON true
        )
 SELECT r.wamid, r.wa_id, r.nome_whatsapp AS cliente, r.direcao, r.tipo,
    r.texto, r.midia_id, r.ocorrido_em, r.bling_id, r.sobre_a_etapa,
    r.vinculo_exato, r.botao AS botao_rastreio, b.cliente AS cliente_pedido,
    r.nome_whatsapp, r.msg_status AS status, r.msg_erro_codigo AS erro_codigo,
    r.msg_erro_detalhe AS erro_detalhe, r.msg_autor AS enviado_por_nome,
    r.numero_id
   FROM resolvido r
     LEFT JOIN bling2_esteira b ON b.bling_id = r.bling_id;

grant select on public.carbo_wa_conversas to authenticated;


-- ── carbo_msg_fila ───────────────────────────────────────────────────────
-- ⚠️ A fila passa a CARREGAR o numero, como ja carrega `instancia` e
-- `canal_envio`. Quem envia nao decide o numero: ele vem do cadastro da etapa.
-- Decidir no codigo seria a quinta copia do que ja esta em QUATRO edge
-- functions.
--
-- ⚠️ `coalesce(t.numero_id, '1255756280958635')`: etapa sem numero cai no de
-- SERVICO, que e o comportamento de hoje. Deixar null chegaria na funcao como
-- ausencia e ela teria de inventar um — a doenca do `Math.round` inventando
-- `×1`.
--
-- ⚠️ E `n.ativo` entra no WHERE: etapa apontando para numero DESLIGADO nao
-- entra na fila. O numero de carrinho esta desligado e NAO REGISTRADO, e
-- enviar por numero nao registrado falha com erro generico da Graph API — que
-- manda procurar no lugar errado.
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
        ), base AS (
         SELECT e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja,
            e.pedido_numero, e.pedido_codigo, e.canal, e.total, e.nf_numero,
            e.nf_pdf, e.transportadora, e.servico, e.rastreio,
            e.entrega_cidade, e.entrega_uf,
            NULL::text AS link_carrinho, NULL::text AS produtos,
            e.rastreio_transportadora,
            e.me_situacao = 'cancelado'::text AS etiqueta_cancelada
           FROM bling2_esteira e
          WHERE e.etapa <> 'cancelado'::text AND e.data_pedido >= (( SELECT cfgmsg.inicio_em FROM cfgmsg))
        UNION ALL
         SELECT e.bling_id, 'saiu_entrega'::text, e.cliente_fone, e.cliente,
            e.pedido_loja, e.pedido_numero, e.pedido_codigo, e.canal, e.total,
            e.nf_numero, e.nf_pdf, e.transportadora, e.servico, e.rastreio,
            e.entrega_cidade, e.entrega_uf,
            NULL::text AS text, NULL::text AS text,
            e.rastreio_transportadora, false
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
            NULL::text AS text, false
           FROM carbo_recompra_pipeline p
          WHERE p.coluna = 'ofertar'::text
            AND p.entregue_em::date >= (( SELECT cfgmsg.inicio_em FROM cfgmsg))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_1'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'aberto'::text
            AND now() >= (c.abandonado_em + (((( SELECT cfg.minutos_1 FROM cfg)) || ' minutes'::text)::interval))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_2'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'msg1'::text
            AND now() >= (p.msg1_em + (((( SELECT cfg.horas_2 FROM cfg)) || ' hours'::text)::interval))
        UNION ALL
         SELECT c.checkout_id, 'carrinho_3'::text, c.telefone, c.cliente,
            NULL::text, NULL::text, NULL::text, 'Nuvemshop'::text, c.total,
            NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
            NULL::text, NULL::text, c.link, c.produtos, NULL::text AS text, false
           FROM carbo_carrinho_pipeline p
             JOIN nuvemshop_carrinhos c ON c.checkout_id = p.checkout_id
          WHERE p.coluna = 'msg2'::text
            AND now() >= (p.msg2_em + (((( SELECT cfg.horas_3 FROM cfg)) || ' hours'::text)::interval))
        )
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
    COALESCE(t.numero_id, '1255756280958635'::text) AS numero_id
   FROM base b
     JOIN carbo_msg_templates t ON t.etapa = b.etapa AND t.ativo
     LEFT JOIN rastreio_card r ON r.codigo = b.rastreio
     LEFT JOIN carbo_wa_numeros n ON n.phone_number_id = t.numero_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM carbo_msg_envios v
          WHERE v.bling_id = b.bling_id AND v.etapa = b.etapa AND v.status <> 'pendente'::text))
    AND NULLIF(TRIM(BOTH FROM COALESCE(b.cliente_fone, ''::text)), ''::text) IS NOT NULL
    AND (t.canal_envio <> 'meta'::text OR t.meta_status = 'APPROVED'::text)
    AND NOT (b.etapa = 'em_transito'::text AND b.etiqueta_cancelada)
    AND (t.canal_envio <> 'meta'::text OR t.numero_id IS NULL OR n.ativo);

grant select on public.carbo_msg_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO D — CONFERÊNCIA do C. Rode UMA DE CADA VEZ.                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ As PKs novas. ESPERADO: as tres com `numero_id, wa_id`.
-- select c.relname, pg_get_constraintdef(con.oid) as pk
-- from pg_constraint con
-- join pg_class c on c.oid = con.conrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and con.contype = 'p'
--   and c.relname in ('carbo_wa_contatos','carbo_wa_atendimento','carbo_wa_resolvidas','carbo_wa_conversa_tag')
-- order by 1;

-- (b) ⚠️ As reloptions das DUAS views. ESPERADO: `{security_invoker=true}` nas
--     duas. Vazio significa que o `create or replace` apagou — e a view passa a
--     rodar com os privilegios do dono, RLS ignorada, com o grant intacto.
-- select relname, reloptions from pg_class
-- where relname in ('carbo_wa_conversas','carbo_msg_fila');

-- (c) A fila continua igual. ESPERADO: as mesmas etapas de antes, e `recompra`
--     AUSENTE (ela so entra quando o template for ligado na fase 3).
-- select etapa, count(*), min(numero_id) as numero
-- from public.carbo_msg_fila group by etapa order by 1;
