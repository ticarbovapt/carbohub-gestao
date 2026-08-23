-- ═══════════════════════════════════════════════════════════════════════════
-- O nome do cliente aparece antes de ele responder
--
-- ── O problema ───────────────────────────────────────────────────────────
--
-- Na lista, cliente que nunca respondeu aparece como `557591355881`. Faz
-- sentido do ponto de vista do WhatsApp — o nome do perfil só chega quando a
-- pessoa escreve —, mas nós JÁ SABEMOS quem é: o número está amarrado a um
-- pedido, e o pedido tem o nome completo.
--
-- Vinte linhas de número são vinte linhas que ninguém consegue varrer.
--
-- ── ⚠️ Dois nomes, e os dois importam ────────────────────────────────────
--
--   cliente_pedido   o nome do CADASTRO — o que a equipe conhece
--   nome_whatsapp    o nome que a PESSOA escolheu no perfil
--
-- Eles divergem com frequência ("advmauro166", "Léo", apelidos, nome da
-- empresa). Mostrar só um dos dois quebra de um jeito diferente:
--
--   só o do pedido    a pessoa procura pelo nome que viu no WhatsApp e não acha
--   só o do WhatsApp  é o problema de hoje, e ainda esconde quem nunca escreveu
--
-- Então a tela mostra o do pedido em destaque e o do WhatsApp numa linha
-- discreta, QUANDO forem diferentes. A busca acha pelos dois.
--
-- ── Por que na view e não numa rotina de semeadura ───────────────────────
--
-- ⚠️ Já existe a `carbo_wa_semear_contatos`, e ela é do tipo que engana:
-- preenche o nome de quem já recebeu aviso NO MOMENTO em que roda. Pedido que
-- chegar depois nasce sem nome de novo — foi exatamente o que aconteceu com
-- estas vinte conversas. Resolver na view vale para sempre e não depende de
-- ninguém lembrar de rodar nada.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view resolve os dois nomes                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `cliente_pedido` e `nome_whatsapp` entram no FIM. A coluna `cliente`
-- continua existindo com o mesmo significado de antes (o nome do contato do
-- WhatsApp) — `create or replace view` não deixa renomear nem reordenar.

create or replace view public.carbo_wa_conversas
with (security_invoker = true) as
with tudo as (
  select
    m.wamid, m.wa_id, m.direcao, m.tipo, m.texto, m.midia_id,
    m.ocorrido_em, m.responde_a,
    null::bigint as envio_bling_id,
    null::text   as envio_etapa,
    null::text   as botao
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
    public.carbo_wa_botao_do_template(v.payload)
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
    x.botao
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
  -- ── Colunas NOVAS, no fim ───────────────────────────────────────────────
  -- O nome do CADASTRO. É o que a equipe conhece, e existe desde o primeiro
  -- aviso — muito antes de a pessoa responder qualquer coisa.
  b.cliente                                  as cliente_pedido,
  -- O nome que a PESSOA escolheu. Repetido com nome próprio para a tela poder
  -- mostrar os dois sem depender de qual deles caiu na coluna `cliente`.
  r.nome_whatsapp
from resolvido r
-- ⚠️ Sem `distinct`: `bling2_esteira` tem uma linha por pedido e o join é pela
-- chave primária dela, então não multiplica. Se um dia multiplicar, a conversa
-- ganharia mensagens duplicadas — vale conferir com a consulta (c) abaixo.
left join public.bling2_esteira b on b.bling_id = r.bling_id;

comment on view public.carbo_wa_conversas is
  'A conversa completa: avisos da esteira e mensagens do webhook na mesma linha do tempo, com o pedido de que tratam. ⚠️ DOIS nomes: `cliente_pedido` (do cadastro, existe desde o primeiro aviso) e `nome_whatsapp` (o que a pessoa escolheu no perfil, só depois que ela escreve). Eles divergem com frequência, e a tela mostra os dois — mostrar só um esconde a pessoa de quem procura pelo outro.';

grant select on public.carbo_wa_conversas to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O NÚMERO QUE IMPORTA: quantas conversas deixam de ser um número solto.
--     Antes, só quem respondeu tinha nome.
select
  count(*) filter (where cliente_pedido is not null)                     as com_nome_do_pedido,
  count(*) filter (where nome_whatsapp is not null)                      as com_nome_do_whatsapp,
  count(*) filter (where cliente_pedido is null and nome_whatsapp is null) as ainda_so_numero
from (select distinct wa_id, cliente_pedido, nome_whatsapp
      from public.carbo_wa_conversas) t;

-- (b) Onde os dois nomes divergem — é para estes casos que a linha discreta
--     existe. Se vier muita coisa, a decisão de mostrar os dois se paga.
select distinct wa_id, cliente_pedido, nome_whatsapp
from public.carbo_wa_conversas
where cliente_pedido is not null and nome_whatsapp is not null
  and lower(trim(cliente_pedido)) <> lower(trim(nome_whatsapp));

-- (c) ⚠️ A prova de que o join novo não multiplicou mensagem: cada wamid tem
--     de aparecer UMA vez. Tem de vir ZERO.
select count(*) as wamids_duplicados
from (select wamid from public.carbo_wa_conversas
      group by wamid having count(*) > 1) t;
