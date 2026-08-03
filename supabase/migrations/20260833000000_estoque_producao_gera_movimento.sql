-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 3 — a produção passa a deixar rastro em stock_movements
--
-- A OP move estoque em três momentos e NENHUM aparecia na aba Movimentações:
--   • separação    → baixa dos insumos da BOM
--   • conclusão    → ajuste entre consumo teórico e real
--   • conclusão    → entrada do produto acabado
--
-- Tudo isso ia para `op_stock_ledger`, uma tabela que NENHUMA tela do sistema
-- lê (zero consumidores no front inteiro). Ela não é auditoria: é a memória de
-- que o `op_reverse_all` precisa para desfazer exatamente o que moveu.
--
-- O ledger CONTINUA existindo e continua sendo a base da reversão e do
-- `op_conclude` — nada da mecânica muda. O que passa a existir é o espelho
-- visível, em `stock_movements`, com elo para a OP e para o pedido de origem.
--
-- ⚠️ POR QUE A REVERSÃO ENTRA NESTA ETAPA, e não na 4:
-- Se só o `op_apply_delta` registrasse, voltar uma OP no kanban devolveria o
-- estoque SEM movimento de entrada — o histórico passaria a mostrar mais saída
-- do que a realidade e os KPIs de saída ficariam inflados. É exatamente a
-- assimetria que evitamos nas funções de venda na etapa 2. Registrar só metade
-- é pior que não registrar: dá aparência de auditoria a um número errado.
--
-- A etapa 4 continua separada e continua sendo a de maior risco: lá o ledger
-- deixa de ser APAGADO na reversão. Aqui ele segue sendo apagado como hoje.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Elo 1:1 entre o ledger e o movimento visível ─────────────────────────
-- Serve para a etapa 4 saber qual movimento estornar sem ter de adivinhar por
-- (op_id, product_id, reason) — e para depurar divergência entre os dois.
alter table public.op_stock_ledger
  add column if not exists movement_id uuid references public.stock_movements(id) on delete set null;

comment on column public.op_stock_ledger.movement_id is
  'Movimento visível correspondente a esta linha do ledger. SET NULL: o histórico sobrevive à limpeza do ledger.';


-- ── Registro do movimento de produção ────────────────────────────────────
-- Espelho do `carbo_reg_mov_venda` da etapa 2, com a mesma regra: quantidade
-- SEMPRE positiva (o sinal vive em `tipo`) e NUNCA levanta exceção.
create or replace function public.carbo_reg_mov_producao(
  p_op_id uuid, p_wh uuid, p_product uuid, p_delta numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_num text; v_op text; v_id uuid; v_nota text;
begin
  if p_product is null or coalesce(p_delta, 0) = 0 or p_wh is null then return null; end if;

  -- O elo com a venda vem da própria OP: `source_order_id` é gravado quando o
  -- Rastreio manda o pedido para "Criar Ordem de Produção". Com ele, a linha
  -- de movimento responde as duas perguntas — de qual OP e de qual pedido.
  select po.source_order_id, po.op_number into v_order, v_op
    from public.production_orders po where po.id = p_op_id;
  if v_order is not null then
    select order_number into v_num from public.carboze_orders where id = v_order;
  end if;

  -- Motivo em português: o ledger usa chaves internas ('separacao',
  -- 'conclusao_ajuste', 'conclusao_produto') que não significam nada para quem
  -- abre a aba Movimentações.
  v_nota := case p_reason
    when 'separacao'         then 'Separação de insumos'
    when 'conclusao_ajuste'  then 'Ajuste de consumo na conclusão'
    when 'conclusao_produto' then 'Produto acabado'
    when 'estorno'           then 'Estorno da OP'
    else coalesce(p_reason, 'Produção')
  end
  || coalesce(' · OP ' || v_op, '')
  || coalesce(' · pedido ' || v_num, '');

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, op_id, order_id, observacoes, created_by)
  values
    (p_product, p_wh,
     case when p_delta > 0 then 'entrada' else 'saida' end,
     abs(p_delta), 'producao', p_op_id, p_op_id, v_order, v_nota, auth.uid())
  returning id into v_id;

  return v_id;
