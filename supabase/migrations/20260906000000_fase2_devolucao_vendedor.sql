-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 — o caminho de volta (banco)
--
-- Hoje a transferência anda numa direção só: `ops_transfer_register` sai
-- SEMPRE do HUB-RN. Vendedor que devolve produto não vendido, ou que passa
-- produto para outro vendedor, não tem como registrar — o saldo fica errado
-- nos dois lados até alguém corrigir na mão.
--
-- ⚠️ RODE EM BLOCOS. E leia o BLOCO 1 antes de rodar: ele DERRUBA a função
-- atual antes de recriar, e há uma janela de segundos em que envio nenhum
-- funciona. Faça fora do horário de expedição.
--
-- ── O risco que ESTE arquivo não resolve sozinho ──────────────────────────
--
-- Abrir a origem é a parte fácil. O problema é a CONFIRMAÇÃO: todas as listas
-- de trânsito do sistema filtram por `to_hub`. Uma devolução para Natal sairia
-- da caixa do vendedor imediatamente e não apareceria em tela nenhuma para
-- alguém confirmar a chegada — ficaria presa em `approved` para sempre, com o
-- estoque debitado do vendedor e NUNCA creditado em Natal. Perda silenciosa.
--
-- Por isso a Fase 2 tem uma parte de front obrigatória (fila de confirmação
-- por `from_hub`, no Ops, e "saindo da minha caixa" nos seis apps). Rodar só
-- este SQL e parar aí é pior do que não ter feito nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — origem parametrizada                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ DROP antes do CREATE, obrigatoriamente.
--
-- Acrescentar um parâmetro cria uma função NOVA no Postgres (sobrecarga), não
-- substitui a antiga. Ficariam duas `ops_transfer_register`, e o PostgREST
-- passa a recusar as chamadas por ambiguidade (PGRST203) quando o payload
-- casa com as duas. O GRANT também é por assinatura e precisa ser regravado.
--
-- O DEFAULT 'HUB-RN' mantém os dois chamadores atuais funcionando sem
-- alteração: `useRegisterEnvio` e `useEnviarParaVendedor` usam parâmetros
-- nomeados e simplesmente não mandam o novo.

drop function if exists public.ops_transfer_register(uuid, text, text, numeric, text, uuid);

