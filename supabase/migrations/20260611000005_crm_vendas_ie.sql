-- Inscrição Estadual do cliente na venda (Carbo Sales).
-- Validação de formato/dígito é client-side (lib/inscricaoEstadual). A titularidade
-- (IE pertence ao CNPJ) depende de API SINTEGRA — fica para quando contratada.
alter table public.crm_vendas add column if not exists customer_ie text;
