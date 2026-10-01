-- ═══════════════════════════════════════════════════════════════════════════
-- Nota sem pedido, pedido sem nota — as DUAS pontas do mesmo buraco
--
-- Pedido do dono do processo em 01/10/2026: *"verifica as nfs do bling 1 e 2, e
-- os pedidos que estão parados por algum motivo sem andar por não ter nota,
-- verifica se tem nf fora que não está vinculada e travando isso"*.
--
-- Hoje isso só se responde com consulta escrita na hora. Consulta escrita na
-- hora é conhecimento que mora na cabeça de quem a escreveu: no mês que vem
-- alguém refaz o raciocínio, ou não refaz. Então vira VIEW, como o catálogo
-- fiscal.
--
-- ── A armadilha que define o desenho ─────────────────────────────────────
--
-- ⚠️ "Nota não ligada a `carboze_orders`" NÃO é "nota órfã". A esmagadora
-- maioria das notas das duas contas é de venda ON-LINE, que vive em
-- `bling_orders`/`bling2_orders` e nunca teve pedido nosso. Listá-las daria
-- MIL linhas e a lista morreria no primeiro dia — a lição já paga do ensaio de
-- estoque: *"lista de trabalho que nunca esvazia é lista que ninguém abre"*.
--
-- O que separa é o RODAPÉ. Nota emitida PELO NOSSO SISTEMA carrega o código do
-- pedido (`V2026090081`); nota de marketplace ou digitada no painel, não. Então
-- o veredito é dirigido pelo CÓDIGO, e não pela ausência de vínculo.
--
-- ⚠️ E o regex é o MESMO de `carbo_vincula_nf_filial` e do `matchNFesToOrders`
-- do `bling-sync`. Um terceiro regex para o mesmo formato seria mais uma cópia
-- de cadastro — e divergir aqui produziria um relatório que discorda do que o
-- sistema faz, sem dar erro.
--
-- ⚠️ O vínculo é conferido POR CONTA. As duas contas numeram do zero, então
-- comparar `bling2_nfe.bling_id` com `carboze_orders.bling_nf_id` casaria a
-- nota de uma empresa com o pedido da outra. É o mesmo cuidado do namespace
-- `BLING2-` e do `abs()` negativo da esteira.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — PERGUNTE AO BANCO quais colunas existem                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `bling_nfe` nasceu na `20260529000003` com DUAS colunas (`id`, `bling_id`)
-- e tudo o mais foi acrescentado fora de migração — o repositório NÃO descreve
-- aquela tabela. É a lição do `pg_get_constraintdef`: pergunte ao banco, não à
-- migração de nascimento.
--
-- A view abaixo usa só colunas provadas em produção hoje, e tira o contato do
-- `raw_data` na conta 1. ⚠️ Caminho jsonb inexistente devolve NULL e não dá
-- erro, então a view sobe de qualquer jeito — o que esta consulta responde é se
-- a coluna de contato aparece preenchida ou vazia.
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name in ('bling_nfe', 'bling2_nfe')
-- order by table_name, ordinal_position;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a NOTA que não achou pedido                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.carbo_nf_sem_pedido
with (security_invoker = true) as
with nf as (
  select
    1                                                   as conta,
    nf.bling_id, nf.numero, nf.valor_total, nf.data_emissao, nf.situacao,
    nf.informacoes_adicionais                           as rodape,
    nf.raw_data -> 'naturezaOperacao' ->> 'id'          as natureza,
    nf.raw_data -> 'contato' ->> 'nome'                 as contato_nome,
    regexp_replace(coalesce(nf.raw_data -> 'contato' ->> 'numeroDocumento', ''), '\D', '', 'g') as contato_doc,
    public.carbo_nf_valida(nf.situacao)                 as valida
  from public.bling_nfe nf
  -- ⚠️ POR CONTA. Comparar com `bling2_nf_id` aqui ligaria id da conta 1 a
  -- coluna da conta 2 — as duas numeram do zero.
  where not exists (
    select 1 from public.carboze_orders o
    where o.bling_nf_id = nf.bling_id
       or o.bling_nf_bonificacao_id = nf.bling_id
  )
  union all
  select
    2,
    nf.bling_id, nf.numero, nf.valor_total, nf.data_emissao, nf.situacao,
    nf.informacoes_adicionais,
    nf.natureza_operacao,
    nf.contato_nome,
    regexp_replace(coalesce(nf.contato_cnpj, ''), '\D', '', 'g'),
    public.bling2_nf_e_valida(nf.situacao)
  from public.bling2_nfe nf
  where not exists (
    select 1 from public.carboze_orders o
    where o.bling2_nf_id = nf.bling_id
       or o.bling2_nf_bonificacao_id = nf.bling_id
  )
),
com_codigo as (
  select nf.*,
    -- ⚠️ MESMO regex de `carbo_vincula_nf_filial` e do `matchNFesToOrders`.
    upper((regexp_match(nf.rodape, '(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})', 'i'))[1]) as codigo
  from nf
)
select
  c.conta, c.bling_id, c.numero, c.valor_total, c.data_emissao,
  c.situacao, c.valida, c.natureza, c.contato_nome, c.contato_doc,
  c.codigo,
  public.carbo_natureza_e_bonificacao(c.natureza) as e_bonificacao,
  o.order_number                                  as pedido,
  o.total                                         as pedido_total,
  o.fulfillment_stage                             as pedido_etapa,
  case
    -- ⚠️ Nota cancelada não é trabalho: ela não vai ligar a nada, e listá-la
    -- encheria a fila com o que já está resolvido.
    when not c.valida                 then 'nota_invalida'
    when c.codigo is null             then 'sem_codigo_no_rodape'
    when o.id is null                 then 'codigo_nao_existe_no_sistema'
    -- ⚠️ ESTE é o veredito que vale dinheiro e tempo: a nota existe, o pedido
    -- existe, e ninguém ligou os dois. É o caso da filial antes da `20261022`.
    when o.bling_nf_id is null and o.bling2_nf_id is null
      and o.bling_nf_bonificacao_id is null and o.bling2_nf_bonificacao_id is null
                                      then 'PEDIDO_ESTA_SEM_NOTA'
    else 'pedido_ja_tem_outra_nota'
  end as veredito
