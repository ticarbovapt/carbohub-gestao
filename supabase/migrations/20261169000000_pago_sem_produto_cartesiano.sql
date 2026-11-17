-- 20261169 — A coluna "Pago" da Esteira levava 2,3 s para 24 linhas (17/11/2026)
--
-- Medido (`explain analyze` como usuário logado):
--
--   Nested Loop Anti Join   Rows Removed by Join Filter: 6.403.254
--     3.041 pedidos dos últimos 30 dias  ×  3.875 pedidos do Bling 2
--   Nested Loop Anti Join   Rows Removed by Join Filter:   485.346   (Bling 1)
--
-- A condição "já está no Bling 2" era UMA só, com um OR:
--     numero_loja = <pedido>   OR   (numero_loja é PayT E a transação está no array do pedido)
-- Com OR o Postgres não consegue fazer join por HASH e compara tudo contra tudo:
-- o custo é pedidos × pedidos do Bling. A 100× o volume são ~10.000× mais trabalho.
--
-- A correção são as MESMAS perguntas, escritas de forma que dê para hashear:
--   ¬(A ∨ B)  ≡  ¬A ∧ ¬B
--   · A  "o número da loja existe no Bling 2 (situação 9/12)"      → NOT EXISTS por igualdade
--   · B  "alguma transação PayT do pedido está no Bling 2"          → JOIN por igualdade entre as linhas
--        do pedido e o conjunto de transações PayT do Bling 2 (hash). ⚠️ A 1ª versão cruzava arrays com
--        `&&`, que não usa hash: 8 s a 100× só nesse filtro. O array do pedido deixou de existir.
--   · "já está no Bling 1, em loja on-line"                         → CTE materializada + NOT EXISTS
-- Nada de regra muda: quem sai de "Pago" e quem entra na esteira continuam sendo a mesma pergunta.
--
-- Mais: (A) e (C) só dependem do número do pedido, então entram ANTES do agrupamento — o group by
-- pesado passa a rodar só sobre o que ainda espera o Bling (24 de 3.041 em 17/11), não sobre 30 dias.
--
-- ⚠️ O texto vivo foi conferido (4 marcas estruturais + as reloptions lidas dele) e a view nova é
-- escrita por inteiro; as reloptions (security_invoker) vão JUNTO.
-- ⚠️ A migração ABORTA se o texto vivo não for o esperado, e ABORTA se o conjunto de
-- pedidos em "Pago" (e os valores) mudar com a troca — a impressão digital é tirada antes e
-- depois, na mesma transação. O antes fica em `carbo_backup_viewdef`.
-- ⚠️ Medido como usuário logado depois: supabase/consultas/esteira_como_usuario.sql (leitura 5).

