-- ═══════════════════════════════════════════════════════════════════════════
-- A métrica passa a enxergar a NF do Bling 2
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- `carbo_vendas_metrica` é a fonte ÚNICA de "esta venda conta". Ela resolve a
-- nota assim:
--
--     left join public.bling_nfe n on n.bling_id = o.bling_nf_id
--
-- `bling_nfe` é o espelho do Bling **1**. A ponte do Bling 2 grava em
-- `carboze_orders.bling_nf_id` o id da nota da conta **2** — outro universo de
-- ids. Duas consequências:
--
-- 1. Para pedido BLING2-*, a nota nunca é encontrada: `nf_situacao` fica nula,
--    `nf_valida` falso, e o pedido só conta porque está `delivered`. Funciona
--    por acidente, não por regra — e a coluna de NF aparece vazia na tela,
--    mesmo com o pedido tendo número e chave gravados.
--
-- 2. ⚠️ O risco de verdade: se um id do Bling 2 COINCIDIR com um do Bling 1, a
--    view associa a NOTA ERRADA. Uma nota cancelada de uma empresa derrubaria
--    a venda da outra, ou o contrário. Hoje a colisão é zero — verificado —,
--    mas isso é sorte, não invariante: os dois Blings numeram por conta
--    própria e nada impede o encontro amanhã.
--
-- ── A correção ────────────────────────────────────────────────────────────
--
-- Cada pedido consulta o espelho da SUA conta. A origem está em `source_file`
-- ('bling2_bridge' é escrito só pela ponte do Bling 2), então o join fica
-- condicionado a ela: um pedido nunca lê a tabela do outro Bling, e a colisão
-- deixa de ser possível — não por os ids serem diferentes, mas porque a
-- consulta não os compara mais.
--
-- ⚠️ CREATE OR REPLACE VIEW não deixa renomear coluna, mudar tipo nem reordenar.
-- Nomes, ordem e tipos abaixo são exatamente os de antes; muda só de onde o
-- valor vem.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  coalesce(n1.numero,       n2.numero)       as nf_numero,
  coalesce(n1.situacao,     n2.situacao)     as nf_situacao,
  coalesce(n1.chave_acesso, n2.chave_acesso) as nf_chave,
  coalesce(n1.valor_total,  n2.valor_total)  as nf_valor,
  public.carbo_nf_valida(coalesce(n1.situacao, n2.situacao))    as nf_valida,
  public.carbo_nf_invalida(coalesce(n1.situacao, n2.situacao))  as nf_invalida,
  coalesce(o.sale_date, o.created_at::date) as data_efetiva,
  -- ── A REGRA (inalterada) ───────────────────────────────────────────────
  (
        o.status not in ('quote', 'cancelled')
    and o.excluir_metricas <> true
    and not (o.bling_nf_id is not null
             and public.carbo_nf_invalida(coalesce(n1.situacao, n2.situacao)))
    and (
          public.carbo_nf_valida(coalesce(n1.situacao, n2.situacao))
       or o.status in ('invoiced', 'shipped', 'delivered')
    )
  ) as conta_metrica,
  case
    when o.status = 'quote'                 then 'orcamento'
    when o.status = 'cancelled'             then 'cancelado'
    when o.excluir_metricas = true          then 'excluido_manualmente'
    when o.bling_nf_id is not null
     and public.carbo_nf_invalida(coalesce(n1.situacao, n2.situacao)) then 'nf_invalida'
    when not public.carbo_nf_valida(coalesce(n1.situacao, n2.situacao))
     and o.status not in ('invoiced','shipped','delivered') then 'aguardando_nf'
    else null
  end as motivo_fora
from public.carboze_orders o
-- Bling 1: todo pedido que NÃO veio da ponte do Bling 2.
left join public.bling_nfe  n1 on n1.bling_id = o.bling_nf_id
                              and coalesce(o.source_file, '') <> 'bling2_bridge'
-- Bling 2: só os da ponte.
left join public.bling2_nfe n2 on n2.bling_id = o.bling_nf_id
                              and coalesce(o.source_file, '') = 'bling2_bridge';

comment on view public.carbo_vendas_metrica is
  'Fonte ÚNICA de "esta venda conta". A nota é resolvida no espelho da conta Bling de origem (source_file), nunca cruzando os dois — ids das duas contas podem coincidir. security_invoker: respeita a RLS de quem chama.';

grant select on public.carbo_vendas_metrica to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Agora os pedidos do Bling 2 têm nota na métrica (antes: tudo nulo).
select count(*)                                          as pedidos_bling2,
       count(nf_situacao)                                as com_situacao_de_nf,
       count(*) filter (where nf_valida)                 as nota_valida,
       count(*) filter (where nf_invalida)               as nota_invalida,
       count(*) filter (where conta_metrica)             as contam_na_metrica,
       sum(total) filter (where conta_metrica)           as faturamento
from public.carbo_vendas_metrica
where source_file = 'bling2_bridge';

-- (b) A regra não pode ter mexido no Bling 1: os números daqui têm de ser os
--     mesmos de antes da migração.
select count(*)                                as pedidos,
       count(*) filter (where conta_metrica)   as contam,
       sum(total) filter (where conta_metrica) as faturamento
from public.carbo_vendas_metrica
where coalesce(source_file, '') <> 'bling2_bridge';

-- (c) Divergência entre a métrica e o status: pedido que conta como métrica
--     mas tem nota inválida (não deveria existir).
select order_number, status, nf_situacao, total
from public.carbo_vendas_metrica
where conta_metrica and nf_invalida;
