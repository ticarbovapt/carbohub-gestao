-- ═══════════════════════════════════════════════════════════════════════════
-- Unicidade dos DOIS lados — uma nota só pode ser de UM pedido
--
-- Medido em 01/10/2026, na lista de trabalho recém-publicada:
--
--   M CONSTRUÇÕES   5 pedidos (R$ 17.920)  ->  todos candidata 000107  (R$ 4.480)
--   LUCK RECEPTIVO  5 pedidos (R$ 14.000)  ->  todos candidata 000209  (R$ 28.000)
--   NLAT            1 pedido  (R$ 28.000)  ->  também a 000209
--
-- Onze pedidos, duas notas. ⚠️ Uma nota pertence a UM pedido — oferecer a mesma
-- a cinco é oferecer quatro vínculos errados, e vínculo errado aqui não é
-- cosmético: ele muda faturamento e, na esteira, dispara WhatsApp para o
-- cliente trocado.
--
-- ── O erro é de MÉTODO, e eu já o conhecia ───────────────────────────────
--
-- A trava olhava UM lado só: *"existe exatamente uma nota solta para este
-- documento?"*. Nunca perguntou *"quantos pedidos disputam esta nota?"*.
--
-- É o `count(distinct bling_id) = 1` da porta 4 do Melhor Envio aplicado pela
-- METADE — e foi justamente aquela conta que impediu ligar uma etiqueta de
-- junho a um pedido de agosto de outra pessoa. Eu citei a lição no comentário
-- da view e implementei meia dela.
--
-- ⚠️ E repare no padrão do dia: é a TERCEIRA vez que o mesmo descuido aparece
-- com outra roupa — apliquei o cuidado ao lado da NOTA e não ao do PEDIDO
-- (1.108 linhas), usei `carbo_nf_valida` e não `carbo_nf_invalida` (nota em voo
-- lida como cancelada), e agora unicidade num lado só. **Metade do cuidado é
-- zero cuidado**, porque a metade que falta é exatamente onde o erro mora.
--
-- ── O que isto NÃO faz ───────────────────────────────────────────────────
--
-- Não escolhe. Disputa vira `AMBIGUO` e some do balde de "conferir" — a mesma
-- regra da carga de PDV, que NÃO insere quando o nome bate com duas linhas:
-- escolher uma enterraria a dúvida, e enterrar dúvida é pior que exibi-la.
--
-- ✅ O que SOBREVIVE à trava é o achado de verdade: `V2026090001` (NOVA NB,
-- R$ 2.600, EM TRANSPORTE) com a nota solta **000939** — e a bonificação dele é
-- a **000940**. Consecutivas, mesmo CNPJ, um pedido só disputando. É a nota de
-- venda que faltava, e é ela que o aviso vermelho do Rastreio está pedindo.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR a disputa, antes de mudar a régua                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Quantos pedidos cada nota candidata está atraindo hoje. Linha com
-- `pedidos > 1` é um vínculo que a lista estava sugerindo errado.
-- select n.conta, n.numero, n.valor_total, n.contato_nome,
--        count(distinct p.order_number)                     as pedidos,
--        sum(p.total)                                       as soma_dos_pedidos,
--        string_agg(p.order_number, ', ' order by p.order_number) as quais
-- from public.carbo_pedido_sem_nota p
-- join public.carboze_orders o on o.order_number = p.order_number
-- join public.carbo_nf_sem_pedido n
--   on n.contato_doc = regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
--  and n.situacao_grupo = 'valida'
--  and n.codigo is null
-- group by 1, 2, 3, 4
-- having count(distinct p.order_number) > 1
-- order by pedidos desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a trava passa a olhar os DOIS lados                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Coluna nova (`pedidos_disputando_a_nota`) vai NO FIM — `42P16` se entrar
-- no meio. E `security_invoker = true` REPETIDO: sem o `with`, o
-- `create or replace view` APAGA as reloptions.

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
    and o.order_number ~ '^(V[0-9]{10}|PED-[0-9]{4}-[0-9]{5})$'
),
por_codigo as (
  select p.id as pedido_id,
         min(n.conta)   as conta,
         min(n.numero)  as numero,
         count(*)       as quantas
  from pedidos p
  join public.carbo_nf_sem_pedido n
    on n.codigo = p.order_number and n.situacao_grupo = 'valida'
  group by p.id
),
em_voo as (
  select p.id as pedido_id,
         count(*)        as quantas,
         min(n.conta)    as conta,
         min(n.numero)   as numero,
         min(n.valor_total) as valor
  from pedidos p
  join public.carbo_nf_sem_pedido n
    on n.contato_doc = p.doc and n.situacao_grupo = 'em_voo'
  where p.doc <> '' and length(p.doc) >= 11
  group by p.id
),
-- ── O par (pedido, nota), explodido, para poder contar os DOIS lados ──
cand as (
  select p.id as pedido_id, n.bling_id, n.conta, n.numero, n.valor_total
  from pedidos p
  join public.carbo_nf_sem_pedido n
    on n.contato_doc = p.doc
   and n.situacao_grupo = 'valida'
   and n.codigo is null
  where p.doc <> '' and length(p.doc) >= 11
),
-- ⚠️ O LADO QUE FALTAVA: quantos pedidos disputam CADA nota.
cand_nota as (
  select bling_id, count(distinct pedido_id) as pedidos_na_disputa
  from cand group by bling_id
),
por_documento as (
  select c.pedido_id,
         count(*)                    as quantas,
         min(c.conta)                as conta,
         min(c.numero)               as numero,
         min(c.valor_total)          as valor,
         -- `max`: basta UMA nota disputada para a sugestão deixar de ser única.
         max(cn.pedidos_na_disputa)  as disputa
  from cand c
  join cand_nota cn on cn.bling_id = c.bling_id
  group by c.pedido_id
)
select
  p.order_number, p.customer_name, p.total, p.status, p.fulfillment_stage,
  p.bling_conta, p.external_ref, p.vendedor_name, p.created_at,
  (current_date - p.created_at::date)        as dias_esperando,
  c.numero                                   as nota_com_o_codigo,
  c.conta                                    as nota_com_o_codigo_conta,
  coalesce(c.quantas, 0)                     as notas_com_o_codigo,
  -- ⚠️ A sugestão só SAI do banco quando é única nos DOIS sentidos: uma nota
  -- para este pedido, e um pedido para esta nota. Fora disso o campo é nulo —
  -- sugestão errada que parece certa é pior que sugestão nenhuma.
  case when d.quantas = 1 and d.disputa = 1 then d.numero end as candidata_por_documento,
  case when d.quantas = 1 and d.disputa = 1 then d.conta  end as candidata_conta,
  case when d.quantas = 1 and d.disputa = 1 then d.valor  end as candidata_valor,
  coalesce(d.quantas, 0)                     as candidatas_por_documento,
  case
    when c.quantas > 1  then 'AMBIGUO: mais de uma nota cita este pedido'
    when c.quantas = 1  then 'VINCULAR: existe nota com o codigo deste pedido'
    when v.quantas >= 1 then 'EM EMISSAO: ha nota sendo autorizada para este CNPJ'
    -- ⚠️ A disputa entra ANTES do "conferir": enquanto N pedidos do mesmo CNPJ
    -- olham para a mesma nota, não há o que conferir — há o que DECIDIR, e
    -- quem decide é gente que sabe qual venda aquela nota cobriu.
    when d.disputa > 1  then 'AMBIGUO: a nota solta e disputada por varios pedidos do mesmo CNPJ'
    when d.quantas = 1  then 'conferir: uma nota solta do mesmo documento'
    when d.quantas > 1  then 'conferir: varias notas soltas do mesmo documento'
    else 'sem nota em lugar nenhum — falta EMITIR'
  end as veredito,
  v.numero                                   as nota_em_emissao,
  v.conta                                    as nota_em_emissao_conta,
  v.valor                                    as nota_em_emissao_valor,
  -- ── coluna NOVA, no fim ──
  coalesce(d.disputa, 0)                     as pedidos_disputando_a_nota
