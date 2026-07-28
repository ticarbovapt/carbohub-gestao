-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_vendas_busca — v2: casa por INÍCIO DE PALAVRA, não por "contém"
--
-- A v1 usava ilike '%termo%'. Com isso "A" batia em CASSIO, MACAIBA, CARPOWER
-- — qualquer registro com a letra em qualquer posição. Busca que devolve tudo
-- não é busca.
--
-- Regras agora:
--   • Cada palavra digitada casa com o COMEÇO de uma palavra do registro.
--     "car" acha CARPOWER e ARTCAR? Não: acha CARPOWER (palavra começa com
--     "car"), e não MACAIBA. É o que a pessoa espera ao digitar.
--   • Várias palavras = TODAS têm que casar ("centro auto" acha
--     "CENTRO AUTOMOTIVO"), em qualquer ordem e em qualquer campo.
--   • Terminar com ESPAÇO exige palavra INTEIRA: "a " só traz onde "a" é uma
--     palavra sozinha.
--   • Número com 3+ dígitos casa em qualquer posição de CNPJ/CPF, telefone,
--     CEP e IE — de documento a gente costuma lembrar do meio, não do começo.
--
-- SECURITY INVOKER continua: a RLS de carboze_orders manda, e colaborador
-- segue vendo só as próprias vendas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_vendas_busca(
  p_termo text,
  p_limit integer default 300
) returns setof public.carboze_orders
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw    text    := coalesce(p_termo, '');
  v_trim   text    := btrim(v_raw);
  -- Espaço no fim = "quero a palavra inteira", como no pedido do usuário.
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
  from public.carboze_orders o
  cross join lateral (
    select
      -- Tudo que é texto num campo só: assim uma palavra pode casar no nome e
      -- a outra na cidade, sem precisar de uma condição por combinação.
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
    -- "todas as palavras casam" escrito como "não existe palavra que falhe".
    and not exists (
      select 1
      from unnest(v_tokens) with ordinality as t(tok, ord)
      where not (
        -- Número: casa em qualquer posição dos campos numéricos.
        (
          length(regexp_replace(t.tok, '\D', '', 'g')) >= 3
          and b.dig like '%' || regexp_replace(t.tok, '\D', '', 'g') || '%'
        )
        or
        -- Texto: \m = início de palavra. \M no fim quando o termo pediu
        -- palavra inteira. Metacaracteres do que foi digitado são escapados —
        -- senão um "(" derruba a consulta inteira com erro de regex.
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
  'Busca global em carboze_orders. Casa por início de palavra (todas as palavras digitadas); espaço no fim exige palavra inteira; número 3+ dígitos casa em qualquer posição de CNPJ/CPF, telefone, CEP e IE. SECURITY INVOKER: respeita a RLS de quem chama.';

grant execute on function public.carbo_vendas_busca(text, integer) to authenticated;
