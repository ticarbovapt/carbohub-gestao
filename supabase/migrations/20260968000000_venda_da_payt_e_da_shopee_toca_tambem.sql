-- ═══════════════════════════════════════════════════════════════════════════
-- Venda da PayT e da Shopee também toca o sino
--
-- ── O que estava fora ────────────────────────────────────────────────────
--
-- O gatilho abre com uma lista de três:
--
--     if NEW.platform not in ('mercadolivre', 'amazon', 'nuvemshop') then
--       return NEW;
--     end if;
--
-- A Shopee entrou como canal em 2026 e a PayT em 28/08 — nenhuma das duas foi
-- acrescentada. Venda delas não toca som, não mostra toast e não aparece no
-- sininho de ninguém. Não dá erro: simplesmente não acontece.
--
-- ⚠️ E o painel MOSTRA a venda, o que torna o silêncio mais confuso ainda: o
-- número sobe e ninguém foi avisado. Quem confia no sino para saber que vendeu
-- passa a ter uma cobertura parcial sem saber disso.
--
-- ── ⚠️ A ARMADILHA que faz metade da correção ser pior que nenhuma ──────
--
-- Logo abaixo daquela lista existem DOIS `case` **sem `ELSE`**:
--
--     plat_label := case NEW.platform
--       when 'mercadolivre' then 'Mercado Livre'
--       when 'amazon'       then 'Amazon'
--       when 'nuvemshop'    then 'Nuvemshop' end;
--
-- Acrescentar 'payt' e 'shopee' SÓ na lista de cima faz `plat_label` e
-- `plat_abbr` virarem NULL para elas. E em Postgres concatenação com NULL é
-- NULL: o título e o corpo inteiros da notificação viram NULL, e cada pessoa do
-- time recebe uma linha VAZIA no sininho.
--
-- Ou seja: a correção incompleta é PIOR que o defeito — silêncio é discreto,
-- notificação vazia treina o time a fechar o sino sem ler, e o CLAUDE.md
-- registra que é justamente isso que faz nenhum aviso funcionar depois.
--
-- Os dois `case` ganham `ELSE` agora, com `initcap(platform)` como reserva:
-- canal novo passa a chegar com o nome cru em vez de derrubar a mensagem.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o que está rodando, e quanto ficou sem aviso                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⚠️ A definição VIVA. Pergunte ao banco, não ao arquivo.
select pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure) as definicao_hoje;

-- (0.b) ⭐ Quantas vendas destes dois canais não avisaram ninguém, nos 90 dias.
select platform, count(*) as vendas, sum(total) as faturamento,
       min(ordered_at)::date as de, max(ordered_at)::date as ate
from public.ecommerce_orders
where platform in ('shopee', 'payt')
  and public.ecommerce_status_e_venda(status)
  and ordered_at > now() - interval '90 days'
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os cinco canais, e o CASE com ELSE                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A função é reescrita INTEIRA, com todas as guardas que já existiam:
-- lista branca de status, janela de 12 h, e o "só na TRANSIÇÃO para pago" no
-- UPDATE. Nenhuma delas é decoração — o CLAUDE.md explica cada uma.