from pedidos p
left join por_codigo    c on c.pedido_id = p.id
left join em_voo        v on v.pedido_id = p.id
left join por_documento d on d.pedido_id = p.id;

comment on view public.carbo_pedido_sem_nota is
  'Pedido NASCIDO AQUI (order_number no formato V0000000000 ou PED-0000-00000), nao orcamento, nao cancelado, sem NF em nenhuma das duas contas, com o que existe de nota solta que poderia ser dele. A sugestao por documento exige UNICIDADE DOS DOIS LADOS: uma nota para este pedido E um pedido para esta nota. A segunda metade faltava, e a lista oferecia a NF 000107 (R$ 4.480) a CINCO pedidos da M Construcoes e a NF 000209 (R$ 28.000) a SEIS da Luck/NLAT — onze pedidos, duas notas. Uma nota pertence a UM pedido; oferecer a mesma a cinco e oferecer quatro vinculos errados, e vinculo errado muda faturamento e dispara WhatsApp para o cliente trocado. Disputa vira AMBIGUO e NAO elege nenhuma, pela regra da carga de PDV que nao insere quando o nome bate com duas linhas. EM EMISSAO = ha nota do MESMO CNPJ aguardando autorizacao, e serve para IMPEDIR que a view mande emitir de novo. A ORDEM do CASE e a regra: VINCULAR (codigo no rodape) vence tudo. ATENCAO: pedido BLING-* / BLING2-* fica FORA de proposito — a nota dele mora em bling_orders.nf_bling_id. Valor nao entra na regua.';

