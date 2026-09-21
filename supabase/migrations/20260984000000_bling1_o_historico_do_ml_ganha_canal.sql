-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 3: o histórico do Mercado Livre (conta 1) ganha canal
--
-- A `20260983` fez a ponte resolver canal no INSERT — vale do próximo sync em
-- diante. O que já está em `carboze_orders` continua sem canal, aparecendo no
-- `/vendas` do vendedor e somando no faturamento do time.
--
-- ⚠️ MEDIDO ANTES (21/09/2026), e o número é o que autoriza rodar isto:
--
--   canal hoje      pedidos   valor        período
--   (sem canal)          18   R$ 2.766,72  28/08/2026 → 20/09/2026
--   online                1   R$   149,50  19/09/2026
--
-- São 18 pedidos e R$ 2.766,72 — tudo dentro de agosto/setembro de 2026. Não é
-- reescrita de histórico antigo: agosto está fechado, setembro está correndo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O PEDIDO QUE JÁ ESTÁ 'online' É A RAZÃO DA TRAVA
--
-- Um dos 19 já está classificado, e NÃO foi a ponte que o classificou — ela só
-- passou a gravar canal agora. Veio da herança pelo histórico do CNPJ (o
-- mecanismo que `apps/crm/src/lib/vendaDoTime.ts` documenta). Ou seja: existe
-- classificação viva nesses dados.
--
-- Por isso o `where` exige `segmento is null`. É a MESMA regra do backfill da
-- `20260814100000`, que já avisava: *"`where segmento is null` é OBRIGATÓRIO:
-- sem isso o backfill atropelaria toda classificação manual já feita."*
--
-- Sem a trava, este UPDATE regravaria por cima de acerto alheio — e regravar
-- 'online' por cima de 'online' seria inofensivo por SORTE, não por desenho.
-- A próxima loja classificada como on-line podendo ter pedido marcado à mão
-- como 'revenda' quebraria isso de verdade.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE MUDA NA PRÁTICA
--
-- Os 18 saem do `/vendas` do Sales (o `FILTRO_VENDA_DO_TIME` tira `segmento =
-- 'online'` E sem vendedor — e nenhum deles tem vendedor) e saem do
-- faturamento do time no Dashboard Comercial, passando a contar como on-line.
--
-- ⚠️ Agosto/2026 muda de valor. É o objetivo, e mesmo assim precisa ser dito:
-- quem fechou agosto verá o faturamento do time menor. Nada é apagado — `total`
-- fica, o pedido fica, e reverter é `set segmento = null` nos mesmos ids.
--
-- ⚠️ Isto NÃO os coloca no painel de `/ecommerce/vendas-online`. Aquele painel
-- lê `ecommerce_orders` (integração de plataforma), não `carboze_orders`. O ML
-- da matriz ainda não está integrado lá — é a Fase 4, e é outro trabalho.
--
-- ⚠️ RODE EM BLOCOS. O BLOCO 2 altera dado; o 1 e o 3 são leitura.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o que muda, MÊS A MÊS (leitura)                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Rode ANTES do BLOCO 2 e guarde o resultado: é com ele que se confere depois.
-- Cada linha é um mês que vai perder faturamento do time para o on-line.

select
  to_char(coalesce(co.sale_date, co.created_at::date), 'YYYY-MM') as mes,
  count(*)                                    as pedidos,
  sum(coalesce(co.total, 0))                  as valor_que_sai_do_time,
  count(*) filter (where co.vendedor_id is not null) as com_vendedor
from public.carboze_orders co
join public.bling_orders bo
  on bo.bling_id::text = split_part(co.external_ref, '-', 2)
where co.external_ref like 'bling-%'
  and co.segmento is null
  and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id')
group by 1
order by 1;

