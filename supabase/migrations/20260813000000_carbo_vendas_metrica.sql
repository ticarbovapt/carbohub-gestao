-- ═══════════════════════════════════════════════════════════════════════════
-- FONTE ÚNICA: o que conta como venda
--
-- O sistema tinha ~14 definições diferentes de "venda que conta" espalhadas
-- por 26 lugares. Dashboards da diretoria somavam até orçamento como receita;
-- dentro da MESMA tela, os KPIs excluíam orçamento e a aba de canais incluía.
--
-- A regra abaixo é a de metas e comissão (a que rege dinheiro), com duas
-- correções vindas da conferência dos dados reais:
--
--   • NF SABIDAMENTE INVÁLIDA desqualifica. A sincronização grava a situação
--     da nota mas ninguém lia: nota Rejeitada/Cancelada/Denegada seguia
--     contando como faturamento.
--
--   • ENTREGUE/ENVIADO conta mesmo sem NF vinculada. Não é leniência: são 13
--     pedidos (R$ 65 mil) nascidos no Bling cuja nota existe mas nunca foi
--     vinculada — o casamento automático procura o código "V…"/"PED-…" na
--     observação da nota, e pedido nascido no Bling não tem esse código.
--     Mercadoria entregue foi faturada; o que falta é o vínculo, não a nota.
--     Quando o financeiro vincular, o número NÃO muda — já contavam.
--
-- Não conta: orçamento, cancelado, excluído da métrica, pedido pendente sem
-- NF, e pedido com NF inválida.
-- ═══════════════════════════════════════════════════════════════════════════

-- Situações do Bling que representam nota FISCALMENTE VÁLIDA.
-- 'Pendente' e 'Aguardando…' não entram: ainda não são documento válido —
-- mas também não desqualificam, porque são transitórias.
create or replace function public.carbo_nf_valida(p_situacao text)
returns boolean language sql immutable as $$
  select coalesce(p_situacao, '') in ('Emitida DANFE', 'Autorizada', 'Registrada');
$$;

-- Situações que INVALIDAM: a nota existe e sabemos que não vale.
create or replace function public.carbo_nf_invalida(p_situacao text)
returns boolean language sql immutable as $$
  select coalesce(p_situacao, '') in ('Cancelada', 'Denegada', 'Rejeitada', 'Bloqueada');
$$;

comment on function public.carbo_nf_valida is
  'Situação de NF do Bling que representa documento fiscal válido.';
comment on function public.carbo_nf_invalida is
  'Situação de NF do Bling sabidamente inválida — desqualifica o pedido da métrica.';

-- ── A view ────────────────────────────────────────────────────────────────
-- security_invoker: a RLS de carboze_orders continua valendo para quem lê.
-- Sem isso, a view viraria um bypass de permissão com cara de conveniência.
create or replace view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  n.numero            as nf_numero,
  n.situacao          as nf_situacao,
  n.chave_acesso      as nf_chave,
  n.valor_total       as nf_valor,
  public.carbo_nf_valida(n.situacao)    as nf_valida,
  public.carbo_nf_invalida(n.situacao)  as nf_invalida,
  -- Data efetiva da venda. Havia telas usando created_at e outras
  -- coalesce(sale_date, created_at) — correção de data movia a venda de mês
  -- na comissão e não movia no dashboard.
  coalesce(o.sale_date, o.created_at::date) as data_efetiva,
  -- ── A REGRA ────────────────────────────────────────────────────────────
  (
        o.status not in ('quote', 'cancelled')
    and o.excluir_metricas <> true
    -- nota conhecida e ruim derruba, mesmo com o pedido entregue
    and not (o.bling_nf_id is not null and public.carbo_nf_invalida(n.situacao))
    and (
          public.carbo_nf_valida(n.situacao)
       or o.status in ('invoiced', 'shipped', 'delivered')
    )
  ) as conta_metrica,
  -- Por que não conta — para a tela poder explicar em vez de só omitir.
  case
    when o.status = 'quote'                 then 'orcamento'
    when o.status = 'cancelled'             then 'cancelado'
    when o.excluir_metricas = true          then 'excluido_manualmente'
    when o.bling_nf_id is not null
     and public.carbo_nf_invalida(n.situacao) then 'nf_invalida'
    when not public.carbo_nf_valida(n.situacao)
     and o.status not in ('invoiced','shipped','delivered') then 'aguardando_nf'
    else null
  end as motivo_fora
from public.carboze_orders o
left join public.bling_nfe n on n.bling_id = o.bling_nf_id;

comment on view public.carbo_vendas_metrica is
  'Fonte ÚNICA de "esta venda conta". Use conta_metrica e data_efetiva em vez de reimplementar o filtro. security_invoker: respeita a RLS de quem chama.';

grant select on public.carbo_vendas_metrica to authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Esperado hoje: ~212 pedidos contando, ~R$ 525.893.
do $$
declare c int; v numeric;
begin
  select count(*), coalesce(sum(total),0) into c, v
  from public.carbo_vendas_metrica where conta_metrica;
  raise notice 'Contam para métrica: % pedidos, R$ %', c, round(v,2);
end $$;
