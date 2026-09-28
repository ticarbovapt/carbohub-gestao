-- ═══════════════════════════════════════════════════════════════════════════
-- A esteira do Bling 2 passa a ser DECLARADA · e a PayT casa por CARRINHO
--
-- Dois defeitos achados em 28/09/2026, e eles são o MESMO defeito visto de
-- dois lados: o `WHERE` desta view decide a TELA e a FILA DE WHATSAPP juntas.
--
-- ── 1. Os dois ramos usavam regras OPOSTAS ────────────────────────────────
--
--     RAMO Bling 2 (filial)   loja_id <> 0 and not ignorar    → opt-OUT
--     RAMO Bling 1 (matriz)   bl.e_online is true             → opt-IN
--
-- A `20260983` já tinha matado a inferência `loja ≠ 0 → on-line` no Bling 1,
-- depois do censo que mostrou R$ 441 mil de venda da equipe que seria marcada
-- como on-line. **O ramo do Bling 2 ficou com a regra velha.**
--
-- Medido em 28/09 — todo canal on-line tem `numero_loja` em 100% dos pedidos,
-- porque é o número do pedido NA LOJA:
--
--     206108070 Nuvemshop     803 ped.  803/803 com numero_loja
--     206107776 Mercado Livre 141 ped.  141/141
--     206107792 Amazon         18 ped.   18/18
--     206191275 Shopee         13 ped.   13/13
--     206111424 (SEM CADASTRO)  6 ped.    0/6      R$ 10.508   ← a filial
--     0         Venda direta   10 ped.    4/10     (os 4 são PayT)
--
-- ⚠️ E o custo não era só visual: esses 6 estavam NA FILA DE WHATSAPP, com
-- "Recebemos seu pedido e ele já está em separação" engatilhado para
-- `(19) 3395-4692` e `(11) 3904-9934` — telefone FIXO de comprador PJ.
--
-- ── 2. Cancelamento da PayT nunca chegava ─────────────────────────────────
--
-- O join era `p.platform_order_number = bo.numero_loja`. Na PayT o primeiro é
-- o CARRINHO e o segundo é `PAYT_<seller>_<transacao>` — nunca casam. Está
-- escrito no CLAUDE.md como armadilha de MEDIÇÃO; era também de PRODUÇÃO.
--
-- ⚠️ E a correção NÃO é casar por transação. Medido:
--
--     ZYG6M5M  carrinho DANVBQ8  2 linhas, 2 canceladas  → cancela ✓
--     O96XVN9  carrinho 78NYJK3  1 linha,  1 cancelada   → cancela ✓
--     PK2279K  carrinho 32BXNEP  3 linhas, 2 canceladas  → FICA
--                                2877EQV:paid R$ 119,60 vivo
--
-- Um pedido não deixa de ser o mesmo pedido porque uma transação dele foi
-- cancelada — foi o que travou o `32BXNEP` por 100 h em "Pago". Por isso a
-- ponte leva ao CARRINHO e o veredito continua saindo do `bool_and` da CTE
-- `plataforma`, que já agrega por carrinho.
--
-- ⚠️ RODE EM BLOCOS. E o freio da fila (`'ignorado'` no que estava pendente)
-- tem de ter sido aplicado ANTES: view que move card é view que enche fila.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR antes de escrever                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Quem está na esteira hoje, por loja. Guarde este resultado: é com ele que
-- se confere o BLOCO 3.
select coalesce(e.canal, '(nulo)') as canal, count(*) as cards,
       count(*) filter (where e.cliente_fone is not null
                          and btrim(e.cliente_fone) <> '') as com_telefone
from public.bling2_esteira e
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — `e_online` DECLARADO no Bling 2                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ TRÊS estados, como no `bling_lojas`. `true` entra na esteira; `false` é
-- "olhei, não é"; `null` é "ninguém olhou". Colapsar os dois últimos faria
-- loja nova nascer parecendo decidida — e é a loja nova que precisa aparecer
-- na lista de trabalho.
alter table public.bling2_lojas
  add column if not exists e_online boolean;

comment on column public.bling2_lojas.e_online is
  'A loja e canal ON-LINE? true entra na esteira; false e "olhei, nao e"; null e "ninguem olhou" (e fica FORA — o lado seguro). Nunca inferir por loja_id <> 0: foi assim que a filial B2B entrou na esteira e na fila de WhatsApp.';

-- Semeadura pelo que foi MEDIDO. Nao toca em quem ja tiver valor.
update public.bling2_lojas
   set e_online = true
 where bling_id in (206108070, 206107776, 206107792, 206191275)
   and e_online is distinct from true;

update public.bling2_lojas
   set e_online = false
 where bling_id in (0, 206111424)
   and e_online is distinct from false;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o freio, ANTES de a view mexer em card                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Toda migração que MOVE card grava `'ignorado'` em `carbo_msg_envios`
-- antes de republicar a view. A `20260946` esqueceu e deu sorte porque a
-- população exposta era pequena. A `carbo_msg_fila` não tem data de corte em
-- lugar nenhum.
insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, telefone, enviado_em)
select f.bling_id, f.etapa, 'ignorado',
       'freio da 20261015: view republicada, card nao reavisa',
       f.telefone, now()
