-- Coluna de exibição: separada de units_per_kit (usada pelo trigger de estoque).
-- Permite mostrar "Kit 10 Sachês = ×10 unidades físicas" sem afetar a dedução
-- de estoque, que continua usando units_per_kit = 1 (1 kit por pedido).
ALTER TABLE sku_product_mappings
  ADD COLUMN IF NOT EXISTS display_units_per_pack numeric;
