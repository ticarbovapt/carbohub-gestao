-- ═══════════════════════════════════════════════════════════════════════════
-- NF cancelada no Bling passa a AVISAR alguém
--
-- Hoje o dado existe e ninguém é avisado. O sync do Bling atualiza
-- bling_nfe.situacao para 'Cancelada' a cada rodada, a carbo_vendas_metrica
-- desconta o pedido do faturamento (motivo_fora = 'nf_invalida') e a tela de
-- Dados Comerciais mostra a etiqueta vermelha.
--
-- Só que tudo isso é PASSIVO: depende de alguém abrir a tela certa e reparar
-- que uma etiqueta mudou de cor. Uma nota de R$ 19 mil cancelada some do
-- faturamento sem ninguém saber que sumiu — e o vínculo continua lá, então o
-- pedido parece faturado para quem olha por cima.
--
-- Este trigger fecha essa lacuna: quem vendeu recebe notificação no mesmo
-- instante em que o Bling cancela.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_avisar_nf_invalida()
returns trigger
language plpgsql
security definer   -- o sync roda com service_role; a inserção precisa
set search_path = public  -- alcançar notifications de OUTRO usuário.
as $$
declare
  v_pedido record;
  v_rotulo text;
begin
  -- Só interessa a TRANSIÇÃO para inválida. Sem esta guarda, todo sync
  -- reavisa a mesma nota cancelada e a pessoa aprende a ignorar o sino.
  if coalesce(public.carbo_nf_invalida(NEW.situacao), false) is not true then
    return NEW;
  end if;
  if coalesce(public.carbo_nf_invalida(OLD.situacao), false) is true then
    return NEW;
  end if;

  select o.id, o.order_number, o.customer_name, o.total, o.vendedor_id
    into v_pedido
  from public.carboze_orders o
  where o.bling_nf_id = NEW.bling_id
  limit 1;

  -- Nota sem pedido vinculado não tem a quem avisar. Ela já aparece como
  -- órfã na tela de NFs.
  if v_pedido.id is null or v_pedido.vendedor_id is null then
    return NEW;
  end if;

  v_rotulo := coalesce(NEW.situacao, 'inválida');

  insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
  values (
    v_pedido.vendedor_id,
    'nf_invalida',
    '⚠️ NF ' || coalesce(NEW.numero, 's/ número') || ' — ' || v_rotulo,
    'Pedido ' || coalesce(v_pedido.order_number, '?')
      || ' · ' || coalesce(v_pedido.customer_name, 'cliente não informado')
      || ' · R$ ' || to_char(coalesce(v_pedido.total, 0), 'FM999G999G990D00')
      || '. A venda saiu do faturamento. O pedido continua vinculado a esta nota — '
      || 'reemita a NF ou cancele a venda.',
    'carboze_order',
    v_pedido.id::text
  );

  return NEW;
exception when others then
  -- NUNCA derrubar o sync do Bling por causa de um aviso. A bridge trata
  -- exceção como `totalFailed++` e a NOTA inteira se perderia — trocaríamos
  -- um aviso que falta por um dado que some.
  return NEW;
end $$;

comment on function public.carbo_avisar_nf_invalida is
  'AFTER UPDATE em bling_nfe: quando a situação MUDA para cancelada/denegada/rejeitada/bloqueada e há pedido vinculado, notifica quem vendeu. Só na transição, para não reavisar a cada sync.';

drop trigger if exists trg_carbo_avisar_nf_invalida on public.bling_nfe;
create trigger trg_carbo_avisar_nf_invalida
  after update of situacao on public.bling_nfe
  for each row
  when (OLD.situacao is distinct from NEW.situacao)
  execute function public.carbo_avisar_nf_invalida();

-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) NFs hoje inválidas E ainda vinculadas a um pedido. Estas são as que já
--     existem — o trigger só pega as PRÓXIMAS. Se aparecer alguma aqui, vale
--     conferir uma a uma antes de fechar o mês.
select n.numero, n.situacao, o.order_number, o.customer_name, o.total,
       o.status, o.fulfillment_stage
from public.bling_nfe n
join public.carboze_orders o on o.bling_nf_id = n.bling_id
where public.carbo_nf_invalida(n.situacao)
order by o.total desc;

-- (b) Pedidos cancelados no Rastreio (fulfillment_stage) que NÃO estão
--     cancelados no status — são os que continuam somando no faturamento.
--     Este é o bug que o front acabou de corrigir; aqui é o passivo.
select order_number, customer_name, total, status, fulfillment_stage,
       coalesce(sale_date, created_at::date) as data
from public.carboze_orders
-- `is distinct from`, não coalesce: `status` é o enum order_status e
-- comparar com '' é erro de tipo. O `is distinct from` já trata o nulo.
where fulfillment_stage = 'cancelado'
  and status is distinct from 'cancelled'
order by total desc;
