-- ═══════════════════════════════════════════════════════════════════════════
-- O cliente só recebe um código que ele consegue usar
--
-- ── O que aconteceu ──────────────────────────────────────────────────────
--
-- Pedido CZ2026080177 (bling_id 26610080799) recebeu "Seu pedido está a
-- caminho" com o código `ME262C8GBN8BR`. O cliente respondeu: "Não consigo ver
-- o rastreamento". Ele estava certo — no Melhor Rastreio o pacote "ainda não
-- tem movimentação", e na Jadlog dá "não encontrado".
--
-- O código não estava errado. Ele era o do MELHOR ENVIO (`self_tracking`),
-- porque o da transportadora (`tracking`) ainda não existia:
--
--     gerado_em    16/08          (etiqueta ficou 6 dias parada)
--     postado_em   22/08 13:56    (entregue na agência)
--     tracking     NULL           ← a Jadlog ainda não pegou
--
-- ── ⚠️ Postado no Melhor Envio ≠ coletado pela transportadora ────────────
--
-- São duas coisas, e a esteira tratava como uma. `posted_at` diz que o pacote
-- saiu das nossas mãos; o `tracking` preenchido diz que a transportadora o
-- assumiu e lhe deu um número. Só o segundo é uma promessa que o cliente pode
-- verificar — e "está a caminho" é exatamente essa promessa.
--
-- ── Por que exigir o código da transportadora é seguro ───────────────────
--
-- Medido em produção, sobre todos os envios postados:
--
--     JeT        119 postados, 119 com código da transportadora
--     Jadlog      95 postados,  94 com código  ← o 1 é este caso
--     Correios    93 postados,  93 com código
--     Loggi        4 postados,   4 com código
--
-- 311 de 312. Exigir o código não silencia canal nenhum: ele atrasa UM aviso
-- em trezentos, e esse é justamente o que não deveria ter saído.
--
-- ── O que NÃO muda ───────────────────────────────────────────────────────
--
-- A esteira continua andando: o card vai para "a caminho" como antes, e o
-- `rastreio-sync` continua enxergando o envio pelo código do ME. Quem espera é
-- só a MENSAGEM. O quadro pode mostrar o que sabe; o cliente só recebe o que
-- consegue usar.
--
-- ── ⚠️ E um segundo defeito, da mesma família ────────────────────────────
--
-- O MESMO cliente recebeu dois números para o mesmo pedido:
--
--     "Recebemos seu pedido 536"                    (confirmado, 19:43)
--     "a nota fiscal do seu pedido CZ2026080353"    (nf_emitida, 19:44)
--
-- `pedido` era `coalesce(pedido_codigo, pedido_loja, pedido_numero)`, e o
-- código `CZ…` só é gerado pelo cron de 2 min DEPOIS de o pedido virar
-- Atendido. O `confirmado` saiu antes e pegou o número cru da loja.
--
-- Como a esteira só enxerga pedido Atendido, o código sempre chega — no máximo
-- dois minutos depois. Então exigir o `pedido_codigo` custa esses dois minutos
-- e devolve o que o número existe para dar: UMA identidade, que o cliente pode
-- repetir de volta e a equipe reconhece.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a esteira passa a distinguir os dois códigos                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `rastreio_transportadora` entra no FIM. `create or replace view` aceita
-- acrescentar coluna ao final, nunca renomear nem reordenar — o resto é
-- idêntico à 20260919.

