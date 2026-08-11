-- ═══════════════════════════════════════════════════════════════════════════
-- Um número de WhatsApp por função
--
-- ── Por que isso não é detalhe ────────────────────────────────────────────
--
-- Aviso de entrega e oferta de recompra são conversas de naturezas opostas. A
-- primeira é serviço: o cliente QUER receber, e responder ali é atendimento. A
-- segunda é comercial: pode ser ignorada, pode incomodar, e quem responde está
-- comprando.
--
-- Misturar as duas no mesmo número tem dois custos concretos:
--
--   1. Quem bloqueia o número por causa da oferta perde também o "seu pedido
--      saiu para entrega" — ou seja, uma campanha mal recebida derruba o canal
--      de serviço junto.
--   2. O atendimento não consegue separar "cliente com problema na entrega" de
--      "cliente respondendo campanha" na mesma caixa.
--
-- ── Como fica ─────────────────────────────────────────────────────────────
--
-- Cada template diz de qual instância da Evolution ele sai. `null` = a
-- instância padrão (a do secret `EVOLUTION_INSTANCE`), que é o comportamento
-- de hoje — então esta migração não muda nada sozinha.
--
-- Quem roteia é o n8n: o `kanban-n8n` passa a mandar `instancia` no payload, e
-- o fluxo lá escolhe por qual número enviar. O sistema não precisa saber qual
-- número é qual; ele precisa dizer QUAL FUNÇÃO está falando.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_msg_templates
  add column if not exists instancia text;

comment on column public.carbo_msg_templates.instancia is
  'Instância da Evolution por onde esta mensagem sai. NULL = instância padrão (secret EVOLUTION_INSTANCE). Serve para separar o número de SERVIÇO (avisos de entrega) do número COMERCIAL (recompra): quem bloqueia por causa da campanha não pode perder o aviso de entrega junto.';

-- A recompra já nasce apontando para um número próprio. O nome é uma
-- convenção — o que existe de fato do lado da Evolution é você quem cria.
update public.carbo_msg_templates
set instancia = 'carbo-comercial'
where etapa = 'recompra' and instancia is null;


-- ═══════════════════════════════════════════════════════════════════════════
-- A fila passa a carregar a instância
--
-- Só acrescenta a coluna no fim; o resto da view é idêntico.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega'
    and r.entregue_em is null
    and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.canal, e.total, e.nf_numero, e.transportadora, e.servico, e.rastreio,
         e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'
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
  coalesce(b.pedido_loja, b.pedido_numero, '')     as pedido,
  b.canal,
  b.total                                          as valor,
  b.nf_numero                                      as nf,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id and v.etapa = b.etapa
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select etapa, ativo, coalesce(instancia, '(padrão)') as sai_por, titulo
from public.carbo_msg_templates
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue','recompra'],
  etapa);
