-- ═══════════════════════════════════════════════════════════════════════════
-- A dedução volta — por canal, com marco zero, e reversível
--
-- ── O que foi medido antes de escrever isto ──────────────────────────────
--
-- 28/08/2026, 90 dias:
--
--   canal          pedidos  com etiqueta NOSSA   unidades CZ100
--   nuvemshop        451         420 (93,1%)          1450
--   mercadolivre     102           0 (0,0%)            390
--   amazon            12           0 (0,0%)             45
--   shopee             3           0 (0,0%)         (sem SKU)
--
-- ⚠️ Os três zeros NÃO provam Full/FBA — provam que ML, Amazon e Shopee não
-- passam pelo Melhor Envio de jeito nenhum (Mercado Envios, logística própria
-- da Amazon, SPX). `0 de 102` é limpo demais para ser comportamento comercial;
-- é um teste que não se aplica ao canal. A pegada da etiqueta mede a NUVEMSHOP,
-- e só ela.
--
-- Por isso esta migração liga UM canal. Os outros três continuam
-- `ativo = false` até existir evidência do mesmo naipe — não por precaução
-- genérica, mas porque para eles não há medição nenhuma.
--
-- ── ⚠️ O MARCO ZERO, que é a parte que não pode faltar ───────────────────
--
-- Sem data de corte, a primeira rodada deduziria os 90 dias de histórico de
-- uma vez: ~1.664 unidades da Nuvemshop, sobre um saldo de 345. O CZ100 iria
-- a -1.319 em segundos, e o relatório seria convincente.
--
-- Pior: 402 dessas unidades JÁ FORAM deduzidas pelo caminho antigo (que rodou
-- até 03/08 13:43 e foi desligado pela 20260834). Deduzi-las de novo é contar
-- duas vezes a mesma saída — e o índice único de `carbo_estoque_consumo` não
-- pega isso, porque aquelas baixas nunca passaram por essa tabela.
--
-- É a mesma lição do `carbo_carrinho_config.inicio_em`: tabela que nasce vazia
-- sobre histórico existente precisa de marco por DATA, senão a enxurrada vem
-- na primeira rodada. O marco nasce em `now()` — daqui pra frente, nada de
-- retroativo.
--
-- ── Por que função em cron, e não trigger ────────────────────────────────
--
-- O trigger `ecommerce_order_sp_stock_trigger` continua existindo e inerte, e
-- fica assim. Trigger dá uma chance por evento: falhou, perdeu. Esta função é
-- idempotente (o índice único decide) e re-executável — rodar duas vezes não
-- deduz duas vezes, e uma rodada que morreu no meio se completa na seguinte.
-- É o mesmo desenho da `carbo_melhorenvio_conciliar()`.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o marco zero, e o estorno tem de existir desde o começo      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_canal_estoque
  add column if not exists deduz_a_partir_de timestamptz;

comment on column public.carbo_canal_estoque.deduz_a_partir_de is
  '⚠️ MARCO ZERO. Só pedido com `ordered_at` DEPOIS desta data é deduzido. Sem ele a primeira rodada baixaria todo o histórico de uma vez (medido: 1.664 unidades da Nuvemshop sobre um saldo de 345) — e parte disso já foi deduzida pelo caminho antigo, que rodou até 03/08/2026. Nulo = nunca deduz, mesmo com ativo=true: o modo seguro é o que não age.';

-- `origem` de stock_movements é texto livre (não há CHECK — conferido em
-- pg_constraint). 'ecommerce' entra como valor novo, ao lado de 'venda'.
-- ⚠️ `origem_id` e `order_id` são UUID e o id do pedido de e-commerce é TEXTO:
-- não cabem. A referência vai em `observacoes`, e a ligação forte fica em
-- `carbo_estoque_consumo.origem_chave` — que é a tabela feita para isso.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a dedução                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_ecommerce_deduzir_estoque(
  p_ensaio boolean default true,
  p_limite integer default 500
)
returns table (
  acao          text,
  platform      text,
  order_id      text,
  produto       text,
  unidades      integer,
  saldo_antes   integer,
  saldo_depois  integer,
  aviso         text
)
language plpgsql security definer set search_path = public as $$
declare
  r          record;
  v_wh       uuid;
  v_saldo    integer;
  v_feitos   integer := 0;