create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  select platform_order_number,
    max(case lower(status)
          when 'delivered' then 3 when 'shipped' then 2 when 'paid' then 1 else 0 end) as avanco,
    max(ordered_at) as ordered_at,
    max(cliente_fone) as cliente_fone,
    max(cliente_email) as cliente_email
  from public.ecommerce_orders
  where platform_order_number is not null
  group by 1
)
select
  bo.bling_id,
  bo.numero                                       as pedido_numero,
  bo.numero_loja                                  as pedido_loja,
  coalesce(nullif(l.nome, ''), 'Canal ' || bo.loja_id::text) as canal,
  bo.loja_id,
  bo.data::date                                   as data_pedido,
  bo.total,
  bo.contato_nome                                 as cliente,
  c.cpf_cnpj                                      as cliente_doc,
  coalesce(c.telefone, c.celular, p.cliente_fone) as cliente_fone,
  nullif(trim(concat_ws(', ',
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'endereco', ''),
    nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'numero', ''))), '') as entrega_endereco,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'bairro', '')    as entrega_bairro,
  nullif(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'municipio', '') as entrega_cidade,
  upper(left(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'uf', ''), 2)) as entrega_uf,
  nullif(regexp_replace(coalesce(bo.raw_detalhe -> 'transporte' -> 'etiqueta' ->> 'cep', ''), '\D', '', 'g'), '') as entrega_cep,
  nf.numero                                       as nf_numero,
  nf.chave_acesso                                 as nf_chave,
  nf.situacao                                     as nf_situacao,
  nf.data_emissao                                 as nf_data,
  nf.pdf_url                                      as nf_pdf,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'contato' ->> 'nome', ''),
           me.transportadora)                     as transportadora,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'servico', ''),
           me.servico)                            as servico,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''),
           me.codigo)                             as rastreio,
  (bo.raw_detalhe -> 'transporte' ->> 'quantidadeVolumes')::numeric::integer as volumes,
  (bo.raw_detalhe -> 'transporte' ->> 'pesoBruto')::numeric                  as peso_kg,
  bo.items,
  o.id                                            as carboze_order_id,
  o.order_number                                  as carboze_order_number,
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
                                        then 'cancelado'
    when p.avanco >= 3 or r.entregue_em is not null
      or me.entregue_em is not null                   then 'entregue'
    when p.avanco = 2  or r.postado_em  is not null
      or me.postado_em is not null                    then 'em_transito'
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      or me.situacao = 'gerado'                       then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao)
                                        then 'nf_emitida'
    else                                     'confirmado'
  end                                             as etapa,
  (p.platform_order_number is not null)           as tem_status_da_plataforma,
  pc.codigo                                       as pedido_codigo,
  case
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      then 'bling'
    when me.codigo is not null then 'melhorenvio'
    when p.platform_order_number is not null and p.avanco >= 2 then 'plataforma'
    else null
  end                                             as rastreio_origem,
  me.situacao                                     as me_situacao,
  me.gerado_em                                    as me_gerado_em,
  me.expirado_em                                  as me_expirado_em,
  -- ── Coluna NOVA, no fim ─────────────────────────────────────────────────
  -- ⚠️ SEM o `self_tracking` no coalesce, e é essa ausência que é a correção.
  -- O código do Melhor Envio identifica o envio para NÓS; o cliente não faz
  -- nada com ele enquanto a transportadora não assumir a encomenda. É por esta
  -- coluna que a MENSAGEM olha; a `rastreio` acima continua com o fallback,
  -- porque a esteira e o `rastreio-sync` precisam enxergar o envio antes disso.
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''),
           mev.tracking)                          as rastreio_transportadora
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
left join public.melhorenvio_envio_vigente me on me.bling_id = bo.bling_id
-- ⚠️ De volta na TABELA para pegar o `tracking` cru. A `melhorenvio_envio_vigente`
-- só expõe o `codigo` já resolvido (com o fallback para o self_tracking), e é
-- justamente a resolução que estamos desfazendo aqui. Juntar pelo `me_id` da
-- vigente garante que é o MESMO envio que ela elegeu — não o mais recente da
-- tabela, que pode ser um cancelado.
--
-- Reescrever a vigente seria o caminho óbvio e não é possível: `create or
-- replace view` não deixa remover coluna, e derrubá-la exigiria CASCADE, que
-- levaria a esteira junto.
left join public.melhorenvio_envios mev on mev.me_id = me.me_id
where bo.situacao_id in (9, 12);

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila carrega a coluna nova                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Só acrescenta ao fim; o resto é idêntico à 20260921.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with cfg as (
  select minutos_1, horas_2, horas_3, valor_minimo, inicio_em
  from public.carbo_carrinho_config where id
),
base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text as link_carrinho, null::text as produtos,
         e.rastreio_transportadora
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text, e.rastreio_transportadora
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text, e.rastreio_transportadora
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'

  union all

  select c.checkout_id, 'carrinho_1', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'aberto'
    and now() >= c.abandonado_em + ((select minutos_1 from cfg) || ' minutes')::interval

  union all

  select c.checkout_id, 'carrinho_2', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg1'
    and now() >= p.msg1_em + ((select horas_2 from cfg) || ' hours')::interval

  union all

  select c.checkout_id, 'carrinho_3', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null, c.link, c.produtos, null::text
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg2'
    and now() >= p.msg2_em + ((select horas_3 from cfg) || ' hours')::interval
)
select
  b.bling_id,
  b.etapa,
  t.titulo,
  t.texto,
  t.atraso_min,
  b.cliente_fone                                   as telefone,
  b.cliente                                        as nome,
  split_part(trim(b.cliente), ' ', 1)              as primeiro_nome,
  coalesce(b.pedido_codigo, b.pedido_loja, b.pedido_numero, '') as pedido,
  b.canal,
  b.total::numeric(12,2)                           as valor,
  b.nf_numero                                      as nf,
  b.nf_pdf                                         as link_nota,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia,
  b.link_carrinho,
  b.produtos,
  case when b.etapa in ('carrinho_1','carrinho_2','carrinho_3','recompra')
       then 1 else 0 end                          as prioridade,
  t.canal_envio,
  t.meta_template_nome,
  t.meta_idioma,
  t.meta_variaveis,
  t.meta_botao_url_de,
  t.meta_status,
  -- Colunas novas, no fim.
  b.rastreio_transportadora,
  -- ⚠️ O código do pedido SEM fallback. A coluna `pedido` acima mantém o
  -- coalesce porque as etapas da Evolution dependem dele; as da Meta passam a
  -- ler daqui, e esperam os dois minutos do cron em vez de mandar o número cru
  -- da loja numa mensagem e o código na seguinte.
  b.pedido_codigo
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id
    and v.etapa = b.etapa
    and v.status <> 'pendente'
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null
  and (t.canal_envio <> 'meta' or t.meta_status = 'APPROVED');

