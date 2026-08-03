-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPAS 1 e 2 — a venda passa a deixar rastro no estoque
--
-- O problema: `pos_venda_deduct_stock`, `pos_venda_restore_stock` e
-- `pos_venda_credit_stock` mexem em `warehouse_stock` e NÃO registram nada em
-- `stock_movements`. O produto sai do galpão para o cliente e a aba
-- Movimentações não mostra nada. A única prova de que houve baixa é o booleano
-- `carboze_orders.stock_deducted`, que não diz quanto, de quê, nem quando.
--
-- Retrato de antes desta migração: 115 movimentações em dois meses, TODAS de
-- origem 'ajuste'. A aba era um log de correções manuais, não um histórico.
--
-- Confirmado antes de escrever: NÃO existe trigger em `warehouse_stock`, e em
-- `stock_movements` existe só o de validação, que valida e retorna. Ninguém
-- recalcula saldo a partir do movimento — portanto inserir o movimento NÃO
-- causa baixa dupla.
--
-- As TRÊS funções mudam juntas, de propósito. Se só a dedução registrasse,
-- cancelar uma venda devolveria o saldo sem movimento de entrada, e o
-- histórico passaria a mostrar mais saída do que a realidade.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ ETAPA 1a — o trigger passa a aceitar as origens novas                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Sem isto a etapa 2 não falha "de leve": a exceção do trigger aborta a
-- transação inteira, o saldo não cai, e a etapa "Separado" quebra na cara do
-- operador. Tem de vir ANTES.
--
-- `producao` entra agora, embora só passe a ser usada na etapa 3 — abrir o
-- vocabulário é barato e evita uma segunda migração idêntica depois.
--
-- ⚠️ NÃO adicionei 'pedido' nem 'OS', que são as origens que o app RAIZ
-- (controle, congelado) tenta gravar hoje e o trigger rejeita — com o erro
-- engolido, porque lá o `.error` não é checado. Deixá-las de fora é
-- deliberado: se o controle voltasse a gravar sobre um pedido que o Ops também
-- registra, o histórico duplicaria. O `/vender` vivo é o dos apps.
CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido: %', NEW.tipo;
  END IF;
  IF NEW.origem NOT IN ('PC', 'OP', 'ajuste', 'transferencia', 'venda', 'producao') THEN
    RAISE EXCEPTION 'Origem de movimento inválida: %', NEW.origem;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ ETAPA 1b — colunas de elo com o card que causou o movimento           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `origem` + `origem_id` já existem, mas são um par polimórfico sem FK: servem
-- para "que transferência foi essa", não para join confiável em relatório.
-- Duas colunas nomeadas respondem as duas perguntas com um WHERE cada:
--   "esta linha veio de quê?"        → order_id / op_id na própria linha
--   "que movimentos este card gerou?" → WHERE order_id = X
--
-- ⚠️ ON DELETE SET NULL, não CASCADE. Com CASCADE, excluir a venda apagaria
-- justamente o rastro que estamos criando — e a exclusão de venda hoje já é o
-- caminho que mais perde histórico. O movimento sobrevive órfão, com o número
-- do pedido preservado em `observacoes`.
alter table public.stock_movements
  add column if not exists order_id uuid references public.carboze_orders(id) on delete set null,
  add column if not exists op_id    uuid references public.production_orders(id) on delete set null;

comment on column public.stock_movements.order_id is
  'Pedido que causou o movimento (venda). Null para ajuste/transferência.';
comment on column public.stock_movements.op_id is
  'Ordem de produção que causou o movimento. Null fora do fluxo de produção.';

create index if not exists idx_stock_movements_order on public.stock_movements (order_id) where order_id is not null;
create index if not exists idx_stock_movements_op    on public.stock_movements (op_id)    where op_id is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ ETAPA 2 — as três funções de venda registram o movimento             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Escreve UMA linha de movimento de venda. Concentrada numa função só para as
-- três rotas não divergirem — é exatamente assim que a dedução e o estorno
-- passariam a contar coisas diferentes.
--
-- `quantidade` é SEMPRE positiva: o sinal vive em `tipo`. É a convenção da
-- tabela, e gravar negativo aqui faria os KPIs somarem errado sem erro nenhum.
create or replace function public.carbo_reg_mov_venda(
  p_order_id uuid, p_wh uuid, p_product uuid, p_qty numeric,
  p_tipo text, p_nota text
) returns void language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  if p_product is null or coalesce(p_qty, 0) <= 0 or p_wh is null then return; end if;
  select order_number into v_num from public.carboze_orders where id = p_order_id;

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, order_id, observacoes, created_by)
  values
    (p_product, p_wh, p_tipo, abs(p_qty), 'venda', p_order_id, p_order_id,
     p_nota || coalesce(' · pedido ' || v_num, ''),
     -- SECURITY DEFINER não anula auth.uid(): ela é uma GUC da requisição, não
     -- depende do dono da função. Fica null quando roda por trigger/cron, e a
     -- coluna "Por" mostra "—", que é honesto.
     auth.uid());
