-- ═══════════════════════════════════════════════════════════════════════════
-- A métrica passa a enxergar a nota da FILIAL
--
-- Caso concreto: V2026070028 (CENTRO AUTOMOTIVO ZAP, R$ 16.800) foi faturado
-- no Bling 2 antes da integração existir. A nota é real, o dinheiro entrou —
-- e a tela mostra "Não conta · Aguardando emissão da NF".
--
-- Não é o pedido que está errado. É a régua: `carbo_vendas_metrica` só junta
-- `bling_nfe`, o espelho da MATRIZ. Nota da filial vive em `bling2_nfe` e não
-- tinha caminho até a view.
--
-- ⚠️ A correção NÃO é gravar o id da conta 2 em `bling_nf_id`. Já foi tentado e
-- revertido neste projeto: os dois Blings numeram do zero, e um id da conta 2
-- pode casar com nota REAL da conta 1 — nota cancelada de uma empresa
-- derrubando venda da outra.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE ESTE ARQUIVO É UM BLOCO SÓ, E NÃO UM `CREATE OR REPLACE`
--
-- A primeira tentativa foi `create or replace view` e o Postgres recusou:
--
--     42P16: cannot change name of view column "nf_numero"
--            to "shipment_quote_value"
--
-- A view começa com `o.*`, e `*` é expandido NO MOMENTO DA CRIAÇÃO — vira uma
-- lista fixa de colunas. As colunas que este projeto acrescentou a
-- `carboze_orders` depois (bling_conta, bling2_nf_id, nf2_access_key,
-- invoice2_number, bling2_pedido_id…) entram no meio dessa lista e empurram as
-- calculadas para outra posição. `CREATE OR REPLACE VIEW` só aceita ACRESCENTAR
-- colunas no fim; renomear ou reordenar, não.
--
-- Ou seja: toda vez que `carboze_orders` ganhar coluna, esta view precisa ser
-- DERRUBADA e recriada. Não é defeito da migração — é como `*` funciona.
--
-- E derrubar exige cuidado: DUAS funções declaram `returns setof
-- carbo_vendas_metrica`, então dependem do TIPO da view e travam o DROP.
-- `DROP ... CASCADE` resolveria, mas apagaria as duas em silêncio e a busca
-- global do Sales pararia de existir sem ninguém saber por quê.
--
-- Por isso: dropa as duas explicitamente, recria a view, recria as duas.
-- Tudo numa transação — se algo falhar no meio, nada fica pela metade.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. As dependentes saem (recriadas idênticas no passo 3) ───────────────
drop function if exists public.carbo_vendas_busca(text, integer);
drop function if exists public.carbo_pdv_pedidos(text);

-- ── 2. A view ─────────────────────────────────────────────────────────────
drop view if exists public.carbo_vendas_metrica;

create view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  -- Número e situação da nota que ESTE pedido tem, seja de qual conta for.
  -- ⚠️ coalesce, e não "n2 quando bling_conta = 2": pedido antigo faturado
  -- manualmente na filial não tem `bling_conta` preenchido — e é exatamente o
  -- caso que motivou esta migração.
  coalesce(n.numero,   n2.numero)   as nf_numero,
  coalesce(n.situacao, n2.situacao) as nf_situacao,

  -- ⚠️ Cada espelho tem a SUA lista branca de situações. A da matriz
  -- (`carbo_nf_valida`) e a da filial (`bling2_nf_e_valida`) hoje coincidem,
  -- mas são cadastros diferentes e podem divergir — usar uma para julgar a
  -- outra seria supor que o Bling escreve igual nas duas contas.
  (public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao))
    as nf_valida,
  (public.carbo_nf_invalida(n.situacao)
   or (n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)))
    as nf_invalida,

  coalesce(o.sale_date, o.created_at::date) as data_efetiva,

  (
    o.status not in ('quote', 'cancelled')
    and (
          public.carbo_nf_valida(n.situacao)
       or public.bling2_nf_e_valida(n2.situacao)
       or o.status in ('invoiced', 'shipped', 'delivered')
    )
  ) as conta_metrica,

  case
    when o.status = 'quote'     then 'orcamento'
    when o.status = 'cancelled' then 'cancelado'
    when public.carbo_nf_invalida(n.situacao) then 'nf_invalida'
    when n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)
      then 'nf_invalida'
    when not public.carbo_nf_valida(n.situacao)
     and not public.bling2_nf_e_valida(n2.situacao)
     and o.status not in ('invoiced','shipped','delivered') then 'aguardando_nf'
    else null
  end as motivo_fora
from public.carboze_orders o
left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id;   -- ⬅ novo