grant select on public.carbo_msg_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — as três mensagens com rastreio passam a exigir o da          ║
-- ║           transportadora                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Corpo E botão apontam para a MESMA coluna. Deixar um em cada seria mandar
-- um código no texto e outro no link — a pior das duas versões de errado.
--
-- Sem `fallback`, a variável é obrigatória: o envio ESPERA. É a mesma máquina
-- que já segurava a mensagem sem código nenhum; agora ela também segura a
-- mensagem com um código que o cliente não consegue usar.

update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"},
    {"nome":"transportadora","de":"transportadora","fallback":"transportadora"},
    {"nome":"rastreio","de":"rastreio_transportadora"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio_transportadora'
where etapa = 'etiqueta';

update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"},
    {"nome":"transportadora","de":"transportadora","fallback":"transportadora"},
    {"nome":"rastreio","de":"rastreio_transportadora"},
    {"nome":"previsao","de":"previsao","fallback":"a confirmar"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio_transportadora'
where etapa = 'em_transito';

update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"},
    {"nome":"rastreio","de":"rastreio_transportadora"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio_transportadora'
where etapa = 'saiu_entrega';


update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"}
  ]'::jsonb
where etapa = 'confirmado';

update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"},
    {"nome":"nf","de":"nf"}
  ]'::jsonb
where etapa = 'nf_emitida';

update public.carbo_msg_templates set
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido_codigo"}
  ]'::jsonb
where etapa = 'entregue';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ QUANTAS mensagens estão sendo seguradas agora por falta do código da
--     transportadora. Cada uma é um cliente que NÃO vai receber um código
--     inútil. Pelo histórico (1 em 312) o número deve ser pequeno; se vier
--     grande, alguma coisa mudou no Melhor Envio e é para me avisar.
select bling_id, etapa, cliente, transportadora, rastreio as codigo_do_me,
       rastreio_transportadora as codigo_da_transportadora
from public.carbo_msg_fila
where canal_envio = 'meta' and meta_botao_url_de = 'rastreio_transportadora'
  and rastreio_transportadora is null;

-- (b) A prova de que o resto continua saindo: quantos têm o código da
--     transportadora e vão normalmente.
select count(*) filter (where rastreio_transportadora is not null) as saem_normalmente,
       count(*) filter (where rastreio_transportadora is null)     as esperam
from public.bling2_esteira
where etapa in ('etiqueta','em_transito') and rastreio is not null;

-- (c) O caso que originou tudo. `codigo_da_transportadora` nulo confirma o
--     diagnóstico; quando a Jadlog atribuir, ele preenche e as próximas
--     mensagens desse pedido saem certas.
select bling_id, etapa, rastreio, rastreio_transportadora, rastreio_origem
from public.bling2_esteira where bling_id = 26610080799;
