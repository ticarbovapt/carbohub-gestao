-- ═══════════════════════════════════════════════════════════════════════════
-- Comissão de DESCARBONIZAÇÃO passa a contar pela NFS-e AUTORIZADA
--
-- Pedido do dono do processo (30/10/2026): "agora temos as descarbonizações
-- gerando nf pelo sistema … preciso que as nfs das descarbonizações apareçam
-- na tela de comissionamento como as de venda de carbozé aparecem, apenas
-- quando forem faturadas".
--
-- Antes (`20260724`): a base era a linha de SERVIÇO do pedido, contada no ato
-- da VENDA, sem nota — porque o CarboVAPT não tinha NF pelo sistema. Desde
-- 16/10/2026 a NFS-e sai pelo Portal Nacional (`carbo_nfse_emissoes`), com o
-- pedido e o vendedor no rodapé.
--
-- Agora:
--   • conta só pedido com NFS-e AUTORIZADA em PRODUÇÃO (ambiente 1) — a mesma
--     régua de `nfseValida()` na tela do Faturamento. Teste não fatura.
--   • nota CANCELADA no portal (evento de cancelamento/substituição que o ADN
--     devolve) sai da base — mesma lista branca `carbo_nfse_evento_cancela`.
--   • valor = o da NOTA (`valor`); data = o dia da EMISSÃO, em Brasília.
--   • `crm_comissao_descarb_detalhe` lista as notas por vendedor — é ela que a
--     tela mostra ("N NFS-e") e que vira a memória do fechamento.
--
-- ⚠️ CONSEQUÊNCIA ASSUMIDA: venda de descarbonização ainda SEM NFS-e sai da
-- base até ser faturada (o BLOCO 0 lista quais). Fechamento JÁ GERADO não muda
-- — ele é congelado em `commission_statements`.
--
-- ⚠️ A assinatura de `crm_comissao_descarb(date, date)` é a MESMA: só o corpo
-- muda (create or replace, sem sobrecarga).
--
-- RODE EM BLOCOS: 0 sozinho; depois 1; depois 2.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR (só leitura): outubro, hoje × depois, por vendedor    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
with hoje as (
  select vendedor_id, vendedor_name, total, qtd
  from public.crm_comissao_descarb(date '2026-10-01', date '2026-10-31')
),
depois as (
  select o.vendedor_id, max(o.vendedor_name) as vendedor_name,
         sum(e.valor) as total, count(*) as qtd
  from public.carbo_nfse_emissoes e
  join public.carboze_orders o on o.id = e.order_id
  where e.ambiente = 1 and e.status = 'autorizada'
    and o.vendedor_id is not null
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
    and (coalesce(e.concluido_em, e.enviado_em) at time zone 'America/Sao_Paulo')::date
        between date '2026-10-01' and date '2026-10-31'
  group by o.vendedor_id
)
select coalesce(h.vendedor_name, d.vendedor_name) as vendedor,
       h.total as hoje_sem_nf, h.qtd as hoje_servicos,
       d.total as depois_com_nfse, d.qtd as depois_notas
from hoje h
full join depois d on d.vendedor_id = h.vendedor_id
order by 1;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as duas funções                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.crm_comissao_descarb_base(p_from date, p_to date)
returns table (vendedor_id uuid, vendedor_name text, order_id uuid, order_number text,
               customer_name text, valor numeric, emitida_em date, n_nfse text,
               chave_acesso text, emissao_id uuid)
language sql stable security definer set search_path = public as $$
  select o.vendedor_id, o.vendedor_name::text, o.id, o.order_number::text,
         o.customer_name::text, coalesce(e.valor, 0)::numeric,
         (coalesce(e.concluido_em, e.enviado_em) at time zone 'America/Sao_Paulo')::date,
         e.n_nfse::text, e.chave_acesso::text, e.id
  from public.carbo_nfse_emissoes e
  join public.carboze_orders o on o.id = e.order_id
  where e.ambiente = 1
    and e.status = 'autorizada'
    and o.vendedor_id is not null
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
    -- Cancelada (ou substituída) no portal não é faturamento. O evento chega
    -- pelo ADN; a chave casa por DÍGITOS nos dois lados.
    and not exists (
      select 1 from public.carbo_nfse_eventos_mat ev
      where public.carbo_nfse_evento_cancela(ev.tipo_evento)
        and regexp_replace(coalesce(ev.chave_acesso, ''), '\D', '', 'g')
          = regexp_replace(coalesce(e.chave_acesso, ''), '\D', '', 'g')
        and coalesce(e.chave_acesso, '') <> ''
    )
    and (coalesce(e.concluido_em, e.enviado_em) at time zone 'America/Sao_Paulo')::date
        between p_from and p_to;
$$;

comment on function public.crm_comissao_descarb_base(date, date) is
  'NFS-e de descarbonizacao (CarboVAPT) que contam na comissao: autorizada em producao, nao cancelada no portal, pedido valido e com vendedor. A UNICA regra — o agregado e o detalhe leem daqui.';

create or replace function public.crm_comissao_descarb(p_from date, p_to date)
returns table (vendedor_id uuid, vendedor_name text, total numeric, qtd bigint)
language sql stable security definer set search_path = public as $$
  select b.vendedor_id, max(b.vendedor_name) as vendedor_name,
         coalesce(sum(b.valor), 0)::numeric as total, count(*)::bigint as qtd
  from public.crm_comissao_descarb_base(p_from, p_to) b
  group by b.vendedor_id;
$$;

comment on function public.crm_comissao_descarb(date, date) is
  'Base de comissao de descarbonizacao por vendedor: soma das NFS-e autorizadas (desde 30/10/2026; antes contava a linha de servico na venda, sem NF).';

create or replace function public.crm_comissao_descarb_detalhe(p_vendedor uuid, p_from date, p_to date)
returns table (order_id uuid, order_number text, customer_name text, total numeric,
               sale_date date, n_nfse text, chave_acesso text, emissao_id uuid)
language sql stable security definer set search_path = public as $$
  select b.order_id, b.order_number, b.customer_name, b.valor, b.emitida_em,
         b.n_nfse, b.chave_acesso, b.emissao_id
  from public.crm_comissao_descarb_base(p_from, p_to) b
  where b.vendedor_id = p_vendedor
  order by b.emitida_em, b.n_nfse;
$$;

-- ⚠️ SECURITY DEFINER nasce executável por anon (default privileges): fecha.
revoke execute on function public.crm_comissao_descarb_base(date, date) from public, anon;
revoke execute on function public.crm_comissao_descarb(date, date) from public, anon;
revoke execute on function public.crm_comissao_descarb_detalhe(uuid, date, date) from public, anon;
grant execute on function public.crm_comissao_descarb_base(date, date) to authenticated, service_role;
grant execute on function public.crm_comissao_descarb(date, date) to authenticated, service_role;
grant execute on function public.crm_comissao_descarb_detalhe(uuid, date, date) to authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA (só leitura)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O total por vendedor tem de BATER com a soma do detalhe (as duas leem da
-- mesma base). Esperado: toda linha com `confere = true`.
select a.vendedor_name, a.total, a.qtd,
       (select coalesce(sum(d.total), 0) from public.crm_comissao_descarb_detalhe(a.vendedor_id, date '2026-10-01', date '2026-10-31') d) as soma_detalhe,
       a.total = (select coalesce(sum(d.total), 0) from public.crm_comissao_descarb_detalhe(a.vendedor_id, date '2026-10-01', date '2026-10-31') d) as confere
from public.crm_comissao_descarb(date '2026-10-01', date '2026-10-31') a
order by a.total desc;
