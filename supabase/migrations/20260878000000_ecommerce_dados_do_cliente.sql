-- ═══════════════════════════════════════════════════════════════════════════
-- O telefone do cliente existe na Nuvemshop — a gente é que jogava fora
--
-- ── Como isso apareceu ────────────────────────────────────────────────────
--
-- A pergunta era se dá para avisar o cliente no momento do pagamento, sem
-- esperar o pedido virar "Atendido" no Bling. A primeira consulta disse que
-- não havia telefone em plataforma nenhuma, e eu quase encerrei o assunto como
-- impossível. Estava errado na CAUSA.
--
-- Listando as chaves reais de `ecommerce_orders.raw` (em vez de adivinhar
-- nomes de campo, que é o erro que eu já tinha cometido antes):
--
--   nuvemshop → width, sku, price, quantity, variant_id, barcode, ...
--
-- Isso não é um pedido, é uma LINHA DE PRODUTO. O `mapNuvemshopOrder` faz
-- `products.map(p => ({ ..., raw: p }))` — busca o pedido inteiro na API,
-- usa o que precisa e guarda só o item. Cliente, contato e telefone vinham na
-- resposta e eram descartados na gravação.
--
-- ML e Amazon são caso diferente e definitivo: guardam o pedido inteiro
-- (`buyer`, `BuyerInfo`, `ShippingAddress`) e mesmo assim dão zero telefone em
-- 30 e 6 pedidos. É política das plataformas, não bug nosso.
--
--   plataforma     pedidos   com telefone
--   nuvemshop      43        recuperável (é o que esta migração destrava)
--   mercadolivre   30        0 — o ML não expõe o telefone do comprador
--   amazon          6        0 — comprador anonimizado
--
-- ── Por que coluna, e não engordar o `raw` ────────────────────────────────
--
-- A alternativa seria guardar o pedido inteiro junto de cada linha. Um pedido
-- de 5 itens gravaria o mesmo cliente 5 vezes, e quem fosse ler teria de
-- adivinhar o caminho da chave — exatamente o que acabou de custar caro.
-- Coluna nomeada é procurável, indexável e não mente sobre o que tem dentro.
--
-- ── Guardado como veio ────────────────────────────────────────────────────
--
-- O telefone entra CRU, do jeito que a plataforma mandou. Quem normaliza (só
-- dígitos, com DDI) é o `normalizarFone` do `kanban-n8n`, que já existe e já é
-- o único lugar que decide isso. Duas normalizações são duas regras que
-- divergem no dia em que alguém mexer numa só.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ecommerce_orders
  add column if not exists cliente_nome  text,
  add column if not exists cliente_fone  text,
  add column if not exists cliente_email text;

comment on column public.ecommerce_orders.cliente_nome is
  'Nome do comprador, como a plataforma informou. Só a Nuvemshop preenche — ML e Amazon anonimizam o comprador.';

comment on column public.ecommerce_orders.cliente_fone is
  'Telefone CRU, como veio da plataforma. A normalização (dígitos + DDI) é do kanban-n8n e mora só lá.';

comment on column public.ecommerce_orders.cliente_email is
  'E-mail do comprador. Na Amazon vem anonimizado pelo marketplace quando vem.';

-- Índice parcial: as consultas que importam são sempre "quem tem telefone".
create index if not exists idx_ecommerce_orders_com_fone
  on public.ecommerce_orders (platform, ordered_at desc)
  where cliente_fone is not null;


-- ── Recuperação do que dá para recuperar ──────────────────────────────────
--
-- Pedido de item ÚNICO preserva o pedido inteiro em `raw` (o caminho sem
-- `products` guarda `raw: order`). Nesses o telefone está lá agora mesmo.
--
-- Pedido de vários itens não tem como: o dado foi descartado na gravação e só
-- volta re-sincronizando. Nada aqui é obrigatório — o resto se preenche
-- sozinho conforme o sync repassar os pedidos com o mapeador novo.

update public.ecommerce_orders
set cliente_nome  = coalesce(cliente_nome,  nullif(raw ->> 'contact_name', ''),
                             nullif(raw -> 'customer' ->> 'name', '')),
    cliente_fone  = coalesce(cliente_fone,  nullif(raw ->> 'contact_phone', ''),
                             nullif(raw -> 'customer' ->> 'phone', ''),
                             nullif(raw ->> 'billing_phone', ''),
                             nullif(raw -> 'shipping_address' ->> 'phone', '')),
    cliente_email = coalesce(cliente_email, nullif(raw ->> 'contact_email', ''),
                             nullif(raw -> 'customer' ->> 'email', ''))
where platform = 'nuvemshop'
  and raw ? 'contact_phone';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- Quanto o backfill alcançou. O número baixo é esperado: só pedidos de item
-- único. O que conta é este número SUBIR nos próximos dias, com o mapeador novo.
select platform,
       count(*)                                        as linhas,
       count(cliente_fone)                             as com_telefone,
       count(distinct platform_order_number)           as pedidos
from public.ecommerce_orders
where ordered_at > now() - interval '90 days'
group by 1
order by 1;
