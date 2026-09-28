-- ═══════════════════════════════════════════════════════════════════════════
-- A fila de WhatsApp voltava 39 s — e o `whatsapp-meta` morria no timeout
--
-- Medido em 28/09/2026, com `explain (analyze, buffers)` sobre
-- `select * from public.carbo_msg_fila`:
--
--     Execution Time: 39.069,755 ms      Buffers: shared hit=12.349.021
--
-- E, em `net._http_response`, a mesma coisa vista de fora, DE MINUTO EM
-- MINUTO desde 10/09:
--
--     500 {"error": "fila: canceling statement due to statement timeout"}
--
-- ⚠️ O `pg_cron` marcava `succeeded` as 1.440 execuções do dia — porque o
-- sucesso dele é ter POSTADO (`net.http_post` é assíncrono). É a mesma
-- cegueira das 25 h do `CRON_SECRET` e das 20 h de 401 do `ecommerce-sync`:
-- **dezoito dias sem um único aviso de esteira sair**, sem erro em lugar
-- nenhum que alguém olhasse.
--
-- O plano aponta o culpado sem ambiguidade — 38,6 s dos 39 estão em
-- `Subquery Scan on "*SELECT* 3"`, o ramo da RECOMPRA:
--
--     Nested Loop  ... Rows Removed by Join Filter: 251909
--     Index Scan using bling2_nfe_bling_id_key ... loops=299574
--
-- ⚠️ **A `bling2_esteira` estava sendo montada DUAS vezes, uma delas dentro
-- de um laço.** O ramo fazia
--
--     from bling2_esteira e join carbo_recompra_pipeline p on p.bling_id = e.bling_id
--
-- e a `carbo_recompra_pipeline` **já é** a `bling2_esteira` (CTE `entregue`)
-- cruzada com `bling2_orders` e `carbo_entrega_carimbo`, mais um `exists`
-- correlacionado por CPF. O Postgres inlina view, então a esteira inteira —
-- que virou UNIÃO de duas contas Bling na `20260990` — era reavaliada por
-- linha. Enquanto a esteira tinha poucas centenas de cards ninguém viu; hoje
-- são **1.021** (427 nos últimos 30 dias, 594 mais velhos, o mais antigo de
-- 12/06/2026), e é a família dos tetos silenciosos deste repo: funciona até o
-- volume cruzar.
--
-- ⚠️ E o segundo `join` **não trazia nada**: a pipeline já carrega
-- `pedido_loja`, `canal`, `cliente`, `cliente_fone`, `total`,
-- `entrega_cidade` e `entrega_uf`, e o template de recompra usa uma variável
-- só (`{{primeiro_nome}}`). NF, transportadora e rastreio não têm papel numa
-- oferta de reposição — a esteira era lida inteira para devolver colunas que
-- a mensagem descarta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- E, JUNTO, o marco zero — porque consertar o timeout sozinho é disparar
--
-- ⚠️ A `carbo_msg_fila` nunca teve data de corte em lugar nenhum. Isso já
-- está escrito no CLAUDE.md desde a `20260946` ("a fila não tem data de corte
-- em lugar nenhum") e nunca foi resolvido. Com a view voltando a responder, a
-- função volta a entregar **no minuto seguinte** — e os 594 cards anteriores
-- a 30 dias voltam a ser candidatos a qualquer etapa que eles ainda não
-- tenham em `carbo_msg_envios`.
--
-- Por isso as duas coisas vão na MESMA migração. Publicar a view rápida sem o
-- corte seria consertar o relógio e apertar o gatilho no mesmo instante.
--
-- ⚠️ **O corte é de 7 dias, não "hoje", e isso foi revisto.** Eu tinha
-- recomendado hoje; hoje **desliga a operação viva**: pedido feito ontem que
-- emite NF amanhã nunca mais seria anunciado, e não existe nada de errado com
-- ele. Sete dias cobrem a operação corrente inteira e matam a cauda antiga,
-- que é o que se quer proteger. O congelamento em `carbo_msg_envios` já cobriu
-- os 309 que estavam parados na fila; o marco zero é para o que vier.
--
-- Ele é EDITÁVEL — uma linha, `carbo_msg_config`, no molde do
-- `carbo_carrinho_config.inicio_em` que já existe e já provou.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o marco zero da fila (tabela de UMA linha)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_msg_config (
  id            boolean primary key default true check (id),

  -- ⚠️ MARCO ZERO. Pedido ANTERIOR a esta data não entra na fila, em nenhuma
  -- etapa. Ele é filtro por DATA — pergunta se o pedido é ANTIGO, não se a
  -- mensagem já foi mandada. Quem responde a segunda pergunta é
  -- `carbo_msg_envios`, e as duas são vereditos SEPARADOS: juntá-las é o erro
  -- de 31/08 do marco zero do estoque, registrado no CLAUDE.md.
  inicio_em     date not null default (current_date - 7),

  atualizado_em timestamptz not null default now()
);

insert into public.carbo_msg_config (id) values (true)
on conflict (id) do nothing;

comment on table public.carbo_msg_config is
  'Uma linha so (id=true). inicio_em e o MARCO ZERO da fila de mensagens: pedido com data anterior nao entra em etapa nenhuma, e entrega anterior nao entra na recompra. Nasce em current_date - 7 para cobrir a operacao corrente e cortar a cauda antiga (1.021 cards, o mais velho de 12/06/2026). Filtro por DATA — quem responde "ja foi enviado?" e carbo_msg_envios, veredito separado.';

alter table public.carbo_msg_config enable row level security;
drop policy if exists carbo_msg_config_read  on public.carbo_msg_config;
drop policy if exists carbo_msg_config_write on public.carbo_msg_config;
create policy carbo_msg_config_read on public.carbo_msg_config
  for select to authenticated using (true);
create policy carbo_msg_config_write on public.carbo_msg_config
  for update to authenticated using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());

