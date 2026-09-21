-- ═══════════════════════════════════════════════════════════════════════════
-- Mercado Livre Full vira canal PRÓPRIO — a fundação (Fase 4A)
--
-- São duas contas de ML: a que já está integrada (despacho nosso, da LogHouse)
-- e a nova, no Full — onde a mercadoria já está no galpão do Mercado Livre.
-- Elas precisam ser canais SEPARADOS, e não por estética: o que decide é o
-- ESTOQUE (ver o BLOCO 3).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE `platform` PRÓPRIA, E NÃO UMA COLUNA DE CONTA
--
-- A alternativa era `ecommerce_orders` ganhar `conta_id` e todas as telas
-- agruparem por `(platform, conta)`. É mais correto em abstrato — "os dois são
-- Mercado Livre" continuaria explícito para o sistema.
--
-- Perdeu por custo e por risco: TODAS as telas de e-commerce são chaveadas por
-- `platform` (`useDashEcommerce(platform, …)`, `PLATFORMS` no
-- `EcommerceVendas.tsx`, `useMetaEcommerce`, o mapa de taxas, o de rótulos).
-- Coluna de conta obrigaria a mexer em todas elas de uma vez, e o pedido é
-- justamente ver os dois lado a lado no comparativo — o que `platform` própria
-- entrega sem tocar em nenhuma lógica de agregação.
--
-- ⚠️ O que se PERDE, e fica registrado: o sistema deixa de saber sozinho que
-- os dois são o mesmo marketplace. Somar "tudo que é Mercado Livre" passa a
-- exigir listar as duas chaves. Se um dia houver uma terceira conta, este é o
-- momento de reconsiderar a coluna.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O QUE ESTA MIGRAÇÃO NÃO FAZ
--
-- Ela é a FUNDAÇÃO: abre o canal no banco. Não sincroniza nada — enquanto o
-- OAuth da segunda conta e o `ecommerce-sync` não souberem das duas (Fase 4B),
-- o canal existe e fica VAZIO. Isso é proposital: canal aberto e vazio é
-- visível; canal que chega com dado antes das travas de estoque é o erro de
-- 31/08.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CHECK de `platform`                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Valor novo num CHECK é INSERT FALHANDO CALADO se esquecido. Já aconteceu
-- neste repo com `'online'` no CHECK de `carboze_orders.segmento`: a ponte
-- gravava, o Postgres recusava, e o pedido simplesmente não existia.
--
-- ⚠️ Pergunte ao BANCO qual é o CHECK atual, não à migração que o criou — a
-- lição da conciliação do Melhor Envio. Por isso o bloco derruba pelo nome
-- descoberto em `pg_constraint`, e não por um nome presumido.

do $$
declare v_nome text;
begin
  select con.conname into v_nome
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'ecommerce_orders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%platform%'
  limit 1;

  if v_nome is not null then
    execute format('alter table public.ecommerce_orders drop constraint %I', v_nome);
    raise notice 'CHECK antigo removido: %', v_nome;
  else
    raise notice 'Nenhum CHECK de platform encontrado — seguindo para criar.';
  end if;
end $$;

alter table public.ecommerce_orders
  add constraint ecommerce_orders_platform_check
  check (platform in ('mercadolivre', 'mercadolivre_full', 'amazon',
                      'tiktok', 'shopee', 'nuvemshop', 'payt'));

comment on column public.ecommerce_orders.platform is
  'Canal da venda. mercadolivre = conta com despacho NOSSO (LogHouse); mercadolivre_full = conta no Fulfillment do ML, onde a mercadoria ja esta no galpao deles. Sao chaves separadas de proposito: o que as distingue e o ESTOQUE (o Full nao deduz da LogHouse — quem deduz e a remessa de reposicao).';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o sininho aprende o canal                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A lista do gatilho é BRANCA: canal fora dela não avisa ninguém, sem erro.
-- Foi o que aconteceu com Shopee e PayT até 31/08/2026 — a venda aparecia no
-- painel e o sininho ficava mudo.
--
-- Função reescrita INTEIRA, com todas as guardas que já existiam (lista branca
-- de status, janela de 12 h, "só na transição para pago" no UPDATE, e o
-- handler de exceção que impede o aviso de derrubar o INSERT do pedido).
-- Nenhuma é decoração.

create or replace function public.trg_ecommerce_sale_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare plat_label text; plat_abbr text;
begin
  -- ⭐ SEIS canais. mercadolivre_full entrou em 21/09/2026.
  if NEW.platform not in ('mercadolivre', 'mercadolivre_full', 'amazon',
                          'nuvemshop', 'shopee', 'payt') then
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
  --
  -- ⚠️ Os rótulos das DUAS contas de ML dizem qual é qual. "Mercado Livre" sem
  -- sobrenome nos dois faria o aviso não distinguir a venda que tira da
  -- LogHouse da que não tira — e é essa a diferença que importa para quem
  -- separa mercadoria.
  plat_label := case NEW.platform
    when 'mercadolivre'      then 'ML LogHouse'
    when 'mercadolivre_full' then 'ML Full'
    when 'amazon'            then 'Amazon'
    when 'nuvemshop'         then 'Nuvemshop'
    when 'shopee'            then 'Shopee'
    when 'payt'              then 'PayT'
    else initcap(NEW.platform) end;
  plat_abbr := case NEW.platform
    when 'mercadolivre'      then 'ML-LH'
    when 'mercadolivre_full' then 'ML-FULL'
    when 'amazon'            then 'AMZ'
    when 'nuvemshop'         then 'NS'
    when 'shopee'            then 'SHP'
    when 'payt'              then 'PAYT'
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