from com_codigo c
left join public.carboze_orders o on o.order_number = c.codigo;

comment on view public.carbo_nf_sem_pedido is
  'Nota das DUAS contas Bling que nao esta vinculada a nenhum pedido do sistema, com o veredito do porque. ATENCAO: a maioria das notas e de venda ON-LINE e nunca teve pedido nosso — por isso o veredito e dirigido pelo CODIGO DO RODAPE (nota emitida pelo nosso sistema carrega V2026090081) e nao pela ausencia de vinculo, que sozinha daria mil linhas e uma lista que ninguem abre. O vinculo e conferido POR CONTA: as duas numeram do zero. Regex identico ao de carbo_vincula_nf_filial.';

grant select on public.carbo_nf_sem_pedido to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o PEDIDO que está sem nota                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A outra ponta. ⚠️ `candidata_*` é CANDIDATO, nunca vínculo: o casamento por
-- documento já mordeu neste projeto (um CPF servia a vários destinatários na
-- conciliação do Melhor Envio, e vínculo errado dispara WhatsApp para o
-- cliente trocado). Por isso:
--   · exige UNICIDADE — duas notas candidatas não elegem nenhuma;
--   · não propõe nada quando a nota já tem código de OUTRO pedido no rodapé;
--   · NÃO existe função que ligue isso sozinho. Quem liga é gente, pelo
--     vínculo manual da tela de Faturamento.
--
-- ⚠️ E valor NÃO entra na régua. Casar por valor + data é lixo medido: ligou
-- `Leandro Teodolino` a `Mauro Nishimoto` e um carrinho PayT a um pedido do ML.
-- O valor aparece na saída para a pessoa CONFERIR, que é outra coisa.

