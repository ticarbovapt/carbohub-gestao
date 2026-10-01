-- ═══════════════════════════════════════════════════════════════════════════
-- Destravar "Gerar Nota Fiscal" quando a nota da MATRIZ já existe
--
-- Relatado pelo dono do processo em 01/10/2026, com a tela na mão: nove cards
-- da Brisanet parados em "Gerar Nota Fiscal" exibindo, no mesmo card, o selo
-- "aguardando NF" E o chip "NF 000303". A nota existe. O card é que não andou.
--
-- ⚠️ A `20261027` destravou SÓ a filial:
--
--     where fulfillment_stage = 'gerar_nf' and bling2_nf_id is not null
--
-- Na hora a queixa era sobre a conta 2, e eu escrevi exatamente a queixa. Estes
-- são da MATRIZ (`bling_nf_id`, notas 000303/000304 e companhia) e ficaram de
-- fora — não por regra, por recorte da pergunta.
--
-- ── Por que o gatilho nunca os pegou ─────────────────────────────────────
--
-- `carboze_orders_nf_autostage` é BEFORE UPDATE e reage à TRANSIÇÃO de
-- `bling_nf_id` de nulo para preenchido. Nestes pedidos a nota chegou ANTES de
-- o card entrar em `gerar_nf`: a transição que ele espera já tinha acontecido,
-- noutra etapa, e ele não olha de novo.
--
-- ⚠️ E eu NÃO vou fazê-lo reagir também à entrada em `gerar_nf`. Mover um card
-- de volta para "Gerar Nota Fiscal" COM nota vinculada é o gesto de quem vai
-- REEMITIR — nota errada, valor errado, cliente errado. Um gatilho que o
-- empurrasse de volta brigaria com a pessoa, e ela não teria como vencer.
-- A pergunta "a nota chegou?" e a pergunta "esta nota presta?" são diferentes,
-- e o sistema só sabe responder a primeira.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quem está preso, e com qual nota.                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Rode ANTES. É esta lista que o BLOCO 1 vai mover, e é com ela que a
-- conferência compara. Esperado, medido na tela: 9 cards, todos Brisanet.
-- select o.order_number, o.customer_name, o.total,
--        o.bling_nf_id, o.invoice_number,
--        o.bling2_nf_id, o.invoice2_number,
--        o.stage_changed_at, o.created_at
-- from public.carboze_orders o
-- where o.fulfillment_stage = 'gerar_nf'
--   and o.bling_nf_id is not null
-- order by o.created_at;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — destravar                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `bling_nf_id`, a nota de VENDA da matriz. NÃO `bling_nf_bonificacao_id`:
-- a remessa acompanha a carga mas não é o documento que libera a expedição, e
-- a etiqueta carrega o número da nota de venda. Mesma razão pela qual a
-- `20261027` deixou `bling2_nf_bonificacao_id` de fora.
--
-- ⚠️ E o `where` exige `fulfillment_stage = 'gerar_nf'`: pedido que a logística
-- já moveu à mão para transporte ou entrega NÃO pode voltar.

update public.carboze_orders
   set fulfillment_stage = 'nf_finalizada',
       stage_changed_at  = now(),
       updated_at        = now()
 where fulfillment_stage = 'gerar_nf'
   and bling_nf_id is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ESPERADO: ZERO, nas DUAS contas. Nenhum pedido com nota de venda pode
--     continuar em "Gerar Nota Fiscal".
-- select count(*) filter (where bling_nf_id  is not null) as presos_matriz,
--        count(*) filter (where bling2_nf_id is not null) as presos_filial
-- from public.carboze_orders
-- where fulfillment_stage = 'gerar_nf';

-- (b) Os que acabaram de andar.
-- select order_number, fulfillment_stage, invoice_number, stage_changed_at
-- from public.carboze_orders
-- where fulfillment_stage = 'nf_finalizada'
-- order by stage_changed_at desc nulls last
-- limit 20;

-- (c) ⚠️ Quem SOBRA em "Gerar Nota Fiscal" é trabalho de verdade: falta emitir.
--     Linha aqui não é defeito, é fila.
-- select order_number, customer_name, total, created_at,
--        bling_nf_bonificacao_id, bling2_nf_bonificacao_id
-- from public.carboze_orders
-- where fulfillment_stage = 'gerar_nf'
-- order by created_at;

-- (d) ⚠️ O FATURAMENTO NÃO PODE MUDAR. Etapa do Rastreio é operação, não
--     fiscal: `conta_metrica` não lê `fulfillment_stage`. ESPERADO: os mesmos
--     1.297 / R$ 930.044,52.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;
