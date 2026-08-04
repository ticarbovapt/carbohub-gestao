-- Venda cancelada não ressuscita por sincronização
--
-- O que aconteceu: o vendedor cancelava a venda em /vendas, o bling-sync rodava
-- e ela voltava como venda viva. Duas de verdade — V2026070049 (R$ 19.468) e
-- V2026070050 (R$ 18.220) — com a NF cancelada no Bling e no Financeiro, mas
-- "Nova Venda" no Sales.
--
-- A causa é sutil e vale registrar: **cancelar a NF no Bling não cancela o
-- pedido lá**. O pedido segue "Atendido". O sync lia a situação do PEDIDO,
-- mapeava para 'delivered' e sobrescrevia o nosso 'cancelled'.
--
-- O conserto principal está no próprio bling-sync. Esta migração é a rede: o
-- sync roda com service_role (auth.uid() IS NULL) e o app roda com o usuário
-- logado. Só quem tem gente por trás pode tirar uma venda de 'cancelled' —
-- reabrir é ação explícita no Rastreio do Ops, não efeito colateral de rotina.
--
-- Não bloqueia o caminho legítimo: a reabertura pelo Rastreio é feita pelo
-- usuário autenticado e continua passando.

CREATE OR REPLACE FUNCTION public.carbo_cancelamento_nao_ressuscita()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'cancelled'
     AND NEW.status IS DISTINCT FROM 'cancelled'
     AND auth.uid() IS NULL
  THEN
    RAISE EXCEPTION
      'Venda % está cancelada e não pode ser reaberta por rotina automática. '
      'Reabrir é ação de usuário, no Rastreio de venda.',
      OLD.order_number;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.carbo_cancelamento_nao_ressuscita IS
  'Impede que sincronização (service_role, sem auth.uid()) desfaça um '
  'cancelamento. Reabertura por usuário autenticado continua permitida.';

DROP TRIGGER IF EXISTS trg_carbo_cancelamento_nao_ressuscita ON public.carboze_orders;
CREATE TRIGGER trg_carbo_cancelamento_nao_ressuscita
BEFORE UPDATE OF status ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.carbo_cancelamento_nao_ressuscita();

NOTIFY pgrst, 'reload schema';