create or replace view public.carbo_pedido_sem_nota
with (security_invoker = true) as
with pedidos as (
  select o.id, o.order_number, o.customer_name, o.total, o.status,
         o.fulfillment_stage, o.bling_conta, o.external_ref,
         o.vendedor_name, o.created_at,
         regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') as doc
  from public.carboze_orders o
  where o.status not in ('quote', 'cancelled')
    and o.bling_nf_id is null
    and o.bling2_nf_id is null
    -- ⚠️ SÓ pedido NASCIDO AQUI, e a régua é o MESMO regex do rodapé.
    --
    -- Medido em 01/10/2026, na primeira execução desta view: **1.108 linhas**,
    -- e a esmagadora maioria era `BLING-*` / `BLING2-*` — pedido IMPORTADO do
    -- Bling pela ponte. A nota deles existe e está certa: mora em
    -- `bling_orders.nf_bling_id`, não em `carboze_orders`. O padrão denunciou
    -- sozinho — `BLING2-2 → 000027`, `BLING2-3 → 000028`, `BLING2-4 → 000029`,
    -- numeração sequencial e valor idêntico ao centavo.
    --
    -- ⚠️ Eu tinha aplicado a lição *"lista que nunca esvazia é lista que
    -- ninguém abre"* ao lado da NOTA (veredito pelo código do rodapé) e NÃO ao
    -- lado do PEDIDO. Metade do cuidado é zero cuidado: a lista nasceu com
    -- 1.108 linhas, ou seja, morta.
    --
    -- A simetria é exata e é por isso que esta é a régua certa: a nota cita o
    -- pedido pelo NÚMERO dele, então pedido cujo número não tem esse formato é
    -- pedido que nota nenhuma consegue citar. Perguntar por ele é perguntar o
    -- que esta view não tem como responder.
    and o.order_number ~ '^(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})$'
),
-- Nota com o código DESTE pedido no rodapé e ainda solta. É o achado forte:
-- aqui não há dúvida nenhuma, o papel nomeia o pedido.
por_codigo as (
  select p.id as pedido_id,
         min(n.conta)   as conta,
         min(n.numero)  as numero,
         count(*)       as quantas
  from pedidos p
  join public.carbo_nf_sem_pedido n on n.codigo = p.order_number and n.valida
  group by p.id
),
-- Nota SEM código, do mesmo documento. É candidato e só: nota emitida direto
-- no painel do Bling não carrega o nosso código, e esse é o caso que o
-- Melhor Envio já ensinou a tratar com unicidade.
por_documento as (
  select p.id as pedido_id,
         count(*)                          as quantas,
         min(n.conta)                      as conta,
         min(n.numero)                     as numero,
         min(n.valor_total)                as valor
  from pedidos p
  join public.carbo_nf_sem_pedido n
    on n.contato_doc = p.doc
   and n.valida
   and n.codigo is null
  where p.doc <> '' and length(p.doc) >= 11
  group by p.id
)
select
  p.order_number, p.customer_name, p.total, p.status, p.fulfillment_stage,
  p.bling_conta, p.external_ref, p.vendedor_name, p.created_at,
  (current_date - p.created_at::date)        as dias_esperando,
  c.numero                                   as nota_com_o_codigo,
  c.conta                                    as nota_com_o_codigo_conta,
  -- ⚠️ `quantas > 1` é AMBIGUIDADE e tem de aparecer como tal. Escolher uma
  -- enterraria a dúvida — a regra da carga de PDV que NÃO insere quando o nome
  -- bate com duas linhas.
  coalesce(c.quantas, 0)                     as notas_com_o_codigo,
  case when d.quantas = 1 then d.numero end  as candidata_por_documento,
  case when d.quantas = 1 then d.conta  end  as candidata_conta,
  case when d.quantas = 1 then d.valor  end  as candidata_valor,
  coalesce(d.quantas, 0)                     as candidatas_por_documento,
  case
    when c.quantas > 1  then 'AMBIGUO: mais de uma nota cita este pedido'
    when c.quantas = 1  then 'VINCULAR: existe nota com o codigo deste pedido'
    when d.quantas = 1  then 'conferir: uma nota solta do mesmo documento'
    when d.quantas > 1  then 'conferir: varias notas soltas do mesmo documento'
    else 'sem nota em lugar nenhum — falta EMITIR'
  end as veredito
from pedidos p
left join por_codigo    c on c.pedido_id = p.id
left join por_documento d on d.pedido_id = p.id;

comment on view public.carbo_pedido_sem_nota is
  'Pedido NASCIDO AQUI (order_number no formato V0000000000 ou PED-0000-00000), nao orcamento, nao cancelado, sem NF em nenhuma das duas contas, com o que existe de nota solta que poderia ser dele. ATENCAO: pedido BLING-* / BLING2-* fica FORA de proposito — ele foi importado do Bling e a nota dele mora em bling_orders.nf_bling_id, nao aqui; incluir os dois dava 1.108 linhas na primeira execucao, uma lista morta no primeiro dia. A regua e o MESMO regex do rodape: a nota cita o pedido pelo numero dele, entao pedido com outro formato e pedido que nota nenhuma consegue citar. VINCULAR = ha nota cujo RODAPE cita este pedido, nao ha duvida. conferir = nota solta do mesmo documento, e CANDIDATO: exige unicidade e nunca vincula sozinho, porque casar por documento ja ligou pedidos de pessoas diferentes neste projeto. Valor nao entra na regua — aparece so para a pessoa conferir.';

