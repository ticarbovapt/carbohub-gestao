-- ═══════════════════════════════════════════════════════════════════════════
-- Telefone do cliente: a plataforma como segunda fonte
--
-- ── O que apareceu ────────────────────────────────────────────────────────
--
-- 22 dos 39 pedidos da esteira estavam sem telefone — e todos os recentes.
-- Duas causas distintas:
--
--   18 pedidos (09 e 10/08)  contato ainda não sincronizado
--    5 pedidos (07 e 08/08)  contato sincronizado, sem telefone no Bling
--
-- A primeira é estrutural: `cliente_fone` vem de `bling2_contacts`, e a fase
-- `contacts` roda UMA VEZ POR DIA (08:30, dentro do `bling2-sync-rapido`).
-- Ela pagina o cadastro inteiro, então não dá para simplesmente aumentar a
-- frequência. Cliente novo compra hoje: o pedido entra em 1 minuto e o cadastro
-- dele só no dia seguinte. É a mesma classe do `order_details` — fase diária
-- alimentando um consumidor que virou tempo real.
--
-- A segunda nem sync resolve: o telefone não existe do lado do Bling.
--
-- ── Por que isso é pior que uma coluna vazia na tela ──────────────────────
--
-- A `carbo_msg_fila` exige `cliente_fone is not null`. Pedido sem telefone NÃO
-- ENTRA na fila — e por não entrar, não gera linha em `carbo_msg_envios`. Não
-- fica marcado como erro, nem como ignorado: fica invisível. Quando o cadastro
-- chega no dia seguinte, o pedido já pode ter passado de "Confirmado" e "NF
-- emitida", e essas mensagens nunca são enviadas, sem deixar rastro.
--
-- Com as mensagens ligadas hoje, 56% dos clientes do dia não receberiam nada.
--
-- ── A segunda fonte já estava aqui ────────────────────────────────────────
--
-- `ecommerce_orders.cliente_fone` passou a existir hoje, e a Nuvemshop está
-- 160/160 preenchida. A esteira JÁ cruza com essa tabela — é de lá que vêm os
-- estágios "em trânsito" e "entregue". Só não usava o contato.
--
-- Medido antes de mexer: dos 23 pedidos sem telefone no contato, **16** têm
-- telefone na plataforma. Resolve as duas causas de uma vez, inclusive os 5 em
-- que o dado não existe no Bling e nenhuma frequência de sync ajudaria.
--
-- ⚠️ A ORDEM do coalesce é deliberada: o Bling primeiro. Ele é onde a operação
-- corrige cadastro à mão, e uma correção feita lá tem de ganhar da cópia que
-- veio da loja. A plataforma é rede de segurança, não fonte preferencial.
--
-- ⚠️ Os 7 que sobram são, em boa parte, Mercado Livre — que não expõe telefone
-- do comprador por política. Para esses, a saída é a fase enxuta de contatos
-- (uma chamada por cliente novo, nos moldes do `order_details`), não esta view.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  select
    platform,
    platform_order_number,
    max(case lower(status)
          when 'delivered' then 3
          when 'shipped'   then 2
          when 'paid'      then 1
          else 0
        end)                                     as avanco,
    max(ordered_at)                              as ordered_at,
    -- Contato como a LOJA registrou. Só a Nuvemshop preenche: ML e Amazon
    -- anonimizam o comprador, e por isso este campo não substitui o cadastro
    -- do Bling — completa.
    max(cliente_fone)                            as cliente_fone,
    max(cliente_email)                           as cliente_email
  from public.ecommerce_orders
  where platform_order_number is not null
  group by 1, 2
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
  -- ⚠️ Bling primeiro, plataforma como rede de segurança. Correção de cadastro
  -- feita à mão no Bling tem de ganhar da cópia que veio da loja.
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
  nullif(bo.raw_detalhe -> 'transporte' -> 'contato' ->> 'nome', '')       as transportadora,
  nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'servico', '') as servico,
  nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') as rastreio,
  (bo.raw_detalhe -> 'transporte' ->> 'quantidadeVolumes')::numeric::integer as volumes,
  (bo.raw_detalhe -> 'transporte' ->> 'pesoBruto')::numeric                  as peso_kg,
  bo.items,
  o.id                                            as carboze_order_id,
  o.order_number                                  as carboze_order_number,
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
                                        then 'cancelado'
    when p.avanco >= 3                  then 'entregue'
    when p.avanco = 2                   then 'em_transito'
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
                                        then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao)
                                        then 'nf_emitida'
    else                                     'confirmado'
  end                                             as etapa,
  (p.platform_order_number is not null)           as tem_status_da_plataforma
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
where bo.situacao_id in (9, 12);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Quantos ganharam telefone. `sem_telefone` tem de cair de 22 para ~7.
select count(*) filter (where cliente_fone is null) as sem_telefone,
       count(*)                                     as total
from public.bling2_esteira
where data_pedido > current_date - 3;

-- (b) Quem ainda está sem, e de qual canal — é a lista que a fase enxuta de
--     contatos vai ter de resolver. Espera-se Mercado Livre em boa parte.
select canal, count(*) as sem_telefone
from public.bling2_esteira
where data_pedido > current_date - 5
  and cliente_fone is null
group by 1
order by 2 desc;
