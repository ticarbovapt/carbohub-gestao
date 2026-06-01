-- Adiciona o status 'quote' (Orçamento) ao enum order_status.
--
-- Um orçamento é um carboze_orders com status = 'quote': salvo e EDITÁVEL
-- (quantidade, itens, preço), porém SEM gerar Ordem de Produção nem movimentar
-- estoque. Quando o cliente aprova, o orçamento é convertido em venda
-- (status -> 'pending') e só então dispara OP + baixa de estoque.
--
-- OBS: ALTER TYPE ... ADD VALUE precisa rodar fora de um bloco de transação.
-- No SQL Editor do Supabase, rode esta migração sozinha.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'quote';