comment on view public.carbo_vendas_metrica is
  'Fonte ÚNICA de "esta venda conta". Junta os DOIS espelhos de NF, cada um pela sua coluna (bling_nf_id → bling_nfe, bling2_nf_id → bling2_nfe). Nunca gravar id da conta 2 em bling_nf_id: os dois Blings numeram do zero e o id colidiria com nota real da outra empresa. ⚠️ Começa com o.* — ganhar coluna em carboze_orders obriga a DROP + recreate desta view e das duas funções que a retornam.';

grant select on public.carbo_vendas_metrica to authenticated;

-- ── 3. As dependentes voltam, IDÊNTICAS ao que eram ───────────────────────
-- Corpo copiado de 20260828000000 e 20260814200000, sem alteração nenhuma.

create function public.carbo_vendas_busca(
  p_termo text,
  p_limit integer default 300
) returns setof public.carbo_vendas_metrica
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw    text    := coalesce(p_termo, '');
  v_trim   text    := btrim(v_raw);
  v_exato  boolean := v_raw <> '' and v_raw ~ '\s$';
  v_tokens text[];
  v_n      integer;
begin
  if v_trim = '' then
    return;
  end if;

  v_tokens := regexp_split_to_array(lower(v_trim), '\s+');
  v_n := array_length(v_tokens, 1);

  return query
  select o.*
  from public.carbo_vendas_metrica o
  cross join lateral (
    select
      lower(concat_ws(' ',
        o.customer_name, o.order_number, o.delivery_city, o.delivery_state,
        o.customer_email, o.delivery_address, o.customer_ie
      )) as txt,
      concat_ws(' ',
        regexp_replace(coalesce(o.cnpj, ''),           '\D', '', 'g'),
        regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'),
        regexp_replace(coalesce(o.delivery_zip, ''),   '\D', '', 'g'),
        regexp_replace(coalesce(o.customer_ie, ''),    '\D', '', 'g')
      ) as dig
  ) b
  where o.excluir_metricas <> true
    and not exists (
      select 1
      from unnest(v_tokens) with ordinality as t(tok, ord)
      where not (
        (
          length(regexp_replace(t.tok, '\D', '', 'g')) >= 3
          and b.dig like '%' || regexp_replace(t.tok, '\D', '', 'g') || '%'
        )
        or
        b.txt ~ (
          '\m'
          || regexp_replace(t.tok, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
          || case when v_exato and t.ord = v_n then '\M' else '' end
        )
      )
    )
  order by coalesce(o.sale_date, o.created_at::date) desc, o.created_at desc
  limit greatest(coalesce(p_limit, 300), 1);
end $$;

comment on function public.carbo_vendas_busca is
  'Busca global em carbo_vendas_metrica (traz conta_metrica/motivo_fora junto). Casa por início de palavra (todas as palavras digitadas); espaço no fim exige palavra inteira; número 3+ dígitos casa em qualquer posição de CNPJ/CPF, telefone, CEP e IE. SECURITY INVOKER: respeita a RLS de quem chama.';

grant execute on function public.carbo_vendas_busca(text, integer) to authenticated;


create function public.carbo_pdv_pedidos(p_cnpj text)
returns setof public.carbo_vendas_metrica
language sql
stable
security invoker
set search_path = public
as $$
  select v.*
  from public.carbo_vendas_metrica v
  where regexp_replace(coalesce(v.cnpj, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) >= 11
  order by coalesce(v.sale_date, v.created_at::date) desc, v.created_at desc
  limit 200;
$$;

comment on function public.carbo_pdv_pedidos is
  'Pedidos de um PDV, casando por CNPJ só-dígitos dos dois lados. SECURITY INVOKER: respeita a RLS.';

grant execute on function public.carbo_pdv_pedidos(text) to authenticated;

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode DEPOIS do commit acima
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) As duas funções voltaram? Tem de trazer DUAS linhas.
select p.oid::regprocedure as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('carbo_vendas_busca', 'carbo_pdv_pedidos');

-- (b) A busca global do Sales continua funcionando?
select order_number, customer_name, total, conta_metrica, motivo_fora
from public.carbo_vendas_busca('zap', 5);

-- (c) O número de referência. Deve continuar 21 / 59.323,40 POR ENQUANTO:
--     a view aprendeu a olhar bling2_nf_id, mas nenhum pedido tem essa coluna
--     preenchida ainda. O ganho vem do vínculo, não daqui.
select count(*) as pedidos_fora, sum(total) as valor_fora
from public.carbo_vendas_metrica
where not conta_metrica and motivo_fora = 'aguardando_nf';
