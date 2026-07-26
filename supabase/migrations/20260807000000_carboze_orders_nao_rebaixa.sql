-- =====================================================================
-- Trava: uma venda NÃO volta a ser orçamento.
--
-- O DEFEITO. `useUpdateVendaFull` grava
--     status = (input.status === 'orcamento' ? 'quote' : 'pending')
-- sem olhar o status ATUAL da linha. A única proteção era a disciplina da
-- tela ("a UI só libera editar em status 'quote'").
--
-- POR QUE É GRAVE. `status = 'quote'` é o que EXCLUI o pedido de:
--   • realizado das metas   — 20260702210000_metas_agregado_carboze.sql:16
--   • placar de metas       — 20260703030000_crm_metas_board_secure.sql
--   • COMISSÃO do vendedor  — 20260712160000_commission_rules_memoria.sql:56
--                             20260728000000_comissao_base_produto_sem_servico.sql
--   • faturamento           — 20260715160000_crm_metas_board_faturado.sql
--   • auditoria de ops      — 20260713160000_ops_audit_fixes.sql:15
--
-- Ou seja: uma venda rebaixada some da comissão e da meta do vendedor, sem
-- erro nenhum na tela. Dinheiro real, em silêncio.
--
-- COMO SE CHEGAVA LÁ (o menu de Vendas.tsx já é protegido por isQuote):
--   1. URL direta /vender?edit=<id> de um pedido já convertido;
--   2. corrida — abre como orçamento, alguém converte, o primeiro salva depois;
--   3. aba esquecida aberta, mesmo efeito, sem ninguém agir de má-fé.
--
-- Verificado na base em 26/07: NENHUMA linha afetada. É exposição, não estrago.
--
-- A trava vai no BANCO porque é o único lugar que os cinco apps, as edge
-- functions e o SQL Editor atravessam. Guarda só no front deixaria os outros
-- caminhos abertos — foi exatamente a lição do registro de trilha e do repasse.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função da trava                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carboze_orders_no_downgrade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Só interessa a transição para 'quote' vinda de algo que JÁ NÃO era.
  -- Editar um orçamento (quote → quote) segue livre, que é o caso legítimo.
  if new.status::text = 'quote' and old.status::text is distinct from 'quote' then
    raise exception
      'Pedido % já é uma venda (%s) e não volta a ser orçamento. '
      'Para desfazer, cancele o pedido e gere um novo orçamento.',
      coalesce(old.order_number, old.id::text), old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — liga o trigger                                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

drop trigger if exists trg_carboze_orders_no_downgrade on public.carboze_orders;

create trigger trg_carboze_orders_no_downgrade
  before update of status on public.carboze_orders
  for each row
  execute function public.carboze_orders_no_downgrade();

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Pegue um pedido REAL já convertido e tente rebaixar. Tem que dar erro:
--
--   update public.carboze_orders set status = 'quote'
--    where id = (select id from public.carboze_orders where status = 'pending' limit 1);
--   → ERROR: Pedido XXX já é uma venda (pending) e não volta a ser orçamento.
--
-- E editar um orçamento de verdade tem que continuar funcionando:
--
--   update public.carboze_orders set status = 'quote'
--    where id = (select id from public.carboze_orders where status = 'quote' limit 1);
--   → UPDATE 1


-- ─── Rollback ────────────────────────────────────────────────────────
-- Se algum dia for preciso desfazer uma conversão de propósito, desligue o
-- trigger na transação, faça o ajuste e religue — NUNCA deixe desligado:
--   alter table public.carboze_orders disable trigger trg_carboze_orders_no_downgrade;
--   ...
--   alter table public.carboze_orders enable trigger trg_carboze_orders_no_downgrade;
--
-- Remoção definitiva:
-- drop trigger if exists trg_carboze_orders_no_downgrade on public.carboze_orders;
-- drop function if exists public.carboze_orders_no_downgrade();
