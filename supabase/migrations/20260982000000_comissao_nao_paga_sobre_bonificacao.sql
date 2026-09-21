-- ═══════════════════════════════════════════════════════════════════════════
-- Comissão não se paga sobre nota de BONIFICAÇÃO
--
-- A `20260981` tirou a nota de bonificação do faturamento, e isso NÃO alcançou
-- a comissão: as duas RPCs de `/comissionamento` não leem
-- `carbo_vendas_metrica`. Elas leem `carboze_orders` direto, com regra própria.
--
-- Medido em 21/09/2026, sobre os quatro pedidos que a `20260981` identificou:
--
--   V2026090052   Anderson Bruno   R$ 2.088,00   SIM — entra na comissão
--   BLING-72      (sem vendedor)   R$   975,00   não
--   BLING-61      (sem vendedor)   R$ 1.950,00   não
--   BLING-21      (sem vendedor)   R$   510,00   não
--
-- Um só, e no MÊS CORRENTE — ou seja, ainda não virou pagamento. Foi isso que
-- decidiu fazer agora em vez de agendar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE A CORREÇÃO NÃO ALCANÇOU: `bling_nf_id is not null`
--
-- É esse o teste que a comissão usa para dizer "pedido faturado". Nos quatro
-- casos, a nota de BONIFICAÇÃO está ocupando `bling_nf_id` — a coluna da nota
-- PRINCIPAL. Para a comissão isso lê como venda faturada, e ela comissiona o
-- `total` cheio.
--
-- ⚠️ No modelo novo (`20260903`) isso não acontece: a nota de bonificação é
-- zerada e mora em `bling_nf_bonificacao_id`, colada ao MESMO pedido. Os quatro
-- são o caminho ANTIGO, em que a remessa voltava do Bling como pedido separado
-- e com valor cheio. A regra abaixo é a rede para os dois.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ, e é decisão
--
-- 1. ⚠️ **Não faz a comissão ler `carbo_vendas_metrica`.** Seria o caminho da
--    "fonte única" e é tentador, mas mudaria MUITO mais que bonificação: a
--    view também exige NF válida, e hoje a comissão paga sobre pedido com nota
--    CANCELADA (ela só olha se `bling_nf_id` está preenchido). Trocar a base
--    mexeria em comissão já paga, sem ninguém ter pedido. Fica registrado como
--    pendência medida, não como efeito colateral.
--
-- 2. **Não mexe no passado.** A regra é um filtro, calculado a cada consulta:
--    o extrato de um mês já fechado passa a mostrar o valor sem bonificação.
--    Para setembro/2026 isso é o objetivo. Se algum fechamento anterior já foi
--    PAGO com esse valor dentro, o acerto é comercial, não de código — e
--    nenhum dos três casos antigos tinha vendedor, então não houve pagamento.
--
-- 3. **Não toca em `crm_comissao_descarb`** (serviço de descarbonização): ele
--    não passa por NF e não tem bonificação — ver `20260724`.
--
-- ⚠️ `create or replace` basta: a assinatura e o tipo de retorno das duas não
-- mudam. Mudar o retorno exigiria `drop` antes, e `drop` de função usada pelo
-- PostgREST derrubaria a tela até o `create` terminar.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o agregado (os cartões de /comissionamento)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Corpo idêntico ao que está em produção (conferido por pg_get_functiondef em
-- 21/09/2026), com DUAS linhas novas: o left join e o `and not`.
--
-- ⚠️ `left join`, nunca `join`: a nota pode não estar no espelho ainda, e um
-- join interno derrubaria da comissão todo pedido cuja NF o sync ainda não
-- trouxe. Ausência tem de deixar passar aqui — o padrão oposto ao do
-- CRON_SECRET, porque aqui "fechar" significa não pagar quem vendeu.
--
-- ⚠️ Só `bling_nfe` (conta 1), e isso não é esquecimento: a função exige
-- `bling_nf_id is not null`, então pedido faturado só na filial (bling2_nf_id)
-- nunca entra nesta base. Acrescentar `bling2_nfe` aqui seria código morto que
-- se disfarça de cuidado.

create or replace function public.crm_comissao_agregado(p_from date, p_to date)
returns table (vendedor_id uuid, vendedor_name text, total numeric, qtd bigint)
language sql stable security definer set search_path = public as $$
  with base as (
    select o.vendedor_id,
           o.vendedor_name,
           greatest(o.total - public.carboze_valor_servico(o.items), 0) as valor_produto
    from public.carboze_orders o
    left join public.bling_nfe nf on nf.bling_id = o.bling_nf_id
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote', 'cancelled')
      and coalesce(o.excluir_metricas, false) = false
      -- Nota de bonificação é remessa de brinde, não receita: não comissiona.
      and not public.carbo_natureza_e_bonificacao(
            nf.raw_data -> 'naturezaOperacao' ->> 'id')
      and coalesce(o.sale_date, o.created_at::date) between p_from and p_to
  )
  select b.vendedor_id,
         max(b.vendedor_name)                 as vendedor_name,
         coalesce(sum(b.valor_produto), 0)::numeric as total,
         count(*)::bigint                     as qtd
  from base b
  -- Pedido cujo valor de produto zerou (era 100% serviço) não é venda de
  -- produto: sai da base e não infla a contagem.
  where b.valor_produto > 0
  group by b.vendedor_id;
