-- Fix warehouse display names to match the actual hub identities
UPDATE warehouses SET name = 'Hub Natal',      updated_at = NOW() WHERE code = 'HUB-RN';
UPDATE warehouses SET name = 'CD SP LogHouse',  updated_at = NOW() WHERE code = 'HUB-SP';
UPDATE warehouses SET name = 'CD SP Vendas',    updated_at = NOW() WHERE code = 'HUB-SP-VENDAS';
