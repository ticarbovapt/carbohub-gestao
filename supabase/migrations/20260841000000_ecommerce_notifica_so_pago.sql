-- ═══════════════════════════════════════════════════════════════════════════
-- E-commerce: só avisa venda que foi PAGA
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- O gatilho de 20260713100000 usava LISTA NEGRA:
--
--     IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
--
-- Ou seja: tudo que não é 'cancelled' vira "🛒 Nova venda" no sininho de todo
-- admin, com valor e tudo. Inclusive 'pending'.
--
-- Na Nuvemshop, quem escolhe PIX gera o pedido ANTES de pagar. O pedido nasce
-- `payment_status = pending` — a classificação está correta e não consome
-- estoque —, mas o alarme toca igual. Carrinho abandonado vira "venda" na
-- cabeça do time, e o valor anunciado nunca existiu.
--
-- ── A armadilha do conserto ───────────────────────────────────────────────
--
-- Exigir 'paid' no INSERT e parar por aí seria PIOR. PIX e boleto — a maior
-- parte das vendas — NASCEM pending e só viram pagos minutos ou dias depois,
-- por UPDATE. Sem gatilho no UPDATE, essas vendas nunca mais avisariam
-- ninguém: trocaríamos alarme falso por silêncio. Alarme falso alguém
-- reclama; silêncio ninguém percebe.
--
-- Por isso são DOIS gatilhos: o INSERT avisa o que já nasce pago (cartão), e o
-- UPDATE avisa na hora em que o pagamento é confirmado.
--
-- ── Lista BRANCA, não negra ───────────────────────────────────────────────
--
-- A regra do que é venda vive numa função só, com lista branca. Status novo de
-- plataforma nova NÃO notifica até alguém decidir que ele é venda — o inverso
-- da lista negra, onde o desconhecido vira alarme automático.
-- ═══════════════════════════════════════════════════════════════════════════

-- Vocabulário conferido contra os normalizadores das quatro plataformas
-- (_shared/nuvemshop.ts, ecommerce-webhook/index.ts):
--   Nuvemshop → cancelled | delivered | shipped | paid | pending
--   Amazon    → 'unshipped' é traduzido para 'paid'
--   Shopee    → UNPAID/READY_TO_SHIP → pending; PROCESSED → shipped
--   ML        → normalizeMLStatus
create or replace function public.ecommerce_status_e_venda(p_status text)
returns boolean language sql immutable set search_path = public as $$
  select lower(coalesce(p_status, '')) in ('paid', 'shipped', 'delivered')
$$;

comment on function public.ecommerce_status_e_venda is
  'Lista BRANCA: o que conta como venda paga no e-commerce. Status desconhecido NÃO é venda.';


create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare plat_label text; plat_abbr text;
begin
  if NEW.platform not in ('mercadolivre', 'amazon', 'nuvemshop') then return NEW; end if;

  -- ⭐ Lista branca. Antes era `if NEW.status = 'cancelled' then return`.
  if not public.ecommerce_status_e_venda(NEW.status) then return NEW; end if;

  -- No UPDATE, só avisa na TRANSIÇÃO para pago. Sem isto, qualquer alteração
  -- de um pedido já pago (mudança de frete, de endereço, o próprio sync
  -- reescrevendo a linha) tocaria o alarme de novo — e o time aprenderia a
  -- ignorar o sininho, que é o pior desfecho possível.
  if TG_OP = 'UPDATE' and public.ecommerce_status_e_venda(OLD.status) then
    return NEW;
  end if;

  -- Guarda de 12h: sync que puxa histórico antigo não vira tempestade de
  -- notificação sobre venda de meses atrás.
  if NEW.ordered_at < now() - interval '12 hours' then return NEW; end if;

  plat_label := case NEW.platform
    when 'mercadolivre' then 'Mercado Livre'
    when 'amazon'       then 'Amazon'
    when 'nuvemshop'    then 'Nuvemshop' end;
  plat_abbr := case NEW.platform
    when 'mercadolivre' then 'ML'
    when 'amazon'       then 'AMZ'
    when 'nuvemshop'    then 'NS' end;

  perform public.notify_admin_users(
    'ecommerce_sale',
    '🛒 Nova venda · ' || plat_abbr,
    plat_label
      || ' · ' || to_char(coalesce(NEW.total, 0), 'FML999G999G990D00')
      || ' · ' || coalesce(NEW.quantity, 0) || ' un.'
      || coalesce(' · ' || nullif(NEW.product_name, ''), ''),
    'ecommerce_order', NEW.id);
  return NEW;
