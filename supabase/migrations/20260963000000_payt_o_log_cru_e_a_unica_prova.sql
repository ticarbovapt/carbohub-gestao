-- ═══════════════════════════════════════════════════════════════════════════
-- PayT: o log cru é a ÚNICA prova, porque não existe API de leitura
--
-- ── O fato que decide o desenho ──────────────────────────────────────────
--
-- A PayT **não tem endpoint de consulta**. Não há `GET /vendas`, não há OAuth,
-- não há como perguntar "quais pedidos entraram ontem". O modelo é push puro:
-- ela dispara um postback e pronto. O único caminho de escrita é o de
-- logística (devolver rastreio); o resto é export manual de CSV.
--
-- ⚠️ Consequência, e ela não tem volta: **postback perdido é venda que nunca
-- entra, para sempre.** Em todos os outros canais existe uma segunda porta —
-- o `ecommerce-sync` de 5 min relê a plataforma e recupera o que o webhook
-- deixou passar. Aqui não existe segunda porta.
--
-- Por isso o corpo CRU é gravado ANTES de qualquer processamento, e é ele — não
-- `ecommerce_orders` — que vira a fonte da verdade. Se o parser estiver errado,
-- se um campo mudar de nome, se a regra de negócio mudar: reprocessa daqui.
-- `ecommerce_orders` passa a ser uma projeção reconstruível, não um registro
-- insubstituível.
--
-- É o mesmo raciocínio do `bling2_orders.raw_detalhe`, e o oposto do erro que
-- a `20260943` quase cometeu com a Shopee: ler o payload pelos nomes que a
-- DOCUMENTAÇÃO diz, sem guardar o que de fato chegou. Quando o SKU da Shopee
-- voltou vazio, a única coisa que fechou a dúvida ("campo com outro nome" ou
-- "anúncio sem cadastro?") foi o `raw` que por sorte tinha sido guardado.
--
-- ── O que esta migração NÃO faz, de propósito ────────────────────────────
--
-- O pacote de referência trazia um schema `payt` com ONZE tabelas (customers,
-- products, orders, order_items, shipments, carts, subscriptions,
-- subscription_charges, commissions, tracking_outbox). Não entram agora.
--
-- Motivo: nenhuma tela deste sistema leria essas tabelas. A esteira, o estoque,
-- as metas e os painéis todos leem `ecommerce_orders`. Um schema paralelo seria
-- uma segunda verdade sobre a mesma venda — exatamente o que o `bling_nf_id` já
-- custou aqui. Tabela derivada entra quando existir tela que a consuma; e como
-- o cru está guardado, criar depois é reprocessar, não perder.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o log append-only                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.payt_eventos (
  id            bigint generated always as identity primary key,
  recebido_em   timestamptz not null default now(),
  -- ⚠️ A TRAVA de reentrega. A PayT reenvia o mesmo evento, e reenvio é normal,
  -- não erro. O hash do corpo decide: mesmo corpo = mesmo evento.
  body_hash     text not null,
  corpo         jsonb not null,
  -- Desnormalizados do corpo só para dar para FILTRAR sem varrer o jsonb.
  -- A verdade continua sendo `corpo`.
  status        text,
  tipo          text,
  transaction_id text,
  cart_id       text,
  atualizado_em timestamptz,          -- `updated_at` do payload, em Brasília
  eh_teste      boolean not null default false,
  -- O que o processamento fez com ele. Nulo = ainda não processado.
  processado_em timestamptz,
  resultado     text,
  erro          text
);

create unique index if not exists payt_eventos_body_hash on public.payt_eventos (body_hash);
create index if not exists payt_eventos_transacao on public.payt_eventos (transaction_id, atualizado_em);
create index if not exists payt_eventos_pendentes on public.payt_eventos (recebido_em) where processado_em is null;

comment on table public.payt_eventos is
  'Todo postback da PayT, cru, ANTES de processar. ⚠️ É a única prova que existe: a PayT não tem API de consulta, então postback perdido é venda que nunca entra — não há de onde buscar depois. ecommerce_orders é PROJEÇÃO disto e pode ser reconstruída; esta tabela, não. Nunca apague linha daqui.';

comment on column public.payt_eventos.body_hash is
  'SHA-256 do corpo cru. ⚠️ É a trava de idempotência: a PayT reenvia o mesmo evento e reenvio é comportamento normal, não erro.';

comment on column public.payt_eventos.eh_teste is
  'O payload traz `test: true` em venda de homologação. Ela é GRAVADA aqui (o log é de tudo que chegou) e NÃO vira pedido — venda de teste no relatório é número errado que ninguém desconfia.';

alter table public.payt_eventos enable row level security;
drop policy if exists payt_eventos_leitura on public.payt_eventos;
create policy payt_eventos_leitura on public.payt_eventos
  for select to authenticated using (public.carbo_e_time_interno());

-- ⚠️ Sem policy de INSERT/UPDATE/DELETE de propósito: quem grava é a edge
-- function, com service role. Log que o front pode editar não é log.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A tabela existe e as travas estão no lugar.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'payt_eventos' order by indexname;

-- (b) ⭐ O painel de saúde da integração. Enquanto não chegar nada, vem vazio —
--     e vazio DEPOIS de cadastrar o postback significa que ele não está
--     chegando, que é o único jeito de descobrir isso sem API de consulta.
select status, tipo, count(*) as eventos,
       count(*) filter (where eh_teste)                as de_teste,
       count(*) filter (where processado_em is null)   as nao_processados,
       count(*) filter (where erro is not null)        as com_erro,
       max(recebido_em)                                as ultimo
from public.payt_eventos
group by 1, 2 order by 3 desc;

-- (c) ⚠️ O alarme de verdade: evento que chegou e NÃO virou pedido. Sem API de
--     consulta, esta consulta é a única auditoria possível da integração.
select e.recebido_em, e.status, e.tipo, e.transaction_id, e.resultado, e.erro
from public.payt_eventos e
where e.processado_em is not null
  and e.erro is not null
order by e.recebido_em desc
limit 50;
