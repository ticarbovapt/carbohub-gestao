-- =====================================================================
-- Vendas do Pré-Vendas — só as que nasceram de um card do SDR ou do closer
--
-- A tela /vendas do Pré-Vendas é a do Sales, portada; o que muda é QUAIS
-- pedidos ela vê e QUEM aparece: no lugar de "Vendedor / Criado por", entra
-- "SDR / Closer". A tela do Sales NÃO muda: a venda do Pré-Vendas continua
-- aparecendo lá como qualquer outra (decisão do dono do processo, 06/10/2026).
--
-- O elo já existe: `crm_lead_orders` (lead → pedido), gravado pelo /vender
-- quando a venda sai de um card. Venda do Pré-Vendas = pedido ligado a card f14
-- (SDR) ou f15 (closer).
--
-- ⚠️ Por que FUNÇÃO, e não um filtro na tela:
--   • a RLS de `carboze_orders` mostra ao colaborador só o que ele VENDEU. O
--     SDR não é o vendedor — o closer é. Sem isto o SDR nunca veria a venda
--     que ele mesmo originou;
--   • "não vazar as outras vendas" (dono do processo): o recorte mora AQUI,
--     no banco. Filtro só na tela é recorte que o próximo app esquece.
--
-- O recorte, por linha:
--   gestor (crm_is_gestor)  → todas as vendas do Pré-Vendas
--   SDR                     → as que ele repassou
--   closer                  → as que ele vendeu (ou lançou)
--
-- ⚠️ SECURITY DEFINER, então a guarda está no corpo: `carbo_e_time_interno()`
-- primeiro (o portal de lojas e o de licenciados usam a MESMA `profiles`), e o
-- recorte acima depois. Os NOMES saem daqui também: `profiles` tem RLS por
-- departamento, e resolver o uuid na tela daria o nome ao gestor e "—" ao SDR.
--
-- ⚠️ É plpgsql e devolve `jsonb`, de propósito: não entra na lista de
-- dependentes da `carbo_vendas_metrica` (que já são três e já derrubaram tela
-- quando republicada). Coluna nova na view chega aqui sozinha.
--
-- Quem é o SDR:
--   card f15 vindo de repasse → `created_by` do card (a RPC de repasse grava o
--                                SDR como criador e deixa o dono vazio)
--   card f14 (venda saiu do próprio card do SDR) → dono do card
--   card f15 criado direto no closer → sem SDR ("—")
-- O CLOSER é o vendedor do pedido — quem fechou.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_prevendas_vendas(
  p_de    date,
  p_ate   date,
  p_termo text default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eu      uuid    := auth.uid();
  v_gestor  boolean := public.crm_is_gestor();
  v_busca   text    := nullif(trim(coalesce(p_termo, '')), '');
  v_digitos text    := nullif(regexp_replace(coalesce(p_termo, ''), '\D', '', 'g'), '');
begin
  if v_eu is null or not public.carbo_e_time_interno() then
    return;   -- fora do time interno: nada, nunca erro com dado dentro
  end if;

  return query
  with lig as (
    select lo.order_id,
           case
             when l.funnel_type = 'f14' then coalesce(l.assigned_to, l.created_by)
             when l.origin_lead_id is not null then l.created_by
           end as sdr_id
      from public.crm_lead_orders lo
      join public.crm_sales_leads l on l.id = lo.lead_id
     where l.funnel_type in ('f14', 'f15')
  )
  select to_jsonb(v)
         || jsonb_build_object(
              'sdr_id',      lig.sdr_id,
              'sdr_name',    ps.full_name,
              'closer_name', coalesce(pc.full_name, v.vendedor_name)
            )
    from lig
    join public.carbo_vendas_metrica v on v.id = lig.order_id
    left join public.profiles ps on ps.id = lig.sdr_id
    left join public.profiles pc on pc.id = v.vendedor_id
   where coalesce(v.excluir_metricas, false) = false
     and (
       v_gestor
       or lig.sdr_id = v_eu
       or v.vendedor_id = v_eu
       or (to_jsonb(v) ->> 'created_by')::uuid = v_eu
     )
     and (
       case
         -- Busca: manda em cima do período, como no Sales.
         when v_busca is not null then
              v.order_number ilike '%' || v_busca || '%'
           or v.customer_name ilike '%' || v_busca || '%'
           or (v_digitos is not null
               and regexp_replace(coalesce(v.cnpj, ''), '\D', '', 'g') like '%' || v_digitos || '%')
         else v.data_efetiva between p_de and p_ate
       end
     )
   order by v.data_efetiva desc, v.created_at desc;
end;
$$;

revoke execute on function public.carbo_prevendas_vendas(date, date, text) from public, anon;
grant  execute on function public.carbo_prevendas_vendas(date, date, text) to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — pergunta como DONO (o SQL Editor não tem usuário)    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ⚠️ Chamar a função AQUI volta VAZIO, e isso está CERTO: o editor roda sem
-- usuário logado (auth.uid() nulo) e a guarda devolve nada. Por isso a
-- conferência conta direto nas tabelas.
-- ESPERADO: vendas_prevendas = 0 se ainda não houve venda gerada de card do
-- Pré-Vendas; o número sobe a cada venda que o closer fechar pelo card.
select count(*) as vendas_prevendas
  from public.crm_lead_orders lo
  join public.crm_sales_leads l on l.id = lo.lead_id
 where l.funnel_type in ('f14', 'f15');
