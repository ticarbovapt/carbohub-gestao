-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_vendas_metrica: separar VENDA de FRETE, sem tocar em `total`
--
-- ── O problema ───────────────────────────────────────────────────────────
--
-- As duas integrações do Bling gravam `shipping_cost = 0` em TODOS os pedidos
-- on-line. O frete cobrado do cliente fica embutido em `total`, e `subtotal`
-- guarda só os produtos. O card "CarboZé on-line" mostra R$ 210k onde a venda
-- de produto é R$ 186k — os R$ 24k de diferença são frete lido como receita.
--
-- Medido em 01→27/10/2026 (on-line, conta_metrica):
--
--   bling2_bridge   1.164 ped.   subtotal 135.497,51   total 157.665,63
--   bling_sync        487 ped.   subtotal  50.713,20   total  52.284,02
--   ─────────────────────────────────────────────────────────────────────
--   total           1.651 ped.   subtotal 186.210,71   total 209.949,65
--                                                      frete  23.738,94 (11%)
--
-- `discount` é 0 em todos eles.
--
-- ── O que esta migração faz, e o que NÃO faz ─────────────────────────────
--
-- ⚠️ `total` NÃO MUDA DE SIGNIFICADO. Continua o bruto do pedido/NF, e todos
-- os consumidores atuais (cards, Evolução Mensal, Crescimento Anual, metas,
-- ticket médio, Vendas por Canal) seguem lendo o mesmo número de antes. Esta
-- migração só ACRESCENTA duas colunas no fim.
--
-- ── Por que a view é recriada por CIRURGIA, e não reescrita à mão ────────
--
-- A view tem 149 colunas. Copiá-las para cá para acrescentar duas é o tipo de
-- operação em que uma coluna some sem ninguém ver — e, numa view que alimenta
-- o dashboard inteiro, sumir calado é o pior desfecho possível.
--
-- Então o bloco lê a definição VIVA (`pg_get_viewdef`), insere as duas colunas
-- imediatamente antes do `FROM`, e recria. As outras 149 passam byte a byte.
--
-- ⚠️ E ABORTA se a âncora não aparecer exatamente uma vez: se a view for
-- reescrita um dia e o texto mudar, esta migração falha em voz alta em vez de
-- gerar uma view torta.
--
-- ── A fórmula ────────────────────────────────────────────────────────────
--
--   valor_frete = shipping_cost            , quando houver (134 linhas hoje)
--               = total - subtotal + desconto, caso contrário (o fallback)
--               , nunca negativo (GREATEST ... 0)
--   valor_venda = total - valor_frete
--
-- O fallback é TEMPORÁRIO: quando as integrações passarem a gravar
-- `shipping_cost`, o primeiro ramo assume sozinho e o histórico continua
-- coberto pelo segundo.
--
-- Conferido nas 3.266 linhas da view (não só no on-line):
--   · valor_frete negativo ................ 0
--   · valor_venda negativo ................ 0
--   · valor_venda + valor_frete = total ... 100% das linhas
--   · subtotal > total + desconto ......... 58 linhas (o GREATEST protege)
-- ═══════════════════════════════════════════════════════════════════════════

do $mig$
declare
  v_def   text;
  v_pos   int;
  v_ancora constant text := 'FROM carboze_orders o';
  v_novas constant text :=
    E',\n'
    '    CASE\n'
    '        WHEN COALESCE(o.shipping_cost, 0::numeric) > 0::numeric THEN o.shipping_cost\n'
    '        ELSE GREATEST(COALESCE(o.total, 0::numeric) - COALESCE(o.subtotal, 0::numeric) + COALESCE(o.discount, 0::numeric), 0::numeric)\n'
    '    END AS valor_frete,\n'
    '    COALESCE(o.total, 0::numeric) - (\n'
    '        CASE\n'
    '            WHEN COALESCE(o.shipping_cost, 0::numeric) > 0::numeric THEN o.shipping_cost\n'
    '            ELSE GREATEST(COALESCE(o.total, 0::numeric) - COALESCE(o.subtotal, 0::numeric) + COALESCE(o.discount, 0::numeric), 0::numeric)\n'
    '        END) AS valor_venda\n'
    '   ';