begin
  for r in
    select e.platform,
           e.order_id,
           e.product_id_alvo,
           e.produto_alvo,
           e.ordered_at,
           e.product_sku,
           e.qtd_vendida,
           e.fator,
           e.unidades_a_deduzir::integer as unidades,
           c.warehouse_code
    from public.carbo_estoque_ensaio e
    join public.carbo_canal_estoque c on c.platform = e.platform
    where c.ativo
      and c.deduz_a_partir_de is not null
      and e.ordered_at > c.deduz_a_partir_de
      and e.product_id_alvo is not null
      and e.unidades_a_deduzir > 0
      -- Já contabilizado? O índice único é a trava definitiva, mas filtrar
      -- aqui evita gastar a cota do limite com linhas que não fariam nada.
      and not exists (
        select 1 from public.carbo_estoque_consumo k
        where k.origem_tipo  = 'ecommerce'
          and k.origem_chave = e.platform || ':' || e.order_id
          and k.product_id   = e.product_id_alvo
      )
    order by e.ordered_at
    limit p_limite
  loop
    select w.id into v_wh from public.warehouses w where w.code = r.warehouse_code;
    if v_wh is null then
      acao := 'ERRO'; platform := r.platform; order_id := r.order_id;
      produto := r.produto_alvo; unidades := r.unidades;
      saldo_antes := null; saldo_depois := null;
      aviso := 'galpão ' || r.warehouse_code || ' não existe em warehouses';
      return next; continue;
    end if;

    -- ⚠️ FOR UPDATE antes de ler o saldo. Sem isso duas rodadas simultâneas
    -- leem o mesmo número e as duas escrevem — a mesma falha que a dedução do
    -- estoque do vendedor já pagou.
    select ws.quantity into v_saldo
    from public.warehouse_stock ws
    where ws.warehouse_id = v_wh and ws.product_id = r.product_id_alvo
    for update;
    v_saldo := coalesce(v_saldo, 0);

    acao         := case when p_ensaio then 'ENSAIO' else 'DEDUZIDO' end;
    platform     := r.platform;
    order_id     := r.order_id;
    produto      := r.produto_alvo;
    unidades     := r.unidades;
    saldo_antes  := v_saldo;
    saldo_depois := v_saldo - r.unidades;

    -- Saldo negativo NÃO trava. A venda já aconteceu: recusar não desfaz a
    -- saída física, só faz o espelho divergir da prateleira para sempre e em
    -- silêncio. O negativo é a informação — ele diz que a contagem do galpão
    -- está errada, e é exatamente o que se quer enxergar.
    aviso := case when v_saldo - r.unidades < 0
                  then '⚠️ saldo fica NEGATIVO — contagem do galpão está atrás'
             end;

    if not p_ensaio then
      insert into public.carbo_estoque_consumo
        (origem_tipo, origem_chave, warehouse_id, product_id, unidades,
         ocorreu_em, platform, platform_sku, quantidade, fator)
      values
        ('ecommerce', r.platform || ':' || r.order_id, v_wh, r.product_id_alvo,
         r.unidades, r.ordered_at, r.platform, r.product_sku, r.qtd_vendida, r.fator)
      on conflict (origem_tipo, origem_chave, product_id) do nothing;

      -- Nada inserido = outra rodada chegou primeiro. Não mexe no saldo.
      if not found then
        acao := 'JA_CONTABILIZADO'; aviso := null;
        return next; continue;
      end if;

      insert into public.warehouse_stock (warehouse_id, product_id, quantity)
      values (v_wh, r.product_id_alvo, -r.unidades)
      on conflict (warehouse_id, product_id)
      do update set quantity = public.warehouse_stock.quantity - r.unidades,
                    updated_at = now();

      insert into public.stock_movements
        (product_id, warehouse_id, tipo, quantidade, origem, observacoes)
      values
        (r.product_id_alvo, v_wh, 'saida', r.unidades, 'ecommerce',
         'E-commerce · ' || r.platform || ' · pedido ' || r.order_id ||
         ' · ' || r.qtd_vendida || ' × ' || r.fator || ' un');
    end if;

    v_feitos := v_feitos + 1;
    return next;
  end loop;
