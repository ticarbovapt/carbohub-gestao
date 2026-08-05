-- ═══════════════════════════════════════════════════════════════════════════
-- Venda online avisa o time INTEIRO, não só quem tem carbo_admin
--
-- Decisão do dono do processo: "todos logados vão ficar recebendo notificações
-- das vendas do online, a ideia é eles verem nosso crescimento".
--
-- Hoje o gatilho chama `notify_admin_users`, que filtra por `carbo_admin` —
-- eram 8 pessoas. Passa a chamar `notify_time_interno`, o mesmo fan-out que o
-- alerta de venda manual (20260835000000) já usa há tempos.
--
-- ⚠️ Por que NÃO é "todo mundo da tabela profiles": o portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`. Sem o filtro de interface
-- interna, o lojista passaria a receber o faturamento da Carbo no sininho
-- dele. `notify_time_interno` já cuida disso — exige pelo menos uma interface
-- carbo_* liberada.
--
-- Nada mais muda: mesma janela de 12h, mesma lista branca de status, mesmo
-- corpo da mensagem. Só a lista de destinatários.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare plat_label text; plat_abbr text;
begin
  if NEW.platform not in ('mercadolivre', 'amazon', 'nuvemshop') then return NEW; end if;

  -- Lista BRANCA: status desconhecido NÃO é venda.
  if not public.ecommerce_status_e_venda(NEW.status) then return NEW; end if;

  -- No UPDATE, só na TRANSIÇÃO para pago. Sem isto, qualquer alteração de um
  -- pedido já pago (frete, endereço, o próprio sync reescrevendo a linha)
  -- tocaria o alarme de novo — e o time aprenderia a ignorar o sininho.
  if TG_OP = 'UPDATE' and public.ecommerce_status_e_venda(OLD.status) then
    return NEW;
  end if;

  -- Guarda de 12h: sync que puxa histórico antigo não vira tempestade de
  -- notificação sobre venda de meses atrás.
  --
  -- ⚠️ Esta janela também existe do lado do navegador, no
  -- useEcommerceNotifications. Mudou aqui, muda lá.
  if NEW.ordered_at < now() - interval '12 hours' then return NEW; end if;

  plat_label := case NEW.platform
    when 'mercadolivre' then 'Mercado Livre'
    when 'amazon'       then 'Amazon'
    when 'nuvemshop'    then 'Nuvemshop' end;
  plat_abbr := case NEW.platform
    when 'mercadolivre' then 'ML'
    when 'amazon'       then 'AMZ'
    when 'nuvemshop'    then 'NS' end;

  -- ⭐ Era notify_admin_users (só carbo_admin). Agora vai para todo o time
  -- interno, portais de lojista/licenciado excluídos.
  perform public.notify_time_interno(
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
  'Avisa venda de e-commerce PAGA para todo o time interno. No INSERT, o que já nasce pago; no UPDATE, a transição pending→paid (PIX/boleto).';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Quem passa a receber, e quem recebia antes.
select count(*) filter (
         where exists (select 1 from unnest(p.allowed_interfaces) x
                       where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                                          'carbo_financas','carbo_mkt','carbo_ti'))
       ) as recebem_agora,
       count(*) filter (
         where 'carbo_admin' = any (select lower(x) from unnest(p.allowed_interfaces) x)
       ) as recebiam_antes
from public.profiles p
where p.allowed_interfaces is not null;

-- (b) Ninguém de portal na lista (tem que vir zero).
select count(*) as lojistas_indevidos
from public.profiles p
where p.allowed_interfaces is not null
  and exists (select 1 from unnest(p.allowed_interfaces) x
              where lower(x) in ('carbo_admin','carbo_crm','carbo_ops','carbo_ops_app',
                                 'carbo_financas','carbo_mkt','carbo_ti'))
  and not exists (select 1 from unnest(p.allowed_interfaces) x
                  where lower(x) like 'carbo_%');
