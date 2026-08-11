-- ═══════════════════════════════════════════════════════════════════════════
-- A mensagem de recompra, e a janela em 30 dias
--
-- ── Por que 30 e não 45 ───────────────────────────────────────────────────
--
-- Os 45 eram chute meu. As duas únicas recompras observadas aconteceram em
-- 10 e 16 dias — e uma delas é CNPJ (revenda comprando de novo), então na
-- prática há UMA observação de consumo real. Não dá para calibrar com isso,
-- mas dá para afirmar que 45 chega tarde num produto que alguém repõe em 10.
--
-- 30 é meio-termo declarado, não medição. Está em tabela justamente para ser
-- corrigido quando houver base madura — hoje o cliente mais antigo tem 29 dias
-- e ninguém completou uma janela sequer.
--
-- ── A mensagem reaproveita toda a máquina que já existe ───────────────────
--
-- Nada de fila nova, cron novo ou função nova: `recompra` entra como mais uma
-- etapa em `carbo_msg_templates`, ganha uma origem na `carbo_msg_fila` e o
-- `kanban-n8n` a envia como envia as outras. A PK `(bling_id, etapa)` de
-- `carbo_msg_envios` garante UMA oferta por pedido, para sempre.
--
-- ⚠️ Nasce com `ativo = false`. Ligar é decisão sua, e quando ligar, todos os
-- que estiverem na coluna "Hora de ofertar" recebem — que é o comportamento
-- desejado aqui, ao contrário das etapas de entrega. Hoje essa coluna está
-- vazia (ninguém chegou a 30 dias), então ligar agora não dispara nada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_msg_templates
  drop constraint if exists carbo_msg_templates_etapa_check;

alter table public.carbo_msg_templates
  add constraint carbo_msg_templates_etapa_check
  check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito',
                   'saiu_entrega','entregue','recompra'));

insert into public.carbo_msg_templates (etapa, ativo, titulo, texto, atraso_min) values
  ('recompra', false, 'Hora de repor',
   'Oi, {{primeiro_nome}}! Aqui é da Carbo 👋' || chr(10) || chr(10) ||
   'Faz um tempinho que você recebeu seu CarboZé — e é mais ou menos agora que o tratamento pede reforço para o motor seguir limpo.' || chr(10) || chr(10) ||
   'Quer repor? Respondendo aqui eu já monto seu pedido.' || chr(10) || chr(10) ||
   'Se ainda tiver produto em casa, é só ignorar esta mensagem 🙂',
   -- O tempo de espera desta etapa NÃO mora aqui: são os 30 dias da
   -- `carbo_recompra_config`, contados a partir da ENTREGA. `atraso_min` conta
   -- a partir da detecção, que é outra coisa — usá-lo somaria duas esperas.
   0)
on conflict (etapa) do nothing;


-- ── A janela: 30 dias ─────────────────────────────────────────────────────

update public.carbo_recompra_config set dias_para_ofertar = 30, atualizado_em = now();


