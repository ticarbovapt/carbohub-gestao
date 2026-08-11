-- ═══════════════════════════════════════════════════════════════════════════
-- Em quais hubs cada produto existe
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- O catálogo (`mrp_products`) é global e o saldo é por hub. Consequência: TODO
-- hub lista o catálogo INTEIRO, com zero no que não tem. Um hub que guarda dois
-- produtos aparece com dezenas de linhas zeradas, e a tela deixa de responder
-- "o que tem aqui?" — que é a única pergunta que ela existe para responder.
--
-- ── Por que exceção, e não lista de permissão ─────────────────────────────
--
-- A tabela guarda quem NÃO está, não quem está. Ausência de linha = o produto
-- existe naquele hub.
--
-- A alternativa (uma linha por par produto×hub permitido) obrigaria a
-- preencher tudo de uma vez para nada sumir — e no dia do deploy, com a tabela
-- vazia, TODOS os hubs ficariam vazios ao mesmo tempo. Um estado inicial que
-- esconde o estoque inteiro não é aceitável, mesmo que dure minutos.
--
-- Assim, ligar isto não muda nada: o comportamento de hoje é o padrão, e a
-- curadoria acontece hub a hub, quando alguém tiver tempo.
--
-- ── ⚠️ A regra de segurança que NÃO está aqui ─────────────────────────────
--
-- Esconder produto é decisão de EXIBIÇÃO. Se um produto marcado como ausente
-- tiver saldo diferente de zero naquele hub, ele CONTINUA aparecendo — com
-- aviso. Esconder estoque que existe fisicamente é como um inventário some sem
-- ninguém notar, e nenhuma organização de tela vale isso.
--
-- Essa regra mora na tela (`StockView`), porque é ela que sabe o saldo. Aqui
-- fica a intenção; lá fica a proteção. Se um dia a filtragem descer para o
-- banco, a proteção desce junto.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.mrp_product_hubs (
  product_id   uuid not null references public.mrp_products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id)   on delete cascade,
  -- `false` = não faz parte deste hub. A coluna existe (em vez de a simples
  -- presença da linha significar exclusão) para o histórico sobreviver ao
  -- religar: marcar, desmarcar e marcar de novo não apaga nada.
  ativo        boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (product_id, warehouse_id)
);

comment on table public.mrp_product_hubs is
  'Exceções de catálogo por hub. Ausência de linha = o produto EXISTE no hub (padrão). Linha com ativo=false = não faz parte dele. ⚠️ Produto com saldo <> 0 continua aparecendo mesmo marcado como ausente — esconder estoque real seria pior que a poluição que isto resolve.';

create index if not exists mrp_product_hubs_warehouse_idx
  on public.mrp_product_hubs (warehouse_id) where not ativo;

alter table public.mrp_product_hubs enable row level security;

drop policy if exists mrp_product_hubs_read on public.mrp_product_hubs;
create policy mrp_product_hubs_read on public.mrp_product_hubs
  for select to authenticated using (true);

-- Escrita para quem já administra o catálogo. A leitura é livre para o time
-- porque a tela de estoque precisa dela para desenhar.
drop policy if exists mrp_product_hubs_write on public.mrp_product_hubs;
create policy mrp_product_hubs_write on public.mrp_product_hubs
  for all to authenticated using (true) with check (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) A tabela nasce VAZIA, e é isso que garante que nada mudou de
--     comportamento ao aplicar esta migração.
select count(*) as exclusoes_cadastradas from public.mrp_product_hubs;

-- (b) O tamanho do problema: quantas linhas cada hub mostra hoje e quantas
--     delas têm saldo. A diferença é a poluição que a curadoria vai remover.
select w.code,
       (select count(*) from public.mrp_products where is_active) as produtos_listados,
       count(ws.product_id) filter (where ws.quantity <> 0)       as com_saldo
from public.warehouses w
left join public.warehouse_stock ws on ws.warehouse_id = w.id
where w.is_active
group by w.code
order by w.code;