do $$
declare
  v_def   text;
  v_opts  text;
  v_n     int;
  v_novo  text;
  v_antes text;
  v_depois text;
  v_qtd   int;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'ecommerce_aguardando_bling';
  if v_def is null then raise exception 'View public.ecommerce_aguardando_bling não encontrada'; end if;

  if v_def ~ 'b2_numero' then
    raise notice 'já aplicada — nada a fazer';
    return;
  end if;

  -- Conferência de que o texto vivo é o que esta migração conhece. Qualquer diferença ABORTA.
  select count(*) into v_n from regexp_matches(v_def, 'FROM\s+(?:public\.)?bling2_orders\s+bo\M', 'g');
  if v_n <> 1 then raise exception 'esperava 1 "FROM bling2_orders bo", achei %', v_n; end if;
  select count(*) into v_n from regexp_matches(v_def, 'FROM\s+\((?:public\.)?bling_orders\s+b1\M', 'g');
  if v_n <> 1 then raise exception 'esperava 1 "FROM (bling_orders b1", achei %', v_n; end if;
  select count(*) into v_n from regexp_matches(v_def, 'WITH\s+transacoes_do_pedido\s+AS\s+\(', 'g');
  if v_n <> 1 then raise exception 'esperava 1 "WITH transacoes_do_pedido AS (", achei %', v_n; end if;
  select count(*) into v_n from regexp_matches(v_def, 'WHERE\s+\(\(p\.avanco\s*>=\s*1\)\s+AND', 'g');
  if v_n <> 1 then raise exception 'esperava 1 "WHERE ((p.avanco >= 1) AND", achei %', v_n; end if;
  if v_def !~ 'bo\.situacao_id\s*=\s*ANY' or v_def !~ 'bl\.e_online\s+IS\s+TRUE' then
    raise exception 'as condições do Bling 1/2 não são as esperadas';
  end if;

  -- A impressão digital de ANTES: o conjunto de pedidos em "Pago" e seus valores.
  -- ⚠️ Todas as colunas MENOS `minutos_parado` (depende do relógio).
  execute $q$select md5(coalesce(string_agg(t::text, ',' order by platform, pedido_loja), '')), count(*)
               from (select platform, pedido_loja, canal, data_pedido, ordered_at, total, itens, produtos,
                            cliente, cliente_fone, cliente_email
                       from public.ecommerce_aguardando_bling) t$q$ into v_antes, v_qtd;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('ecommerce_aguardando_bling', v_def, v_opts, '20261169 — antes de tirar o produto cartesiano do Pago');

  -- A view nova inteira. As colunas, os nomes e os tipos são os do texto vivo: se divergirem,
  -- o `create or replace view` recusa (42P16) e a migração aborta sem mudar nada.
  --
  -- ⚠️ Os filtros (A) e (C) só dependem do NÚMERO do pedido (a chave do agrupamento), então entram
  -- ANTES do `group by`, nas duas CTEs: o agrupamento pesado (sort, array_agg distinct, string_agg
  -- distinct) passa a rodar só sobre o que ainda está esperando o Bling — em 17/11, 24 de 3.041
  -- pedidos —, e não sobre os 30 dias inteiros. Equivalente: o filtro é por chave, então o grupo
  -- entra ou sai INTEIRO, e o array de transações de quem fica não muda.
  v_novo := $w$WITH b2_numero AS MATERIALIZED (
         SELECT DISTINCT bo.numero_loja
           FROM public.bling2_orders bo
          WHERE bo.situacao_id = ANY (ARRAY[9::bigint, 12::bigint]) AND bo.numero_loja IS NOT NULL
        ), b2_payt_tr AS MATERIALIZED (
         -- as transações PayT que já estão no Bling 2: PAYT_<seller>_<transação>
         SELECT DISTINCT split_part(bo.numero_loja, '_', 3) AS tr
           FROM public.bling2_orders bo
          WHERE bo.situacao_id = ANY (ARRAY[9::bigint, 12::bigint]) AND bo.numero_loja LIKE 'PAYT!_%' ESCAPE '!'
        ), b1_online AS MATERIALIZED (
         SELECT DISTINCT b1.numero_loja
           FROM public.bling_orders b1
           JOIN public.bling_lojas bl ON (b1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
                              AND bl.bling_id = ((b1.raw_data -> 'loja' ->> 'id'))::bigint
          WHERE bl.e_online IS TRUE AND NOT COALESCE(bl.ignorar, false) AND b1.numero_loja IS NOT NULL
        ), pedido_ja_no_bling2_pela_payt AS MATERIALIZED (
         -- (B) os pedidos (plataforma + número) com ALGUMA linha cuja transação PayT já está no Bling 2.
         -- Era `transacao = ANY(array do pedido)` com OR dentro do NOT EXISTS: o Postgres comparava
         -- cada pedido com cada pedido do Bling. Aqui é um JOIN por igualdade (hash). A identidade
         -- continua sem filtro de status — um pedido não deixa de ser o mesmo porque uma transação
         -- dele foi cancelada (a lição da 20260975).
         SELECT DISTINCT e.platform, e.platform_order_number
           FROM public.ecommerce_orders e
           JOIN b2_payt_tr s ON s.tr = split_part(e.order_id, '-'::text, 1)
          WHERE e.platform_order_number IS NOT NULL
            AND e.ordered_at > (now() - '30 days'::interval)
        ), pedido AS (
         SELECT e.platform,
            e.platform_order_number,
            min(e.ordered_at) AS ordered_at,
            sum(e.total) AS total,
            sum(e.quantity) AS itens,
            max(e.cliente_nome) AS cliente,
            max(e.cliente_fone) AS cliente_fone,
            max(e.cliente_email) AS cliente_email,
            max(
                CASE lower(e.status)
                    WHEN 'delivered'::text THEN 3
                    WHEN 'shipped'::text THEN 2
                    WHEN 'paid'::text THEN 1
                    ELSE 0
                END) AS avanco,
            string_agg(DISTINCT e.product_name, ' · '::text) AS produtos
           FROM public.ecommerce_orders e
          WHERE e.platform_order_number IS NOT NULL
            AND public.ecommerce_status_e_venda(e.status)
            AND e.ordered_at > (now() - '30 days'::interval)
            -- (A) o número da loja já está no Bling 2 (situação 9/12)
            AND NOT EXISTS (SELECT 1 FROM b2_numero x WHERE x.numero_loja = e.platform_order_number)
            -- (C) já está no Bling 1, em loja on-line — CÓPIA da condição do ramo 1 da esteira
            AND NOT EXISTS (SELECT 1 FROM b1_online x WHERE x.numero_loja = e.platform_order_number)
          GROUP BY e.platform, e.platform_order_number
        )
 SELECT p.platform,
    p.platform_order_number AS pedido_loja,
        CASE p.platform
            WHEN 'nuvemshop'::text THEN 'Loja Nuvemshop'::text
            WHEN 'mercadolivre'::text THEN 'Mercado Livre'::text
            WHEN 'mercadolivre_full'::text THEN 'ML Full'::text
            WHEN 'amazon'::text THEN 'Amazon'::text
            WHEN 'payt'::text THEN 'PayT'::text
            WHEN 'shopee'::text THEN 'Shopee'::text
            ELSE initcap(p.platform)
        END AS canal,
    ((p.ordered_at AT TIME ZONE 'America/Sao_Paulo'::text))::date AS data_pedido,
    p.ordered_at,
    p.total,
    p.itens,
    p.produtos,
    p.cliente,
    p.cliente_fone,
    p.cliente_email,
    ((EXTRACT(epoch FROM (now() - p.ordered_at)))::bigint / 60) AS minutos_parado
   FROM pedido p
  WHERE p.avanco >= 1
    AND NOT EXISTS (SELECT 1 FROM pedido_ja_no_bling2_pela_payt x
                     WHERE x.platform = p.platform
                       AND x.platform_order_number = p.platform_order_number)$w$;

  -- ⚠️ As reloptions (security_invoker) vão JUNTO: `create or replace view` sem `with` as APAGA.
  execute format('create or replace view public.ecommerce_aguardando_bling %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                 rtrim(v_novo, '; '));

  execute $q$select md5(coalesce(string_agg(t::text, ',' order by platform, pedido_loja), ''))
               from (select platform, pedido_loja, canal, data_pedido, ordered_at, total, itens, produtos,
                            cliente, cliente_fone, cliente_email
                       from public.ecommerce_aguardando_bling) t$q$ into v_depois;
  if v_depois is distinct from v_antes then
    raise exception 'ABORTADO: o conjunto de pedidos em "Pago" mudou com a troca (nada foi gravado)';
  end if;

  raise notice 'ok: % pedidos em "Pago", idênticos antes e depois', v_qtd;
end
$$;
