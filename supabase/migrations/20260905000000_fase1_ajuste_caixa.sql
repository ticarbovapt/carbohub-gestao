-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — corrigir o saldo de uma caixa (e de qualquer armazém)
--
-- Eu disse ao dono do processo que "quem corrige o saldo é o Ops", e não
-- construí isso. A tela do Ops só tinha Enviar e Confirmar chegada. Quebra,
-- perda, amostra e erro de contagem não tinham como ser registrados — o único
-- caminho era SQL na mão.
--
-- ── Por que uma RPC nova, e não estender o ajuste que já existe ───────────
--
-- O ajuste de hub de hoje (`useSetStockQty`) mora no CLIENTE e faz:
--     lê o saldo NA TELA → upsert(quantity = valor absoluto) → insert movimento
-- Três defeitos, e o primeiro é grave numa caixa que vende sozinha:
--
--  1. VALOR ABSOLUTO. Ops abre a tela vendo 10 → o vendedor vende 3 (saldo
--     real 7) → Ops grava "corrigi para 9" → escreve 9, e a venda de 3
--     desaparece. O certo seria 6. E o upsert vindo do PostgREST ESPERA o
--     `FOR UPDATE` da dedução e sobrescreve depois — a trava da venda não
--     protege contra ele.
--  2. O delta do movimento é calculado com o saldo que a tela leu. Se o saldo
--     mudou desde o carregamento, o ledger registra uma variação que não
--     aconteceu e deixa de reconciliar com `warehouse_stock`.
--  3. Saldo e movimento são DUAS requisições HTTP. Falha na segunda deixa
--     estoque alterado sem rastro nenhum.
--
-- Esta função recebe a quantidade CONTADA, mas calcula o delta DENTRO da
-- transação, depois de travar a linha. O que o usuário informa é o que ele
-- viu na prateleira; o que o sistema grava é a diferença real no instante da
-- gravação.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o motivo, em coluna                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `stock_movements` só tem `observacoes` (texto livre). "Quebrou", "quebra",
-- "caiu da van" e "qbra" são a mesma coisa para a operação e quatro coisas
-- diferentes para uma consulta — e a pergunta que vai ser feita daqui a três
-- meses é "quanto a gente perdeu por quebra?".
--
-- Coluna nova, nullable: todo movimento que já existe continua válido, e só
-- ajuste preenche.

set lock_timeout = '5s';

alter table public.stock_movements
  add column if not exists ajuste_motivo text;

reset lock_timeout;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_ajuste_motivo_check') then
    alter table public.stock_movements
      add constraint stock_movements_ajuste_motivo_check check (
        ajuste_motivo is null or ajuste_motivo in
          ('contagem', 'quebra', 'perda', 'amostra', 'devolucao_cliente', 'outro')
      );
  end if;
end $$;

comment on column public.stock_movements.ajuste_motivo is
  'Por que o saldo foi ajustado. Lista fechada, preenchida só por carbo_ajustar_estoque. Texto livre em observacoes não responde "quanto perdemos por quebra".';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a função de ajuste                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Serve para QUALQUER armazém, não só caixa de vendedor: o defeito do ajuste
-- absoluto existe igual no HUB-RN, e duas funções de ajuste divergiriam.
--
-- ⚠️ `p_qty_contada` é o que a pessoa CONTOU. O delta é calculado aqui dentro,
-- depois do FOR UPDATE. Ver o cabeçalho para o porquê.
--
-- ⚠️ `p_saldo_esperado` é opcional e é a rede de segurança: a tela manda o
-- saldo que estava exibindo, e se ele não bater com o do banco a função
-- RECUSA. Sem isso, um ajuste feito com a tela velha corrige para um número
-- que já não faz sentido — e a pessoa não tem como saber. Recusar e pedir para
-- reconferir custa um clique; gravar em cima de uma venda custa um inventário.

