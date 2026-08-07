-- ═══════════════════════════════════════════════════════════════════════════
-- Esteira do online: uma view, cinco etapas, nenhum card arrastado
--
-- O fluxo real: venda cai na plataforma → Bling emite a NF automaticamente,
-- já com transportadora e rastreio → a LogHouse (fulfillment) embala e entrega
-- à transportadora → o cliente recebe.
--
-- A LogHouse NÃO é fonte de nada aqui, e isso é decisão consciente: é o Bling
-- que fornece transportadora e rastreio para ela, não o contrário. Ela executa.
-- Depender de um sistema sem integração para mover card seria trocar dado que
-- já temos por um que precisaria ser digitado.
--
-- ── As etapas, e quem prova cada uma ──────────────────────────────────────
--
--   confirmado    pedido atendido no Bling 2
--   nf_emitida    nota com situação válida (bling2_nfe)
--   etiqueta      `codigoRastreamento` preenchido — a etiqueta existe
--   em_transito   a PLATAFORMA diz que enviou (ecommerce_orders.status)
--   entregue      a plataforma diz que entregou
--   cancelado     pedido cancelado no Bling, ou nota inválida
--
-- ⚠️ Não existe coluna "empacotado". Estado interno do CD, sem fonte — e não é
-- o que interessa: quem prova que o pacote saiu é a transportadora registrando
-- movimento, não o CD dizendo que embalou.
--
-- ── O vínculo com a plataforma ────────────────────────────────────────────
--
-- `bling2_orders.numero_loja` é o número do pedido NA LOJA:
--   • Mercado Livre → 2000017765716648   (bate com ecommerce_orders.order_id)
--   • Amazon        → 702-1468153-5810605 (idem)
--   • Nuvemshop     → 276                 (o #276 do painel deles)
--
-- Para ML e Amazon o casamento já funciona hoje. Para a Nuvemshop não: o nosso
-- `order_id` guarda o id INTERNO do pedido, não o número da loja. Por isso a
-- coluna `platform_order_number` — preenchida pelo normalizador — e o backfill
-- abaixo, que recupera o que dá do `raw`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. O número do pedido na loja, como coluna ────────────────────────────
alter table public.ecommerce_orders
  add column if not exists platform_order_number text;

comment on column public.ecommerce_orders.platform_order_number is
  'Número do pedido como a LOJA o exibe (#276 na Nuvemshop). Diferente de order_id, que carrega o id interno + a linha do item. É por ele que a esteira casa com bling2_orders.numero_loja.';

create index if not exists idx_ecommerce_orders_platform_number
  on public.ecommerce_orders (platform, platform_order_number)
  where platform_order_number is not null;

-- Backfill do que já dá para recuperar.
--
-- ⚠️ Só alcança parte da Nuvemshop: nos pedidos com mais de um item o
-- normalizador guardou apenas a LINHA do produto em `raw` (`raw: p`), e o
-- número do pedido não está lá. Pedido de item único preserva o pedido inteiro
-- e tem o `number`. O resto se resolve sozinho conforme o sync repassa os
-- pedidos com o normalizador novo — por isso nada aqui é obrigatório.
update public.ecommerce_orders
set platform_order_number = raw ->> 'number'
where platform = 'nuvemshop'
  and platform_order_number is null
  and raw ? 'number';

-- ML e Amazon: o número da loja é a própria raiz do order_id.
update public.ecommerce_orders
set platform_order_number = public.ecommerce_pedido_raiz(platform, order_id)
where platform in ('mercadolivre', 'amazon')
  and platform_order_number is null;


-- ── 1b. ML e Amazon preenchem sozinhos ────────────────────────────────────
--
-- Nessas duas plataformas o número da loja É a raiz do order_id (conferido:
-- 2000017765716648 e 702-1468153-5810605 casam com o numero_loja do Bling).
-- Um gatilho evita ter de repetir esse preenchimento nos dois lugares onde o
-- pedido é mapeado (ecommerce-sync e ecommerce-webhook) — e principalmente
-- evita que um deles seja esquecido, que é como esse tipo de campo morre.
--
-- ⚠️ Nuvemshop fica DE FORA de propósito: lá a raiz do order_id é o id interno,
-- que não bate com nada. Preencher com ele daria um valor não-nulo e errado —
-- o pedido pareceria ligado à plataforma e nunca casaria. Melhor nulo e
-- honesto: a esteira mostra `tem_status_da_plataforma = false`.
create or replace function public.trg_ecommerce_numero_da_loja()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.platform_order_number is null
     and NEW.platform in ('mercadolivre', 'amazon') then
    NEW.platform_order_number := public.ecommerce_pedido_raiz(NEW.platform, NEW.order_id);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_ecommerce_numero_da_loja on public.ecommerce_orders;
create trigger trg_ecommerce_numero_da_loja
  before insert or update of order_id, platform on public.ecommerce_orders
  for each row execute function public.trg_ecommerce_numero_da_loja();


-- ── 2. A esteira ──────────────────────────────────────────────────────────
--
-- Uma linha por pedido do Bling 2, já com etapa calculada e tudo que o card
-- precisa mostrar. A tela não recalcula nada: se a regra mudar, muda aqui.
create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  -- Status do pedido na plataforma. Agrega por pedido (a tabela tem uma linha
  -- por item) e fica com o estágio MAIS AVANÇADO das linhas: um pedido com um
  -- item entregue e outro em trânsito está, para o cliente, em trânsito.
  select
    platform,
    platform_order_number,
    max(case lower(status)
          when 'delivered' then 3
          when 'shipped'   then 2
          when 'paid'      then 1
          else 0
        end)                                     as avanco,
    max(ordered_at)                              as ordered_at
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
  coalesce(c.telefone, c.celular)                 as cliente_fone,
  -- Endereço de ENTREGA (etiqueta), que no marketplace difere do cadastro.
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
  -- Pedido correspondente em carboze_orders, quando já atravessou a ponte.
  o.id                                            as carboze_order_id,
  o.order_number                                  as carboze_order_number,
  -- ── A ETAPA ─────────────────────────────────────────────────────────────
  -- Ordem do CASE = precedência. Cancelado primeiro: nada depois dele importa.
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
  -- A plataforma foi consultada? Distingue "ainda não enviou" de "não sabemos".
  (p.platform_order_number is not null)           as tem_status_da_plataforma
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
where bo.situacao_id in (9, 12);

comment on view public.bling2_esteira is
  'Esteira do e-commerce: um pedido do Bling 2 por linha, com etapa calculada (confirmado → nf_emitida → etiqueta → em_transito → entregue) e os dados do card. Espelho puro: nada aqui é editável, todas as etapas têm fonte externa.';

grant select on public.bling2_esteira to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Como os pedidos se distribuem pela esteira.
select etapa, count(*) as pedidos, sum(total) as valor
from public.bling2_esteira group by 1 order by 2 desc;

-- (b) Quantos já têm status vindo da plataforma — é o que faz as duas últimas
--     colunas andarem. Nuvemshop tende a ficar baixo até o sync repassar os
--     pedidos com o normalizador novo.
select canal,
       count(*)                                          as pedidos,
       count(*) filter (where tem_status_da_plataforma)  as com_status_plataforma,
       count(*) filter (where rastreio is not null)      as com_rastreio
from public.bling2_esteira
where etapa <> 'cancelado'
group by 1 order by 2 desc;

-- (c) O backfill do número da loja, por plataforma.
select platform,
       count(*)                              as linhas,
       count(platform_order_number)          as com_numero_da_loja
from public.ecommerce_orders
group by 1 order by 2 desc;
