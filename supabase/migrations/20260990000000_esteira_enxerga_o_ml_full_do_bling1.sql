-- ═══════════════════════════════════════════════════════════════════════════
-- A Esteira do On-line passa a enxergar o ML Full (Bling 1)
--
-- Decisão do dono do processo em 21/09/2026: *"os pedidos do ML Full do bling 1
-- têm que ser entendidos pela esteira... a única plataforma do online que tem
-- no bling 1 é esse ml full... os outros pedidos não devem ir para esteira,
-- apenas o que é venda do online"*.
--
-- Medido antes de escrever: **14 cards presos na coluna "Pago"**, todos do ML
-- Full, o mais antigo de 14/09 — e ZERO cards dele em qualquer outra etapa. Os
-- outros canais não aparecem em "Pago", ou seja, só o Full não encontra o
-- pedido dele no Bling. Crescendo ~13 por semana.
--
-- A causa: a esteira lê `bling2_esteira`, que parte de `bling2_orders`. O ML
-- Full fatura no Bling **1** — confirmado por IDENTIDADE, não semelhança: 12
-- dos 14 `platform_order_number` batem exatamente com `numero_loja` da loja
-- 206270703.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ QUATRO ARMADILHAS MEDIDAS, E CADA UMA MUDOU O DESENHO
--
-- 1. **`situacao_id in (9, 12)` esconderia TODOS os 19.** No Bling 1 eles estão
--    em `situacao_id = 15` ("Em andamento", conforme o `mapBlingStatus` do
--    `bling-sync`), nunca em 9. Id de situação é cadastro de CADA conta —
--    presumir que 9 é Atendido nas duas é a mesma suposição que já custou caro
--    com `bling_id` de produto e de contato. Este ramo NÃO filtra por situação.
--
-- 2. ⚠️ **`carbo_pedido_codigo` e `melhorenvio_envio_vigente` casam por
--    `bling_id`, e as duas contas numeram do zero.** Juntar aqui traria código
--    de rastreio do pedido de OUTRA empresa para dentro do card. Este ramo não
--    tem esses joins — os campos saem nulos, e nulo é honesto.
--
-- 3. ⚠️ **`bling_id` é chave de `carbo_msg_envios`** (`bling_id:etapa`), além
--    de ser a chave do card e o `?card=` da URL. Colisão hoje é ZERO (medido),
--    mas as duas contas vão se cruzar — e aí o marcador de "aviso já enviado"
--    de um pedido apareceria no outro. Por isso o Bling 1 entra com o id
--    **NEGATIVO**: reversível (`abs()`), impossível de colidir, e uma consulta
--    que o leve à tabela errada não acha nada em vez de achar o pedido alheio.
--
-- 4. **`bling_orders` não tem `raw_detalhe`.** O `bling-sync` guarda só a
--    listagem ("Use list data only — skip per-order detail fetch to avoid
--    timeout"), então endereço de entrega, transportadora, volumes e peso vêm
--    NULOS. Aceitável: o ML Full despacha pelo Mercado Envios e a etiqueta não
--    é nossa. E o card ANDA mesmo assim, porque quem o move é o CTE
--    `plataforma` (status do `ecommerce_orders`: paid → shipped → delivered),
--    e disso nós temos 12 de 14.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O QUE ESTA MIGRAÇÃO NÃO RESOLVE, E NÃO PODE
--
-- Os pedidos do Full estão em "Em andamento" no Bling 1 e **sem nota fiscal**
-- (medido: 21 pedidos, R$ 3.215,22, `conta_metrica = false`, motivo
-- `aguardando_nf`). A etapa `nf_emitida` simplesmente nunca aparece para eles —
-- o card vai de "Confirmado" direto para "Em trânsito".
--
-- Isso é operação, não código: ou o pedido avança para Atendido no Bling, ou o
-- faturamento precisa aprender a contar o canal sem exigir NF. Decisão do dono
-- do processo, registrada como pendente.
--
-- ⚠️ E a `carbo_msg_fila` lê esta view — acrescentar linha aqui é acrescentar
-- candidato a WhatsApp. Medido: **0 de 14 pedidos do Full têm `cliente_fone`**,
-- e o dono do processo confirmou que "o Mercado Livre nunca manda o telefone".
-- A fila exige telefone não vazio, então eles caem fora sozinhos. O BLOCO 2
-- confere isso DEPOIS de aplicar — zero hoje não é zero amanhã.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view, agora com dois ramos                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `create or replace` exige as MESMAS colunas, nos mesmos nomes, tipos e
-- ORDEM. O primeiro ramo é cópia literal do que está em produção (lido por
-- `pg_get_viewdef`, não do repositório — a produção não é o repositório). O
-- segundo espelha essa lista coluna a coluna, com `null::tipo` onde o Bling 1
-- não tem o dado.

create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  select e.platform_order_number,
         max(case lower(e.status)
               when 'delivered' then 3 when 'shipped' then 2
               when 'paid' then 1 else 0 end)        as avanco,
         max(e.ordered_at)                            as ordered_at,
         max(e.cliente_fone)                          as cliente_fone,
         max(e.cliente_email)                         as cliente_email,
         bool_and(lower(e.status) like 'cancel%'
                  or lower(e.status) = any (array['refunded','voided','estornado']))
                                                      as cancelado_na_loja
    from public.ecommerce_orders e
   where e.platform_order_number is not null
   group by e.platform_order_number
)
-- ── RAMO 1: Bling 2 (filial SP) — intacto ────────────────────────────────
select
  bo.bling_id,
  bo.numero                                           as pedido_numero,
  bo.numero_loja                                      as pedido_loja,
  case when coalesce(bo.numero_loja, '') like 'PAYT!_%' escape '!' then 'PayT'
       else coalesce(nullif(l.nome, ''), 'Canal ' || bo.loja_id::text) end
                                                      as canal,
  bo.loja_id,
  bo.data::date                                       as data_pedido,
  bo.total,
  coalesce(nullif(btrim(c.nome), ''), bo.contato_nome) as cliente,
  c.cpf_cnpj                                          as cliente_doc,
  coalesce(c.telefone, c.celular, p.cliente_fone)     as cliente_fone,
  nullif(trim(both from concat_ws(', ',
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'endereco', ''),
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'numero', ''))), '')
                                                      as entrega_endereco,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'bairro', '')    as entrega_bairro,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'municipio', '') as entrega_cidade,
  upper(left(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'uf', ''), 2)) as entrega_uf,
  nullif(regexp_replace(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'cep', ''),
                        '\D', '', 'g'), '')           as entrega_cep,
  nf.numero                                           as nf_numero,
  nf.chave_acesso                                     as nf_chave,
  nf.situacao                                         as nf_situacao,
  nf.data_emissao                                     as nf_data,
  nf.pdf_url                                          as nf_pdf,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'contato' ->> 'nome', ''), me.transportadora)
                                                      as transportadora,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'servico', ''), me.servico)
                                                      as servico,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''), me.codigo)
                                                      as rastreio,
  ((bo.raw_detalhe -> 'transporte' ->> 'quantidadeVolumes')::numeric)::integer as volumes,
  (bo.raw_detalhe -> 'transporte' ->> 'pesoBruto')::numeric as peso_kg,
  bo.items,
  o.id                                                as carboze_order_id,
  o.order_number                                      as carboze_order_number,
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
      then 'cancelado'
    when p.avanco >= 3 or r.entregue_em is not null or me.entregue_em is not null
      then 'entregue'
    when p.avanco = 2 or r.postado_em is not null or me.postado_em is not null
      then 'em_transito'
    when p.cancelado_na_loja then 'cancelado'
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      or me.situacao = 'gerado'
      then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao) then 'nf_emitida'
    else 'confirmado'
  end                                                 as etapa,
  (p.platform_order_number is not null)               as tem_status_da_plataforma,
  pc.codigo                                           as pedido_codigo,
  case
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      then 'bling'
    when me.codigo is not null then 'melhorenvio'
    when p.platform_order_number is not null and p.avanco >= 2 then 'plataforma'
    else null::text
  end                                                 as rastreio_origem,
  me.situacao                                         as me_situacao,
  me.gerado_em                                        as me_gerado_em,
  me.expirado_em                                      as me_expirado_em,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''), mev.tracking)
                                                      as rastreio_transportadora,
  me.tem_ativo                                        as me_tem_ativo,
  (coalesce(bo.numero_loja, '') like 'PAYT!_%' escape '!'
   or (coalesce(bo.loja_id, 0) <> 0 and not coalesce(l.ignorar, false)))
                                                      as e_online