grant select on public.carbo_pedido_sem_nota to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O TOTAL NÃO PODE MUDAR: 54 pedidos. Só a repartição muda — os dez
--     da M Construções e da Luck saem de "conferir" e viram AMBIGUO.
-- select veredito, count(*) as pedidos, sum(total) as valor
-- from public.carbo_pedido_sem_nota group by 1 order by 3 desc;

-- (b) ⚠️ O ACHADO QUE SOBREVIVE À TRAVA, e é o que vale abrir hoje:
--     ESPERADO: V2026090001 com `candidata_por_documento = 000939` e
--     `pedidos_disputando_a_nota = 1`. A bonificação dele já é a 000940 —
--     consecutivas, mesmo CNPJ. É a nota de venda que faltava.
-- select order_number, customer_name, total, fulfillment_stage, veredito,
--        candidata_por_documento, candidata_conta, candidata_valor,
--        pedidos_disputando_a_nota
-- from public.carbo_pedido_sem_nota
-- where order_number = 'V2026090001';

-- (c) As sugestões que RESTARAM — únicas nos dois sentidos. É esta lista que
--     vira clique no vínculo manual do Faturamento.
-- select order_number, customer_name, total, dias_esperando,
--        candidata_por_documento, candidata_conta, candidata_valor,
--        fulfillment_stage, vendedor_name
-- from public.carbo_pedido_sem_nota
-- where candidata_por_documento is not null
-- order by dias_esperando desc;

-- (d) As disputas, para quem for decidir. ⚠️ Linha aqui NÃO é defeito: é uma
--     pergunta que só quem fez a venda sabe responder.
-- select order_number, customer_name, total, dias_esperando,
--        pedidos_disputando_a_nota, vendedor_name
-- from public.carbo_pedido_sem_nota
-- where veredito like 'AMBIGUO: a nota solta%'
-- order by customer_name, order_number;

-- (e) ⚠️ E o que NÃO é fila: `V2026080004` está sem `customer_name` (R$ 400,
--     59 dias). Pedido sem cliente não tem documento, então nunca vai casar
--     com nota nenhuma — e não é a lista que resolve isso.
-- select order_number, customer_name, cnpj, total, created_at, vendedor_name
-- from public.carboze_orders
-- where order_number = 'V2026080004';
