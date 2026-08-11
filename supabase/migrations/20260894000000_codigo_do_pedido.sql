-- ═══════════════════════════════════════════════════════════════════════════
-- CZAAAAMMXXXX — o número do pedido que o cliente vê
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- A mensagem dizia "seu pedido 278". Isso é o `numero_loja` da Nuvemshop — um
-- contador cru que não significa nada para quem recebe e ainda entrega o
-- volume da operação para qualquer pessoa que compare dois pedidos.
--
-- ── O formato ─────────────────────────────────────────────────────────────
--
--   CZ 2026 08 0001
--   ─┬ ──┬─ ─┬ ──┬─
--    │   │   │   └── sequência do MÊS, reiniciando em 0001
--    │   │   └────── mês
--    │   └────────── ano
--    └────────────── CarboZé
--
-- Reiniciar por mês não é estética: um contador global revelaria o total de
-- pedidos da empresa no próprio código. Por mês, o número diz "você é o 37º
-- deste mês" — informação inofensiva.
--
-- ── ⚠️ O mês é o do PEDIDO, não o da geração ──────────────────────────────
--
-- O código sai de `bling2_orders.data`. Um pedido de julho que só vira
-- Atendido em agosto recebe código de JULHO — senão o cliente receberia
-- "CZ202608…" para uma compra que ele fez no mês anterior, e a numeração
-- deixaria de bater com qualquer relatório por competência.
--
-- ── ⚠️ Isto NÃO substitui o número do Bling ───────────────────────────────
--
-- Tabela à parte, de propósito. `bling2_orders` é ESPELHO: escrever nele é
-- inventar dado que a próxima rodada do sync sobrescreve. O código vive aqui,
-- ligado por `bling_id`, e o número do Bling continua sendo o do Bling — é por
-- ele que a operação fala com o Bling, e pelo código que a gente fala com o
-- cliente.
--
-- ── Quando é atribuído ────────────────────────────────────────────────────
--
-- Quando o pedido vira ATENDIDO (`situacao_id = 9`), junto do carimbo de
-- entrega, no cron de 2 minutos. Antes disso ele ainda pode ser cancelado sem
-- nunca ter existido para o cliente, e queimar um número nele criaria buraco
-- na sequência.
--
-- Cancelamento DEPOIS não devolve o número: a linha fica. O cliente já viu
-- aquele código, e reaproveitá-lo faria duas compras diferentes terem o mesmo
-- identificador.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_pedido_codigo (
  bling_id  bigint  primary key,
  ano       char(4) not null,
  mes       char(2) not null,
  seq       integer not null,
  codigo    text    not null unique,
  criado_em timestamptz not null default now(),
  -- Duas garantias diferentes: `codigo` único impede repetir o identificador;
  -- (ano, mes, seq) único impede a sequência furar dentro do mês.
  unique (ano, mes, seq)
);

comment on table public.carbo_pedido_codigo is
  'Número do pedido para o CLIENTE (CZAAAAMMXXXX, sequência reiniciando por mês). Tabela à parte porque bling2_orders é espelho — escrever lá seria sobrescrito pelo sync. O mês vem da DATA DO PEDIDO, não da geração.';

alter table public.carbo_pedido_codigo enable row level security;
drop policy if exists carbo_pedido_codigo_read on public.carbo_pedido_codigo;
create policy carbo_pedido_codigo_read on public.carbo_pedido_codigo
  for select to authenticated using (true);


-- ── Quem gera ─────────────────────────────────────────────────────────────

create or replace function public.carbo_gerar_codigos_pedido()
returns integer language plpgsql security definer set search_path = public as $$
declare v_qtd integer := 0;
begin
  -- ⚠️ Lock antes de calcular. Duas execuções simultâneas leriam o mesmo
  -- `max(seq)` e tentariam gravar o mesmo número — uma delas morreria no
  -- índice único, e a rodada inteira falharia por causa de uma corrida de
  -- milissegundos. O lock é de transação: solta sozinho no fim.
  perform pg_advisory_xact_lock(hashtext('carbo_pedido_codigo'));

  with novos as (
    select bo.bling_id,
           to_char(bo.data::date, 'YYYY') as ano,
           to_char(bo.data::date, 'MM')   as mes,
           row_number() over (
             partition by to_char(bo.data::date, 'YYYYMM')
             -- Ordem cronológica dentro do mês: quem comprou antes tem número
             -- menor. Com `bling_id` desempatando, o resultado é estável — a
             -- mesma entrada sempre gera a mesma saída.
             order by bo.data::date, bo.bling_id
           ) as n
    from public.bling2_orders bo
    where bo.situacao_id = 9
      and bo.data is not null
      and not exists (
        select 1 from public.carbo_pedido_codigo c where c.bling_id = bo.bling_id
      )
  ),
  ja_usado as (
    select ano, mes, max(seq) as maior
    from public.carbo_pedido_codigo
    group by ano, mes
  )
  insert into public.carbo_pedido_codigo (bling_id, ano, mes, seq, codigo)
  select n.bling_id, n.ano, n.mes,
         coalesce(u.maior, 0) + n.n,
         'CZ' || n.ano || n.mes || lpad((coalesce(u.maior, 0) + n.n)::text, 4, '0')
  from novos n
  left join ja_usado u on u.ano = n.ano and u.mes = n.mes;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- Preenche o histórico. Idempotente: rodar de novo não muda nada.