exception when others then
  -- Notificação nunca derruba a gravação do pedido.
  return NEW;
end $$;

comment on function public.trg_ecommerce_sale_notify is
  'Avisa venda de e-commerce PAGA. No INSERT, o que já nasce pago; no UPDATE, a transição pending→paid (PIX/boleto).';


-- ⚠️ `ecommerce_orders` é escrita pelo webhook e pelo cron de 15 min. DROP de
-- gatilho pede AccessExclusiveLock — com lock_timeout, falha limpa em vez de
-- deadlock. Se der timeout, rode este bloco de novo.
set lock_timeout = '5s';

-- O de INSERT já existe e só troca de função (o CREATE OR REPLACE acima já
-- valeu). Recriado só para garantir que aponta para a função certa.
drop trigger if exists trg_ecommerce_sale_notify on public.ecommerce_orders;
create trigger trg_ecommerce_sale_notify
  after insert on public.ecommerce_orders
  for each row execute function public.trg_ecommerce_sale_notify();

reset lock_timeout;


-- O de UPDATE é novo: é ele que faz a venda por PIX avisar quando é paga.
set lock_timeout = '5s';
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_ecommerce_sale_notify_upd'
      and tgrelid = 'public.ecommerce_orders'::regclass
      and not tgisinternal
  ) then
    create trigger trg_ecommerce_sale_notify_upd
      after update of status on public.ecommerce_orders
      for each row
      when (OLD.status is distinct from NEW.status)
      execute function public.trg_ecommerce_sale_notify();
  end if;
end $$;
reset lock_timeout;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O TAMANHO do problema: quantos pedidos por status, e quanto de valor.
--     O que estiver em 'pending' foi anunciado como venda sem ter sido pago.
select platform, status, count(*) as pedidos, sum(total) as valor
from public.ecommerce_orders
where ordered_at > now() - interval '90 days'
group by 1, 2
order by 1, 4 desc nulls last;

-- (b) Carrinho abandonado de verdade: pedido que nasceu pending e nunca saiu
--     de lá. Cada um destes gerou uma notificação falsa de venda.
select platform, count(*) as nunca_pagos, sum(total) as valor_fantasma
from public.ecommerce_orders
where status = 'pending'
  and ordered_at < now() - interval '3 days'
group by 1 order by 3 desc nulls last;

-- (c) Os dois gatilhos de pé?
select tgname from pg_trigger
where tgname in ('trg_ecommerce_sale_notify', 'trg_ecommerce_sale_notify_upd')
  and not tgisinternal
order by 1;

-- (d) ⚠️ ONDE MAIS o 'pending' pode estar sendo contado como venda. Esta
--     consulta não conserta nada — mostra o tamanho do estrago se alguma tela
--     somar `ecommerce_orders` sem filtrar status.
select date_trunc('month', ordered_at)::date as mes,
       sum(total) filter (where public.ecommerce_status_e_venda(status)) as venda_real,
       sum(total) filter (where status = 'pending')                       as ainda_nao_pago,
       sum(total) filter (where status = 'cancelled')                     as cancelado
from public.ecommerce_orders
where ordered_at > now() - interval '6 months'
group by 1 order by 1 desc;