from public.bling2_orders bo
left join public.bling2_nfe      nf  on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c   on c.bling_id = bo.contato_id
left join public.bling2_lojas    l   on l.bling_id = bo.loja_id
left join public.carboze_orders  o   on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p   on p.platform_order_number = bo.numero_loja
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
left join public.melhorenvio_envio_vigente me on me.bling_id = bo.bling_id
left join public.melhorenvio_envios mev on mev.me_id = me.me_id
where bo.situacao_id = any (array[9::bigint, 12::bigint])
  and (coalesce(bo.numero_loja, '') like 'PAYT!_%' escape '!'
       or (coalesce(bo.loja_id, 0) <> 0 and not coalesce(l.ignorar, false)))

union all

-- ── RAMO 2: Bling 1 (matriz) — SÓ loja marcada como on-line ──────────────
select
  -- ⚠️ NEGATIVO. Ver a armadilha 3 do cabeçalho: `bling_id` é chave de
  -- `carbo_msg_envios`, do card e do `?card=`. `abs()` recupera o original.
  (- b1.bling_id)                                     as bling_id,
  b1.numero                                           as pedido_numero,
  b1.numero_loja                                      as pedido_loja,
  coalesce(nullif(bl.nome, ''), 'Canal ' || coalesce(b1.raw_data -> 'loja' ->> 'id', '?'))
                                                      as canal,
  nullif(b1.raw_data -> 'loja' ->> 'id', '')::bigint  as loja_id,
  b1.data::date                                       as data_pedido,
  b1.total,
  -- Mesmo padrão do ramo do Bling 2: o cadastro vence, o pedido é a reserva.
  -- ⚠️ Eu tinha escrito aqui que `bling_contacts` não tem `nome` — inferi isso
  -- de um `select` do `ecommerce-sync` que simplesmente não o pedia. A tabela
  -- tem. Inferir ausência de uma consulta é o mesmo erro de inferir um CHECK
  -- da migração que criou a tabela: pergunte ao schema.
  coalesce(nullif(btrim(bc.nome), ''), b1.contato_nome) as cliente,
  bc.cpf_cnpj                                         as cliente_doc,
  coalesce(bc.telefone, bc.celular, p.cliente_fone)   as cliente_fone,
  -- Sem `raw_detalhe` na conta 1: o endereço de entrega não existe aqui.
  null::text                                          as entrega_endereco,
  null::text                                          as entrega_bairro,
  null::text                                          as entrega_cidade,
  null::text                                          as entrega_uf,
  null::text                                          as entrega_cep,
  nf1.numero                                          as nf_numero,
  nf1.chave_acesso                                    as nf_chave,
  nf1.situacao                                        as nf_situacao,
  nf1.data_emissao                                    as nf_data,
  nf1.pdf_url                                         as nf_pdf,
  null::text                                          as transportadora,
  null::text                                          as servico,
  null::text                                          as rastreio,
  null::integer                                       as volumes,
  null::numeric                                       as peso_kg,
  b1.items,
  o1.id                                               as carboze_order_id,
  o1.order_number                                     as carboze_order_number,
  case
    -- ⚠️ `carbo_nf_valida` (conta 1), NUNCA `bling2_nf_e_valida`: cada espelho
    -- tem a SUA lista branca de situações, e usar uma para julgar a outra
    -- supõe que o Bling escreve igual nas duas contas.
    when b1.situacao_id = 12 or lower(coalesce(b1.situacao_valor, '')) like '%cancelad%'
      or (nf1.situacao is not null and public.carbo_nf_invalida(nf1.situacao))
      then 'cancelado'
    when p.avanco >= 3 then 'entregue'
    when p.avanco = 2  then 'em_transito'
    when p.cancelado_na_loja then 'cancelado'
    -- Sem etapa `etiqueta`: a etiqueta do Full é do Mercado Envios e não passa
    -- por nós. O card vai de confirmado/nf_emitida direto para em_transito.
    when nf1.id is not null and public.carbo_nf_valida(nf1.situacao) then 'nf_emitida'
    else 'confirmado'
  end                                                 as etapa,
  (p.platform_order_number is not null)               as tem_status_da_plataforma,
  -- ⚠️ NULO, não join: `carbo_pedido_codigo` é chaveado por bling_id e traria
  -- o código de um pedido da OUTRA conta.
  null::text                                          as pedido_codigo,
  case when p.platform_order_number is not null and p.avanco >= 2
       then 'plataforma' else null::text end          as rastreio_origem,
  -- Melhor Envio não alcança a conta 1 (a conciliação parte de bling2_orders),
  -- e o Full nem passa por ele.
  null::text                                          as me_situacao,
  null::timestamptz                                   as me_gerado_em,
  null::timestamptz                                   as me_expirado_em,
  null::text                                          as rastreio_transportadora,
  null::boolean                                       as me_tem_ativo,
  true                                                as e_online
