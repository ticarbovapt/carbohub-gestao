-- ═══════════════════════════════════════════════════════════════════════════
-- O Rastreio avança com a NF da FILIAL também
--
-- Relatado pelo dono do processo em 01/10/2026: pedidos com a nota da filial já
-- vinculada continuam parados em "Gerar Nota Fiscal" no `/logistica/pos-venda`
-- — oito deles, incluindo o V2026090081, que acabou de ganhar as DUAS notas.
--
-- ⚠️ O gatilho `carboze_orders_nf_autostage` olha SÓ `bling_nf_id`. Ele é de
-- julho/2026, de quando só existia uma conta Bling — e o comentário dele diz
-- "imune a por qual caminho a NF foi vinculada", o que era verdade na época e
-- deixou de ser quando a nota passou a poder chegar em `bling2_nf_id`.
--
-- Não é um caso de "esqueceram": é o que acontece quando um conceito novo (a
-- segunda conta) entra num sistema cujas regras foram escritas contra o antigo.
-- A mesma coisa já tinha acontecido com o `SELECT` à mão do `usePosVenda`, e o
-- comentário DE LÁ previa: "coluna que não estiver aqui simplesmente não chega,
-- e o campo aparece vazio na tela sem erro nenhum".
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quantos estão presos, e por quê.                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select order_number, fulfillment_stage, bling_conta,
--        bling_nf_id, invoice_number,
--        bling2_nf_id, invoice2_number,
--        bling2_nf_bonificacao_id, invoice2_bonificacao_number
-- from public.carboze_orders
-- where fulfillment_stage = 'gerar_nf'
--   and bling2_nf_id is not null
-- order by created_at desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o gatilho enxerga as DUAS contas                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Só a nota de VENDA avança o card. A remessa de bonificação NÃO:
-- `bling2_nf_bonificacao_id` está de fora de propósito. Ela acompanha a carga,
-- mas não é o documento que libera a expedição — avançar por ela faria um
-- pedido cuja nota de venda ainda não saiu parecer pronto para etiqueta, e a
-- etiqueta carrega o número da nota de VENDA.
--
-- ⚠️ E continua agindo SÓ em `gerar_nf`: não puxa de volta quem já seguiu para
-- transporte ou entrega.

create or replace function public.carboze_orders_nf_autostage()
returns trigger language plpgsql as $$
begin
  if NEW.fulfillment_stage = 'gerar_nf'
     and (
       -- matriz (o comportamento original)
       (NEW.bling_nf_id  is not null and OLD.bling_nf_id  is null)
       -- filial. ⚠️ Acrescentado em 01/10/2026: a nota da conta 2 mora em
       -- coluna PRÓPRIA porque as duas contas numeram do zero, e por isso o
       -- gatilho precisava aprender a olhar as duas. Oito pedidos ficaram
       -- presos em "Gerar Nota Fiscal" com a nota já vinculada.
       or (NEW.bling2_nf_id is not null and OLD.bling2_nf_id is null)
     )
  then
    NEW.fulfillment_stage := 'nf_finalizada';
  end if;
  return NEW;
end $$;

comment on function public.carboze_orders_nf_autostage is
  'Avanca gerar_nf -> nf_finalizada quando a NF e vinculada, em QUALQUER das duas contas Bling (bling_nf_id ou bling2_nf_id). A remessa de bonificacao NAO avanca: ela acompanha a carga mas nao e o documento que libera a expedicao, e a etiqueta carrega o numero da nota de VENDA.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — destravar os que já estão vinculados                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O gatilho é BEFORE UPDATE e reage à TRANSIÇÃO de nulo para preenchido.
-- Os pedidos que já receberam a nota não vão avançar sozinhos nunca — a
-- transição deles já aconteceu, com o gatilho antigo no lugar. Republicar a
-- função não reprocessa o passado.
--
-- ⚠️ E o `where` exige `fulfillment_stage = 'gerar_nf'`: pedido que a logística
-- já moveu à mão para transporte ou entrega NÃO pode voltar. A conferência do
-- BLOCO 3 mostra quantos foram.

update public.carboze_orders
   set fulfillment_stage = 'nf_finalizada',
       stage_changed_at  = now(),
       updated_at        = now()
 where fulfillment_stage = 'gerar_nf'
   and bling2_nf_id is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ESPERADO: ZERO. Nenhum pedido com nota da filial pode continuar em
--     "Gerar Nota Fiscal".
-- select count(*) as ainda_presos
-- from public.carboze_orders
-- where fulfillment_stage = 'gerar_nf' and bling2_nf_id is not null;

-- (b) Os que acabaram de avançar, para conferir na tela.
-- select order_number, fulfillment_stage, invoice2_number as nf_venda,
--        invoice2_bonificacao_number as nf_remessa, stage_changed_at
-- from public.carboze_orders
-- where bling2_nf_id is not null
-- order by stage_changed_at desc nulls last
-- limit 20;

-- (c) ⚠️ O caso oposto: pedido com a REMESSA vinculada e SEM a nota de venda.
--     Ele continua — corretamente — em "Gerar Nota Fiscal", porque a nota que
--     libera a expedição é a de venda. Linha aqui é trabalho de verdade: falta
--     emitir a nota principal.
-- select order_number, fulfillment_stage, invoice2_bonificacao_number
-- from public.carboze_orders
-- where bling2_nf_bonificacao_id is not null
--   and bling2_nf_id is null
--   and bling_nf_id is null;