grant select on public.carbo_msg_config to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila: uma esteira só, e com corte de data                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Mudanças, e só estas três:
--   1. o ramo da recompra lê SÓ a `carbo_recompra_pipeline` (a segunda
--      montagem da esteira sai);
--   2. os ramos da esteira ganham `data_pedido >= inicio_em`;
--   3. a recompra ganha `entregue_em >= inicio_em`.
--
-- ⚠️ A lista de saída é IDÊNTICA à da `20260947` — `create or replace view`
-- não reordena nem renomeia coluna publicada, e duas edge functions leem esta
-- fila por NOME de campo.
--
-- ⚠️ `with (security_invoker = true)` repetido: `create or replace view` sem
-- `WITH` APAGA as reloptions, e foi assim que a `bling2_esteira` passou a
-- rodar como DONO com o grant intacto.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with cfg as (
  select minutos_1, horas_2, horas_3, valor_minimo, inicio_em
  from public.carbo_carrinho_config where id
),
cfgmsg as (
  select inicio_em from public.carbo_msg_config where id
),
base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text as link_carrinho, null::text as produtos,
         e.rastreio_transportadora,
         -- ⚠️ CANCELADA, não "morta". Vencida com `postado_em` foi USADA — o
         -- vencimento depois é contabilidade, e travar aí calaria aviso
         -- legítimo. Cancelada é a única em que o código pode ter deixado de
         -- valer na transportadora.
         (e.me_situacao = 'cancelado')             as etiqueta_cancelada
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'
    and e.data_pedido >= (select inicio_em from cfgmsg)

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text, e.rastreio_transportadora,
         -- `saiu_entrega` vem de evento REAL da transportadora (rastreio_card),
         -- não de carimbo de etiqueta: se ela saiu para entrega, ela existe.
         false
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'
    and e.data_pedido >= (select inicio_em from cfgmsg)

  union all

  -- ⚠️ SEM a `bling2_esteira` aqui. A `carbo_recompra_pipeline` já É a esteira
  -- (CTE `entregue`) cruzada com `bling2_orders` e o carimbo de entrega; o
  -- `join` de volta montava a união inteira das DUAS contas Bling por linha —
  -- 38,6 s dos 39 do plano. As colunas de NF, transportadora e rastreio vêm
  -- nulas de propósito: uma oferta de reposição não fala de envio nenhum, e o
  -- template usa só `{{primeiro_nome}}`. O identificador do pedido continua
  -- saindo, pelo `pedido_loja` que a pipeline já carrega.
  select p.bling_id, 'recompra', p.cliente_fone, p.cliente, p.pedido_loja, null::text,
         null::text, p.canal, p.total, null::text, null::text, null::text,
         null::text, null::text, p.entrega_cidade, p.entrega_uf,
         null::text, null::text, null::text,
         false
  from public.carbo_recompra_pipeline p
  where p.coluna = 'ofertar'
    -- ⚠️ Aqui o marco zero olha a ENTREGA, não a data do pedido: a régua de
    -- recompra conta 30 dias a partir dela, e cortar por data de pedido
    -- esvaziaria o ramo para sempre. Consequência assumida: com o template
    -- religado, a recompra só alcança entregas posteriores ao marco — que é
    -- exatamente a rajada que não se quer no dia em que alguém ligar o
    -- `ativo`. Hoje ele está desligado, então isto não muda nada no ar.
    and p.entregue_em::date >= (select inicio_em from cfgmsg)

  union all

  select c.checkout_id, 'carrinho_1', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'aberto'
    and now() >= c.abandonado_em + ((select minutos_1 from cfg) || ' minutes')::interval

  union all

  select c.checkout_id, 'carrinho_2', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg1'
    and now() >= p.msg1_em + ((select horas_2 from cfg) || ' hours')::interval

  union all

  select c.checkout_id, 'carrinho_3', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text, false
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg2'
    and now() >= p.msg2_em + ((select horas_3 from cfg) || ' hours')::interval
)
select
  b.bling_id,
  b.etapa,
  t.titulo,
  t.texto,
  t.atraso_min,
  b.cliente_fone                                   as telefone,
  b.cliente                                        as nome,
  split_part(trim(b.cliente), ' ', 1)              as primeiro_nome,
  coalesce(b.pedido_codigo, b.pedido_loja, b.pedido_numero, '') as pedido,
  b.canal,
  b.total::numeric(12,2)                           as valor,
  b.nf_numero                                      as nf,
  b.nf_pdf                                         as link_nota,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia,
  b.link_carrinho,
  b.produtos,
  case when b.etapa in ('carrinho_1','carrinho_2','carrinho_3','recompra')
       then 1 else 0 end                          as prioridade,
  t.canal_envio,
  t.meta_template_nome,
  t.meta_idioma,
  t.meta_variaveis,
  t.meta_botao_url_de,
  t.meta_status,
  b.rastreio_transportadora,
  b.pedido_codigo
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id
    and v.etapa = b.etapa
    and v.status <> 'pendente'
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null
  and (t.canal_envio <> 'meta' or t.meta_status = 'APPROVED')
  -- ⚠️ A TRAVA. "Saiu para entrega" com etiqueta cancelada é promessa
  -- verificável sobre envio que não existe: o cliente confere o código e não
  -- acha nada. O card continua mostrando `em_transito` (o carimbo de postagem
  -- é fato); só o ANÚNCIO é segurado, porque anunciar não se desfaz.
  and not (b.etapa = 'em_transito' and b.etiqueta_cancelada);

