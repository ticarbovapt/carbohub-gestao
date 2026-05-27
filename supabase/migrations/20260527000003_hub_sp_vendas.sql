-- Cria o warehouse CD SP Vendas (para licenciados / vendas físicas)
INSERT INTO warehouses (name, code, city, state, is_active)
VALUES ('CD SP Vendas', 'HUB-SP-VENDAS', 'São Paulo', 'SP', true)
ON CONFLICT (code) DO NOTHING;
