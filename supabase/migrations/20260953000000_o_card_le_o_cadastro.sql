-- ═══════════════════════════════════════════════════════════════════════════
-- O nome do card sai do CADASTRO, não da cópia que veio no pedido
--
-- ── O caso ───────────────────────────────────────────────────────────────
--
-- 27/08/2026. Um pedido da Shopee (447, `2608210JRNF666`) que era de "Lucas
-- Padilha Barbosa" passou a exibir "Miramon Amorin De Sousa Amorin De Sousa"
-- no card da esteira. Medido, lado a lado:
--
--   raw_detalhe->contato->nome  = "Lucas Padilha Barbosa"  (doc 12041277432)
--   raw_detalhe->contato->id    = 18342124332
--   bling2_contacts[18342124332].nome = "Lucas Padilha Barbosa"
--   bling2_orders.contato_nome  = "Miramon Amorin De Sousa Amorin De Sousa"  ← só este
--
-- E a etiqueta de entrega do próprio pedido diz "Lucas Padilha Barbosa, Natal".
-- Ou seja: TODAS as fontes concordam, menos a coluna copiada.
--
-- ── Por que a cópia diverge ──────────────────────────────────────────────
--
-- `bling2_orders.contato_nome` tem DOIS escritores:
--
--   upsertPedidoDaLista   ← listagem /pedidos/vendas       roda a cada 1 min
--   order_details         ← detalhe  /pedidos/vendas/{id}  roda a cada 10 min
--
-- Quando os dois discordam, o de 1 minuto reescreve o de 10 e vence sempre. O
-- detalhe corrige, e sessenta segundos depois a listagem desfaz — para sempre,
-- sem erro em lugar nenhum.
--
-- ⚠️ O nome duplicado ("Amorin De Sousa Amorin De Sousa") é a assinatura de um
-- nome montado por concatenação em algum ponto do caminho. Não é o nosso código
-- que monta: nós copiamos `contato.nome` como veio. De onde a listagem tira
-- esse valor continua em aberto — e é por isso que este arquivo NÃO tenta
-- corrigir a coluna. Ele para de DEPENDER dela.
--
-- ── A decisão ────────────────────────────────────────────────────────────
--
-- O card passa a ler `bling2_contacts.nome` pelo `contato_id`, com queda para a
-- cópia. O cadastro é a fonte; a cópia no pedido é um retrato que pode
-- envelhecer ou vir sujo.
--
-- ⚠️ E a queda importa: pedido de marketplace às vezes chega antes do cadastro
-- ser espelhado, e nesses minutos `c.nome` é nulo. Sem o `coalesce`, o card
-- ficaria SEM NOME — trocar um nome errado por nome nenhum não é conserto.
--
-- ⚠️ Só cai para a cópia quando o cadastro não existe. Cadastro existente com
-- nome vazio é dado ruim conhecido, e continuar preferindo-o é o que impede
-- este defeito de voltar por outro caminho.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o tamanho do problema, antes                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⭐ Todo pedido cuja cópia discorda do cadastro. Cada linha é um card
-- mostrando o nome de outra pessoa.

select bo.bling_id, bo.numero, bo.numero_loja, bo.data::date, bo.total,
       bo.contato_id,
       bo.contato_nome                                     as nome_no_pedido,
       c.nome                                              as nome_no_cadastro,
       c.cpf_cnpj,
       bo.raw_detalhe->'contato'->>'nome'                  as nome_no_detalhe,
       bo.raw_data->'contato'->>'nome'                     as nome_na_listagem,
       bo.raw_detalhe->'transporte'->'etiqueta'->>'nome'   as nome_na_etiqueta
from public.bling2_orders bo
join public.bling2_contacts c on c.bling_id = bo.contato_id
where coalesce(btrim(c.nome), '') <> ''
  and coalesce(btrim(bo.contato_nome), '') <> ''
  and lower(btrim(c.nome)) <> lower(btrim(bo.contato_nome))
order by bo.data desc;

-- ⚠️ `nome_na_listagem` é a resposta que falta: se ele trouxer o nome errado, a
-- origem é a listagem do Bling e o conserto seguinte é parar de gravá-la por
-- cima do detalhe. Se vier CERTO, quem sujou foi outra coisa — e aí é uma
-- escrita nossa que ninguém mapeou ainda.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a esteira lê o cadastro                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Só a expressão da coluna `cliente` muda. Nome, tipo, ordem e o resto da
-- view ficam idênticos — `create or replace view` não aceita outra coisa. E o
-- `security_invoker` REPETIDO: republicar sem ele apaga as reloptions e a RLS
-- deixa de valer para lojista e licenciado, que usam a MESMA tabela `profiles`.

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
  -- ⚠️ AQUI. O cadastro manda; a cópia do pedido é a rede de segurança para o
  -- pedido que chegou antes do contato ser espelhado.
  coalesce(nullif(btrim(c.nome), ''), bo.contato_nome) as cliente,
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
  coalesce(nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', ''),
           mev.tracking)                          as rastreio_transportadora,
  me.tem_ativo                                    as me_tem_ativo
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
left join public.melhorenvio_envios mev on mev.me_id = me.me_id
where bo.situacao_id in (9, 12);

grant select on public.bling2_esteira to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ {security_invoker=true}. Nulo = RLS ignorada, e `authenticated`
--     inclui o portal de lojas e o de licenciados.
select relname, reloptions from pg_class where relname = 'bling2_esteira';

-- (b) ⭐ O card do pedido 447 voltou ao dono?
select bling_id, pedido_numero, canal, cliente, cliente_doc, etapa, data_pedido
from public.bling2_esteira
where bling_id in (26663573831, 26713027295, 26651458330);

-- (c) Ninguém ficou sem nome. Tem de vir 0 — se vier maior, algum pedido tem
--     contato espelhado com nome vazio, e aí a queda precisa ser revista.
select count(*) as cards_sem_nome
from public.bling2_esteira
where coalesce(btrim(cliente), '') = '';

-- (d) Quantos cards mudaram de nome com esta migração. É a lista do BLOCO 1,
--     agora resolvida.
select count(*) as cards_corrigidos
from public.bling2_orders bo
join public.bling2_contacts c on c.bling_id = bo.contato_id
where coalesce(btrim(c.nome), '') <> ''
  and coalesce(btrim(bo.contato_nome), '') <> ''
  and lower(btrim(c.nome)) <> lower(btrim(bo.contato_nome));
