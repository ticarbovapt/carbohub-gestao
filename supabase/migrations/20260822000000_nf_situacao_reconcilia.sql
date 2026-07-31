-- ═══════════════════════════════════════════════════════════════════════════
-- Reconcilia bling_nfe.situacao com o que o Bling já respondeu
--
-- O sync tem duas rotinas de backfill que buscam o DETALHE da nota, gravam o
-- `raw_data` fresco e esquecem de gravar a coluna `situacao`. Resultado: o
-- JSON guardado diz "2" (Cancelada) e a coluna segue "Emitida DANFE".
--
-- Isso não é cosmético. TUDO que decide se uma venda conta lê a coluna:
-- carbo_vendas_metrica, a fila de faturamento e o aviso de NF cancelada. Uma
-- nota cancelada passava por válida em todos eles — a NF 000326, de
-- R$ 2.800, é o caso que apareceu.
--
-- O código do sync foi corrigido para gravar a situação junto. Esta migração
-- conserta o passivo: as notas cujo raw_data já sabe a resposta certa.
-- ═══════════════════════════════════════════════════════════════════════════

-- Mesmo dicionário do NFE_SITUACAO_LABELS da edge function. Se um dia mudar
-- lá, muda aqui — são duas cópias porque uma vive em TS e a outra em SQL.
create or replace function public.carbo_nfe_situacao_label(p_codigo text)
returns text language sql immutable as $$
  select case p_codigo
    when '1'  then 'Pendente'
    when '2'  then 'Cancelada'
    when '3'  then 'Aguardando recibo'
    when '4'  then 'Rejeitada'
    when '5'  then 'Autorizada'
    when '6'  then 'Emitida DANFE'
    when '7'  then 'Registrada'
    when '8'  then 'Aguardando protocolo'
    when '9'  then 'Denegada'
    when '10' then 'Consulta situação'
    when '11' then 'Bloqueada'
    else null
  end;
$$;

comment on function public.carbo_nfe_situacao_label is
  'Código de situação da NF no Bling → rótulo. Espelha NFE_SITUACAO_LABELS da edge function bling-sync.';

-- ── Antes: quem está divergente ───────────────────────────────────────────
select n.numero,
       n.situacao                                            as coluna_atual,
       n.raw_data->>'situacao'                               as codigo_do_bling,
       public.carbo_nfe_situacao_label(n.raw_data->>'situacao') as deveria_ser,
       o.order_number, o.customer_name, o.total
from public.bling_nfe n
left join public.carboze_orders o on o.bling_nf_id = n.bling_id
where jsonb_typeof(n.raw_data->'situacao') = 'number'
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is not null
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is distinct from n.situacao
order by o.total desc nulls last;

-- ── Correção ──────────────────────────────────────────────────────────────
-- Só onde o raw_data traz a situação como NÚMERO e o rótulo é conhecido.
-- Sem essas guardas, uma nota cujo raw_data veio da LISTA (formato diferente)
-- teria a situação sobrescrita por nulo.
update public.bling_nfe n
set situacao = public.carbo_nfe_situacao_label(n.raw_data->>'situacao'),
    updated_at = now()
where jsonb_typeof(n.raw_data->'situacao') = 'number'
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is not null
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is distinct from n.situacao;

-- ── Depois ────────────────────────────────────────────────────────────────

-- (a) Não pode sobrar divergência.
select count(*) as ainda_divergentes
from public.bling_nfe n
where jsonb_typeof(n.raw_data->'situacao') = 'number'
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is not null
  and public.carbo_nfe_situacao_label(n.raw_data->>'situacao') is distinct from n.situacao;

-- (b) NFs inválidas ainda vinculadas a pedido — agora com as que estavam
--     escondidas atrás da situação errada. Cada linha é faturamento que
--     saiu da conta.
select n.numero, n.situacao, o.order_number, o.customer_name, o.total,
       o.status, o.fulfillment_stage
from public.bling_nfe n
join public.carboze_orders o on o.bling_nf_id = n.bling_id
where public.carbo_nf_invalida(n.situacao)
order by o.total desc;
