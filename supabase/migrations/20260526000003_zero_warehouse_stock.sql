-- Zera todas as quantidades de warehouse_stock (ambos os hubs)
UPDATE warehouse_stock
SET quantity   = 0,
    updated_at = NOW();