end;
$$;

comment on function public.carbo_ecommerce_deduzir_estoque is
  'Deduz do estoque as vendas de e-commerce dos canais ATIVOS em carbo_canal_estoque, a partir do marco zero de cada um. ⚠️ Nasce em ENSAIO (p_ensaio = true): sem argumento ela não escreve nada. Idempotente — o índice único de carbo_estoque_consumo decide, então rodar duas vezes não deduz duas vezes e uma rodada interrompida se completa na seguinte. Saldo negativo não trava: a venda já aconteceu, e recusar só faria o espelho divergir da prateleira em silêncio.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o estorno, que precisa nascer junto                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Dedução sem estorno é espelho que só sabe andar para um lado. Pedido pago
-- que vira cancelado/estornado depois tem de devolver o que saiu — e isso
-- acontece: a `20260834` deixou 402 unidades deduzidas justamente porque
-- desligar não devolve nada.
--
-- A marca é a LINHA DO LEDGER, não uma coluna no pedido: apagar a linha de
-- consumo é o que libera aquele pedido a ser deduzido de novo se ele voltar a
-- ficar pago. Um booleano `estornado` faria o pedido ressuscitado nunca mais
-- deduzir — a mesma doença do `bling-sync`, onde venda cancelada ressuscitava
-- a cada rodada por falta de direção única.

create or replace function public.carbo_ecommerce_estornar_estoque(
  p_ensaio boolean default true
)
returns table (
  acao text, platform text, order_id text, produto text, unidades integer
)
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select k.id, k.warehouse_id, k.product_id, k.unidades, k.platform,
           k.origem_chave, p.product_code
    from public.carbo_estoque_consumo k
    join public.mrp_products p on p.id = k.product_id
    where k.origem_tipo = 'ecommerce'
      -- Nenhuma linha do pedido continua num status que justifique a saída.
      and not exists (
        select 1 from public.ecommerce_orders o
        where o.platform || ':' || o.order_id = k.origem_chave
          and o.status in ('paid','shipped','delivered')
      )
  loop
    acao     := case when p_ensaio then 'ENSAIO' else 'ESTORNADO' end;
    platform := r.platform;
    order_id := r.origem_chave;
    produto  := r.product_code;
    unidades := r.unidades;

    if not p_ensaio then
      update public.warehouse_stock
         set quantity = quantity + r.unidades, updated_at = now()
       where warehouse_id = r.warehouse_id and product_id = r.product_id;

      insert into public.stock_movements
        (product_id, warehouse_id, tipo, quantidade, origem, observacoes)
      values
        (r.product_id, r.warehouse_id, 'entrada', r.unidades, 'ecommerce',
         'Estorno e-commerce · ' || r.origem_chave);

      -- A linha SAI. É ela que representa "esta saída está contabilizada";
      -- sem ela o pedido volta a ser elegível se voltar a ficar pago.
      delete from public.carbo_estoque_consumo where id = r.id;
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.carbo_ecommerce_estornar_estoque is
  'Devolve ao estoque o que foi deduzido de pedido que deixou de estar pago/enviado/entregue. ⚠️ APAGA a linha de carbo_estoque_consumo em vez de marcá-la: é a linha que significa "já contabilizado", então removê-la é o que deixa o pedido elegível de novo se ele voltar a ficar pago. Um booleano faria o pedido ressuscitado nunca mais deduzir.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o ensaio, com os canais como estão (nada liga aqui)         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Deve voltar VAZIO: nenhum canal está ativo e nenhum tem marco zero.
