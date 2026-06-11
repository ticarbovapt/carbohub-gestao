-- Endereço de FATURAMENTO (NF) da venda — pode ser diferente do endereço de
-- entrega. Quando NULL, significa "mesmo endereço da entrega".
alter table public.crm_vendas add column if not exists endereco_faturamento jsonb;
