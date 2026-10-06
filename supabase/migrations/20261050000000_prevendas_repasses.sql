-- =====================================================================
-- Resultados do Pré-Vendas — o que aconteceu com cada lead que o SDR repassou
--
-- Uma linha por card do closer (f15) que nasceu de repasse, com quem
-- repassou, quem pegou, a etapa de hoje e quanto já virou pedido. A tela
-- `/resultados` do Pré-Vendas calcula tudo a partir disto: repassados,
-- fechados, conversão, tempo até fechar, receita, por closer, por SDR.
--
-- ⚠️ Por que FUNÇÃO, e não leitura direta de `crm_sales_leads`:
--   • `crm_list_vendedores` só devolve o PRÓPRIO perfil a quem não é gestor —
--     o SDR veria o próprio nome e um "—" no lugar de cada closer;
--   • a RLS de `crm_sales_leads` mostra a qualquer um a FILA ABERTA (card de
--     repasse sem dono). Lida direto, a tela do SDR contaria os repasses dos
--     OUTROS SDRs que ainda estão na fila. O recorte certo mora aqui.
--   • o valor vendido vem de `carboze_orders`, cuja RLS mostra ao colaborador
--     só o que ELE vendeu — o SDR nunca veria a receita do lead que originou.
--
-- O recorte, por linha:
--   gestor (crm_is_gestor)  → todos os repasses
--   SDR                     → os que ele repassou (created_by do card f15)
--   closer                  → os que ele pegou (assigned_to)
--
-- ⚠️ SECURITY DEFINER guardada no corpo por `carbo_e_time_interno()`: o portal
-- de lojas e o de licenciados usam a MESMA `profiles`.
-- ⚠️ `RETURNS TABLE` com `::text` em toda coluna de texto — sem o cast a função
-- é criada sem reclamar e falha só na CHAMADA (lição da 20261009).
--
-- O período filtra a DATA DO REPASSE, em Brasília. É coorte: "dos que eu
-- repassei em outubro, quantos fecharam" — fechar em novembro conta para
-- outubro. Filtrar pela data do fechamento misturaria leads de meses
-- diferentes no numerador e no denominador, e a taxa passaria de 100%.
--
-- "Vendido" = pedido ligado ao card (crm_lead_orders) que não é orçamento nem
-- cancelado. Orçamento não é venda; cancelado deixou de ser.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_prevendas_repasses(p_de date, p_ate date)
returns table (
  lead_id       uuid,
  origem_id     uuid,
  cliente       text,
  repassado_em  timestamptz,
  sdr_id        uuid,
  sdr_nome      text,
  closer_id     uuid,
  closer_nome   text,
  etapa         text,
  ganho_em      timestamptz,
  perdido_em    timestamptz,
  motivo_perda  text,
  valor_vendido numeric,
  pedidos       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eu     uuid    := auth.uid();
  v_gestor boolean := public.crm_is_gestor();
begin
  if v_eu is null or not public.carbo_e_time_interno() then
    return;
  end if;

  return query
  select l.id,
         l.origin_lead_id,
         coalesce(nullif(l.trade_name, ''), nullif(l.legal_name, ''), nullif(l.contact_name, ''), 'Sem nome')::text,
         l.created_at,
         l.created_by,
         ps.full_name::text,
         l.assigned_to,
         pc.full_name::text,
         l.stage::text,
         l.won_at,
         l.lost_at,
         l.lost_reason::text,
         coalesce(v.valor, 0)::numeric,
         coalesce(v.qtd, 0)::integer
    from public.crm_sales_leads l
    left join public.profiles ps on ps.id = l.created_by
    left join public.profiles pc on pc.id = l.assigned_to
    left join lateral (
      select sum(o.total) as valor, count(*) as qtd
        from public.crm_lead_orders lo
        join public.carboze_orders o on o.id = lo.order_id
       where lo.lead_id = l.id
         and o.status not in ('quote', 'cancelled')
    ) v on true
   where l.funnel_type = 'f15'
     and l.origin_lead_id is not null
     and l.deleted_at is null
     and (l.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     and (v_gestor or l.created_by = v_eu or l.assigned_to = v_eu)
   order by l.created_at desc;
end;
$$;

revoke execute on function public.carbo_prevendas_repasses(date, date) from public, anon;
grant  execute on function public.carbo_prevendas_repasses(date, date) to authenticated;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — direto nas tabelas (o SQL Editor não tem usuário)    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ⚠️ Chamar a função AQUI volta VAZIO, e está certo: sem usuário logado a
-- guarda não devolve nada. ESPERADO: repasses = quantos cards o SDR já passou
-- ao closer no Pré-Vendas (o seu teste conta).
select count(*) as repasses
  from public.crm_sales_leads
 where funnel_type = 'f15' and origin_lead_id is not null and deleted_at is null;