grant select on public.carbo_pedido_sem_nota to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A LISTA DE TRABALHO. Linha com veredito VINCULAR é nota pronta
--     esperando um clique no vínculo manual do Faturamento.
-- select order_number, customer_name, total, dias_esperando, veredito,
--        nota_com_o_codigo, nota_com_o_codigo_conta,
--        candidata_por_documento, candidata_conta, candidata_valor,
--        fulfillment_stage, vendedor_name
-- from public.carbo_pedido_sem_nota
-- order by (veredito like 'VINCULAR%') desc,
--          (veredito like 'AMBIGUO%') desc,
--          dias_esperando desc;

-- (b) A contagem por veredito — é ela que diz se a lista é abrível.
-- select veredito, count(*) as pedidos, sum(total) as valor
-- from public.carbo_pedido_sem_nota group by 1 order by 3 desc;

-- (c) ⚠️ O OUTRO LADO: nota com código cujo pedido está sem nota nenhuma.
--     Tem de bater com a (a) — dois números que deveriam fechar.
-- select conta, numero, valor_total, data_emissao, codigo, pedido,
--        pedido_total, pedido_etapa, e_bonificacao, veredito
-- from public.carbo_nf_sem_pedido
-- where veredito = 'PEDIDO_ESTA_SEM_NOTA'
-- order by data_emissao;

-- (d) O censo das notas soltas. ESPERADO: `sem_codigo_no_rodape` dominando —
--     é a venda on-line, e ela NÃO é fila nossa. Se `PEDIDO_ESTA_SEM_NOTA`
--     crescer, o casamento automático parou.
-- select conta, veredito, count(*) as notas, sum(valor_total) as valor
-- from public.carbo_nf_sem_pedido group by 1, 2 order by 1, 3 desc;

-- (e) Os 7 que estavam parados em "Gerar Nota Fiscal", nominalmente.
-- select order_number, customer_name, total, dias_esperando, veredito,
--        nota_com_o_codigo, candidata_por_documento, candidata_valor
-- from public.carbo_pedido_sem_nota
-- where fulfillment_stage = 'gerar_nf'
-- order by dias_esperando desc;

-- (f) ⚠️ Os dois da VONNIX, que é a pergunta que abriu isto.
--     ✅ RESPONDIDO em 01/10/2026, e a minha hipótese estava ERRADA: os CNPJs
--     são DIFERENTES (37.193.053/0001-86 e 49.745.570/0001-08). Não é pedido
--     duplicado nem o portão do "mesmo documento, outro nome" — são duas
--     empresas de verdade, e `VONNIX`/`VONIXX` é só grafia. Nenhuma nota existe
--     para nenhum dos dois: ninguém emitiu, e a pausa é comercial.
-- select p.order_number, p.customer_name, o.cnpj, p.total, p.veredito,
--        p.nota_com_o_codigo, p.candidata_por_documento, p.candidata_valor
-- from public.carbo_pedido_sem_nota p
-- join public.carboze_orders o on o.order_number = p.order_number
-- where p.order_number in ('V2026090074', 'V2026090075');

-- (g) ⚠️ A NOTA INVÁLIDA DE R$ 6.900 na matriz — mesmo valor exato dos dois
--     pedidos da VONNIX. Pode ser uma emissão cancelada e refeita, e nesse caso
--     não é fila: é história. Mas igualdade de valor é PISTA, nunca prova —
--     casar por valor já ligou `Leandro Teodolino` a `Mauro Nishimoto` neste
--     projeto. Esta consulta serve para alguém LER o contato e o rodapé, não
--     para o sistema decidir.
-- select conta, numero, valor_total, data_emissao, situacao,
--        contato_nome, contato_doc, codigo, veredito
-- from public.carbo_nf_sem_pedido
-- where not valida
-- order by conta, data_emissao desc;