-- ⚠️ ESTE HANDLER JÁ EXISTIA em produção. Sem ele, um erro dentro de
-- `notify_time_interno` ABORTA O INSERT DO PEDIDO: a venda não entraria em
-- `ecommerce_orders` porque a notificação falhou. Trocar uma venda perdida por
-- um aviso perdido é o pior negócio possível.
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
  'Avisa o time interno de venda nova no e-commerce. ⚠️ Os dois CASE têm ELSE de propósito: sem ele, canal fora da lista faz plat_label virar NULL, e concatenação com NULL é NULL — a notificação chegaria VAZIA. SEIS canais desde 21/09/2026 (mercadolivre_full entrou). Os rótulos separam ML LogHouse de ML Full porque a diferença entre eles é de onde a mercadoria sai.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — ⚠️ O ESTOQUE: o Full NÃO deduz, e é por isso que ele é       ║
-- ║            canal separado                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Esta é a razão de tudo acima.
--
-- No ML LogHouse a venda tira da LogHouse — o despacho é nosso, confirmado
-- pelo dono do processo em 28/08/2026, e por isso `mercadolivre` está ativo em
-- `carbo_canal_estoque`.
--
-- No Full a mercadoria JÁ ESTÁ no galpão do Mercado Livre. A venda não tira
-- nada daqui: quem tira é a REMESSA de reposição, quando a gente manda o lote
-- para lá.
--
-- ⚠️ Se as duas contas dividissem a chave `mercadolivre`, a dedução baixaria na
-- venda do Full E de novo na remessa — a mesma saída contada duas vezes. É
-- exatamente o erro de 31/08/2026, que custou uma contagem física inteira.
--
-- Por isso a linha nasce com `ativo = false` E `deduz_a_partir_de` nulo, que
-- são DUAS travas independentes: o CLAUDE.md registra que marco zero nulo NÃO
-- deduz nem com `ativo = true`. Redundância aqui é barata; a falta dela custou
-- 1.664 unidades sobre um saldo de 345.

insert into public.carbo_canal_estoque (platform, warehouse_code, ativo, deduz_a_partir_de)
select 'mercadolivre_full', 'HUB-SP', false, null
where not exists (
  select 1 from public.carbo_canal_estoque where platform = 'mercadolivre_full'
);

comment on table public.carbo_canal_estoque is
  'Por canal: de qual galpao a venda deduz, e se deduz. ⚠️ mercadolivre_full nasce ativo=false e SEM marco zero de proposito: no Full a mercadoria ja esta com o Mercado Livre e a venda NAO tira nada da LogHouse — quem tira e a REMESSA de reposicao. Ligar isso conta a mesma saida duas vezes.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O CHECK aceita o canal novo? Pergunte ao BANCO, não à migração.
--     Tem de conter 'mercadolivre_full'.
select con.conname, pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class c on c.oid = con.conrelid
where c.relname = 'ecommerce_orders' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%platform%';

-- (b) O gatilho conhece os SEIS e mantém os dois ELSE? Esperado: true, 2.
select
  pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure)
    ilike '%mercadolivre_full%'                                    as conhece_o_full,
  (length(pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure))
   - length(replace(pg_get_functiondef('public.trg_ecommerce_sale_notify()'::regprocedure), 'else initcap', '')))
   / length('else initcap')                                        as else_do_label;

-- (c) ⚠️ A trava do estoque. As DUAS colunas têm de estar como abaixo:
--     mercadolivre      ativo = true   (despacho nosso, deduz)
--     mercadolivre_full ativo = false  e deduz_a_partir_de NULO
select platform, warehouse_code, ativo, deduz_a_partir_de
from public.carbo_canal_estoque
where platform like 'mercadolivre%'
order by platform;

-- (d) O canal aceita gravação? Insere e apaga uma linha de teste.
--     Esperado: 'ok'. Se falhar com violação de CHECK, o BLOCO 1 não pegou.
do $$
begin
  insert into public.ecommerce_orders
    (platform, order_id, quantity, units_real, unit_price, total, status, ordered_at)
  values ('mercadolivre_full', '__teste_do_check__', 1, 1, 0, 0, 'pending', now());
  delete from public.ecommerce_orders
   where platform = 'mercadolivre_full' and order_id = '__teste_do_check__';
  raise notice 'ok: o canal mercadolivre_full aceita gravacao';
end $$;

-- (e) O canal nasce VAZIO, e isso é o esperado até a Fase 4B (o sync das duas
--     contas). Tem de vir 0 — se vier diferente, alguém já está gravando ali.
select count(*) as linhas_do_full from public.ecommerce_orders
where platform = 'mercadolivre_full';
