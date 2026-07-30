-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige os 4 clientes com histórico de canal MISTO
--
-- A regra de herança (20260817000000) só classifica quando o histórico do
-- CNPJ é unânime. Estes 4 eram os únicos mistos do sistema — e em todos o
-- canal divergente é o errado, não a exceção legítima.
--
-- Depois desta migração os 4 ficam unânimes, e o trigger passa a acertar
-- sozinho os próximos pedidos deles. Era esse o objetivo: parar de etiquetar
-- cliente recorrente à mão todo mês.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── M & D COMERCIO SERVICOS E LOCACOES (13.681.768/0001-10) ───────────────
-- BLING-18 (abr/2026, R$ 6.160) é o PRIMEIRO pedido do cliente e o único
-- 'revenda'. Depois dele vêm 5 pedidos de R$ 5.600, todos 'consumo', um por
-- mês. O primeiro foi etiquetado antes de alguém saber o que era o cliente.
-- Confirmado pelo comercial: locadora comprando recorrente para a frota.
update public.carboze_orders
set segmento = 'consumo'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '13681768000110'
  and segmento = 'revenda'
  and status not in ('quote', 'cancelled');

-- ── PROTASIO LOCACAO E TURISMO (12.801.601/0001-82) ──────────────────────
-- Mesmo desenho: 2 pedidos 'consumo' de R$ 1.820 em dez/2025 fechados pelo
-- Thelis, e BLING-119 (abr/2026) com o MESMO valor marcado 'revenda' e SEM
-- vendedor — nasceu no Bling, onde nada é classificado de verdade.
-- Locadora comprando o valor de sempre é frota própria.
update public.carboze_orders
set segmento = 'consumo'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '12801601000182'
  and segmento = 'revenda'
  and status not in ('quote', 'cancelled');

-- ── Emmily Moreira e Jayane Albano (CPF) ─────────────────────────────────
-- Os 4 pedidos marcados 'revenda' são de R$ 13,00. Revendedor não compra
-- R$ 13. E as datas vêm em par: BLING-99/BLING-100 no mesmo 31/03,
-- BLING-103/BLING-105 no mesmo 09/04 — duas pessoas comprando junto, valor
-- de sachê, CPF. É consumidor final pelo site, igual aos outros pedidos
-- delas, que já estão como 'online'.
--
-- ⚠️ Vai para 'online', não 'consumo': os demais pedidos destas duas são
-- 'online', e o objetivo aqui é deixar o histórico UNÂNIME. Marcar 'consumo'
-- só trocaria um histórico misto por outro.
update public.carboze_orders
set segmento = 'online'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') in ('10641249411', '07380118439')
  and segmento = 'revenda'
  and status not in ('quote', 'cancelled');

-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Não deve sobrar nenhum cliente com histórico misto.
select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as doc,
       min(customer_name) as cliente,
       string_agg(distinct segmento, ', ') as canais,
       count(*) as pedidos
from public.carboze_orders
where segmento is not null
  and status not in ('quote', 'cancelled')
  and coalesce(excluir_metricas, false) = false
  and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) in (11, 14)
group by 1
having count(distinct segmento) > 1
order by 4 desc;

-- (b) Quebra por canal depois da correção. O que sai de 'revenda' entra em
--     'consumo' (R$ 7.980) e 'online' (R$ 52) — o total NÃO muda.
select coalesce(segmento, '(não classificado)') as canal,
       count(*) as pedidos, round(sum(total), 2) as valor
from public.carboze_orders
where status not in ('quote', 'cancelled')
  and coalesce(excluir_metricas, false) = false
group by 1
order by 3 desc nulls last;