from public.carbo_msg_fila f
on conflict do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `create or replace view` SEM `WITH` apaga as reloptions — o
-- `security_invoker = true` é repetido de propósito. Foi assim que esta mesma
-- view virou leitura da logística inteira da Carbo para lojista e licenciado.

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
),
-- ⚠️ A PayT NAO casa por `platform_order_number`: no Bling o `numero_loja` e
-- `PAYT_<seller>_<transacao>` e o `platform_order_number` e o CARRINHO. O join
-- direto nunca casava, entao `cancelado_na_loja` vinha SEMPRE nulo e
-- cancelamento na PayT nao movia card nenhum. Esta CTE faz a ponte
-- transacao -> carrinho, a MESMA regra que a `ecommerce_aguardando_bling` usa.
payt_carrinho as (
  select distinct split_part(e.order_id, '-', 1) as transacao,
         e.platform_order_number                 as carrinho
    from public.ecommerce_orders e
   where e.platform = 'payt'
     and e.platform_order_number is not null
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
   or l.e_online is true)                             as e_online
from public.bling2_orders bo
left join public.bling2_nfe      nf  on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c   on c.bling_id = bo.contato_id
left join public.bling2_lojas    l   on l.bling_id = bo.loja_id
left join public.carboze_orders  o   on o.external_ref = 'bling2-' || bo.bling_id
-- ⚠️ ALIAS `ptc`, NUNCA `pc`: `carbo_pedido_codigo` ja usa `pc` logo abaixo, e
-- dois aliases iguais no mesmo FROM sao `table name "pc" specified more than
-- once` — e, pior, `pc.codigo` passaria a apontar para a tabela errada.
left join payt_carrinho          ptc on coalesce(bo.numero_loja, '') like 'PAYT!_%' escape '!'
                                    and ptc.transacao = split_part(bo.numero_loja, '_', 3)
left join plataforma             p   on p.platform_order_number = coalesce(ptc.carrinho, bo.numero_loja)
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
left join public.melhorenvio_envio_vigente me on me.bling_id = bo.bling_id
left join public.melhorenvio_envios mev on mev.me_id = me.me_id
where bo.situacao_id = any (array[9::bigint, 12::bigint])
  -- ⚠️ DECLARADO, nunca inferido. Era `loja_id <> 0 and not ignorar` — opt-OUT,
  -- entao loja NOVA entrava sozinha. Foi assim que a 206111424 (a filial
  -- faturando B2B, sem cadastro e com `numero_loja` em 0 de 6 pedidos) chegou
  -- a esteira E a fila de WhatsApp, com mensagem de e-commerce para telefone
  -- FIXO de comprador PJ. Agora e opt-IN, igual ao ramo do Bling 1.
  and (coalesce(bo.numero_loja, '') like 'PAYT!_%' escape '!'
       or l.e_online is true)

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
  'Esteira do On-line: UNIAO do Bling 2 (filial) com o que e ON-LINE no Bling 1 (matriz). ⚠️ Os DOIS ramos agora sao DECLARADOS (bling2_lojas.e_online / bling_lojas.e_online) — ate 28/09/2026 o ramo do Bling 2 inferia por loja_id <> 0 e a filial B2B entrava sozinha, na tela E na fila de WhatsApp. ⚠️ A PayT casa por CARRINHO (CTE payt_carrinho): o numero_loja e PAYT_<seller>_<transacao> e o platform_order_number e o carrinho, entao o join direto nunca casava e cancelamento na PayT nao movia card. E o veredito continua vindo do bool_and por carrinho: transacao cancelada dentro de carrinho pago NAO cancela o pedido.';

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência (rode UMA DE CADA VEZ)                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O `security_invoker` sobreviveu? ESPERADO: {security_invoker=true}.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (b) A esteira por canal. ESPERADO: some o `Canal 206111424`; os demais
--     ficam com a MESMA contagem do BLOCO 0.
select coalesce(e.canal, '(nulo)') as canal, count(*) as cards
from public.bling2_esteira e group by 1 order by 2 desc;

-- (c) A PayT. ESPERADO: ZYG6M5M e O96XVN9 em `cancelado`; PK2279K e 78PV8VP
--     seguem vivos — o primeiro tem R$ 119,60 pagos dentro do carrinho.
select pedido_loja, etapa, total, data_pedido
from public.bling2_esteira
where pedido_loja like 'PAYT!_%' escape '!'
order by data_pedido desc;

-- (d) ⚠️ A FILA. ESPERADO: nenhuma linha da filial, e nada anterior a hoje —
--     o BLOCO 2 carimbou tudo. Linha nova aqui e transicao de verdade.
select f.etapa, f.canal, count(*) as na_fila, min(e.data_pedido) as mais_antigo
from public.carbo_msg_fila f
join public.bling2_esteira e on e.bling_id = f.bling_id
group by 1, 2 order by 3 desc;

-- (e) Loja do Bling 2 sem classificacao — a lista de trabalho. Loja NOVA cai
--     aqui e fica FORA da esteira ate alguem decidir.
select bo.loja_id, coalesce(nullif(l.nome, ''), '(sem cadastro)') as loja,
       l.e_online, count(*) as pedidos, sum(bo.total) as total
from public.bling2_orders bo
left join public.bling2_lojas l on l.bling_id = bo.loja_id
where bo.situacao_id = any (array[9::bigint, 12::bigint])
  and l.e_online is null
group by 1, 2, 3 order by 5 desc;
