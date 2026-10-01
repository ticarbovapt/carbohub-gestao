-- ═══════════════════════════════════════════════════════════════════════════
-- Nota EM VOO não é nota CANCELADA — e eu colapsei as duas
--
-- Medido em 01/10/2026, na primeira execução da `carbo_nf_sem_pedido`, e o
-- achado estava na PRIMEIRA linha:
--
--   conta 1 · 000475 · R$ 6.900,00 · 01/10/2026 · **Pendente**
--   VONNIX PB LTDA · 49745570000108
--
-- Esse CNPJ é EXATAMENTE o do `V2026090074`. A nota está sendo emitida AGORA —
-- aguardando autorização, não cancelada.
--
-- ⚠️ E a view dizia o contrário em dois lugares ao mesmo tempo:
--   · `carbo_nf_sem_pedido` chamava a nota de `nota_invalida`, junto com 13
--     notas de verdade canceladas;
--   · `carbo_pedido_sem_nota` só junta `and n.valida`, então a nota em voo era
--     INVISÍVEL e o pedido aparecia como "sem nota em lugar nenhum — falta
--     EMITIR". Mandar emitir para quem acabou de emitir é como nasce a segunda
--     nota do mesmo pedido.
--
-- É a ausência disfarçada de resposta, no sabor mais caro: não "não sei", e sim
-- a afirmação ERRADA de que não existe.
--
-- ── A régua já existia, e eu usei só metade dela ─────────────────────────
--
-- A `20260813` tem DUAS listas brancas, e o comentário dela diz exatamente o
-- que eu precisava ter lido:
--
--   carbo_nf_valida     'Emitida DANFE', 'Autorizada', 'Registrada'
--   carbo_nf_invalida   'Cancelada', 'Denegada', 'Rejeitada', 'Bloqueada'
--
--   "'Pendente' e 'Aguardando…' não entram: ainda não são documento válido —
--    mas também não desqualificam, porque são transitórias."
--
-- O que sobra ENTRE as duas listas é a nota em voo. Não precisei inventar regra
-- nenhuma — precisei parar de tratar "não é válida" como "é cancelada".
--
-- ⚠️ E isso NÃO é regra negativa disfarçada: as duas pontas são lista BRANCA
-- explícita, e o balde do meio é o que nenhuma das duas reclamou. Situação nova
-- do Bling cai em `em_voo` e APARECE, em vez de ser silenciosamente classificada
-- — o molde do `carbo_nfse_eventos_tipos`.
--
-- ⚠️ `carbo_nf_invalida` é reusada na conta 2, e isso foi conferido, não
-- suposto: as 13 notas inválidas da filial dizem TODAS `Cancelada`, e as listas
-- de VÁLIDA das duas funções (`carbo_nf_valida` e `bling2_nf_e_valida`) são as
-- mesmas três palavras. O vocabulário é do BLING, não da conta.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR o vocabulário. Rode UMA DE CADA VEZ.                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Antes de confiar em duas listas brancas, veja o que o banco realmente
-- tem. Situação que não cair em nenhuma das duas vira `em_voo` — e se
-- aparecer aqui algo que claramente NÃO é transitório, a lista precisa crescer.
-- select 1 as conta, situacao, count(*) as notas
-- from public.bling_nfe group by 1, 2
-- union all
-- select 2, situacao, count(*)
-- from public.bling2_nfe group by 1, 2
-- order by 1, 3 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a nota ganha TRÊS estados                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `situacao_grupo` vai NO FIM (`42P16` se entrar no meio), e o `veredito`
-- muda de VALOR mantendo a posição: `nota_invalida` vira `nota_cancelada` ou
-- `nota_em_emissao`. Quem filtrar pela string antiga passa a não achar nada —
-- é o risco conhecido de `motivo_fora` como chave de filtro, e por isso o grupo
-- existe como COLUNA PRÓPRIA, fora do CASE e imune à ordem.
--
-- ⚠️ `security_invoker = true` REPETIDO: `create or replace view` sem `with`
-- APAGA as reloptions.

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
    public.carbo_nf_valida(nf.situacao)                 as valida,
    public.carbo_nf_invalida(nf.situacao)               as morta
  from public.bling_nfe nf
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
    public.bling2_nf_e_valida(nf.situacao),
    -- ⚠️ Conferido, não suposto: as 13 inválidas da filial dizem TODAS
    -- `Cancelada`, e a lista de VÁLIDA das duas funções é a mesma. O
    -- vocabulário de situação é do Bling, não da conta.
    public.carbo_nf_invalida(nf.situacao)
  from public.bling2_nfe nf
  where not exists (
    select 1 from public.carboze_orders o
    where o.bling2_nf_id = nf.bling_id
       or o.bling2_nf_bonificacao_id = nf.bling_id
  )
),
com_codigo as (
  select nf.*,
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
    -- ⚠️ MORTA primeiro, e só ela some da fila: documento cancelado não vai
    -- ligar a nada. EM VOO é o oposto — é trabalho ACONTECENDO.
    when c.morta                      then 'nota_cancelada'
    when not c.valida                 then 'nota_em_emissao'
    when c.codigo is null             then 'sem_codigo_no_rodape'
    when o.id is null                 then 'codigo_nao_existe_no_sistema'
    when o.bling_nf_id is null and o.bling2_nf_id is null
      and o.bling_nf_bonificacao_id is null and o.bling2_nf_bonificacao_id is null
                                      then 'PEDIDO_ESTA_SEM_NOTA'
    else 'pedido_ja_tem_outra_nota'
  end as veredito,
  -- ── coluna NOVA, no fim ──
  -- ⚠️ COLUNA PRÓPRIA e não o `veredito`: aquele é um CASE com PRECEDÊNCIA, e
  -- filtrar por string de CASE é o defeito já pago do `motivo_fora`.
  case when c.morta then 'cancelada'
       when c.valida then 'valida'
       else 'em_voo' end                          as situacao_grupo
from com_codigo c
left join public.carboze_orders o on o.order_number = c.codigo;

comment on view public.carbo_nf_sem_pedido is
  'Nota das DUAS contas Bling que nao esta vinculada a nenhum pedido do sistema, com o veredito do porque. situacao_grupo tem TRES valores (valida / cancelada / em_voo) porque "Pendente" NAO e "Cancelada": uma esta sendo emitida agora e a outra morreu, e colapsa-las fez a view dizer "falta EMITIR" para um pedido cuja nota estava em voo — o jeito de nascer a segunda nota do mesmo pedido. As duas pontas sao lista BRANCA (carbo_nf_valida e carbo_nf_invalida); o balde do meio e o que nenhuma reclamou, entao situacao NOVA do Bling aparece em vez de ser classificada em silencio. ATENCAO: a maioria das notas e de venda ON-LINE e nunca teve pedido nosso — por isso o veredito e dirigido pelo CODIGO DO RODAPE e nao pela ausencia de vinculo. O vinculo e conferido POR CONTA: as duas numeram do zero.';

grant select on public.carbo_nf_sem_pedido to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o pedido ENXERGA a nota em voo                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Este é o bloco que importa. Sem ele o `V2026090074` continua dizendo
-- "falta EMITIR" com a nota R$ 6.900 sendo autorizada no mesmo minuto.
--
-- ⚠️ `EM EMISSAO` entra ACIMA de `VINCULAR` no CASE? NÃO — e a ordem é a regra:
-- se existe nota AUTORIZADA citando o pedido, é ELA que se vincula; a em voo é
-- a segunda melhor notícia. Inverter faria uma nota pendente esconder uma nota
-- pronta esperando um clique.

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
-- ⚠️ A nota EM VOO, pelo documento. Ela ainda não tem código no rodapé — o
-- Bling preenche as informações complementares na autorização —, então casar
-- por código aqui nunca acharia nada. Documento é CANDIDATO, e aqui isso basta:
-- o que esta coluna faz é IMPEDIR que a view mande emitir de novo.
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
por_documento as (
  select p.id as pedido_id,
         count(*)                          as quantas,
         min(n.conta)                      as conta,
         min(n.numero)                     as numero,
         min(n.valor_total)                as valor
  from pedidos p
  join public.carbo_nf_sem_pedido n
    on n.contato_doc = p.doc
   and n.situacao_grupo = 'valida'
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
  coalesce(c.quantas, 0)                     as notas_com_o_codigo,
  case when d.quantas = 1 then d.numero end  as candidata_por_documento,
  case when d.quantas = 1 then d.conta  end  as candidata_conta,
  case when d.quantas = 1 then d.valor  end  as candidata_valor,
  coalesce(d.quantas, 0)                     as candidatas_por_documento,
  case
    when c.quantas > 1  then 'AMBIGUO: mais de uma nota cita este pedido'
    when c.quantas = 1  then 'VINCULAR: existe nota com o codigo deste pedido'
    -- ⚠️ ABAIXO de VINCULAR, ACIMA de tudo o mais: nota sendo autorizada não
    -- se vincula ainda, mas também não se pede para emitir de novo.
    when v.quantas >= 1 then 'EM EMISSAO: ha nota sendo autorizada para este CNPJ'
    when d.quantas = 1  then 'conferir: uma nota solta do mesmo documento'
    when d.quantas > 1  then 'conferir: varias notas soltas do mesmo documento'
    else 'sem nota em lugar nenhum — falta EMITIR'
  end as veredito,
  -- ── colunas NOVAS, no fim ──
  v.numero                                   as nota_em_emissao,
  v.conta                                    as nota_em_emissao_conta,
  v.valor                                    as nota_em_emissao_valor
from pedidos p
left join por_codigo    c on c.pedido_id = p.id
left join em_voo        v on v.pedido_id = p.id
left join por_documento d on d.pedido_id = p.id;

comment on view public.carbo_pedido_sem_nota is
  'Pedido NASCIDO AQUI (order_number no formato V0000000000 ou PED-0000-00000), nao orcamento, nao cancelado, sem NF em nenhuma das duas contas, com o que existe de nota solta que poderia ser dele. EM EMISSAO = ha nota do MESMO CNPJ aguardando autorizacao: ela ainda nao tem codigo no rodape (o Bling preenche as informacoes complementares na autorizacao), e o que esta coluna faz e IMPEDIR que a view mande emitir de novo — foi o que ela fez com o V2026090074, cuja nota de R$ 6.900 estava Pendente no mesmo minuto. A ORDEM do CASE e a regra: VINCULAR vem antes, porque nota ja autorizada citando o pedido vence nota em voo. ATENCAO: pedido BLING-* / BLING2-* fica FORA de proposito — a nota dele mora em bling_orders.nf_bling_id; incluir os dois dava 1.108 linhas. VINCULAR = ha nota cujo RODAPE cita este pedido. conferir = CANDIDATO por documento: exige unicidade e nunca vincula sozinho. Valor nao entra na regua.';

grant select on public.carbo_pedido_sem_nota to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O caso que abriu a migração. ESPERADO: o V2026090074 com veredito
--     "EM EMISSAO" e `nota_em_emissao = 000475`; o V2026090075 continua
--     "falta EMITIR", porque o CNPJ dele é outro e não há nota nenhuma.
-- select order_number, customer_name, total, veredito,
--        nota_em_emissao, nota_em_emissao_conta, nota_em_emissao_valor
-- from public.carbo_pedido_sem_nota
-- where order_number in ('V2026090074', 'V2026090075');

-- (b) As notas em voo, nas duas contas. Linha aqui é trabalho EM ANDAMENTO —
--     e linha ANTIGA aqui é emissão que travou e ninguém viu.
-- select conta, numero, valor_total, data_emissao, situacao,
--        contato_nome, contato_doc, situacao_grupo
-- from public.carbo_nf_sem_pedido
-- where situacao_grupo = 'em_voo'
-- order by data_emissao;

-- (c) O censo por grupo. ESPERADO: `cancelada` com as 13 da filial + nenhuma
--     da matriz; `em_voo` com a 000475.
-- select conta, situacao_grupo, situacao, count(*) as notas
-- from public.carbo_nf_sem_pedido
-- where situacao_grupo <> 'valida'
-- group by 1, 2, 3 order by 1, 4 desc;

-- (d) A fila de pedidos, agora com o EM EMISSAO separado. Referência de
--     01/10/2026, ANTES desta migração: 27 falta EMITIR / R$ 81.060,00 ·
--     12 uma nota solta / R$ 36.760,00 · 15 várias / R$ 31.080,00.
--     ⚠️ O total de pedidos (54) NÃO pode mudar — só a repartição.
-- select veredito, count(*) as pedidos, sum(total) as valor
-- from public.carbo_pedido_sem_nota group by 1 order by 3 desc;

-- (e) A lista inteira, que é o que se abre para trabalhar.
-- select order_number, customer_name, total, dias_esperando, veredito,
--        nota_com_o_codigo, nota_em_emissao, candidata_por_documento,
--        fulfillment_stage, vendedor_name
-- from public.carbo_pedido_sem_nota
-- order by (veredito like 'VINCULAR%') desc,
--          (veredito like 'AMBIGUO%') desc,
--          dias_esperando desc;