grant select on public.carbo_msg_fila to authenticated;

comment on view public.carbo_msg_fila is
  'Uma etapa por pedido, pronta para virar mensagem. ⚠️ MARCO ZERO em carbo_msg_config.inicio_em: pedido anterior nao entra em etapa nenhuma (e entrega anterior nao entra na recompra) — sem ele, a fila nao tinha data de corte em lugar nenhum e os 594 cards com mais de 30 dias voltariam a ser candidatos assim que a view parasse de estourar. ⚠️ O ramo da recompra le SO a carbo_recompra_pipeline: o join de volta a bling2_esteira montava a uniao das duas contas Bling POR LINHA e custava 38,6 s dos 39 s medidos em 28/09 — NAO o recoloque. ⚠️ em_transito e segurado quando a etiqueta eleita esta CANCELADA; a tela continua mostrando o card (postagem e fato), mas o anuncio nao sai. ⚠️ security_invoker = true — repita a clausula em toda republicacao.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência: rode UMA DE CADA VEZ                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O SQL Editor mostra só o resultado da ÚLTIMA consulta do bloco.

-- (a) ⚠️ O TEMPO. É esta a conferência que importa: era 39.069 ms.
--     ESPERADO: abaixo de 1.000 ms. Acima de ~5 s, o timeout volta.
-- explain (analyze, buffers) select * from public.carbo_msg_fila;

-- (b) O marco zero e as reloptions. ESPERADO: uma linha com a data de hoje−7,
--     e `security_invoker=true` nas DUAS views.
-- select (select inicio_em from public.carbo_msg_config where id) as marco_zero,
--        (select reloptions from pg_class where relname = 'carbo_msg_fila')   as fila_opts,
--        (select reloptions from pg_class where relname = 'bling2_esteira')   as esteira_opts;

-- (c) O que a fila entrega AGORA, por etapa e canal.
--     ⚠️ Fila VAZIA aqui é resposta boa: quer dizer que o congelamento pegou
--     tudo e nada novo andou desde então. Fila com DEZENAS é sinal — leia
--     linha a linha antes de deixar o cron pegar.
-- select etapa, canal, count(*) as na_fila
-- from public.carbo_msg_fila group by 1,2 order by 3 desc;

-- (d) A prova de que o `whatsapp-meta` voltou. Rode DEPOIS de um minuto.
--     ESPERADO: status 200. O 500 com `canceling statement due to statement
--     timeout` é o defeito que esta migração fecha.
-- select r.created, r.status_code, left(r.content, 200) as corpo
-- from net._http_response r
-- order by r.created desc limit 10;