exception when others then
  -- Histórico não trava produção. Se o registro falhar, a OP segue.
  return null;
end $$;

comment on function public.carbo_reg_mov_producao is
  'Registra em stock_movements o movimento de uma OP (origem=producao), com elo para a OP e para o pedido que a originou. Devolve o id do movimento. Nunca levanta exceção.';


-- ── op_apply_delta passa a espelhar no histórico ─────────────────────────
CREATE OR REPLACE FUNCTION public.op_apply_delta(
  p_op_id uuid, p_product_id uuid, p_delta numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; v_mov uuid;
BEGIN
  IF p_product_id IS NULL OR p_delta = 0 THEN RETURN; END IF;
  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (wh, p_product_id, p_delta)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = public.warehouse_stock.quantity + p_delta, updated_at = now();

  -- Movimento visível PRIMEIRO, para guardar o id no ledger.
  v_mov := public.carbo_reg_mov_producao(p_op_id, wh, p_product_id, p_delta, p_reason);

  INSERT INTO public.op_stock_ledger (op_id, product_id, warehouse_id, delta, reason, movement_id)
  VALUES (p_op_id, p_product_id, wh, p_delta, p_reason, v_mov);
END $$;


-- ── op_reverse_all registra o estorno (mecânica intacta) ─────────────────
-- Só ganhou a chamada de registro. A soma do ledger, o UPDATE do saldo, os
-- DELETEs e o reset das flags continuam exatamente como estavam — trocar isso
-- é a etapa 4.
CREATE OR REPLACE FUNCTION public.op_reverse_all(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT product_id, warehouse_id, sum(delta) AS d
      FROM public.op_stock_ledger WHERE op_id = p_op_id
      GROUP BY product_id, warehouse_id HAVING sum(delta) <> 0
  LOOP
    UPDATE public.warehouse_stock
      SET quantity = quantity - r.d, updated_at = now()
      WHERE warehouse_id = r.warehouse_id AND product_id = r.product_id;
    -- ⭐ NOVO: o estorno é o INVERSO do saldo acumulado (por isso `-r.d`).
    -- Sem isto, voltar a OP devolveria o estoque sem movimento de entrada e o
    -- histórico mostraria mais saída do que a realidade.
    PERFORM public.carbo_reg_mov_producao(p_op_id, r.warehouse_id, r.product_id, -r.d, 'estorno');
  END LOOP;
  DELETE FROM public.op_stock_ledger WHERE op_id = p_op_id;
  DELETE FROM public.op_material_loss WHERE op_id = p_op_id;
  UPDATE public.production_orders
    SET materials_deducted = false, product_credited = false, production_route = NULL
    WHERE id = p_op_id;
END $$;

GRANT EXECUTE ON FUNCTION public.op_apply_delta(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_reverse_all(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carbo_reg_mov_producao(uuid, uuid, uuid, numeric, text) TO authenticated;

-- Sem backfill: o ledger histórico não guarda o suficiente para reconstruir
-- movimento com honestidade, e o `op_reverse_all` já apagou o das OPs
-- revertidas. Degrau na data do deploy, como na etapa 2.


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Linha de base — tem de continuar 115 'ajuste' + o que a etapa 2 gerou
--     desde ontem. NADA de 'producao' ainda: só aparece quando alguém mover
--     uma OP.
select w.code as hub, m.origem, count(*) as movimentos
from public.stock_movements m
left join public.warehouses w on w.id = m.warehouse_id
group by 1, 2
order by 1 nulls last, 3 desc;

-- (b) O elo novo entrou?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'op_stock_ledger'
  and column_name = 'movement_id';

-- (c) OPs vivas com estoque já movimentado. São estas que vão gerar estorno
--     visível se alguém voltar o card — vale saber quantas são antes.
select po.op_number, po.op_status, po.materials_deducted, po.product_credited,
       count(l.id) as linhas_no_ledger
from public.production_orders po
left join public.op_stock_ledger l on l.op_id = po.id
where po.materials_deducted = true or po.product_credited = true
group by 1, 2, 3, 4
order by 1;