create or replace function public.carbo_ajustar_estoque(
  p_warehouse_id   uuid,
  p_product_id     uuid,
  p_qty_contada    numeric,
  p_motivo         text,
  p_obs            text default null,
  p_saldo_esperado numeric default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual numeric;
  v_delta numeric;
  v_nome  text;
  v_wh    text;
begin
  if not public.carbo_pode_mexer_estoque() then
    raise exception 'Você não tem permissão para ajustar estoque. É preciso acesso ao Carbo Ops.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_qty_contada is null or p_qty_contada < 0 then
    raise exception 'Quantidade contada inválida.' using errcode = 'check_violation';
  end if;

  if p_motivo is null or p_motivo not in
     ('contagem','quebra','perda','amostra','devolucao_cliente','outro') then
    raise exception 'Motivo inválido.' using errcode = 'check_violation';
  end if;

  select name into v_wh from public.warehouses where id = p_warehouse_id;
  if v_wh is null then
    raise exception 'Armazém não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Trava a linha ANTES de ler. É o que faz o delta ser calculado contra o
  -- saldo real do instante, e não contra o que a tela viu.
  select quantity into v_atual
    from public.warehouse_stock
   where warehouse_id = p_warehouse_id and product_id = p_product_id
   for update;
  v_atual := coalesce(v_atual, 0);

  -- Rede de segurança: a tela mudou embaixo de quem estava olhando?
  if p_saldo_esperado is not null and p_saldo_esperado <> v_atual then
    raise exception
      'O saldo mudou enquanto você conferia (era %, agora é %). Confira de novo antes de ajustar.',
      p_saldo_esperado, v_atual
      using errcode = 'serialization_failure';
  end if;

  v_delta := p_qty_contada - v_atual;
  if v_delta = 0 then
    return v_atual;                      -- nada a fazer, e nada a registrar
  end if;

  -- ⚠️ O guarda de negativo mora aqui porque `warehouse_stock.quantity` NÃO
  -- tem CHECK >= 0. O único obstáculo a saldo negativo no sistema é o `raise`
  -- de quem deduz — e um ajuste passaria por cima dele.
  if p_qty_contada < 0 then
    raise exception 'Saldo não pode ficar negativo.' using errcode = 'check_violation';
  end if;

  insert into public.warehouse_stock (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse_id, p_product_id, p_qty_contada, now())
  on conflict (warehouse_id, product_id)
  -- Delta relativo, não absoluto: entre o SELECT FOR UPDATE e aqui nada mais
  -- escreve nesta linha (ela está travada), então os dois seriam equivalentes
  -- — mas escrever o delta mantém a mesma forma das outras seis funções de
  -- estoque, e forma diferente é o que faz alguém copiar a errada depois.
  do update set quantity = public.warehouse_stock.quantity + v_delta, updated_at = now();

  select name into v_nome from public.mrp_products where id = p_product_id;

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, ajuste_motivo, observacoes, created_by)
  values
    (p_product_id, p_warehouse_id,
     case when v_delta > 0 then 'entrada' else 'saida' end,
     abs(v_delta), 'ajuste', p_motivo,
     format('[%s] ajuste %s→%s · %s%s', v_wh, v_atual, p_qty_contada, p_motivo,
            case when coalesce(p_obs,'') = '' then '' else ' · ' || p_obs end),
     auth.uid());

  return p_qty_contada;
end;
$$;

comment on function public.carbo_ajustar_estoque is
  'Ajusta o saldo de um armazém a partir da quantidade CONTADA. Trava a linha, calcula o delta dentro da transação e grava saldo + movimento juntos. Recusa se o saldo mudou desde o que a tela exibia. Substitui o ajuste do cliente, que gravava valor absoluto lido da tela e apagava vendas concorrentes.';

revoke all on function public.carbo_ajustar_estoque(uuid, uuid, numeric, text, text, numeric) from public, anon;
grant execute on function public.carbo_ajustar_estoque(uuid, uuid, numeric, text, text, numeric) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A coluna e o CHECK existem?
select column_name from information_schema.columns
where table_schema='public' and table_name='stock_movements' and column_name='ajuste_motivo';

-- (b) Últimos ajustes (vazio por enquanto — a tela ainda não usa).
select m.created_at, w.name as armazem, pr.name as produto,
       m.tipo, m.quantidade, m.ajuste_motivo, m.observacoes
from public.stock_movements m
join public.warehouses   w  on w.id  = m.warehouse_id
join public.mrp_products pr on pr.id = m.product_id
where m.origem = 'ajuste'
order by m.created_at desc
limit 20;

-- (c) Quanto se perdeu por motivo — a pergunta que a coluna existe para
--     responder. Só terá dado depois que a tela começar a ser usada.
select ajuste_motivo, sum(quantidade) as unidades, count(*) as ocorrencias
from public.stock_movements
where origem = 'ajuste' and tipo = 'saida' and ajuste_motivo is not null
group by ajuste_motivo
order by unidades desc;
