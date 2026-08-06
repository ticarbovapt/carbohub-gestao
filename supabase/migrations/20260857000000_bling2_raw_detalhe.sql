-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2: o detalhe do pedido para de ser apagado pela listagem
--
-- ── O que estava acontecendo ──────────────────────────────────────────────
--
-- `bling2_orders.raw_data` tem DOIS escritores:
--   • a fase `order_details` grava o detalhe COMPLETO (GET /pedidos/vendas/{id})
--     — transporte, etiqueta com endereço de entrega, parcelas;
--   • a listagem (`upsertPedidoDaLista`), que roda a cada 30 min, grava o
--     objeto MAGRO da lista — id, data, loja, total, contato, situação.
--
-- A listagem vem depois e sobrescreve. O detalhe é buscado (uma chamada de API
-- por pedido!) e descartado em minutos. Nenhuma linha da tabela tinha `itens`
-- dentro do raw_data, apesar de a fase de detalhe rodar desde sempre.
--
-- O próprio código já sabia desse risco: `items` e `observacoes` são omitidos
-- do upsert da lista justamente para não apagar o que o detalhe preencheu
-- ("foi exatamente esse apagão que deixou 38 pedidos do Bling 1 sem item").
-- O `raw_data` ficou de fora dessa proteção.
--
-- ── O conserto ────────────────────────────────────────────────────────────
--
-- Coluna própria para o detalhe. Cada escritor passa a ter a sua: a lista
-- continua dona de `raw_data`, o detalhe passa a gravar em `raw_detalhe`.
-- Sem condicional, sem ordem de execução para dar errado.
--
-- ⚠️ Esta migração sozinha não preenche nada: ela cria o lugar. O
-- `bling2-sync` precisa ser publicado para começar a gravar (a mudança é de
-- uma linha, na fase de detalhe). Enquanto não for, a coluna fica nula e nada
-- quebra — a ponte já trata ausência.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.bling2_orders
  add column if not exists raw_detalhe jsonb;

comment on column public.bling2_orders.raw_detalhe is
  'Detalhe completo do pedido (GET /pedidos/vendas/{id}): transporte, etiqueta, parcelas. Escrito SÓ pela fase order_details. A listagem grava em raw_data e não toca aqui — antes os dois disputavam raw_data e o detalhe era apagado a cada rodada.';

-- Índice parcial: as consultas que interessam são sempre "quem já tem detalhe".
create index if not exists idx_bling2_orders_com_detalhe
  on public.bling2_orders (bling_id)
  where raw_detalhe is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência (depois do deploy do bling2-sync)
-- ═══════════════════════════════════════════════════════════════════════════

-- Quantos já têm detalhe guardado, e o que ele traz.
select count(*)                                        as pedidos,
       count(raw_detalhe)                              as com_detalhe,
       count(*) filter (where raw_detalhe ? 'transporte') as com_transporte,
       count(*) filter (where raw_detalhe ? 'itens')      as com_itens
from public.bling2_orders;

-- As chaves do detalhe, para decidir o que vale trazer para o pedido.
select key, count(*) as vezes
from public.bling2_orders, jsonb_object_keys(raw_detalhe) key
where raw_detalhe is not null
group by 1 order by 2 desc;