-- ⚠️ `com_vendedor` tem de vir 0. Pedido de marketplace nunca tem vendedor (a
-- ponte não atribui ninguém). Se vier diferente de zero, PARE: ou um vendedor
-- registrou venda de verdade que caiu na loja do ML, ou a loja foi classificada
-- errado — e marcar 'online' tiraria a venda da tela de quem a fez, que é o
-- dano que a 20260983 existe para evitar.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a classificação do histórico                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Bloco plpgsql, e não um UPDATE solto, por dois motivos:
--
-- 1. Ele ABORTA se encontrar pedido com vendedor, em vez de classificar e
--    avisar depois. O aviso chegaria com a venda já fora da tela de alguém.
-- 2. Ele diz quantas linhas mudou. `UPDATE` no SQL Editor devolve "Success" e
--    o número se perde — e o número é a única forma de conferir contra o
--    BLOCO 1.

do $$
declare
  v_com_vendedor integer;
  v_alteradas    integer;
begin
  select count(*) into v_com_vendedor
  from public.carboze_orders co
  join public.bling_orders bo
    on bo.bling_id::text = split_part(co.external_ref, '-', 2)
  where co.external_ref like 'bling-%'
    and co.segmento is null
    and co.vendedor_id is not null
    and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id');

  if v_com_vendedor > 0 then
    raise exception
      'ABORTADO: % pedido(s) de loja on-line TEM vendedor. Marcar online tiraria a venda da tela de quem a fez. Rode o BLOCO 1, confira a classificacao da loja em bling_lojas, e so entao decida.',
      v_com_vendedor;
  end if;

  update public.carboze_orders co
     set segmento = 'online'
    from public.bling_orders bo
   where bo.bling_id::text = split_part(co.external_ref, '-', 2)
     and co.external_ref like 'bling-%'
     -- ⚠️ OBRIGATÓRIO: nunca atropela classificação existente (manual ou
     -- herdada). Mesma regra do backfill da 20260814100000.
     and co.segmento is null
     and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id');

  get diagnostics v_alteradas = row_count;
  raise notice 'Classificados como on-line: % pedido(s). Confira contra o BLOCO 1.', v_alteradas;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Sobrou algum sem canal? Esperado: ZERO linhas.
select co.order_number, co.total, coalesce(co.sale_date, co.created_at::date) as data
from public.carboze_orders co
join public.bling_orders bo
  on bo.bling_id::text = split_part(co.external_ref, '-', 2)
where co.external_ref like 'bling-%'
  and co.segmento is null
  and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id')
order by data;

-- (b) O placar. Esperado: 19 pedidos, R$ 2.916,22, TODOS 'online'
--     (os 18 classificados agora + o 1 que já estava).
select coalesce(co.segmento, '(sem canal)') as canal,
       count(*)                             as pedidos,
       sum(coalesce(co.total, 0))           as valor
from public.carboze_orders co
join public.bling_orders bo
  on bo.bling_id::text = split_part(co.external_ref, '-', 2)
where co.external_ref like 'bling-%'
  and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id')
group by 1
order by valor desc;

-- (c) ⚠️ A conferência que impede o dano silencioso: nenhum pedido COM vendedor
--     pode ter virado on-line nesta rodada. Tem de vir ZERO.
select count(*) as vendas_de_gente_marcadas_online
from public.carboze_orders co
join public.bling_orders bo
  on bo.bling_id::text = split_part(co.external_ref, '-', 2)
where co.external_ref like 'bling-%'
  and co.segmento = 'online'
  and co.vendedor_id is not null
  and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id');

-- (d) Para REVERTER, se algo saiu diferente do esperado. Não roda sozinho:
--     está comentado de propósito, porque `segmento = null` também apagaria a
--     classificação do pedido que já era 'online' antes desta migração.
--
-- update public.carboze_orders co
--    set segmento = null
--   from public.bling_orders bo
--  where bo.bling_id::text = split_part(co.external_ref, '-', 2)
--    and co.external_ref like 'bling-%'
--    and co.segmento = 'online'
--    and public.carbo_bling_loja_e_online(bo.raw_data -> 'loja' ->> 'id');