create or replace function public.ops_transfer_register(
  p_product_id uuid,
  p_product_code text,
  p_to_code text,
  p_qty numeric,
  p_notes text,
  p_user uuid,
  p_from_code text default 'HUB-RN'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  from_id uuid; to_id uuid; cur numeric; tid uuid;
  from_nome text; to_nome text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  -- ⚠️ Origem e destino iguais: débito e crédito na mesma caixa. O saldo não
  -- muda, mas nascem dois movimentos e uma linha eterna na fila de trânsito —
  -- alguém passaria o dia procurando o que confirmar.
  if p_from_code = p_to_code then
    raise exception 'Origem e destino são o mesmo armazém.' using errcode = 'check_violation';
  end if;

  select id, name into from_id, from_nome from public.warehouses where code = p_from_code limit 1;
  select id, name into to_id,   to_nome   from public.warehouses where code = p_to_code   limit 1;
  if from_id is null then raise exception 'Origem não encontrada (%).', p_from_code; end if;
  if to_id   is null then raise exception 'Destino não encontrado (%).', p_to_code;   end if;

  -- Trava a linha da ORIGEM e confere saldo (anti-concorrência).
  select quantity into cur from public.warehouse_stock
   where warehouse_id = from_id and product_id = p_product_id
   for update;
  cur := coalesce(cur, 0);
  -- ⚠️ Mensagem com o nome REAL da origem. Antes dizia "Saldo insuficiente no
  -- Hub Natal" sempre — numa devolução isso mandaria o vendedor conferir o
  -- galpão errado.
  if p_qty > cur then
    raise exception 'Saldo insuficiente em % (disponível: %).', from_nome, cur;
  end if;

  update public.warehouse_stock
     set quantity = quantity - p_qty, updated_at = now()
   where warehouse_id = from_id and product_id = p_product_id;

  insert into public.stock_transfers
    (product_id, product_code, from_hub, to_hub, quantity, status, pre_debited,
     notes, approved_by, approved_at)
  values
    (p_product_id, p_product_code, from_id, to_id, p_qty, 'approved', true,
     p_notes, p_user, now())
  returning id into tid;

  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
  values
    (p_product_id, from_id, 'saida', p_qty, 'transferencia', tid,
     format('[%s → %s] envio', from_nome, to_nome), p_user);

  return tid;
end $$;

comment on function public.ops_transfer_register is
  'Registra envio entre armazéns: debita a origem (travando a linha), cria a transferência em trânsito e grava o movimento. Origem parametrizada com default HUB-RN — serve para abastecer vendedor, para devolução vendedor→Natal e entre caixas.';

grant execute on function public.ops_transfer_register(uuid, text, text, numeric, text, uuid, text)
  to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o estorno para de mentir no histórico                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A mecânica já era genérica: o crédito vai para `from_hub`, lido da própria
-- linha. Só o TEXTO do movimento era o literal '[HUB-RN] estorno de envio'.
--
-- Com devolução, estornar uma transferência vendedor→Natal gravaria
-- "[HUB-RN] estorno" num movimento de ENTRADA na caixa do vendedor. O saldo
-- fica certo e o extrato mente — que é o modo de erro mais caro de achar,
-- porque ninguém desconfia de um número correto.

create or replace function public.ops_transfer_estorno(p_transfer_id uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid; v_prod uuid; v_qty numeric; v_pre boolean; v_nome text;
begin
  update public.stock_transfers
     set status = 'cancelled'
   where id = p_transfer_id and status = 'approved'
  returning from_hub, product_id, quantity, pre_debited
       into v_from, v_prod, v_qty, v_pre;

  if not found then
    raise exception 'Envio já confirmado ou cancelado.';
  end if;

  if v_pre then
    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (v_from, v_prod, v_qty)
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();

    select name into v_nome from public.warehouses where id = v_from;

    insert into public.stock_movements
      (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
    values
      (v_prod, v_from, 'entrada', v_qty, 'transferencia', p_transfer_id,
       format('[%s] estorno de envio', coalesce(v_nome, '?')), p_user);
  end if;
end $$;

comment on function public.ops_transfer_estorno is
  'Cancela um envio em trânsito e devolve à ORIGEM real (from_hub), com o nome dela no histórico. Antes o texto era o literal [HUB-RN] — numa devolução gravaria "estorno HUB-RN" num movimento de entrada na caixa do vendedor.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — índices que passam a importar                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `stock_transfers` só tem índice em product_code, status e product_id. Todas
-- as filas de trânsito filtram por `to_hub`/`from_hub` + status — e com uma
-- caixa por vendedor a tabela cresce numa ordem diferente da de antes.

create index if not exists idx_stock_transfers_to_status
  on public.stock_transfers (to_hub, status);
create index if not exists idx_stock_transfers_from_status
  on public.stock_transfers (from_hub, status);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ Tem de vir UMA linha. Duas = a antiga não foi derrubada e o
--     PostgREST vai recusar as chamadas por ambiguidade.
select p.oid::regprocedure as assinatura
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ops_transfer_register';

-- (b) O envio normal (Natal → vendedor) continua funcionando? Confira pela
--     tela do Ops, não por SQL: é o caminho que estava no ar.

-- (c) ⚠️ Devoluções presas. Enquanto a parte de FRONT desta fase não subir,
--     esta consulta é a ÚNICA forma de ver uma devolução aguardando
--     confirmação. Se aparecer linha aqui, o estoque está debitado do
--     vendedor e ainda não creditado no destino.
select t.id, t.created_at, o.name as saiu_de, d.name as vai_para,
       t.product_code, t.quantity, t.status
from public.stock_transfers t
join public.warehouses o on o.id = t.from_hub
join public.warehouses d on d.id = t.to_hub
where t.status = 'approved' and o.kind = 'vendedor'
order by t.created_at desc;
