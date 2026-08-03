-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 5 — e-commerce PARA de deduzir estoque
--
-- Mudança de rumo, decidida pelo dono do processo: por ora o e-commerce não
-- deve mexer no estoque do HUB-SP.
--
-- O plano original desta etapa era o oposto — fazer a dedução do e-commerce
-- aparecer na aba Movimentações, como as etapas 2 e 3 fizeram para venda e
-- produção. Não faz sentido dar visibilidade a um efeito que não deveria
-- existir: o certo é remover o efeito.
--
-- ── O que a investigação revelou no caminho ──────────────────────────────
--
-- A migração `20260605000005_ecommerce_stock_track_product.sql` NUNCA foi
-- aplicada neste banco: a coluna `stock_deducted_product_id` não existe. O
-- arquivo está no repositório desde junho, e a função em produção era a versão
-- anterior, de `20260605000004`.
--
-- Isso importa além deste caso: arquivo de migração NÃO é prova de estado do
-- banco. E `CREATE OR REPLACE FUNCTION` em plpgsql não valida nome de coluna
-- na criação — resolve em tempo de execução. Uma função que referencia coluna
-- inexistente sobe limpa e só quebra no primeiro uso real.
--
-- ── Por que trocar a função, e não derrubar o trigger ────────────────────
--
-- `DROP TRIGGER` / `DISABLE TRIGGER` pedem AccessExclusiveLock em
-- `ecommerce_orders`, que o webhook escreve a qualquer momento. Já deadlocamos
-- duas vezes nesta base fazendo isso sem cuidado.
--
-- `CREATE OR REPLACE FUNCTION` não pega lock nenhum na tabela. O trigger
-- continua existindo e disparando; ele só não faz mais nada. Quando o
-- e-commerce voltar a baixar estoque, é substituir a função de novo — sem
-- janela de manutenção.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- DESLIGADO. Não toca em warehouse_stock e não mexe nas colunas de rastreio
  -- (`stock_deducted_units`, `stock_deducted_product_id`).
  --
  -- Não zerar as colunas é deliberado: elas são o registro honesto do que foi
  -- deduzido enquanto a dedução esteve ligada. Zerá-las apagaria a explicação
  -- do saldo atual do HUB-SP — e é justamente esse histórico que permite
  -- decidir depois se as baixas antigas devem ser estornadas.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

comment on function public.handle_ecommerce_order_sp_stock is
  'DESLIGADA por decisão de processo: o e-commerce não deduz estoque do HUB-SP. O trigger segue existindo para não precisar de lock em ecommerce_orders quando for religado.';


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) A função está mesmo inerte? Deve devolver `true`.
select pg_get_functiondef('public.handle_ecommerce_order_sp_stock()'::regprocedure)
         !~ 'warehouse_stock' as nao_toca_estoque;

-- (b) O PASSIVO. Quanto o e-commerce já tirou do HUB-SP enquanto a dedução
--     esteve ligada. Este saldo continua descontado — desligar não devolve
--     nada. Se a decisão for estornar, é a partir desta lista.
select o.platform,
       count(*)                       as pedidos,
       sum(o.stock_deducted_units)    as unidades_deduzidas
from public.ecommerce_orders o
where coalesce(o.stock_deducted_units, 0) > 0
group by 1
order by 3 desc;

-- (c) Saldo atual do HUB-SP. É o retrato de referência: daqui pra frente ele
--     só muda por ajuste manual ou transferência.
select p.name as produto, ws.quantity as saldo_sp
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id and w.code = 'HUB-SP'
join public.mrp_products p on p.id = ws.product_id
order by ws.quantity, 1;
