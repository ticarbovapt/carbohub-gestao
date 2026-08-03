-- ═══════════════════════════════════════════════════════════════════════════
-- Alerta de venda: as vendas dos vendedores passam a avisar o time
--
-- Hoje só a venda ONLINE avisa (trg_ecommerce_sale_notify, de 20260713100000).
-- Venda cadastrada por vendedor no /vender não avisa ninguém — o que é
-- justamente a maior parte do faturamento e a que o time comemora.
--
-- ── Decisões, todas do dono do processo ──────────────────────────────────
--
-- SEM VALOR. O alerta existe para dar ritmo e reconhecimento, não para
-- espalhar faturamento. Quem precisa do número tem as telas de dinheiro.
--
-- SEM CANAL. A primeira versão tinha uma linha com B2B / Revenda / On-line,
-- mas o `segmento` só é preenchido quando o CNPJ já é PDV conhecido ou tem
-- histórico unânime — cliente novo fica nulo. Era 7 de 34 vendas manuais sem
-- canal, e a notificação diria "Venda direta" sem ser verdade. Melhor não
-- dizer do que dizer errado.
--
-- PARA TODO MUNDO. O alerta do e-commerce vai só para quem tem `carbo_admin`;
-- este vai para todo usuário interno.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fan-out para o time INTERNO. Diferente do `notify_admin_users`, que filtra
-- por `carbo_admin`.
--
-- ⚠️ O filtro exclui quem NÃO tem interface interna nenhuma: o portal de lojas
-- e o de licenciados usam a mesma tabela `profiles`, e sem esta guarda o
-- lojista receberia aviso das vendas da Carbo.
create or replace function public.notify_time_interno(
  p_type text, p_title text, p_body text, p_ref_type text, p_ref_id uuid, p_exceto uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id, p_type, p_title, p_body, p_ref_type, p_ref_id, false
  from public.profiles p
  where p.allowed_interfaces is not null
    and exists (
      select 1 from unnest(p.allowed_interfaces) x
      where lower(x) in ('carbo_admin','carbo_sales','carbo_crm','carbo_ops',
                         'carbo_financas','carbo_mkt','carbo_ti')
    )
    and (p_exceto is null or p.id is distinct from p_exceto);
end $$;

comment on function public.notify_time_interno is
  'Fan-out de notificação para todo usuário com alguma interface INTERNA liberada. Exclui portal de lojas/licenciados, que compartilham a tabela profiles.';

grant execute on function public.notify_time_interno(text, text, text, text, uuid, uuid) to authenticated;


-- ── O gatilho ────────────────────────────────────────────────────────────
create or replace function public.trg_venda_manual_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  -- Orçamento não é venda. Avisar aqui encheria o sino de proposta que talvez
  -- nunca feche — e quando ela fechar, o aviso vem pela conversão (abaixo).
  if NEW.status = 'quote' then return NEW; end if;
  if NEW.status = 'cancelled' then return NEW; end if;

  -- Pedido nascido no Bling fica de fora: o sync roda de hora em hora e traz
  -- venda já conhecida, às vezes de meses atrás. Seria chuva de notificação
  -- sobre fato velho.
  if coalesce(NEW.order_number, '') like 'BLING-%' then return NEW; end if;

  -- Nome de quem vendeu. `vendedor_name` é o que a venda gravou; o perfil é o
  -- desempate quando só veio o id (e fica atualizado se a pessoa trocar de
  -- nome).
  v_nome := nullif(btrim(coalesce(NEW.vendedor_name, '')), '');
  if v_nome is null and NEW.vendedor_id is not null then
    select nullif(btrim(full_name), '') into v_nome from public.profiles where id = NEW.vendedor_id;
  end if;

  perform public.notify_time_interno(
    'ecommerce_sale',   -- reaproveita o ícone/rótulo de "Nova venda" do sininho
    '🎉 Nova venda!',
    'Realizada por: ' || coalesce(v_nome, '—'),
    'carboze_order', NEW.id,
    -- Quem vendeu não precisa ser avisado da própria venda.
    NEW.vendedor_id);
  return NEW;
exception when others then
  -- Notificação nunca derruba a gravação da venda.
  return NEW;
end $$;

comment on function public.trg_venda_manual_notify is
  'Avisa o time interno quando uma venda manual nasce (ou quando um orçamento vira venda). Sem valor e sem canal, por decisão de processo.';

drop trigger if exists trg_venda_manual_notify_ins on public.carboze_orders;
create trigger trg_venda_manual_notify_ins
  after insert on public.carboze_orders
  for each row execute function public.trg_venda_manual_notify();

-- Conversão de orçamento em venda: é o momento em que a venda passa a existir.
-- Sem este gatilho, metade das vendas (as que começam como orçamento) nunca
-- avisaria — o INSERT delas foi barrado logo acima, por serem 'quote'.
--
-- ⚠️ Trigger em carboze_orders pede AccessExclusiveLock e a tabela é escrita
-- pelo cron do Bling. Sem `drop`, e com lock_timeout: falha limpa em 5s em vez
-- de deadlock. Se der timeout, rode este bloco de novo.
set lock_timeout = '5s';
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_venda_manual_notify_upd'
      and tgrelid = 'public.carboze_orders'::regclass
      and not tgisinternal
  ) then
    create trigger trg_venda_manual_notify_upd
      after update of status on public.carboze_orders
      for each row
      when (OLD.status = 'quote' and NEW.status is distinct from 'quote')
      execute function public.trg_venda_manual_notify();
  end if;
end $$;
reset lock_timeout;


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Quantas pessoas receberiam o alerta? Confira se o número bate com o
--     tamanho do time interno — se vier alto demais, há perfil externo com
--     interface interna liberada por engano.
select count(*) as recebem
from public.profiles p
where p.allowed_interfaces is not null
  and exists (
    select 1 from unnest(p.allowed_interfaces) x
    where lower(x) in ('carbo_admin','carbo_sales','carbo_crm','carbo_ops',
                       'carbo_financas','carbo_mkt','carbo_ti')
  );

-- (b) Os dois gatilhos ficaram de pé?
select tgname from pg_trigger
where tgname in ('trg_venda_manual_notify_ins', 'trg_venda_manual_notify_upd')
  and not tgisinternal
order by 1;

-- (c) Prévia do texto, com as vendas manuais reais dos últimos 30 dias.
--     É o que o time teria recebido.
select '🎉 Nova venda!' as titulo,
       'Realizada por: ' || coalesce(nullif(btrim(vendedor_name), ''), '—') as corpo,
       order_number, coalesce(sale_date, created_at::date) as data
from public.carboze_orders
where order_number like 'V%'
  and status not in ('quote', 'cancelled')
  and created_at > now() - interval '30 days'
order by created_at desc
limit 10;