-- ═══════════════════════════════════════════════════════════════════════════
-- A pipeline: "ofertado" passa a ser qualquer registro, não só o enviado
--
-- ⚠️ Correção de coerência, e ela importa mais do que parece.
--
-- A `carbo_msg_fila` exclui qualquer pedido que JÁ TENHA linha em
-- `carbo_msg_envios`, com qualquer status. Mas a pipeline só considerava
-- "ofertado" quem tivesse `status = 'enviado'`.
--
-- Resultado: um envio que falhou (o `kanban-n8n` grava 'erro' ANTES de tentar,
-- de propósito) sairia da fila e ficaria PARA SEMPRE na coluna "Hora de
-- ofertar" — um card pedindo uma ação que o sistema nunca mais vai executar.
-- O pior tipo de tela: a que mostra trabalho que não existe.
--
-- Agora as duas pontas usam a mesma régua: existe linha, saiu da fila e saiu
-- da coluna. Se o envio falhou, quem mostra é a tela de mensagens, que tem o
-- motivo — e não um card mudo esperando eternamente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_recompra_pipeline
with (security_invoker = true) as
with cfg as (
  select dias_para_ofertar, dias_para_desistir from public.carbo_recompra_config where id
),
entregue as (
  select e.bling_id, e.pedido_loja, e.canal, e.cliente, e.cliente_fone, e.total,
         e.entrega_cidade, e.entrega_uf,
         bo.contato_id, c.cpf_cnpj,
         ca.entregue_em, ca.origem
  from public.bling2_esteira e
  join public.bling2_orders  bo on bo.bling_id = e.bling_id
  join public.carbo_entrega_carimbo ca on ca.bling_id = e.bling_id
  left join public.bling2_contacts c on c.bling_id = bo.contato_id
  where e.etapa = 'entregue'
),
com_recompra as (
  select ent.*,
    exists (
      select 1
      from public.bling2_orders b2
      join public.bling2_contacts c2 on c2.bling_id = b2.contato_id
      where c2.cpf_cnpj = ent.cpf_cnpj
        and ent.cpf_cnpj is not null
        and b2.bling_id <> ent.bling_id
        and b2.situacao_id = 9
        and b2.data::date > ent.entregue_em::date
    ) as recomprou,
    -- Qualquer registro, não só o enviado — mesma régua da fila.
    (select coalesce(v.enviado_em, v.detectado_em) from public.carbo_msg_envios v
      where v.bling_id = ent.bling_id and v.etapa = 'recompra') as ofertado_em
  from entregue ent
)
select
  r.bling_id, r.pedido_loja, r.canal, r.cliente, r.cliente_fone, r.cpf_cnpj,
  r.total, r.entrega_cidade, r.entrega_uf, r.entregue_em,
  r.origem                                       as origem_da_data,
  r.ofertado_em,
  r.recomprou,
  (current_date - r.entregue_em::date)           as dias_desde_entrega,
  case
    when r.recomprou                                          then 'recomprou'
    when r.origem = 'historico'                               then 'historico'
    when r.ofertado_em is not null
     and current_date - r.ofertado_em::date > (select dias_para_desistir from cfg)
                                                              then 'sem_retorno'
    when r.ofertado_em is not null                            then 'ofertado'
    when current_date - r.entregue_em::date >= (select dias_para_ofertar from cfg)
                                                              then 'ofertar'
    else                                                           'entregue'
  end                                            as coluna
from com_recompra r;


-- ═══════════════════════════════════════════════════════════════════════════
-- A fila ganha a terceira origem
--
-- Origem 1: a etapa da esteira.       Origem 2: `saiu_entrega`, do rastreio.
-- Origem 3: a régua de recompra — quem está na coluna "ofertar".
--
-- ⚠️ `historico` NÃO entra: a coluna dele nunca é 'ofertar' (o CASE trata
-- histórico antes), então os 85 pedidos com data estimada ficam fora do
-- disparo automático por construção, não por filtro que alguém pode remover
-- sem perceber.
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

  -- Origem 3: régua de recompra.
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
  r.previsao_entrega                               as previsao
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

-- (a) As sete etapas, todas desligadas.
select etapa, ativo, titulo, atraso_min
from public.carbo_msg_templates
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue','recompra'],
  etapa);

-- (b) A janela nova, e como a base se distribui com ela.
select (select dias_para_ofertar from public.carbo_recompra_config where id) as janela_dias;

select coluna, count(*) as pedidos
from public.carbo_recompra_pipeline
group by coluna order by 2 desc;

-- (c) A fila continua VAZIA (todos os templates desligados). Se ligar o de
--     recompra, aqui aparece quem está em "Hora de ofertar" — e é exatamente
--     isso que será enviado.
select etapa, count(*) as na_fila
from public.carbo_msg_fila
group by etapa;
