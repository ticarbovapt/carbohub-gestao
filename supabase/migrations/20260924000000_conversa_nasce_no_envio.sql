-- ═══════════════════════════════════════════════════════════════════════════
-- A conversa começa no que NÓS mandamos
--
-- ── O problema, dito por quem vai atender ─────────────────────────────────
--
-- "A pessoa que vai fazer o atendimento precisa saber o que já foi enviado ao
-- cliente."
--
-- Até aqui a `carbo_wa_conversas` só mostrava `carbo_wa_mensagens`, que o
-- webhook preenche — ou seja, a resposta do cliente e o que o atendimento
-- digitou. Os seis avisos da esteira ficavam de fora: eles são enviados pelo
-- `whatsapp-meta`, que grava em `carbo_msg_envios`.
--
-- O efeito é uma conversa que começa no meio. O cliente escreve "e o meu
-- código?" e quem abre a tela não vê que o rastreio foi mandado há duas horas
-- — responde no escuro, ou repete o que já foi dito.
--
-- ── ⚠️ Por que UNION e não copiar as linhas ──────────────────────────────
--
-- A tentação é o `whatsapp-meta` gravar também em `carbo_wa_mensagens` a cada
-- envio. Seriam duas escritas para o mesmo fato, com duas chances de divergir —
-- e a segunda ficaria para trás em toda mensagem já enviada antes de hoje.
--
-- Aqui a origem continua sendo uma só por tipo de mensagem: aviso da esteira
-- mora em `carbo_msg_envios`, conversa mora em `carbo_wa_mensagens`, e a view
-- junta. Mudou a regra de uma, a tela muda junto.
--
-- ── O que entra, e o que fica de fora ─────────────────────────────────────
--
-- Entra o que a Meta ACEITOU (tem `wamid`) e foi para um número conhecido
-- (`wa_id`). Fica de fora `pendente`, `ignorado` e `erro`: nenhum deles chegou
-- ao cliente, e mostrá-los como balão faria quem atende responder como se já
-- tivesse dito aquilo — é a mesma razão pela qual o `whatsapp-responder` só
-- grava o que saiu.
--
-- ⚠️ E fica de fora o canal `evolution`: aquelas mensagens saem por OUTRO
-- número (o comercial), e misturá-las aqui mostraria na conversa do número de
-- serviço algo que o cliente recebeu noutro lugar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
with tudo as (
  -- ── O que o webhook capturou: a resposta do cliente e o que o atendimento
  --    digitou pela tela.
  select
    m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
    m.ocorrido_em, m.responde_a,
    null::bigint as envio_bling_id,
    null::text   as envio_etapa
  from public.carbo_wa_mensagens m

  union all

  -- ── Os avisos da esteira. `carbo_msg_envios` não guarda o texto final da
  --    mensagem nas etapas da Meta (a redação é da Meta), então o que se mostra
  --    é o TÍTULO da etapa. Inventar aqui um texto parecido com o aprovado
  --    seria pior que não ter: quem atende leria uma coisa e o cliente teria
  --    recebido outra.
  select
    v.wamid, v.wa_id, 'saida', 'template',
    coalesce(t.titulo, v.etapa),
    null::text,
    v.enviado_em, null::text,
    v.bling_id, v.etapa
  from public.carbo_msg_envios v
  left join public.carbo_msg_templates t on t.etapa = v.etapa
  where v.canal = 'meta'
    and v.wamid is not null
    and v.wa_id is not null
    and v.enviado_em is not null
    -- Só o que a Meta aceitou. `falhou` tem wamid às vezes, mas não chegou.
    and v.status in ('enviado','entregue','lido')
)
select
  x.wamid,
  x.wa_id,
  c.nome                                     as cliente,
  x.direcao,
  x.tipo,
  x.texto,
  x.midia_id,
  x.ocorrido_em,
  -- Três caminhos até o pedido, do mais exato para o mais frouxo:
  --   1. é o próprio aviso da esteira — o pedido é dele
  --   2. o `context.id` da resposta do cliente
  --   3. o último aviso mandado àquele número antes desta mensagem
  coalesce(x.envio_bling_id, e.bling_id, u.bling_id) as bling_id,
  coalesce(x.envio_etapa,    e.etapa,    u.etapa)    as sobre_a_etapa,
  -- ⚠️ `vinculo_exato` só é verdade nos dois primeiros. O terceiro é
  -- aproximação, e aproximação que se passa por certeza é como alguém responde
  -- sobre o pedido errado.
  (x.envio_bling_id is not null or e.bling_id is not null) as vinculo_exato
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
) u on true;

