-- =====================================================================
-- PayT é ON-LINE também no faturamento (16/10/2026).
--
-- Medido pela auditoria 20261089 (01/06 a 16/10): 25 pedidos PayT,
-- R$ 4.173,01, faturados no Bling 2 e somando em "Comercial Expansão" (venda
-- direta e revenda) do Dashboard Comercial, em vez de "CarboZé on-line".
--
-- Causa: a ponte do Bling 2 (`bling2_bridge_pedidos_faturados`) marca
-- `segmento = 'online'` só quando a loja do pedido é ≠ 0, e a PayT chega com
-- `loja_id = 0` — a mesma loja da venda de balcão (pendência nº 1 da PayT no
-- CLAUDE.md). O que distingue a PayT é o `numero_loja = PAYT_<seller>_<tx>`,
-- a MESMA marca que a Esteira já usa para chamá-la de on-line.
--
-- O conserto:
--   1. a ponte passa a marcar 'online' quando `numero_loja like 'PAYT\_%'`
--      (trocado no texto VIVO da função, com backup e trava);
--   2. o histórico: pedido PayT com `segmento` nulo e SEM vendedor vira
--      'online'. ⚠️ Só nulo: classificação já feita à mão não é tocada. E só
--      sem vendedor: marcar on-line tira a venda da tela de quem a fez.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — os pedidos PayT no sistema, por canal (leitura)          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: a maioria com segmento NULO (o defeito) e alguns 'online'
-- (herdados pelo CNPJ). tem_vendedor = false em todos.
-- Linha com tem_vendedor = true: me mande antes do BLOCO 1.
select o.segmento,
       (o.vendedor_id is not null) as tem_vendedor,
       count(*)                    as pedidos,
       round(sum(o.total), 2)      as valor
  from public.carboze_orders o
  join public.bling2_orders bo on o.external_ref = 'bling2-' || bo.bling_id
 where bo.numero_loja like 'PAYT\_%'
 group by 1, 2
 order by 1 nulls first, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a ponte aprende a PayT, e o histórico é reclassificado   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $ponte$
declare
  v_def  text := pg_get_functiondef('public.bling2_bridge_pedidos_faturados()'::regprocedure);
  v_de   text := $d$when bo.loja_id is not null and bo.loja_id <> 0$d$;
  v_por  text := $p$when bo.numero_loja like 'PAYT\_%' then 'online'
        when bo.loja_id is not null and bo.loja_id <> 0$p$;
  v_n    int;
begin
  if position('PAYT' in v_def) > 0 then
    raise notice 'A ponte já reconhece a PayT — nada a trocar.';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'Esperava 1 ocorrência do trecho da loja na ponte, achei %. Nada foi alterado — me mande pg_get_functiondef(''public.bling2_bridge_pedidos_faturados()''::regprocedure).', v_n;
  end if;
  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('bling2_bridge_pedidos_faturados', v_def);
  execute replace(v_def, v_de, v_por);
  raise notice 'Ponte atualizada: PayT entra como on-line.';
end $ponte$;

update public.carboze_orders o
   set segmento = 'online'
  from public.bling2_orders bo
 where o.external_ref = 'bling2-' || bo.bling_id
   and bo.numero_loja like 'PAYT\_%'
   and o.segmento is null
   and o.vendedor_id is null;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — o BLOCO 0 de novo, e a ponte                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: segmento NULO com zero pedidos (some da lista) e ponte_ok = true.
select o.segmento,
       count(*)               as pedidos,
       round(sum(o.total), 2) as valor,
       position('PAYT' in pg_get_functiondef('public.bling2_bridge_pedidos_faturados()'::regprocedure)) > 0 as ponte_ok
  from public.carboze_orders o
  join public.bling2_orders bo on o.external_ref = 'bling2-' || bo.bling_id
 where bo.numero_loja like 'PAYT\_%'
 group by 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ LISTA — cancelado NA LOJA e contando no faturamento (leitura)      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A NF continua válida no Bling, então o pedido conta. Se a venda não
-- aconteceu, quem corrige é o FISCAL (cancelar a NF ou emitir a devolução no
-- Bling) — o sistema passa a não contar sozinho quando a NF cai.
-- Na PayT a pergunta é pelo CARRINHO: transação cancelada com upsell pago no
-- mesmo carrinho NÃO é venda cancelada.
with v as (
  select v.order_number, v.customer_name, v.total, v.data_efetiva, v.external_ref
    from public.carbo_vendas_metrica v
   where v.conta_metrica and v.segmento = 'online'
     and v.data_efetiva between date '2026-06-01' and date '2026-10-16'
), b as (
  select 'bling2-' || bling_id as ref, numero, numero_loja from public.bling2_orders
  union all
  select 'bling-'  || bling_id,        numero, numero_loja from public.bling_orders
), x as (
  select v.*, b.numero as pedido_bling, b.numero_loja
    from v join b on b.ref = v.external_ref
), linhas as (
  select x.*, e.platform, e.status
    from x
    join public.ecommerce_orders e
      on (x.numero_loja like 'PAYT\_%' and e.platform = 'payt'
          and e.platform_order_number in (
                select e2.platform_order_number from public.ecommerce_orders e2
                 where e2.platform = 'payt'
                   and split_part(e2.order_id, '-', 1) = split_part(x.numero_loja, '_', 3)))
      or (x.numero_loja not like 'PAYT\_%' and e.platform_order_number = x.numero_loja)
)
select data_efetiva, order_number, pedido_bling, numero_loja, customer_name, total,
       max(platform) as plataforma,
       string_agg(distinct status, ', ') as status_na_loja
  from linhas
 group by 1, 2, 3, 4, 5, 6
having not bool_or(public.ecommerce_status_e_venda(status))
 order by data_efetiva;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ FRETE — por que o on-line do Dashboard vale mais (leitura)         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- O Dashboard soma o total da NF (produtos + frete − desconto); a Vendas
-- Online soma só os produtos. ESPERADO: frete ≈ a diferença da auditoria
-- (Nuvemshop: R$ 161.742,79 no Bling contra R$ 140.134,70 na plataforma).
select coalesce(l.nome, 'loja ' || bo.loja_id) as loja,
       count(*)                               as pedidos,
       round(sum(bo.total), 2)                as total_nf,
       round(sum(bo.total_produtos), 2)       as produtos,
       round(sum(bo.total_frete), 2)          as frete,
       round(sum(bo.total_desconto), 2)       as desconto
  from public.carbo_vendas_metrica v
  join public.bling2_orders bo on v.external_ref = 'bling2-' || bo.bling_id
  left join public.bling2_lojas l on l.bling_id = bo.loja_id
 where v.conta_metrica and v.segmento = 'online'
   and v.data_efetiva between date '2026-06-01' and date '2026-10-16'
 group by 1
 order by total_nf desc;
