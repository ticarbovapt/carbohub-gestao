-- ═══════════════════════════════════════════════════════════════════════════
-- Novo hub: Escritório
--
-- ── O que um hub é, na prática ────────────────────────────────────────────
--
-- Uma linha em `warehouses`. Não há tabela por hub: `warehouse_stock` guarda
-- (warehouse_id, product_id, qty), e `stock_movements` registra as entradas e
-- saídas. Criar um hub é criar a linha; o estoque nasce vazio e é preenchido
-- pelos mesmos fluxos de ajuste e entrada dos outros.
--
-- ⚠️ Não existe CHECK restringindo o `code` — conferi antes. Então esta
-- migração não precisa de alteração de constraint, ao contrário do que
-- aconteceu com `segmento` quando 'online' entrou (INSERT falhando calado).
--
-- ── Os produtos ───────────────────────────────────────────────────────────
--
-- São os mesmos `mrp_products` dos outros hubs — o catálogo é global, o saldo é
-- por hub. Então o Escritório já enxerga a lista inteira, com saldo zero, sem
-- nada a copiar.
--
-- Foi decisão explícita do dono do processo começar assim: nem todo produto
-- fica de fato no escritório, e a curadoria vem depois. Registrado aqui para
-- que "por que o escritório lista produto que ele não tem?" tenha resposta.
--
-- ── ⚠️ Um hub NÃO vive só aqui ────────────────────────────────────────────
--
-- Esta linha é o banco. O front tem CINCO lugares que precisam concordar, e
-- esquecer um deixa o hub meio existente — sem erro nenhum:
--
--   apps/ops/src/components/estoque/stockData.ts   HUBS (slug, rótulo, cidade)
--   apps/ops/src/pages/compras/Suprimentos.tsx     HubId + HUB_CODE + botão
--   apps/ops/src/hooks/useStock.ts                 CODE_TO_HUB (banco → UI)
--   apps/ops/src/hooks/useStockMutations.ts        HUB_TO_CODE (UI → banco)
--   apps/admin|ti/src/hooks/useSuprimentosCockpit.ts  rótulo e classificação
--
-- As duas traduções (CODE_TO_HUB e HUB_TO_CODE) são espelhos: se só uma for
-- atualizada, a tela LÊ o estoque e não consegue GRAVAR — ou o contrário.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.warehouses (name, code, city, state, is_active)
values ('Escritório', 'HUB-ESCRITORIO', 'Natal', 'RN', true)
on conflict (code) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O hub existe e está ativo, ao lado dos outros.
select code, name, city, state, is_active
from public.warehouses
order by code;

-- (b) Saldo do Escritório — esperado ZERO linhas por enquanto. O catálogo é
--     global; o que não existe ainda é movimento.
select count(*) as linhas_de_estoque
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id
where w.code = 'HUB-ESCRITORIO';
