-- ═══════════════════════════════════════════════════════════════════════════
-- O pedido de BRINDE que nós criamos no Bling voltava como VENDA NOVA
--
-- Medido em 29/10/2026 (aba "Do Bling" do Faturamento): BLING-966 (R$ 130) e
-- BLING-977 (R$ 192), "entregue", conta_metrica = true, sem NF. São os pedidos
-- de REMESSA DE BONIFICAÇÃO que a emissão criou na matriz para V2026100041 e
-- V2026100076 (`bling_pedido_bonificacao_id`), e a ponte do `bling-sync` os
-- importou como pedido próprio. As notas (000537, 000546, natureza de
-- bonificação) já estão CERTAS no V…: o que sobra é o pedido duplicado
-- contando brinde como faturamento.
--
-- Correção:
--   • código: a ponte do bling-sync deixa de importar esses pedidos (deploy
--     pelo push em main).
--   • dado: os já importados ganham `excluir_metricas = true` — a marca que
--     as telas de venda, o Dashboard Comercial e a comissão já respeitam
--     (`conta_metrica and not excluir_metricas`). FICAM na lista (nada é
--     apagado; reverter é `excluir_metricas = false`).
--
-- ⚠️ RODE EM BLOCOS. BLOCO 0 sozinho; o BLOCO 1 só se o 0 vier como esperado.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR (só leitura)                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Todo pedido importado que é, na verdade, o brinde de uma venda nossa — nas
-- DUAS contas (matriz `bling-`, filial `bling2-`).
select d.conta, d.pedido_importado, d.status, d.total, d.conta_metrica,
       d.excluir_metricas, d.venda_de_origem, d.total_da_venda
  from (
    select 'matriz' as conta, b.order_number as pedido_importado, b.status, b.total,
           m.conta_metrica, b.excluir_metricas, v.order_number as venda_de_origem,
           v.total as total_da_venda
      from public.carboze_orders v
      join public.carboze_orders b on b.external_ref = 'bling-' || v.bling_pedido_bonificacao_id
      left join public.carbo_vendas_metrica m on m.id = b.id
     where v.bling_pedido_bonificacao_id is not null
    union all
    select 'filial', b.order_number, b.status, b.total, m.conta_metrica,
           b.excluir_metricas, v.order_number, v.total
      from public.carboze_orders v
      join public.carboze_orders b on b.external_ref = 'bling2-' || v.bling2_pedido_bonificacao_id
      left join public.carbo_vendas_metrica m on m.id = b.id
     where v.bling2_pedido_bonificacao_id is not null
  ) d
 order by d.conta, d.pedido_importado;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — tirar os brindes importados do faturamento                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Só pedido IMPORTADO (BLING-/BLING2-), nunca uma venda V…, e só o que ainda
-- conta. Devolve a lista do que mudou.
update public.carboze_orders b
   set excluir_metricas = true
  from public.carboze_orders v
 where (   (v.bling_pedido_bonificacao_id  is not null and b.external_ref = 'bling-'  || v.bling_pedido_bonificacao_id)
        or (v.bling2_pedido_bonificacao_id is not null and b.external_ref = 'bling2-' || v.bling2_pedido_bonificacao_id))
   and b.order_number ~ '^BLING2?-'
   and coalesce(b.excluir_metricas, false) = false
returning b.order_number, b.total, v.order_number as brinde_de;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA (só leitura). Esperado: ZERO.                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select count(*) as brindes_ainda_no_faturamento
  from public.carboze_orders v
  join public.carboze_orders b
    on b.external_ref in ('bling-' || v.bling_pedido_bonificacao_id, 'bling2-' || v.bling2_pedido_bonificacao_id)
  join public.carbo_vendas_metrica m on m.id = b.id
 where m.conta_metrica and coalesce(b.excluir_metricas, false) = false;