$$;

grant execute on function public.crm_comissao_agregado(date, date) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o detalhe (a Memória de cálculo, e o que vira extrato)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ As DUAS precisam da mesma regra. O detalhe é o que o `useComissao` grava
-- em `commission_statement_items` ao fechar o mês: se só o agregado filtrasse,
-- o cartão mostraria um valor e o extrato listaria outro — duas verdades sobre
-- o mesmo número, que é a doença que este repositório mais paga.

create or replace function public.crm_comissao_detalhe(p_vendedor uuid, p_from date, p_to date)
returns table (order_id uuid, order_number text, customer_name text, total numeric, sale_date date)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_number, o.customer_name, coalesce(o.total, 0)::numeric,
         coalesce(o.sale_date, o.created_at::date)
  from public.carboze_orders o
  left join public.bling_nfe nf on nf.bling_id = o.bling_nf_id
  where o.vendedor_id = p_vendedor
    and o.bling_nf_id is not null
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
    -- Mesma regra do agregado. Divergir aqui faz o cartão e o extrato
    -- discordarem, e quem fecha o mês não saberia qual acreditar.
    and not public.carbo_natureza_e_bonificacao(
          nf.raw_data -> 'naturezaOperacao' ->> 'id')
    and coalesce(o.sale_date, o.created_at::date) >= p_from
    and coalesce(o.sale_date, o.created_at::date) <= p_to
  order by 5;
$$;

grant execute on function public.crm_comissao_detalhe(uuid, date, date) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A trava da regra inteira, herdada da 20260981: sem natureza
--     cadastrada, `carbo_natureza_e_bonificacao` devolve false para tudo e
--     esta migração não faz NADA, sem erro. Tem de vir 2 ou mais.
select count(*) as naturezas_configuradas
from public.carbo_config_fiscal
where chave like '%natureza_bonificacao%'
  and valor is not null and btrim(valor) <> '';

-- (b) O V2026090052 saiu do detalhe do Anderson? Tem de vir ZERO linhas.
--     ⚠️ Antes de rodar, confira que o UUID abaixo é o do vendedor certo —
--     está null de propósito para o bloco NÃO rodar por engano com o vendedor
--     errado e devolver "zero linhas" por motivo falso.
do $$
declare v_vend uuid := null;   -- ⬅ PREENCHA com o vendedor_id do Anderson Bruno
begin
  if v_vend is null then
    raise exception 'Preencha v_vend com o vendedor_id antes de rodar. Pegue em: select distinct vendedor_id, vendedor_name from public.carboze_orders where vendedor_name ilike ''%%Anderson%%'';';
  end if;
  if exists (
    select 1 from public.crm_comissao_detalhe(v_vend, date '2026-09-01', date '2026-09-30')
    where order_number = 'V2026090052'
  ) then
    raise exception 'V2026090052 AINDA esta no detalhe da comissao — a regra nao pegou.';
  end if;
  raise notice 'OK: V2026090052 fora do detalhe de setembro.';
end $$;

-- (c) A visão geral de setembro, para comparar com a tela. O total do Anderson
--     tem de estar R$ 2.088,00 MENOR do que estava antes desta migração.
select vendedor_name, total, qtd
from public.crm_comissao_agregado(date '2026-09-01', date '2026-09-30')
order by total desc;

-- (d) ⚠️ Nenhum outro vendedor pode ter perdido pedido. Esta consulta lista
--     TODO pedido que a regra nova exclui, no ano inteiro — tem de trazer
--     exatamente os pedidos de nota de bonificação, e nada além.
select o.order_number, o.vendedor_name, o.total,
       coalesce(o.sale_date, o.created_at::date) as data_efetiva,
       nf.numero as nf_numero,
       nf.raw_data -> 'naturezaOperacao' ->> 'id' as natureza_id
from public.carboze_orders o
join public.bling_nfe nf on nf.bling_id = o.bling_nf_id
where o.vendedor_id is not null
  and o.status not in ('quote', 'cancelled')
  and coalesce(o.excluir_metricas, false) = false
  and public.carbo_natureza_e_bonificacao(nf.raw_data -> 'naturezaOperacao' ->> 'id')
order by data_efetiva desc;