from public.bling_orders b1
join public.bling_lojas bl
  on (b1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
 and bl.bling_id = (b1.raw_data -> 'loja' ->> 'id')::bigint
left join public.bling_contacts bc on bc.bling_id = b1.contato_id
left join public.carboze_orders o1 on o1.external_ref = 'bling-' || b1.bling_id
left join public.bling_nfe nf1     on nf1.order_id = o1.id
left join plataforma p             on p.platform_order_number = b1.numero_loja
-- ⚠️ O CORTE INTEIRO está aqui: `join` (não left) em `bling_lojas` mais
-- `e_online = true`. Venda de balcão (loja 0) e venda da equipe (206071309,
-- 206071288) estão marcadas `false` e ficam de fora, que é a regra permanente
-- da esteira. Loja NOVA sem classificação também fica de fora — o lado seguro.
--
-- ⚠️ E NÃO há filtro de `situacao_id`: no Bling 1 os pedidos do Full estão em
-- 15 ("Em andamento"), e copiar o `in (9,12)` do outro ramo esconderia todos.
where bl.e_online is true
  and not coalesce(bl.ignorar, false);

comment on view public.bling2_esteira is
  'Esteira do On-line: UNIAO do Bling 2 (filial) com o que e ON-LINE no Bling 1 (matriz). O ramo da conta 1 existe porque o ML Full fatura la — confirmado por identidade, 12 de 14 numeros batendo. Tres coisas que NAO se copiam entre os ramos: o filtro situacao_id in (9,12) (na conta 1 o Full esta em 15), os joins por bling_id em carbo_pedido_codigo e melhorenvio (as duas contas numeram do zero e casariam com pedido de outra empresa), e a lista branca de NF (carbo_nf_valida x bling2_nf_e_valida). O bling_id da conta 1 sai NEGATIVO porque ele e chave de carbo_msg_envios e do ?card= — abs() recupera o original.';

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA (o segundo item é o que não pode falhar)        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O ML Full aparece na esteira agora? Esperado: linhas com canal 'ML Full'
--     distribuídas por etapa (provavelmente 'confirmado' e 'em_transito').
select canal, etapa, count(*) as cards, max(data_pedido) as mais_recente
from public.bling2_esteira
where canal = 'ML Full'
group by 1, 2
order by 3 desc;

-- (b) ⚠️ A FILA DE WHATSAPP. Esta view alimenta `carbo_msg_fila`, e acrescentar
--     linha aqui é acrescentar candidato a envio. Medido antes: 0 de 14
--     pedidos do Full com telefone, e o ML nunca manda telefone.
--     ESPERADO: ZERO. Qualquer linha = alguém do ML vai receber WhatsApp, e aí
--     me chame ANTES de continuar.
select count(*) as ml_full_na_fila_de_whatsapp
from public.carbo_msg_fila f
where f.bling_id < 0;

-- (c) Venda de balcão e venda da equipe continuam FORA? Esperado: ZERO.
--     São as lojas 0, 206071309 e 206071288, marcadas e_online = false.
select count(*) as venda_nao_online_vazou
from public.bling2_esteira e
where e.bling_id < 0
  and abs(e.bling_id) in (
    select b1.bling_id from public.bling_orders b1
    join public.bling_lojas bl
      on (b1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
     and bl.bling_id = (b1.raw_data -> 'loja' ->> 'id')::bigint
    where bl.e_online is distinct from true
  );

-- (d) O ramo do Bling 2 não mudou de tamanho? Compare com o que a esteira
--     mostrava antes: entregue 673, em_transito 87, etiqueta 79, cancelado 25,
--     nf_emitida 15, confirmado 1 (medido em 21/09/2026, antes desta migração).
select etapa, count(*) as cards
from public.bling2_esteira
where bling_id > 0
group by 1
order by 2 desc;

-- (e) A view manteve o security_invoker? Esperado: {security_invoker=true}.
--     CREATE VIEW sem WITH apaga as reloptions — foi assim que esta MESMA view
--     vazou a esteira inteira para lojista e licenciado.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (f) A coluna "Pago" esvaziou? Ela vem de `ecommerce_aguardando_bling`, que é
--     outra view — os 14 cards só saem de lá quando o pedido casa no Bling.
--     ⚠️ Esta migração NÃO mexe nela. Se continuarem 14, é esperado: eles agora
--     aparecem TAMBÉM na esteira, e o próximo passo é decidir se saem de "Pago".
select platform, count(*) as ainda_em_pago
from public.ecommerce_aguardando_bling
group by 1;
