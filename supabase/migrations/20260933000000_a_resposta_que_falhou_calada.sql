-- ─────────────────────────────────────────────────────────────────────────────
-- A resposta do atendimento que falhou CALADA
--
-- Medido agora, com o áudio que não chegou: a Meta aceitou o envio (devolveu
-- `wamid`, o balão apareceu na tela) e DEPOIS avisou pelo webhook que ele
-- falhou. Esse aviso foi jogado fora.
--
-- Por quê: `carbo_msg_status_meta` procura o `wamid` em `carbo_msg_envios` e
-- devolve `false` quando não acha. A regra estava certa para o que ela nasceu
-- para fazer — não inventar linha para mensagem mandada de fora do sistema —,
-- mas a conversa passou a ter uma SEGUNDA origem de saída: `carbo_wa_mensagens`,
-- onde moram as respostas em texto livre, as fotos e os áudios. Para essas, o
-- status simplesmente não tinha onde cair.
--
-- ⚠️ O efeito é o pior de todos: o balão fica na tela igualzinho ao que deu
-- certo. Quem atendeu vai embora achando que respondeu, e o cliente nunca
-- recebeu nada — é a mesma doença do `catch` vazio do som da venda, e do
-- `pg_cron` marcando `succeeded`.
--
-- O evento sempre chegou, aliás: está em `carbo_wa_eventos` como
-- `status:<wamid>:failed`. Havia registro do fracasso, e nenhuma tela olhava.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — onde o status cai                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_wa_mensagens
  add column if not exists status       text,
  add column if not exists entregue_em  timestamptz,
  add column if not exists lido_em      timestamptz,
  add column if not exists erro_codigo  integer,
  add column if not exists erro_detalhe text;

-- ⚠️ Sem CHECK e sem default. Nulo aqui significa "ainda não veio status", que
-- é diferente de "enviado": mensagem de ENTRADA nunca tem status nenhum, e um
-- default faria toda mensagem do cliente nascer marcada como enviada por nós.
comment on column public.carbo_wa_mensagens.status is
  'enviado | entregue | lido | falhou — só para direcao=saida, aplicado pelo webhook. Nulo = ainda não chegou status (e mensagem de entrada nunca tem).';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o status passa a ter DOIS destinos                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- A regra de avanço é a MESMA nos dois (o status só anda; `failed` não vence
-- entrega já registrada), e por isso ela continua escrita uma vez só, aqui —
-- duas cópias divergem, e divergir num monotônico é rebaixar `lido` para
-- `entregue` num reenvio da Meta.

