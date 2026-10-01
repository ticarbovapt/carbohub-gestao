-- ═══════════════════════════════════════════════════════════════════════════
-- `V2026090001` recebe a nota de venda que faltava
--
-- Pedido do dono do processo em 01/10/2026: *"1 - vincula ai"*. A RPC
-- `carbo_nf_filial_vincular` recusa do SQL Editor — ele roda como `postgres`
-- sem JWT, `auth.uid()` é nulo e a guarda devolve `Sem permissão`. Isso está
-- CERTO e não se contorna afrouxando a função: o caminho é a tela, ou um
-- `update` pontual como este, que carrega as mesmas travas.
--
-- O caso, medido:
--
--   pedido   V2026090001   NOVA NB   R$ 2.600,00   em_transporte, 30 dias
--   nota     000939        conta 2   R$ 2.600,00   bling_id 26939585336
--   bonif.   000940        conta 2   R$    52,00   já vinculada
--
-- Valor idêntico ao centavo, mesmo CNPJ, numeração CONSECUTIVA com a
-- bonificação que já está no pedido, e UM só pedido disputando. É o vínculo
-- mais forte que existe sem o código no rodapé.
--
-- ⚠️ A carga está na rua desde 02/09 com nota de BRINDE e sem nota de VENDA —
-- foi este pedido que motivou o aviso vermelho novo do Rastreio.
--
-- ⚠️ E ele não casou sozinho por uma razão que vale registrar: `000939` e
-- `000940` estão as DUAS com `natureza_operacao` nula (o backfill levava 401 —
-- `20261036`), então `carbo_natureza_e_bonificacao` devolve `false` para as
-- duas e o casamento automático não tem como decidir a coluna. Com a fila
-- drenada, um caso assim passa a se resolver sozinho.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Rode UMA DE CADA VEZ, e LEIA antes de seguir.        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O pedido, como está agora. ESPERADO: `bling2_nf_id` NULO e
--     `bling2_nf_bonificacao_id` = 26939959173.
--     ⚠️ Se `bling2_nf_id` já tiver valor, PARE: alguém vinculou no meio do
--     caminho e o BLOCO 1 — corretamente — não fará nada.
-- select order_number, total, fulfillment_stage, bling_conta,
--        bling_nf_id, bling2_nf_id, invoice2_number,
--        bling2_nf_bonificacao_id, invoice2_bonificacao_number
-- from public.carboze_orders
-- where order_number = 'V2026090001';

-- (b) As duas notas. ESPERADO: 000939 R$ 2.600,00 e 000940 R$ 52,00, as duas
--     `Emitida DANFE`, as duas do mesmo CNPJ.
--     ⚠️ Se a 000939 NÃO valer exatamente R$ 2.600,00, pare e me diga: o valor
--     bater ao centavo é metade do que autoriza este vínculo.
-- select numero, valor_total, situacao, data_emissao, contato_nome,
--        contato_cnpj, natureza_operacao, bling_id, chave_acesso
-- from public.bling2_nfe
-- where bling_id in (26939585336, 26939959173)
-- order by numero;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — vincular                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `bling2_nf_id is null` no WHERE é a MESMA trava da RPC: este bloco pode
-- recusar, nunca SOBRESCREVER. Vínculo por texto derrubando vínculo por id
-- seria trocar o certo pelo provável — e aqui seria pior, porque trocaria um
-- vínculo humano por um meu.
--
-- ⚠️ `bling_conta = 2` vai junto, e não é detalhe: é ele que faz a tela de
-- Faturamento ler as colunas `*2_*`. Sem isso o pedido fica com a nota
-- vinculada no banco e continuando a aparecer como "Sem NF" na tela — o
-- defeito mais confuso possível, já registrado na `20261022`.
--
-- ⚠️ A etapa NÃO muda: o gatilho `carboze_orders_nf_autostage` só age em
-- `gerar_nf`, e este pedido está em `em_transporte`. Puxá-lo de volta seria
-- desfazer o que a logística já fez.

update public.carboze_orders o
   set bling2_nf_id    = n.bling_id,
       nf2_access_key  = n.chave_acesso,
       invoice2_number = n.numero,
       bling_conta     = 2,
       updated_at      = now()
  from public.bling2_nfe n
 where o.order_number = 'V2026090001'
   and n.bling_id     = 26939585336
   and o.bling2_nf_id is null
   -- ⚠️ Nota cancelada não vincula. A situação é lida AGORA, não presumida do
   -- que eu vi às 15h: entre a medição e o `update` cabe um cancelamento.
   and public.bling2_nf_e_valida(n.situacao);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ESPERADO: `invoice2_number = 000939`, `bling_conta = 2`, e a bonificação
--     intacta em 000940. A etapa continua `em_transporte`.
-- select order_number, total, fulfillment_stage, bling_conta,
--        bling2_nf_id, invoice2_number,
--        bling2_nf_bonificacao_id, invoice2_bonificacao_number
-- from public.carboze_orders
-- where order_number = 'V2026090001';

-- (b) ⚠️ Ele SAIU da lista de trabalho? ESPERADO: ZERO linhas.
-- select order_number, veredito, candidata_por_documento
-- from public.carbo_pedido_sem_nota
-- where order_number = 'V2026090001';

-- (c) ⚠️ E o FATURAMENTO muda, porque o pedido ganhou nota válida. Referência
--     de 01/10 ANTES deste bloco: 1.297 pedidos / R$ 930.044,52.
--     ESPERADO: 1.298 / R$ 932.644,52 (+R$ 2.600,00).
--     Se subir mais que isso, outra coisa andou junto — meça com a (d).
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (d) O pedido na métrica, para ver por que ele passou a contar.
-- select order_number, total, conta_metrica, motivo_fora,
--        nf_numero, nf_situacao, nf_valida, e_bonificacao, sem_faturamento
-- from public.carbo_vendas_metrica
-- where order_number = 'V2026090001';

-- (e) A fila, agora com um a menos. ESPERADO: 53 pedidos no total.
-- select veredito, count(*) as pedidos, sum(total) as valor
-- from public.carbo_pedido_sem_nota group by 1 order by 3 desc;
