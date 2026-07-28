-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_vendas_busca — busca global na tela /vendas do Carbo Sales
--
-- A barra de busca era um refino do que já estava na tela: filtrava pelo mês
-- carregado e só olhava nome do cliente e nº do pedido. Quem procurava "o
-- pedido daquele cliente de Recife" tinha que adivinhar o mês antes.
--
-- Aqui a busca passa a ser o filtro PRINCIPAL: quando tem termo, varre o
-- HISTÓRICO INTEIRO e ignora mês e vendedor. Campos cobertos:
--   texto    → cliente, nº do pedido, cidade, UF, e-mail, endereço, IE
--   dígitos  → CNPJ/CPF, telefone, CEP, inscrição estadual
--
-- ⚠️ SECURITY INVOKER de propósito. A RLS de carboze_orders continua valendo:
-- colaborador que só enxerga as próprias vendas continua enxergando só as
-- dele, por mais amplo que seja o termo. Marcar como SECURITY DEFINER aqui
-- transformaria uma busca em vazamento de base.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_vendas_busca(
  p_termo text,
  p_limit integer default 300
) returns setof public.carboze_orders
language sql
stable
security invoker
set search_path = public
as $$
  with p as (
    select
      regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as digits,
      btrim(coalesce(p_termo, ''))                         as texto
  )
  select o.*
  from public.carboze_orders o, p
  where o.excluir_metricas <> true
    and (
      -- Documento, telefone, CEP e IE: compara só os dígitos dos DOIS lados.
      -- O que está gravado tem pontuação irregular (veio de épocas e telas
      -- diferentes), então comparar o texto cru não acharia metade.
      (
        length(p.digits) >= 3 and (
             regexp_replace(coalesce(o.cnpj, ''),           '\D', '', 'g') like '%' || p.digits || '%'
          or regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') like '%' || p.digits || '%'
          or regexp_replace(coalesce(o.delivery_zip, ''),   '\D', '', 'g') like '%' || p.digits || '%'
          or regexp_replace(coalesce(o.customer_ie, ''),    '\D', '', 'g') like '%' || p.digits || '%'
        )
      )
      or
      (
        length(p.texto) >= 2 and (
             o.customer_name                      ilike '%' || p.texto || '%'
          or o.order_number                       ilike '%' || p.texto || '%'
          or coalesce(o.delivery_city, '')        ilike '%' || p.texto || '%'
          or coalesce(o.customer_email, '')       ilike '%' || p.texto || '%'
          or coalesce(o.delivery_address, '')     ilike '%' || p.texto || '%'
          or coalesce(o.customer_ie, '')          ilike '%' || p.texto || '%'
          -- UF é sigla de 2 letras: com `%SP%` qualquer cidade com "sp" no
          -- nome entraria. Aqui é igualdade.
          or coalesce(o.delivery_state, '')       ilike p.texto
        )
      )
    )
  order by coalesce(o.sale_date, o.created_at::date) desc, o.created_at desc
  limit greatest(coalesce(p_limit, 300), 1)
$$;

comment on function public.carbo_vendas_busca is
  'Busca global em carboze_orders por cliente, cidade, UF, CNPJ/CPF, IE, telefone, CEP, e-mail, endereço e nº do pedido. SECURITY INVOKER: respeita a RLS de quem chama.';

grant execute on function public.carbo_vendas_busca(text, integer) to authenticated;

-- Índices para os campos normalizados (o texto puro já tem os seus).
create index if not exists carboze_orders_phone_digits_idx
  on public.carboze_orders ((regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')))
  where coalesce(customer_phone, '') <> '';

create index if not exists carboze_orders_zip_digits_idx
  on public.carboze_orders ((regexp_replace(coalesce(delivery_zip, ''), '\D', '', 'g')))
  where coalesce(delivery_zip, '') <> '';
