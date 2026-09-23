-- ═══════════════════════════════════════════════════════════════════════════
-- NFS-e: são TRÊS tipos de evento, e dois deles cancelam
--
-- Medido em 23/09/2026, logo depois da primeira carga (762 documentos):
--
--   CONFIRMACAO_TOMADOR            31 eventos · 31 notas
--   CANCELAMENTO                   27 eventos · 27 notas
--   CANCELAMENTO_POR_SUBSTITUICAO   8 eventos ·  8 notas
--
-- A `20261002` só conhecia `CANCELAMENTO`. Consequência: **8 notas apareciam
-- como válidas depois de terem sido canceladas e substituídas** — e nenhuma
-- delas dava erro, porque a view simplesmente não achava evento para elas.
--
-- ⚠️ O sinal que denunciou foi uma ARITMÉTICA QUE NÃO FECHOU: 66 eventos para
-- 27 notas marcadas como canceladas. Dois números que deveriam bater e não
-- batiam. Sem essa conferência, a tela nasceria mostrando nota cancelada como
-- boa, e ninguém teria por que desconfiar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ LISTA BRANCA EXPLÍCITA, nunca "tudo que não é CONFIRMACAO_TOMADOR"
--
-- A regra negativa é mais curta e está errada pelo motivo de sempre: tipo de
-- evento NOVO passaria a cancelar nota sozinho, calado. É a mesma lição já
-- paga em `cancelado_na_loja`, onde `not ecommerce_status_e_venda(...)` teria
-- marcado como cancelado todo pedido ainda não pago.
--
-- Evento de tipo desconhecido aqui não faz NADA — e aparece em
-- `carbo_nfse_eventos_tipos`, que é a lista de trabalho.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ CANCELAMENTO e SUBSTITUIÇÃO não são a mesma coisa para quem lê
--
-- Os dois tiram a nota do valor válido, então `cancelada` cobre os dois. Mas
-- "cancelei" e "cancelei porque emiti outra no lugar" pedem ações diferentes de
-- quem confere o mês — na substituição existe uma nota nova e o valor não
-- sumiu. Por isso `cancelamento_tipo` vai junto, em coluna própria.
--
-- `CONFIRMACAO_TOMADOR` é o oposto: é o tomador CONFIRMANDO a nota. Tratá-lo
-- como cancelamento inverteria o significado — 31 notas boas viradas do avesso.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_nfse_evento_cancela(p_tipo text)
returns boolean
language sql immutable as $$
  select upper(coalesce(p_tipo,'')) in ('CANCELAMENTO','CANCELAMENTO_POR_SUBSTITUICAO');
$$;

comment on function public.carbo_nfse_evento_cancela(text) is
  'Lista BRANCA dos eventos que tiram a nota do valor valido. Explicita de proposito: a regra negativa faria tipo de evento novo cancelar nota sozinho, calado.';

-- ───────────────────────────────────────────────────────────────────────────
-- A lista de trabalho: tipo de evento que o sistema ainda não sabe interpretar
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.carbo_nfse_eventos_tipos
with (security_invoker = true) as
select
  e.tipo_evento,
  count(*)                     as eventos,
  count(distinct e.chave_acesso) as notas,
  max(e.ocorrido_em)           as mais_recente,
  public.carbo_nfse_evento_cancela(e.tipo_evento) as cancela,
  -- ⚠️ `conhecido = false` é o que impede este caso de se repetir em silêncio.
  -- `CANCELAMENTO_POR_SUBSTITUICAO` existia desde a primeira carga e passou
  -- despercebido porque nada perguntava "que tipos existem?".
  (upper(coalesce(e.tipo_evento,'')) in
     ('CANCELAMENTO','CANCELAMENTO_POR_SUBSTITUICAO','CONFIRMACAO_TOMADOR')) as conhecido
from public.carbo_nfse_eventos e
group by e.tipo_evento;

comment on view public.carbo_nfse_eventos_tipos is
  'Censo dos tipos de evento do ADN. `conhecido = false` e lista de trabalho: tipo novo nao faz nada ate alguem decidir o que ele significa.';

grant select on public.carbo_nfse_eventos_tipos to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- A visão, agora com os três tipos
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `carbo_nfse_eventos_orfaos` depende de `carbo_nfse_eventos`, não desta —
-- mas `create or replace view` sobre `carbo_nfse_visao` muda a LISTA de
-- colunas, e isso o `replace` recusa. Por isso o drop, e por isso a cláusula
-- `with (security_invoker = true)` é REPETIDA: `CREATE VIEW` sem `WITH` apaga
-- as reloptions, e foi assim que a `bling2_esteira` passou a rodar com os
-- privilégios do dono, ignorando RLS.
drop view if exists public.carbo_nfse_visao;

create view public.carbo_nfse_visao
with (security_invoker = true) as
select
  n.*,
  case
    when public.carbo_nfse_cnpj() = '' or public.carbo_nfse_cnpj() is null then 'indefinido'
    when regexp_replace(coalesce(n.emit_cnpj,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'emitida'
    when regexp_replace(coalesce(n.toma_doc,''), '\D', '', 'g') = public.carbo_nfse_cnpj() then 'recebida'
    else 'indefinido'
  end as papel,

  (c.chave_acesso is not null)                                   as cancelada,
  c.tipo_evento                                                  as cancelamento_tipo,
  c.ocorrido_em                                                  as cancelada_em,
  c.motivo                                                       as cancelamento_motivo,
  (t.chave_acesso is not null)                                   as confirmada_tomador,
  t.ocorrido_em                                                  as confirmada_em
from public.carbo_nfse_notas n
left join lateral (
  select e.chave_acesso, e.tipo_evento, e.ocorrido_em, e.motivo
  from public.carbo_nfse_eventos e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and public.carbo_nfse_evento_cancela(e.tipo_evento)
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) c on true
left join lateral (
  select e.chave_acesso, e.ocorrido_em
  from public.carbo_nfse_eventos e
  where e.ambiente = n.ambiente
    and e.chave_acesso = n.chave_acesso
    and upper(coalesce(e.tipo_evento,'')) = 'CONFIRMACAO_TOMADOR'
  order by e.ocorrido_em desc nulls last, e.nsu desc
  limit 1
) t on true;

comment on view public.carbo_nfse_visao is
  'A NFS-e pronta para tela. `cancelada` cobre CANCELAMENTO e CANCELAMENTO_POR_SUBSTITUICAO — os dois tiram a nota do valor valido —, e `cancelamento_tipo` distingue os dois, porque na substituicao existe nota nova e o valor nao sumiu. CONFIRMACAO_TOMADOR e o OPOSTO de cancelamento e nunca entra ali.';

grant select on public.carbo_nfse_visao to authenticated;