select * from public.carbo_ecommerce_deduzir_estoque();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — liga a Nuvemshop (o único canal com evidência)              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- 93,1% dos 451 pedidos saíram com etiqueta comprada por nós. Loja própria,
-- despacho nosso. É a única premissa confirmada das quatro.
--
-- ⚠️ O marco é `now()`. Deduzir o histórico exigiria antes conciliar com as
-- 402 unidades que o caminho antigo já tirou, e isso é trabalho separado.

update public.carbo_canal_estoque
set ativo = true,
    deduz_a_partir_de = now(),
    observacao = 'Ligado em 28/08/2026. 93,1% dos pedidos (420 de 451 em 90d) '
                 || 'com etiqueta comprada por nós no Melhor Envio.',
    atualizado_em = now()
where platform = 'nuvemshop';

-- ⚠️ Os outros três seguem desligados, e o motivo NÃO é precaução genérica:
-- é ausência de medição. A pegada da etiqueta não se aplica a eles.
update public.carbo_canal_estoque
set observacao = '⚠️ Sem medição: este canal não passa pelo Melhor Envio '
                 || '(Mercado Envios / logística Amazon / SPX), então "0% com '
                 || 'etiqueta nossa" NÃO significa Full/FBA. Falta evidência de '
                 || 'quem despacha antes de ligar.',
    atualizado_em = now()
where platform in ('mercadolivre','amazon','shopee');

-- Agora o ensaio tem o que mostrar: os pedidos da Nuvemshop daqui pra frente.
-- Logo após rodar, deve vir VAZIO (o marco é agora). Encha com o tempo.
select * from public.carbo_ecommerce_deduzir_estoque();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o cron                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- SQL puro, banco→banco: não depende de deploy de edge function, como a ponte
-- do Bling 2 e a conciliação do Melhor Envio.
--
-- 10 minutos, não 1: estoque não dispara mensagem para ninguém e não precisa
-- andar em minutos. Minuto :08 para não empilhar com o `order_details` (:03),
-- o `nfe_recheck` (:07) nem o `carrinhos` (:04).

select cron.unschedule('ecommerce-deduz-estoque-10min')
where exists (select 1 from cron.job where jobname = 'ecommerce-deduz-estoque-10min');

select cron.schedule(
  'ecommerce-deduz-estoque-10min',
  '8-59/10 * * * *',
  $cron$
    select public.carbo_ecommerce_estornar_estoque(false);
    select public.carbo_ecommerce_deduzir_estoque(false, 500);
  $cron$
);

-- ⚠️ O estorno vem ANTES da dedução, de propósito: pedido que foi cancelado e
-- recomprado no mesmo intervalo devolve e sai de novo na ordem certa. Na ordem
-- inversa a dedução veria a linha antiga ainda presente e pularia o pedido.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência (rode amanhã, não agora)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O que já foi contabilizado, e de onde saiu.
select k.platform, p.product_code, count(*) as pedidos, sum(k.unidades) as unidades,
       min(k.ocorreu_em) as primeiro, max(k.ocorreu_em) as ultimo
from public.carbo_estoque_consumo k
join public.mrp_products p on p.id = k.product_id
group by 1,2 order by 4 desc;

-- (b) ⭐ O saldo do HUB-SP, e quanto dele o e-commerce explica.
select p.product_code, p.name, ws.quantity as saldo_sp,
       coalesce(sum(k.unidades), 0) as tirado_pelo_ecommerce
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id and w.code = 'HUB-SP'
join public.mrp_products p on p.id = ws.product_id
left join public.carbo_estoque_consumo k
       on k.product_id = p.id and k.warehouse_id = ws.warehouse_id
group by 1,2,3 order by 3 desc;

-- (c) ⚠️ Saldo negativo é sinal de contagem atrasada, não de bug da dedução.
select p.product_code, ws.quantity
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id and w.code = 'HUB-SP'
join public.mrp_products p on p.id = ws.product_id
where ws.quantity < 0;

-- (d) O cron rodou? ⚠️ `succeeded` aqui vale de verdade — é SQL síncrono, não
--     um net.http_post cujo sucesso é só ter POSTADO.
select j.jobname, r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where j.jobname = 'ecommerce-deduz-estoque-10min'
order by r.start_time desc limit 10;
