-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido nascido no Bling deixa de mentir a etapa
--
-- A bridge do bling-sync insere o pedido gravando `status` (traduzido da
-- situação do Bling) e NUNCA grava `fulfillment_stage`. A coluna cai no
-- DEFAULT 'nova_venda' e fica lá — porque pedido do Bling não passa pelo
-- kanban do Ops: ninguém arrasta o card, então nada nunca atualiza a etapa.
--
-- Resultado: BLING-233 (CARPOWER, R$ 2.800) e BLING-230 (M & D, R$ 5.600)
-- estão `status = 'delivered'` e `fulfillment_stage = 'nova_venda'` ao mesmo
-- tempo. Entregues e "nova venda".
--
-- Não afeta faturamento — carbo_vendas_metrica lê `status`, não a etapa — e
-- não aparece no Rastreio, que filtra pedido com external_ref. É dado errado
-- parado na tabela esperando alguém fazer um join nele. Corrige agora, antes
-- que vire relatório.
--
-- O código da bridge foi corrigido junto: passa a gravar a etapa no insert e
-- a recalculá-la a cada rodada. Esta migração só conserta o que já entrou.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Antes ────────────────────────────────────────────────────────────────
select order_number, customer_name, total, status, fulfillment_stage,
       coalesce(sale_date, created_at::date) as data
from public.carboze_orders
where order_number like 'BLING-%'
  and fulfillment_stage <> case status
        when 'delivered' then 'entregue'
        when 'shipped'   then 'em_transporte'
        when 'invoiced'  then 'separado'
        when 'confirmed' then 'separacao_pendente'
        when 'cancelled' then 'cancelado'
        else 'nova_venda' end
order by total desc;

-- ── Correção ─────────────────────────────────────────────────────────────
-- Mesmo mapa do backfill de 20260630120000 e da função `estagioDoStatus` da
-- edge function. Três cópias do mesmo dicionário: se mudar, mude nas três.
--
-- ⚠️ O filtro é `order_number like 'BLING-%'`, NÃO `external_ref is not null`.
-- Venda manual ('V…') ganha external_ref ao ir pro Bling emitir NF, mas tem
-- etapa de verdade, movida à mão pelo Ops. Trocar o filtro aqui jogaria o
-- kanban do pós-venda inteiro para trás.
update public.carboze_orders
set fulfillment_stage = case status
      when 'delivered' then 'entregue'
      when 'shipped'   then 'em_transporte'
      when 'invoiced'  then 'separado'
      when 'confirmed' then 'separacao_pendente'
      when 'cancelled' then 'cancelado'
      else 'nova_venda' end,
    updated_at = now()
where order_number like 'BLING-%'
  and fulfillment_stage <> case status
        when 'delivered' then 'entregue'
        when 'shipped'   then 'em_transporte'
        when 'invoiced'  then 'separado'
        when 'confirmed' then 'separacao_pendente'
        when 'cancelled' then 'cancelado'
        else 'nova_venda' end;

-- ── Depois ───────────────────────────────────────────────────────────────

-- (a) Tem que voltar zero.
select count(*) as ainda_divergentes
from public.carboze_orders
where order_number like 'BLING-%'
  and fulfillment_stage <> case status
        when 'delivered' then 'entregue'
        when 'shipped'   then 'em_transporte'
        when 'invoiced'  then 'separado'
        when 'confirmed' then 'separacao_pendente'
        when 'cancelled' then 'cancelado'
        else 'nova_venda' end;

-- (b) Confere que as vendas MANUAIS não foram tocadas: o kanban do pós-venda
--     tem etapa que não corresponde ao status de propósito (ex.: 'separando'
--     com status 'confirmed'). Se este número mudou, algo saiu errado.
select fulfillment_stage, count(*) as pedidos
from public.carboze_orders
where order_number not like 'BLING-%'
group by 1
order by 2 desc;