create or replace function public.carbo_msg_status_meta(
  p_wamid   text,
  p_status  text,
  p_quando  timestamptz default now(),
  p_erro_codigo integer default null,
  p_erro_detalhe text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_novo  text;
  v_atual text;
begin
  v_novo := case lower(p_status)
              when 'sent'      then 'enviado'
              when 'delivered' then 'entregue'
              when 'read'      then 'lido'
              when 'failed'    then 'falhou'
              else null end;
  if v_novo is null then return false; end if;

  -- ── Destino 1: o aviso da esteira ──────────────────────────────────────
  select status into v_atual from public.carbo_msg_envios where wamid = p_wamid;

  if v_atual is not null then
    if v_novo = 'falhou' then
      if public.carbo_msg_status_rank(v_atual) >= 3 then return false; end if;
    elsif public.carbo_msg_status_rank(v_novo) <= public.carbo_msg_status_rank(v_atual) then
      return false;
    end if;

    update public.carbo_msg_envios set
      status = v_novo,
      entregue_em = case when v_novo in ('entregue','lido')
                         then coalesce(entregue_em, p_quando) else entregue_em end,
      lido_em     = case when v_novo = 'lido'
                         then coalesce(lido_em, p_quando) else lido_em end,
      erro_codigo = coalesce(p_erro_codigo, erro_codigo),
      erro_detalhe= coalesce(p_erro_detalhe, erro_detalhe)
    where wamid = p_wamid;
    return true;
  end if;

  -- ── Destino 2: a resposta que o atendimento mandou ─────────────────────
  select status into v_atual from public.carbo_wa_mensagens where wamid = p_wamid;

  -- Continua NÃO inventando linha: `wamid` que não é de lugar nenhum é
  -- mensagem mandada por fora (teste no painel da Meta), e criar registro para
  -- ela sujaria a conversa com um balão que ninguém escreveu aqui.
  if not found then return false; end if;

  if v_atual is not null then
    if v_novo = 'falhou' then
      if public.carbo_msg_status_rank(v_atual) >= 3 then return false; end if;
    elsif public.carbo_msg_status_rank(v_novo) <= public.carbo_msg_status_rank(v_atual) then
      return false;
    end if;
  end if;

  update public.carbo_wa_mensagens set
    status = v_novo,
    entregue_em = case when v_novo in ('entregue','lido')
                       then coalesce(entregue_em, p_quando) else entregue_em end,
    lido_em     = case when v_novo = 'lido'
                       then coalesce(lido_em, p_quando) else lido_em end,
    erro_codigo = coalesce(p_erro_codigo, erro_codigo),
    erro_detalhe= coalesce(p_erro_detalhe, erro_detalhe)
  where wamid = p_wamid;
  return true;
end $$;

comment on function public.carbo_msg_status_meta is
  'Aplica um status do webhook da Meta ao envio: primeiro em carbo_msg_envios (avisos da esteira), depois em carbo_wa_mensagens (respostas do atendimento). O status só ANDA; failed é a única exceção e não vence entrega já registrada. wamid desconhecido nas duas não vira linha nova.';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a tela enxerga o fracasso                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `security_invoker = true` REPETIDO. `create or replace view` sem a
-- cláusula APAGA as reloptions — foi assim que a `bling2_esteira` passou a
-- rodar com os privilégios do dono e a esteira inteira ficou legível para
-- lojista e licenciado pelo PostgREST.
--
-- ⚠️ E as colunas novas vão no FIM, sem mexer em nenhuma existente: o Postgres
-- recusa renomear, reordenar ou trocar tipo de coluna de view com 42P16.

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
with tudo as (
  select
    m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
    m.ocorrido_em, m.responde_a,
    null::bigint as envio_bling_id,
    null::text   as envio_etapa,
    null::text   as botao,
    m.status       as msg_status,
    m.erro_codigo  as msg_erro_codigo,
    m.erro_detalhe as msg_erro_detalhe
  from public.carbo_wa_mensagens m

  union all

  select
    v.wamid, v.wa_id, 'saida', 'template',
    coalesce(
      nullif(public.carbo_wa_texto_do_template(t.texto, v.payload), ''),
      t.titulo, v.etapa),
    null::text,
    v.enviado_em, null::text,
    v.bling_id, v.etapa,
    public.carbo_wa_botao_do_template(v.payload),
    v.status, v.erro_codigo, v.erro_detalhe
  from public.carbo_msg_envios v
  left join public.carbo_msg_templates t on t.etapa = v.etapa
  where v.canal = 'meta'
    and v.wamid is not null
    and v.wa_id is not null
    and v.enviado_em is not null
    and v.status in ('enviado','entregue','lido')
),
resolvido as (
  select
    x.wamid,
    x.wa_id,
    c.nome                                     as nome_whatsapp,
    x.direcao,
    x.tipo,
    x.texto,
    x.midia_id,
    x.ocorrido_em,
    coalesce(x.envio_bling_id, e.bling_id, u.bling_id) as bling_id,
    coalesce(x.envio_etapa,    e.etapa,    u.etapa)    as sobre_a_etapa,
    (x.envio_bling_id is not null or e.bling_id is not null) as vinculo_exato,
    x.botao,
    x.msg_status, x.msg_erro_codigo, x.msg_erro_detalhe
  from tudo x
  left join public.carbo_wa_contatos c on c.wa_id = x.wa_id
  left join lateral (
    select v.bling_id, v.etapa
    from public.carbo_msg_envios v
    where v.wamid = x.responde_a
    limit 1
  ) e on true
  left join lateral (
    select v.bling_id, v.etapa
    from public.carbo_msg_envios v
    where v.canal = 'meta' and v.wa_id = x.wa_id
      and v.enviado_em is not null and v.enviado_em <= x.ocorrido_em
    order by v.enviado_em desc
    limit 1
  ) u on true
)
select
  r.wamid,
  r.wa_id,
  r.nome_whatsapp                            as cliente,
  r.direcao,
  r.tipo,
  r.texto,
  r.midia_id,
  r.ocorrido_em,
  r.bling_id,
  r.sobre_a_etapa,
  r.vinculo_exato,
  r.botao                                    as botao_rastreio,
  b.cliente                                  as cliente_pedido,
  r.nome_whatsapp,
  -- ── Colunas NOVAS, no fim ───────────────────────────────────────────────
  -- O que a Meta disse depois de aceitar. `falhou` aqui é a diferença entre
  -- "respondi" e "achei que tinha respondido".
  r.msg_status                               as status,
  r.msg_erro_codigo                          as erro_codigo,
  r.msg_erro_detalhe                         as erro_detalhe
from resolvido r
left join public.bling2_esteira b on b.bling_id = r.bling_id;

comment on view public.carbo_wa_conversas is
  'A conversa completa: avisos da esteira e mensagens do webhook na mesma linha do tempo, com o pedido de que tratam. ⚠️ DOIS nomes (`cliente_pedido` do cadastro, `nome_whatsapp` do perfil). E `status`: o que a Meta disse DEPOIS de aceitar o envio — aceitar não é entregar, e uma resposta `falhou` que não aparece na tela faz quem atendeu ir embora achando que respondeu.';

grant select on public.carbo_wa_conversas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O QUE ACONTECEU COM O ÁUDIO. O evento sempre chegou; era o destino que
--     não existia. Aqui ele aparece, pela chave guardada em carbo_wa_eventos.
select
  m.wamid, m.tipo, m.texto, m.ocorrido_em, m.status, m.erro_codigo,
  (select string_agg(split_part(e.chave, ':', 3), ' → ' order by e.recebido_em)
     from public.carbo_wa_eventos e
    where e.chave like 'status:' || m.wamid || ':%')  as status_que_chegaram
from public.carbo_wa_mensagens m
where m.direcao = 'saida'
order by m.ocorrido_em desc
limit 20;

-- (b) Quantas respostas nossas estão sem status nenhum. As antigas ficam assim
--     para sempre — a Meta não reentrega o passado; daqui para frente, não.
select
  count(*)                                   as respostas_nossas,
  count(*) filter (where status is null)     as sem_status,
  count(*) filter (where status = 'falhou')  as falharam
from public.carbo_wa_mensagens where direcao = 'saida';

-- (c) ⚠️ A view continua com security_invoker. Tem de vir `{security_invoker=true}`.
select relname, reloptions from pg_class where relname = 'carbo_wa_conversas';
