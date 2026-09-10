-- ═══════════════════════════════════════════════════════════════════════════
-- Virar pronta entrega DEPOIS da venda criada não deduzia nada
--
-- ── O sintoma ────────────────────────────────────────────────────────────
--
-- V2026090057 (Breno Henrique, 80 × CarboZé 100ml, 10/09):
--
--     entrega_modalidade = 'pronta_entrega'   ← marcada
--     status             = 'pending'          ← não é orçamento
--     stock_deducted     = false              ← não deduziu
--     fulfillment_stage  = 'nova_venda'       ← devia estar em 'gerar_nf'
--     caixa do vendedor  = 399 un             ← sobrava saldo
--
-- Os três gatilhos existiam e estavam ativos. Ninguém falhou: nenhum foi
-- CHAMADO.
--
-- ── A causa: faltava o terceiro evento ──────────────────────────────────
--
-- A 20260899 cobre dois momentos, e só eles:
--
--     INSERT                         deduz se a modalidade JÁ vier na linha
--     UPDATE de status (quote→venda) deduz na conversão do orçamento
--     UPDATE de entrega_modalidade   — não existia
--
-- O "Editar venda" (`useUpdateVendaFull`) grava `entrega_modalidade` num
-- UPDATE comum. Venda que NASCEU produção e virou pronta entrega na edição não
-- passa por nenhum dos dois: no insert a modalidade era outra, e o status nunca
-- foi 'quote', então a cláusula WHEN da conversão (`old.status = 'quote'`) é
-- falsa. O pedido fica marcado como pronta entrega e o estoque nunca sai.
--
-- ⚠️ E o silêncio é total: a tela mostra "Pronta entrega", o card fica em Nova
-- Venda, e a caixa do vendedor segue cheia de produto que já foi embora na van.
-- O erro só aparece no dia da contagem física.
--
-- ── O que este arquivo faz ──────────────────────────────────────────────
--
-- Um gatilho para o evento que faltava, chamando a MESMA função de sempre — a
-- dedução, a trava por linha e a recusa por falta de saldo continuam num lugar
-- só.
--
-- ⚠️ Ele NÃO empurra card para trás. A 20260899 põe `gerar_nf` sem olhar a
-- etapa atual, o que é seguro num INSERT (o pedido acabou de nascer) e não é
-- num UPDATE: um pedido que já avançou voltaria para "Gerar NF". Aqui a etapa
-- só muda se ainda estiver em `nova_venda`.
--
-- ⚠️ Sem saldo, o UPDATE FALHA — de propósito, e com a mensagem da RPC ("você
-- tem N, o pedido pede M"). É a mesma recusa de quem cria a venda já como
-- pronta entrega; deixar passar gravaria a modalidade sem tirar o produto, que
-- é o defeito que este arquivo conserta.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o tamanho do buraco                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ TODO pedido nessa situação, não só o V2026090057: marcado como
--       pronta entrega, não deduzido e sem ter sido cancelado. Cada linha aqui
--       é produto que saiu na van e continua contado na caixa do vendedor.
select o.order_number, o.created_at, o.updated_at, o.status, o.fulfillment_stage,
       o.vendedor_name, o.total,
       (o.updated_at > o.created_at + interval '1 minute') as foi_editado_depois
from public.carboze_orders o
where o.entrega_modalidade = 'pronta_entrega'
  and coalesce(o.stock_deducted, false) = false
  and o.status not in ('cancelled', 'quote')
order by o.created_at;

-- (0.b) O contrário, para conferir que o caminho normal funciona: pronta
--       entrega JÁ deduzida. Se aqui vier vazio, o problema é mais amplo do
--       que esta migração supõe — PARE e me diga.
select count(*) as prontas_deduzidas
from public.carboze_orders
where entrega_modalidade = 'pronta_entrega' and stock_deducted;

-- (0.c) Nada saiu por conta do V2026090057 (a coluna é `quantidade`).
select sm.created_at, sm.tipo, sm.quantidade, sm.origem, sm.observacoes,
       p.name as produto, w.code as galpao
from public.stock_movements sm
left join public.mrp_products p on p.id = sm.product_id
left join public.warehouses w on w.id = sm.warehouse_id
where sm.order_id = 'a753866b-fb43-4183-ae82-c77606f09d36'
order by sm.created_at;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o gatilho que faltava                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_pronta_entrega_virou_pronta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Orçamento espera a conversão, como nos outros dois caminhos.
  if new.status = 'quote' then return new; end if;

  -- Cinto: a própria RPC é idempotente, mas sair antes evita o FOR UPDATE.
  if coalesce(new.stock_deducted, false) then return new; end if;

  perform public.carbo_pronta_entrega_deduzir(new.id);

  -- ⚠️ SÓ de `nova_venda`. Diferente do gatilho de INSERT, aqui o pedido pode
  -- já ter andado — e mandá-lo de volta para "Gerar NF" seria desfazer
  -- trabalho de outra pessoa.
  update public.carboze_orders
     set fulfillment_stage = 'gerar_nf'
   where id = new.id and fulfillment_stage = 'nova_venda';

  return new;
end;
$$;

comment on function public.carbo_pronta_entrega_virou_pronta is
  'Deduz a caixa do vendedor quando um pedido JÁ EXISTENTE passa a ser pronta entrega (edição). A 20260899 cobria só INSERT e a conversão de orçamento; venda que nasceu produção e virou pronta entrega na edição não passava por nenhum dos dois — ficava marcada, sem deduzir e parada em "nova_venda". ⚠️ Só promove a etapa a partir de nova_venda: no UPDATE o pedido pode já ter andado.';

drop trigger if exists trg_pronta_entrega_virou on public.carboze_orders;
create trigger trg_pronta_entrega_virou
  after update of entrega_modalidade on public.carboze_orders
  for each row
  -- ⚠️ `is distinct from` e não `<>`: o valor antigo costuma ser NULL, e
  -- `null <> 'pronta_entrega'` é NULL — a cláusula nunca seria verdadeira e o
  -- gatilho não dispararia para o caso mais comum de todos.
  when (coalesce(new.entrega_modalidade, '') = 'pronta_entrega'
        and old.entrega_modalidade is distinct from 'pronta_entrega')
  execute function public.carbo_pronta_entrega_virou_pronta();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o V2026090057, que já está gravado errado                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Este bloco MEXE EM ESTOQUE: tira 80 CarboZé 100ml da caixa do Breno.
-- Rode só depois de ver o 0.a e concordar com a lista.
--
-- Ele é seguro de repetir: a RPC devolve 0 se o pedido já estiver deduzido.

do $$
declare
  v_id uuid := 'a753866b-fb43-4183-ae82-c77606f09d36';
  v_n  int;
begin
  select public.carbo_pronta_entrega_deduzir(v_id) into v_n;

  update public.carboze_orders
     set fulfillment_stage = 'gerar_nf'
   where id = v_id and fulfillment_stage = 'nova_venda';

  raise notice 'Linhas de estoque deduzidas: %', v_n;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) ⭐ O pedido: deduzido, com o galpão gravado e em "Gerar NF".