select public.carbo_gerar_codigos_pedido() as codigos_gerados;


-- ═══════════════════════════════════════════════════════════════════════════
-- A esteira mostra o código
--
-- Coluna acrescentada no FIM — `create or replace view` aceita colunas novas
-- ao final, nunca renomear ou reordenar as que já existem.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.bling2_esteira
with (security_invoker = true) as
with plataforma as (
  select
    platform, platform_order_number,
    max(case lower(status)
          when 'delivered' then 3 when 'shipped' then 2 when 'paid' then 1 else 0 end) as avanco,
    max(ordered_at) as ordered_at,
    max(cliente_fone) as cliente_fone,
    max(cliente_email) as cliente_email
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
  case
    when bo.situacao_id = 12
      or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
                                        then 'cancelado'
    when p.avanco >= 3 or r.entregue_em is not null   then 'entregue'
    when p.avanco = 2  or r.postado_em  is not null   then 'em_transito'
    when nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '') is not null
                                        then 'etiqueta'
    when nf.id is not null and public.bling2_nf_e_valida(nf.situacao)
                                        then 'nf_emitida'
    else                                     'confirmado'
  end                                             as etapa,
  (p.platform_order_number is not null)           as tem_status_da_plataforma,
  pc.codigo                                       as pedido_codigo
from public.bling2_orders bo
left join public.bling2_nfe      nf on nf.bling_id = bo.nf_bling_id
left join public.bling2_contacts c  on c.bling_id  = bo.contato_id
left join public.bling2_lojas    l  on l.bling_id  = bo.loja_id
left join public.carboze_orders  o  on o.external_ref = 'bling2-' || bo.bling_id
left join plataforma             p  on p.platform_order_number = bo.numero_loja
left join public.rastreio_envios r
       on r.codigo = nullif(bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 ->> 'codigoRastreamento', '')
left join public.carbo_pedido_codigo pc on pc.bling_id = bo.bling_id
where bo.situacao_id in (9, 12);


-- ═══════════════════════════════════════════════════════════════════════════
-- A mensagem passa a usar o código
--
-- ⚠️ `{{pedido}}` deixa de ser o número da loja e vira o código. Os textos NÃO
-- mudam — a variável é a mesma, só o valor melhorou. Quem já escreveu "seu
-- pedido {{pedido}}" não precisa reescrever nada.
--
-- O `coalesce` mantém o número da loja como reserva: pedido que ainda não
-- ganhou código (a geração roda a cada 2 min) mandaria "seu pedido " seguido de
-- nada — e a regra de apagar linha com variável vazia sumiria com a frase
-- inteira, o que é pior que um número feio.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.transportadora, e.servico,
         e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.transportadora, e.servico,
         e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.transportadora, e.servico,
         e.rastreio, e.entrega_cidade, e.entrega_uf
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'
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
  b.total                                          as valor,
  b.nf_numero                                      as nf,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id and v.etapa = b.etapa
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Como ficou a numeração por mês. `seq` tem de ir de 1 até a quantidade,
--     sem buraco.
select ano, mes, count(*) as pedidos, min(codigo) as primeiro, max(codigo) as ultimo
from public.carbo_pedido_codigo
group by ano, mes
order by ano, mes;

-- (b) Nenhum pedido atendido pode ficar sem código.
select count(*) as atendidos_sem_codigo
from public.bling2_orders bo
where bo.situacao_id = 9
  and not exists (select 1 from public.carbo_pedido_codigo c where c.bling_id = bo.bling_id);

-- (c) Como o cliente vai ver, nos pedidos mais recentes.
select pedido_codigo, pedido_loja, cliente, canal, data_pedido, etapa
from public.bling2_esteira
order by data_pedido desc
limit 10;