exception when others then
  -- ⚠️ NUNCA derrubar a movimentação de estoque por causa do registro.
  -- O saldo é a verdade operacional; o histórico é documentação. Se o insert
  -- falhar (origem recusada, produto apagado), a separação tem de seguir —
  -- trocaríamos um histórico que falta por um pedido travado no galpão.
  return;
end $$;

comment on function public.carbo_reg_mov_venda is
  'Registra uma linha em stock_movements para os fluxos de venda (origem=venda). Nunca levanta exceção: histórico não pode travar operação.';


-- ── Dedução (etapa "Separado") ───────────────────────────────────────────
-- Sem DROP: o retorno continua `int`, então o REPLACE basta. Dropar abriria
-- uma janela em que a função não existe e uma separação simultânea falharia.
CREATE OR REPLACE FUNCTION public.pos_venda_deduct_stock(p_order_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int; n int := 0;
BEGIN
  UPDATE public.carboze_orders
    SET stock_deducted = true, updated_at = now()
    WHERE id = p_order_id AND stock_deducted = false;
  IF NOT FOUND THEN RETURN 0; END IF;  -- já deduzido

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN 0; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, -qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity - qty, updated_at = now();
      PERFORM public.carbo_reg_mov_venda(p_order_id, wh, pid, qty, 'saida', 'Separação');
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ── Estorno (voltar de "Separado", cancelar, NF cancelada) ───────────────
CREATE OR REPLACE FUNCTION public.pos_venda_restore_stock(p_order_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int; n int := 0;
BEGIN
  UPDATE public.carboze_orders
    SET stock_deducted = false, updated_at = now()
    WHERE id = p_order_id AND stock_deducted = true;
  IF NOT FOUND THEN RETURN 0; END IF;  -- não estava deduzido → nada a estornar

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN 0; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + qty, updated_at = now();
      PERFORM public.carbo_reg_mov_venda(p_order_id, wh, pid, qty, 'entrada', 'Estorno de separação');
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ── Crédito por produção concluída ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_venda_credit_stock(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int;
BEGIN
  UPDATE public.carboze_orders
    SET stock_credited = true, production_done = true, updated_at = now()
    WHERE id = p_order_id AND stock_credited = false;
  IF NOT FOUND THEN RETURN; END IF;  -- já creditado

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + qty, updated_at = now();
      PERFORM public.carbo_reg_mov_venda(p_order_id, wh, pid, qty, 'entrada', 'Produção concluída');
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_venda_deduct_stock(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_venda_restore_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_venda_credit_stock(uuid)  TO authenticated;

-- SEM BACKFILL, de propósito. Pedido já com stock_deducted = true nunca vai
-- gerar movimento retroativo, e não há como saber QUANDO cada dedução ocorreu
-- (só `updated_at`, já sobrescrito por outras edições). Inventar data em
-- ledger é pior que buraco assumido: o histórico fica com um degrau na data
-- do deploy, e isso é verdade.


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) O trigger aceita as origens novas?
select pg_get_functiondef('public.validate_stock_movement()'::regprocedure)
         ~ 'venda' as aceita_venda,
       pg_get_functiondef('public.validate_stock_movement()'::regprocedure)
         ~ 'producao' as aceita_producao;

-- (b) As colunas de elo entraram?
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'stock_movements'
  and column_name in ('order_id', 'op_id')
order by column_name;

-- (c) Linha de base — tem de continuar igual ao retrato de antes
--     (115 movimentos, todos 'ajuste'). Nada foi criado retroativamente.
select w.code as hub, m.origem, count(*) as movimentos
from public.stock_movements m
left join public.warehouses w on w.id = m.warehouse_id
group by 1, 2
order by 1 nulls last, 3 desc;