select order_number, status, fulfillment_stage, entrega_modalidade,
       stock_deducted, estoque_warehouse_id
from public.carboze_orders
where id = 'a753866b-fb43-4183-ae82-c77606f09d36';

-- (3.b) ⭐ A saída registrada, auditável: 80 un, saída, origem 'venda'.
select sm.created_at, sm.tipo, sm.quantidade, sm.origem, sm.observacoes,
       p.name as produto, w.code as galpao
from public.stock_movements sm
left join public.mrp_products p on p.id = sm.product_id
left join public.warehouses w on w.id = sm.warehouse_id
where sm.order_id = 'a753866b-fb43-4183-ae82-c77606f09d36';

-- (3.c) A caixa do Breno: 399 − 80 = 319.
select w.code, p.name as produto, ws.quantity as saldo
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id
join public.mrp_products p on p.id = ws.product_id
where w.owner_id = 'd1fcaf80-6cd7-403d-8d65-2a19433ef990' and w.kind = 'vendedor'
order by p.name;

-- (3.d) ⭐ A lista do 0.a tem de ter ESVAZIADO (ou perdido este pedido).
select count(*) as ainda_marcadas_sem_deduzir
from public.carboze_orders
where entrega_modalidade = 'pronta_entrega'
  and coalesce(stock_deducted, false) = false
  and status not in ('cancelled', 'quote');
