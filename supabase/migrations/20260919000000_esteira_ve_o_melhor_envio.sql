-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4 — a esteira enxerga o Melhor Envio
--
-- ⚠️ RECONSTITUIÇÃO, como a 20260918. O SQL rodou em produção pelo SQL Editor
-- em 20/08/2026 e ficou fora do repositório.
--
-- ── O buraco que ela fecha ────────────────────────────────────────────────
--
-- Etiqueta comprada DIRETO no painel do Melhor Envio nunca volta para o Bling.
-- O card ficava em "NF emitida" com a encomenda já a caminho — 79 pedidos
-- assim, e a leitura errada ("a operação está parada") era pior que o dado
-- errado.
--
-- O Bling continua vencendo quando tem o dado. O Melhor Envio preenche o
-- SILÊNCIO, que era justamente o buraco.
--
-- ── ⚠️ Uma correção junto: o `security_invoker` ───────────────────────────
--
-- O bloco rodado em produção veio como `create or replace view ... as`, SEM a
-- cláusula `with (security_invoker = true)` que a view tinha desde a
-- 20260863. `CREATE OR REPLACE VIEW` aplica `AT_ReplaceRelOptions`: lista de
-- opções vazia APAGA as opções existentes. A view passou a rodar com os
-- privilégios do dono — RLS das tabelas de baixo ignorada — mantendo o
-- `grant select to authenticated` que já tinha.
--
-- Isso importa porque `profiles` é a MESMA tabela do portal de lojas e do de
-- licenciados: sem o invoker, um lojista logado consegue ler a esteira inteira
-- da Carbo pelo PostgREST — nome, CPF, telefone e endereço de cada cliente.
-- É o mesmo tipo de vazamento que o filtro de interface interna evita no
-- sininho, e ele voltou por um efeito colateral de sintaxe, não por decisão.
--
-- A cláusula está de volta abaixo. Rodar este arquivo conserta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — marco zero, ANTES de mexer na view                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ NÃO PULE. Sem ele, dezenas de pedidos mudam de etapa de uma vez — e no
-- dia em que o template de "etiqueta" for ligado, todos recebem WhatsApp por
-- uma mudança que foi de SISTEMA, não de mundo. Mesma trava da migração
-- original das mensagens e do marco zero do carrinho abandonado.

insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, 'etiqueta', 'ignorado',
       'etapa mudou pela integracao do Melhor Envio, nao por evento novo', now()
from public.bling2_esteira e
where e.etapa = 'nf_emitida'
on conflict (bling_id, etapa) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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
  -- ⚠️ O Melhor Envio ENTRA como fonte, sem tirar o Bling do lugar.
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'contato' ->> 'nome', ''),
           me.transportadora)                     as transportadora,
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'servico', ''),
           me.servico)                            as servico,
  -- ⚠️ E aqui está o efeito colateral BOM: com o código do ME nesta coluna, o
  -- `rastreio-sync` passa a enxergar esses envios sozinho — a fila dele parte
  -- de `esteira where rastreio is not null`. O trajeto vem de graça.
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
      -- ⚠️ `situacao = 'gerado'` e não `gerado_em is not null`: etiqueta vencida
      -- CONTINUA tendo generated_at, e promete um envio que não vai acontecer.
      or me.situacao = 'gerado'                       then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao)
                                        then 'nf_emitida'
    else                                     'confirmado'
  end                                             as etapa,
  (p.platform_order_number is not null)           as tem_status_da_plataforma,
  pc.codigo                                       as pedido_codigo,
  -- ── Colunas NOVAS, todas no fim ─────────────────────────────────────────
  -- De onde veio o rastreio. Existe para ninguém mais interpretar ausência de
  -- informação como ausência de envio — que foi o erro de leitura que fez 79
  -- pedidos parecerem parados.
  case
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
      then 'bling'
    when me.codigo is not null then 'melhorenvio'
    when p.platform_order_number is not null and p.avanco >= 2 then 'plataforma'
    else null
  end                                             as rastreio_origem,
  me.situacao                                     as me_situacao,
  me.gerado_em                                    as me_gerado_em,
  me.expirado_em                                  as me_expirado_em
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
-- ⚠️ O VIGENTE, nunca a tabela crua: etiqueta cancelada e refeita gera me_id
-- novo, e sem isto um envio cancelado poderia mover o card.
left join public.melhorenvio_envio_vigente me on me.bling_id = bo.bling_id
where bo.situacao_id in (9, 12);

-- `create or replace` preserva as permissões, mas repetir é barato e o dia em
-- que alguém precisar de um DROP + CREATE (mudança de nome/ordem de coluna) o
-- grant tem de estar escrito em algum lugar.
grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A opção voltou? Tem de aparecer {security_invoker=true}.
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'bling2_esteira';

-- (b) A distribuição por etapa.
select etapa, count(*) from public.bling2_esteira
where canal = 'Nuvemshop' group by 1 order by 2 desc;

-- (c) A prova de que o buraco fechou: `melhorenvio` com número relevante.
select rastreio_origem, count(*) from public.bling2_esteira
where etapa in ('etiqueta','em_transito','entregue') group by 1 order by 2 desc;

-- (d) O "sem etiqueta" DE VERDADE — NF emitida e nenhuma etiqueta em lugar
--     nenhum. O que sobra aqui é operação, não sistema.
select count(*) as sem_etiqueta_em_lugar_nenhum, sum(total) as valor
from public.bling2_esteira
where etapa = 'nf_emitida' and canal = 'Nuvemshop';
