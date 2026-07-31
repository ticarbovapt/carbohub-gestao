-- ═══════════════════════════════════════════════════════════════════════════
-- NF cancelada no Bling passa a CANCELAR a venda, não só avisar
--
-- Até aqui o trigger `carbo_avisar_nf_invalida` mandava uma notificação e
-- parava por aí. O pedido continuava `delivered`/`pending`, continuava no
-- kanban do Rastreio como se estivesse vivo, e o estoque deduzido continuava
-- deduzido. Só a carbo_vendas_metrica sabia da verdade, e ela sabia por um
-- caminho lateral (motivo_fora = 'nf_invalida') que nenhuma outra tela lê.
--
-- Resultado prático: nota cancelada no Bling e venda viva no sistema. Alguém
-- tinha que ler a notificação e ir cancelar na mão — e ninguém ia.
--
-- Agora o cancelamento é automático e faz as TRÊS coisas juntas, que é o que
-- "cancelar" significa em qualquer outro lugar do sistema:
--   1. status = 'cancelled'        → sai do faturamento (toda métrica lê isto)
--   2. fulfillment_stage = 'cancelado' → o card vai pra coluna Cancelado
--   3. estorno do estoque          → devolve ao HUB-RN o que foi deduzido
--
-- ⚠️ RESSALVA QUE VALE SABER: nem toda NF cancelada significa venda perdida.
-- Nota cancelada para ser REEMITIDA (erro de dado, endereço, CFOP) cancela a
-- venda aqui também. Quando isso acontecer, é só arrastar o card de volta no
-- Rastreio do Ops — a etapa devolve o status para 'pending' e o estoque é
-- deduzido de novo na separação. Reversível de propósito.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_avisar_nf_invalida()
returns trigger
language plpgsql
security definer   -- o sync roda com service_role; precisa alcançar
set search_path = public  -- notifications e carboze_orders de outro usuário.
as $$
declare
  v_pedido    record;
  v_rotulo    text;
  v_estornado int := 0;
begin
  -- Só a TRANSIÇÃO para inválida. Sem esta guarda, todo sync reprocessaria a
  -- mesma nota — reavisando a pessoa e, agora que cancela, brigando com quem
  -- tivesse reaberto o pedido de propósito.
  if coalesce(public.carbo_nf_invalida(NEW.situacao), false) is not true then
    return NEW;
  end if;
  if coalesce(public.carbo_nf_invalida(OLD.situacao), false) is true then
    return NEW;
  end if;

  select o.id, o.order_number, o.customer_name, o.total, o.vendedor_id, o.status
    into v_pedido
  from public.carboze_orders o
  where o.bling_nf_id = NEW.bling_id
  limit 1;

  -- Nota sem pedido vinculado não tem o que cancelar nem a quem avisar. Ela já
  -- aparece como órfã na tela de NFs.
  if v_pedido.id is null then
    return NEW;
  end if;

  v_rotulo := coalesce(NEW.situacao, 'inválida');

  -- ── Cancela de verdade ────────────────────────────────────────────────
  if v_pedido.status is distinct from 'cancelled' then
    -- Estorno ANTES: a função só age com stock_deducted = true, então pedido
    -- que nunca foi separado passa batido.
    v_estornado := public.pos_venda_restore_stock(v_pedido.id);

    -- Os dois campos JUNTOS. `status` é o que a métrica lê; `fulfillment_stage`
    -- é o que o Rastreio mostra. Mexer só num deles foi exatamente o bug que
    -- deixou venda cancelada somando no faturamento.
    update public.carboze_orders
    set status = 'cancelled',
        fulfillment_stage = 'cancelado',
        updated_at = now()
    where id = v_pedido.id;

    begin
      update public.ops_shipments set status = 'cancelado', updated_at = now()
      where order_id = v_pedido.id;
    exception when others then null;
    end;

    begin
      insert into public.order_status_history (order_id, status, notes, changed_by)
      values (
        v_pedido.id, 'cancelled',
        'Cancelado automaticamente: NF ' || coalesce(NEW.numero, 's/ número')
          || ' ficou ' || v_rotulo || ' no Bling'
          || case when v_estornado > 0
               then ' · ' || v_estornado || ' item(ns) estornado(s) no HUB-RN'
               else '' end,
        null
      );
    exception when others then null;
    end;
  end if;

  -- ── Avisa quem vendeu ─────────────────────────────────────────────────
  if v_pedido.vendedor_id is not null then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
    values (
      v_pedido.vendedor_id,
      'nf_invalida',
      '⚠️ NF ' || coalesce(NEW.numero, 's/ número') || ' — ' || v_rotulo,
      'Pedido ' || coalesce(v_pedido.order_number, '?')
        || ' · ' || coalesce(v_pedido.customer_name, 'cliente não informado')
        || ' · R$ ' || to_char(coalesce(v_pedido.total, 0), 'FM999G999G990D00')
        || '. A VENDA FOI CANCELADA automaticamente e saiu do faturamento'
        || case when v_estornado > 0
             then ', e o estoque voltou pro HUB-RN' else '' end
        || '. Se a nota foi cancelada para ser reemitida, arraste o card de volta '
        || 'no Rastreio do Ops para reabrir a venda.',
      'carboze_order',
      v_pedido.id::text
    );
  end if;

  return NEW;
exception when others then
  -- NUNCA derrubar o sync do Bling. A bridge trata exceção como
  -- `totalFailed++` e a NOTA inteira se perderia — trocaríamos um
  -- cancelamento que falta por um dado que some.
  return NEW;
end $$;

comment on function public.carbo_avisar_nf_invalida is
  'AFTER UPDATE em bling_nfe: quando a situação MUDA para cancelada/denegada/rejeitada/bloqueada e há pedido vinculado, CANCELA a venda (status + etapa + estorno de estoque) e notifica quem vendeu. Só na transição. Reversível pelo Rastreio do Ops.';

-- O trigger de 20260821000000 já existe e aponta para esta função — o
-- `create or replace` acima basta. Recriar exigiria AccessExclusiveLock em
-- bling_nfe e daria deadlock com o cron do Bling.

-- ── Passivo: NFs já inválidas hoje ────────────────────────────────────────
-- O trigger só pega as PRÓXIMAS transições. Estas já estão inválidas e o
-- pedido delas continua vivo. Confere ANTES de rodar o update abaixo.
select n.numero, n.situacao, o.order_number, o.customer_name, o.total,
       o.status, o.fulfillment_stage, o.stock_deducted
from public.bling_nfe n
join public.carboze_orders o on o.bling_nf_id = n.bling_id
where public.carbo_nf_invalida(n.situacao)
  and o.status is distinct from 'cancelled'
order by o.total desc;
