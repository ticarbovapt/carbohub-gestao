-- ═══════════════════════════════════════════════════════════════════════════
-- A etapa passa a ouvir a transportadora
--
-- ── O que se viu nos dados ────────────────────────────────────────────────
--
-- 11 pedidos parados em "Etiqueta", o mais antigo de 20/06 — 52 dias — todos
-- com `rastreio_envios.entregue_em` preenchido. A transportadora deu baixa, o
-- espelho gravou, e o quadro nunca soube.
--
-- ── A causa ───────────────────────────────────────────────────────────────
--
-- A precedência da etapa olhava SÓ o status da plataforma (`p.avanco`, vindo de
-- `ecommerce_orders`). Quando a Nuvemshop não marca o pedido como enviado ou
-- entregue — e ela nem sempre marca —, ele congela em "Etiqueta" para sempre,
-- ainda que o rastreio prove a entrega.
--
-- Dois dias atrás eu tratei o SINTOMA disso no detalhe do card: quando as duas
-- fontes discordavam, a tela passou a dizer qual manda. Não tratei a CAUSA, que
-- é a etapa ignorar o rastreio. O aviso na tela era honesto e insuficiente.
--
-- ── A regra nova ──────────────────────────────────────────────────────────
--
-- Plataforma OU transportadora — o que chegar primeiro. As duas provam a mesma
-- coisa, e exigir que seja sempre a mesma fonte é o que criou o congelamento.
--
-- ⚠️ Junta-se `rastreio_envios` (tabela) e não `rastreio_card` (view): a view
-- monta um array JSON de eventos por linha, e a esteira não precisa dele para
-- decidir etapa. Custo por consulta importa numa tela que recarrega a cada 10 s.
--
-- ⚠️ O casamento é por igualdade de código, então pedido do Mercado Livre cujo
-- código no Bling esteja no formato `MEL...` e na API no formato de 26
-- caracteres NÃO casa aqui. A tela resolve isso pelo `fonte_id`; esta view não.
-- É limitação conhecida, não esquecimento: o efeito é o pedido continuar no
-- comportamento antigo, nunca uma etapa errada.
--
-- ── ⚠️ O marco zero, e por que ele é MAIOR que esta mudança ───────────────
--
-- Mexer na etapa mexe no que dispara mensagem: `bling2_esteira` alimenta
-- `carbo_msg_fila`. Onze pedidos mudariam de coluna de uma vez, alguns de
-- junho — e com os avisos ligados isso seria "seu pedido foi entregue" para
-- quem recebeu há 50 dias.
--
-- Só que o problema é maior do que os 11. O marco zero da migração 20260873
-- cobriu o que existia NAQUELE dia; desde então ~200 pedidos andaram pelas
-- etapas sem nenhum registro em `carbo_msg_envios`, porque os seis templates
-- estão desligados e a fila nunca os viu. No dia em que alguém ligar "Em
-- trânsito", os 35 pedidos que estiverem nessa etapa recebem de uma vez —
-- inclusive os de 27 dias atrás.
--
-- Então o marco zero aqui cobre TUDO que está na esteira hoje, não só os 11.
-- É a hora certa de fazer isso: com os templates desligados, ninguém perde
-- mensagem nenhuma. Depois de ligados, seria tarde.
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
  -- ── A ETAPA ─────────────────────────────────────────────────────────────
  -- Cancelado primeiro: nada depois dele importa. Depois, para cada estágio,
  -- PLATAFORMA **ou** TRANSPORTADORA — as duas provam o mesmo fato, e exigir
  -- que fosse sempre a mesma fonte foi o que deixou 11 pedidos entregues
  -- parados em "Etiqueta" por até 52 dias.
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
                                        then 'cancelado'
    when p.avanco >= 3 or r.entregue_em is not null
                                        then 'entregue'
    when p.avanco = 2 or r.postado_em is not null
                                        then 'em_transito'
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
-- Tabela, não a view `rastreio_card`: só `postado_em` e `entregue_em` importam
-- aqui, e a view agregaria o histórico inteiro de eventos por linha à toa.
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
where bo.situacao_id in (9, 12);


-- ═══════════════════════════════════════════════════════════════════════════
-- Marco zero — tudo que está na esteira HOJE entra como já avisado
--
-- Não é sobre os 11 que mudam de coluna. É sobre os ~200 que andaram desde a
-- 20260873 sem gerar registro, porque os templates estão desligados e a fila
-- nunca os enxergou. Ligar qualquer aviso amanhã dispararia para todos eles.
--
-- `on conflict do nothing` preserva o que já foi decidido antes.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, e.etapa, 'ignorado',
       'já estava nesta etapa quando o aviso foi ligado', now()
from public.bling2_esteira e
where e.etapa <> 'cancelado'
on conflict (bling_id, etapa) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Os 11 saíram de "Etiqueta". Tem de voltar ZERO.
select e.etapa, count(*)
from public.bling2_esteira e
join public.rastreio_envios r on r.codigo = e.rastreio
where r.entregue_em is not null
  and e.etapa not in ('entregue', 'cancelado')
group by e.etapa;

-- (b) A nova distribuição. "Entregue" sobe, "Etiqueta" desce.
select etapa, count(*) as pedidos, sum(total) as valor
from public.bling2_esteira
where data_pedido > current_date - 60
group by etapa
order by array_position(
  array['confirmado','nf_emitida','etiqueta','em_transito','entregue','cancelado'], etapa);

-- (c) A fila de avisos tem de estar VAZIA depois do marco zero — é isso que
--     garante que ligar um template amanhã não dispare nada retroativo.
select count(*) as na_fila_agora from public.carbo_msg_fila;
