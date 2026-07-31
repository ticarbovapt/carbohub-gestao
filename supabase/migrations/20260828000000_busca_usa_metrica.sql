-- ═══════════════════════════════════════════════════════════════════════════
-- A busca do Sales passa a devolver a REGRA junto com a venda
--
-- Contexto: o Total Faturado do Carbo Sales dava R$ 51.274 e o Dashboard do
-- Admin dava R$ 48 mil no mesmo mês. Nenhum bug — duas definições. O Admin
-- usa `carbo_vendas_metrica.conta_metrica`, a fonte única; o Sales tinha
-- regra própria, mais frouxa (contava pedido com nota Pendente ou Rejeitada).
--
-- A listagem do Sales foi apontada para a view. Só que a BUSCA GLOBAL vem
-- desta função, que devolve `setof carboze_orders` — sem as colunas da regra.
-- Sem mexer aqui, bastava digitar no campo de busca para os KPIs zerarem: a
-- tela perguntaria `conta_metrica` a linhas que não têm essa coluna.
--
-- Trocar o tipo de retorno para a view resolve na origem, em vez de a tela
-- reimplementar a regra "só durante a busca" — que seria a definição nº 3.
--
-- Corpo idêntico ao de 20260812100000. A ÚNICA mudança é a origem:
-- carboze_orders → carbo_vendas_metrica. A view é `o.*` mais as colunas
-- calculadas, então todos os campos usados abaixo continuam existindo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Mudança de tipo de retorno exige dropar antes. Trava a função, não a
-- tabela — sem risco de deadlock com o cron do Bling.
drop function if exists public.carbo_vendas_busca(text, integer);

create or replace function public.carbo_vendas_busca(
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
  -- Espaço no fim = "quero a palavra inteira".
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

-- ── Conferência ───────────────────────────────────────────────────────────
-- Tem que trazer as colunas novas preenchidas.
select order_number, customer_name, total, status, conta_metrica, motivo_fora
from public.carbo_vendas_busca('centro auto', 10);
