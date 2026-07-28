-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_clientes_busca — autocomplete de cliente na tela /vender
--
-- Não existe cadastro de clientes: o que a Carbo sabe de um cliente está
-- espalhado entre os PEDIDOS já feitos (carboze_orders) e os LEADS do
-- comercial (crm_sales_leads). A busca junta os dois e devolve UMA linha por
-- documento, com o dado mais RECENTE de cada campo.
--
-- Por que no banco e não no front: o vendedor digita, e cada tecla viraria
-- duas consultas + deduplicação no navegador. Aqui é uma chamada só, e a mesma
-- função serve /vender de qualquer app.
--
-- Só devolve o que já é nosso — nada de Receita Federal. A consulta externa
-- continua sendo o botão "Buscar dados", e é outra coisa: serve para cliente
-- NOVO. Esta aqui evita recadastrar quem já é cliente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_clientes_busca(
  p_termo text,
  p_limit integer default 8
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_texto  text;
  v_rows   jsonb;
begin
  v_digits := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
  v_texto  := btrim(coalesce(p_termo, ''));

  -- Menos de 3 caracteres devolve vazio: com 1–2 dígitos a lista traria
  -- praticamente toda a base e não ajudaria ninguém.
  if length(v_digits) < 3 and length(v_texto) < 3 then
    return jsonb_build_array();
  end if;

  with base as (
    -- Pedidos: a fonte mais confiável, porque o cliente já comprou.
    select
      regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') as doc,
      o.customer_name   as nome,
      o.customer_email  as email,
      o.customer_phone  as telefone,
      o.customer_ie     as ie,
      o.delivery_address as endereco,
      o.delivery_city   as cidade,
      o.delivery_state  as uf,
      o.delivery_zip    as cep,
      o.created_at      as quando,
      'pedido'::text    as origem
    from public.carboze_orders o
    where coalesce(o.cnpj, '') <> ''

    union all

    -- Leads: cliente ainda sem pedido, mas já qualificado pelo comercial.
    select
      regexp_replace(coalesce(l.cnpj, ''), '\D', '', 'g'),
      coalesce(nullif(btrim(l.legal_name), ''), l.contact_name),
      l.contact_email,
      l.contact_phone,
      null,
      null,
      l.city,
      l.state,
      null,
      l.created_at,
      'lead'
    from public.crm_sales_leads l
    where coalesce(l.cnpj, '') <> ''
      and l.deleted_at is null
  ),
  filtrada as (
    select * from base
    where doc <> ''
      and (
        (length(v_digits) >= 3 and doc like v_digits || '%')
        or (length(v_texto) >= 3 and nome ilike '%' || v_texto || '%')
      )
  ),
  -- Uma linha por documento. Campo a campo pega o valor não-nulo mais recente:
  -- pedido antigo com telefone não deve ser apagado por pedido novo sem ele.
  consolidada as (
    select
      doc,
      (array_agg(nome     order by quando desc) filter (where nome     is not null and btrim(nome) <> ''))[1] as nome,
      (array_agg(email    order by quando desc) filter (where email    is not null and btrim(email) <> ''))[1] as email,
      (array_agg(telefone order by quando desc) filter (where telefone is not null and btrim(telefone) <> ''))[1] as telefone,
      (array_agg(ie       order by quando desc) filter (where ie       is not null and btrim(ie) <> ''))[1] as ie,
      (array_agg(endereco order by quando desc) filter (where endereco is not null and btrim(endereco) <> ''))[1] as endereco,
      (array_agg(cidade   order by quando desc) filter (where cidade   is not null and btrim(cidade) <> ''))[1] as cidade,
      (array_agg(uf       order by quando desc) filter (where uf       is not null and btrim(uf) <> ''))[1] as uf,
      (array_agg(cep      order by quando desc) filter (where cep      is not null and btrim(cep) <> ''))[1] as cep,
      count(*) filter (where origem = 'pedido') as pedidos,
      max(quando) as ultimo
    from filtrada
    group by doc
  )
  select coalesce(jsonb_agg(t order by t.pedidos desc, t.ultimo desc), jsonb_build_array())
  into v_rows
  from (
    select
      doc,
      nome, email, telefone, ie, endereco, cidade, uf, cep,
      pedidos,
      ultimo,
      -- Quem já comprou vem primeiro e com rótulo diferente: o vendedor
      -- precisa saber se está diante de um cliente ou de um lead frio.
      case when pedidos > 0 then 'cliente' else 'lead' end as tipo
    from consolidada
    order by pedidos desc, ultimo desc
    limit greatest(coalesce(p_limit, 8), 1)
  ) t;

  return v_rows;
end $$;

comment on function public.carbo_clientes_busca is
  'Autocomplete de cliente por CNPJ/CPF ou nome, unindo carboze_orders e crm_sales_leads. Uma linha por documento, campo a campo com o valor mais recente.';

grant execute on function public.carbo_clientes_busca(text, integer) to authenticated;

-- Prefixo de documento é o caminho quente da busca.
create index if not exists carboze_orders_cnpj_digits_idx
  on public.carboze_orders ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  where coalesce(cnpj, '') <> '';

create index if not exists crm_sales_leads_cnpj_digits_idx
  on public.crm_sales_leads ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  where coalesce(cnpj, '') <> '';
