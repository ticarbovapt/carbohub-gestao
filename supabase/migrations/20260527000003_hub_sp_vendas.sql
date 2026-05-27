-- Cria o warehouse CD SP Vendas (para licenciados / vendas físicas)
INSERT INTO warehouses (name, code, city, state, is_active, description)
VALUES (
  'CD SP Vendas',
  'HUB-SP-VENDAS',
  'São Paulo',
  'SP',
  true,
  'Destino para licenciados e vendas em lojas físicas parceiras'
)
ON CONFLICT DO NOTHING;