comment on view public.carbo_wa_conversas is
  'A conversa completa: os avisos da esteira (carbo_msg_envios) e as mensagens do webhook (carbo_wa_mensagens), na mesma linha do tempo. ⚠️ Só entra aviso que a Meta ACEITOU e que foi pelo canal meta — pendente, erro e evolution ficam de fora, porque mostrá-los como balão faria quem atende responder como se ja tivesse dito aquilo. Cada tipo de mensagem tem UMA origem: unir na view evita duas escritas para o mesmo fato.';

grant select on public.carbo_wa_conversas to authenticated;


-- ── ⚠️ O contato precisa existir antes da primeira resposta ───────────────
--
-- `cliente` vem de `carbo_wa_contatos`, que o webhook só preenche quando a
-- pessoa ESCREVE. Sem isto, todo aviso enviado apareceria na lista como um
-- número solto até o cliente responder — e a maioria nunca responde.
--
-- `last_inbound_at` fica NULO de propósito: a janela de 24 h só abre com
-- mensagem do cliente, e preencher aqui abriria a porta para o atendimento
-- escrever texto livre para quem nunca falou (erro 131047, e do lado da Meta
-- uma tentativa de contato não solicitado).

create or replace function public.carbo_wa_semear_contatos()
returns integer language plpgsql security definer set search_path = public as $$
declare v_qtd integer := 0;
begin
  insert into public.carbo_wa_contatos (wa_id, nome, last_inbound_at)
  select distinct on (v.wa_id)
         v.wa_id,
         nullif(trim(coalesce(b.cliente, '')), ''),
         null
  from public.carbo_msg_envios v
  left join public.bling2_esteira b on b.bling_id = v.bling_id
  where v.canal = 'meta' and v.wa_id is not null and v.wamid is not null
  order by v.wa_id, v.enviado_em desc
  on conflict (wa_id) do update
    -- Só preenche nome vazio. O nome do PERFIL do WhatsApp, que o webhook
    -- grava, é o que a pessoa escolheu — vale mais que o do cadastro fiscal.
    set nome = coalesce(nullif(trim(public.carbo_wa_contatos.nome), ''), excluded.nome);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

comment on function public.carbo_wa_semear_contatos is
  'Cria o contato de quem já recebeu aviso da esteira, para a conversa ter nome antes da primeira resposta. ⚠️ last_inbound_at fica NULO: a janela de 24h só abre com mensagem do cliente.';

select public.carbo_wa_semear_contatos() as contatos_semeados;


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) A conversa agora tem as duas origens. `template` são os avisos da
--     esteira; `text` e os demais são o webhook.
select direcao, tipo, count(*) from public.carbo_wa_conversas
group by 1, 2 order by 3 desc;

-- (b) ⚠️ Nenhum aviso que NÃO chegou pode aparecer. Tem de vir ZERO.
select count(*) as vazamento_de_nao_enviado
from public.carbo_wa_conversas c
join public.carbo_msg_envios v on v.wamid = c.wamid
where v.status not in ('enviado','entregue','lido');

-- (c) A linha do tempo de quem já conversou, do jeito que a tela vai mostrar.
select ocorrido_em, cliente, direcao, tipo, coalesce(texto, '(arquivo)') as conteudo,
       sobre_a_etapa, vinculo_exato
from public.carbo_wa_conversas
order by ocorrido_em desc limit 30;