create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare plat_label text; plat_abbr text;
begin
  -- ⭐ Cinco canais. Shopee e PayT entraram em 31/08/2026; antes a venda delas
  --    aparecia no painel e não avisava ninguém.
  if NEW.platform not in ('mercadolivre', 'amazon', 'nuvemshop', 'shopee', 'payt') then
    return NEW;
  end if;

  -- Lista BRANCA de status: desconhecido NÃO é venda. Mesma função do ensaio
  -- de estoque e do resumo mensal.
  if not public.ecommerce_status_e_venda(NEW.status) then return NEW; end if;

  -- Guarda de 12 h: sync que puxa histórico antigo não vira tempestade de
  -- notificação sobre venda de meses atrás.
  -- ⚠️ Esta janela também existe do lado do navegador, no
  -- useEcommerceNotifications. Mudou aqui, muda lá.
  if NEW.ordered_at < now() - interval '12 hours' then return NEW; end if;

  -- No UPDATE, só na TRANSIÇÃO para pago. Sem isto, qualquer alteração de um
  -- pedido já pago (frete, endereço, o próprio sync reescrevendo a linha)
  -- tocaria o alarme de novo — e o time aprenderia a ignorar o sininho.
  if TG_OP = 'UPDATE' and public.ecommerce_status_e_venda(OLD.status) then
    return NEW;
  end if;

  -- ⚠️ ELSE OBRIGATÓRIO. Sem ele, canal fora da lista dá NULL, e concatenação
  -- com NULL em Postgres é NULL: a notificação inteira chegaria VAZIA a cada
  -- pessoa do time. `initcap` é a reserva — nome cru é feio, notificação vazia
  -- é pior.
  plat_label := case NEW.platform
    when 'mercadolivre' then 'Mercado Livre'
    when 'amazon'       then 'Amazon'
    when 'nuvemshop'    then 'Nuvemshop'
    when 'shopee'       then 'Shopee'
    when 'payt'         then 'PayT'
    else initcap(NEW.platform) end;
  plat_abbr := case NEW.platform
    when 'mercadolivre' then 'ML'
    when 'amazon'       then 'AMZ'
    when 'nuvemshop'    then 'NS'
    when 'shopee'       then 'SHP'
    when 'payt'         then 'PAYT'
    else upper(left(NEW.platform, 4)) end;

  -- Vai para todo o time interno; portais de lojista/licenciado excluídos por
  -- `carbo_interface_e_interna`.
  perform public.notify_time_interno(
    'ecommerce_sale',
    '🛒 Nova venda · ' || plat_abbr,
    plat_label
      || ' · ' || to_char(coalesce(NEW.total, 0), 'FML999G999G990D00')
      || ' · ' || coalesce(NEW.quantity, 0) || ' un.'
      || coalesce(' · ' || nullif(NEW.product_name, ''), ''),
    'ecommerce_order', NEW.id);
  return NEW;

-- ⚠️ ESTE HANDLER JÁ EXISTIA em produção e quase foi perdido nesta reescrita.
--
-- Sem ele, um erro dentro de `notify_time_interno` ABORTA O INSERT DO PEDIDO: a
-- venda não entraria em `ecommerce_orders` porque a notificação falhou. Trocar
-- uma venda perdida por um aviso perdido é o pior negócio possível — a venda é
-- o dado, o aviso é conveniência.
--
-- ⚠️ Mas engolir erro calado é a doença que este repo persegue. Por isso o
-- `raise warning`: o pedido entra do mesmo jeito, e a falha passa a existir no
-- log do Postgres em vez de sumir.
exception when others then
  raise warning '[venda_notify] aviso falhou para % %: %',
    NEW.platform, NEW.order_id, sqlerrm;
  return NEW;
end $$;

comment on function public.trg_ecommerce_sale_notify is
  'Avisa o time interno de venda nova no e-commerce. ⚠️ Os dois CASE têm ELSE de propósito: sem ele, canal fora da lista faz plat_label virar NULL, e concatenação com NULL é NULL — a notificação chegaria VAZIA para cada pessoa do time, que é pior que não avisar. Cinco canais desde 31/08/2026 (Shopee e PayT entraram).';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os cinco canais estão na lista, e o ELSE existe nos dois CASE.
select
  pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure) like '%''shopee'', ''payt''%' as tem_os_cinco,
  (length(pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure))
   - length(replace(pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure), 'else ', ''))) / 5
                                                                                                       as quantos_else;

-- (b) O gatilho continua montado na tabela.
select t.tgname, c.relname, t.tgenabled
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'ecommerce_orders' and not t.tgisinternal
order by t.tgname;

-- (c) ⚠️ NÃO dispara retroativamente: a guarda de 12 h e o "só na transição"
--     cuidam disso. Esta consulta mostra o que TERIA avisado hoje — serve para
--     estimar o volume antes de a próxima venda chegar.
select platform, count(*) as avisos_no_dia
from public.ecommerce_orders
where public.ecommerce_status_e_venda(status)
  and ordered_at > now() - interval '12 hours'
group by 1 order by 2 desc;