begin
  -- Já aplicada? Sai sem fazer nada (idempotente).
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'carbo_vendas_metrica'
                and column_name = 'valor_frete') then
    raise notice 'valor_frete ja existe em carbo_vendas_metrica — nada a fazer.';
    return;
  end if;

  v_def := pg_get_viewdef('public.carbo_vendas_metrica'::regclass, true);

  -- ⚠️ A âncora tem de ser ÚNICA. Se aparecer zero vezes, a view mudou de
  -- forma; se aparecer duas, a inserção cairia no lugar errado. Nos dois casos
  -- é melhor quebrar aqui do que gerar uma view silenciosamente torta.
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception
      'ABORTADO: a ancora "%" nao aparece exatamente uma vez na definicao de carbo_vendas_metrica. A view mudou de forma — reveja esta migracao.',
      v_ancora;
  end if;

  v_pos := position(v_ancora in v_def);

  execute 'create or replace view public.carbo_vendas_metrica as '
       || substr(v_def, 1, v_pos - 1)
       || v_novas
       || substr(v_def, v_pos);

  raise notice 'carbo_vendas_metrica recriada com valor_frete e valor_venda.';
end
$mig$;

-- ⚠️ `security_invoker` REAFIRMADO, e não por excesso de zelo.
--
-- A view roda hoje com `security_invoker=true`: a RLS de `carboze_orders`
-- continua valendo para quem consulta. Se um CREATE OR REPLACE perder essa
-- opção, a view vira security-definer e passa a mostrar a TODOS os pedidos que
-- o dono dela enxerga — vazamento silencioso, sem erro em lugar nenhum.
--
-- O ALTER é idempotente e custa nada. Deixar a preservação por conta do
-- comportamento padrão do Postgres é apostar numa sutileza de versão.
alter view public.carbo_vendas_metrica set (security_invoker = true);

-- ⚠️ `CREATE OR REPLACE` basta aqui — acrescentar coluna NO FIM é permitido e
-- não exige derrubar a dependente (`carbo_vendas_nf_cancelada`). O comentário
-- em `useDashComercial.ts:162` fala em "DROP + as três dependentes"; hoje a
-- dependente é UMA, e o DROP só seria necessário para mudar/remover/reordenar
-- coluna existente — que é exatamente o que esta migração não faz.

comment on view public.carbo_vendas_metrica is
  'Venda que conta + a quebra venda/frete. `total` e o bruto e NAO mudou de '
  'significado; `valor_venda` e `valor_frete` sao colunas novas que sempre '
  'somam `total`. O frete usa `shipping_cost` quando existe e, enquanto as '
  'integracoes do Bling gravarem zero, cai no fallback total - subtotal + desconto.';


-- ── Conferência (rode e leia) ────────────────────────────────────────────

-- 0. A opção de segurança continua de pé. Tem de devolver {security_invoker=true}.
select reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'carbo_vendas_metrica';

-- 1. As duas invariantes, na view inteira. As três colunas têm de vir ZERO.
select count(*) filter (where valor_frete < 0)                            as frete_negativo_deve_ser_0,
       count(*) filter (where valor_venda < 0)                            as venda_negativa_deve_ser_0,
       count(*) filter (where round(valor_venda + valor_frete, 2) <> round(coalesce(total,0), 2))
                                                                          as soma_nao_fecha_deve_ser_0
from public.carbo_vendas_metrica;

-- 2. Os números de aceite do briefing (01→27/10/2026, on-line).
--    Esperado: 1.651 pedidos · total 209.949,65 · venda 186.210,71 · frete 23.738,94
select count(*)                      as pedidos,
       round(sum(total)::numeric,2)       as total,
       round(sum(valor_venda)::numeric,2) as venda,
       round(sum(valor_frete)::numeric,2) as frete,
       round((sum(valor_frete) / nullif(sum(total),0) * 100)::numeric,1) as frete_pct
from public.carbo_vendas_metrica
where segmento = 'online' and conta_metrica
  and data_efetiva between date '2026-10-01' and date '2026-10-27';
