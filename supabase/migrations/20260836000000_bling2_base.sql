-- ═══════════════════════════════════════════════════════════════════════════
-- BLING 2 — base própria, paralela e ISOLADA da integração que já existe
--
-- Objetivo: puxar TUDO de uma segunda conta Bling sem cruzar com nada do que
-- já está no ar.
--
-- ── Por que TABELAS SEPARADAS, e não uma coluna `conta` nas tabelas atuais ──
--
-- A alternativa óbvia seria `alter table bling_orders add column conta int`.
-- Ela foi descartada de propósito: com discriminador, TODA consulta que já
-- existe (telas de faturamento, bridge, casamento de NF, dashboards) passaria
-- a precisar de `where conta = 1`. Esquecer UMA delas não dá erro — ela
-- simplesmente começa a somar pedido da outra conta no número do time. É
-- exatamente o modo de falha silenciosa que já mordeu este sistema várias
-- vezes (etapa ausente sumindo card, filtro de interface sem `carbo_ops_app`,
-- duas definições de "faturado"). Tabela separada não tem esse risco: quem
-- não conhece `bling2_*` continua vendo só o que via antes.
--
-- ── O que NÃO existe aqui, de propósito ────────────────────────────────────
--
-- • Nenhuma FK para `carboze_orders`. A `bling_nfe` tem `order_id`; a
--   `bling2_nfe` NÃO tem. Bling 2 é espelho puro — não vira venda no sistema,
--   não entra no faturamento, não casa NF com pedido.
-- • Contas a pagar/receber e pedidos de compra do Bling 1 caem direto em
--   `purchase_payables` / `receivables` / `purchase_orders`, que são tabelas
--   OPERACIONAIS lidas pelo financeiro. As do Bling 2 ficam em espelho
--   próprio (`bling2_contas_*`, `bling2_pedidos_compra`) — senão o fluxo de
--   caixa passaria a misturar as duas empresas sem ninguém pedir.
--
-- Quando (e se) alguma coisa do Bling 2 tiver de alimentar tela existente,
-- isso será um passo explícito e conferido — não um efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. bling2_integration — tokens OAuth da SEGUNDA conta ────────────────
-- App/credenciais próprios no painel do Bling (BLING2_CLIENT_ID/SECRET nas
-- variáveis da edge function). Mesmo esquema de `bling_integration`, com um
-- `apelido` para a tela dizer de qual empresa se trata.
create table if not exists public.bling2_integration (
  id            uuid        not null default gen_random_uuid() primary key,
  apelido       text,
  access_token  text        not null,
  refresh_token text        not null,
  token_type    text        not null default 'Bearer',
  expires_at    timestamptz not null,
  scope         text        default '',
  connected_by  uuid        references auth.users(id),
  is_active     boolean     not null default true,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.bling2_integration is
  'Tokens OAuth da SEGUNDA conta Bling. Independente de bling_integration — desconectar uma não afeta a outra.';

drop trigger if exists update_bling2_integration_updated_at on public.bling2_integration;
create trigger update_bling2_integration_updated_at
  before update on public.bling2_integration
  for each row execute function update_updated_at_column();


-- ── 2. bling2_products ────────────────────────────────────────────────────
create table if not exists public.bling2_products (
  id                uuid    not null default gen_random_uuid() primary key,
  bling_id          bigint  not null unique,
  nome              text    not null default '',
  codigo            text,
  preco             numeric(12,2) default 0,
  tipo              text,
  situacao          text,
  formato           text,
  unidade           text,
  peso_liquido      numeric(10,4),
  peso_bruto        numeric(10,4),
  gtin              text,
  gtin_embalagem    text,
  -- Saldo vem de /estoques, não de /produtos — por isso tem carimbo próprio:
  -- produto sincronizado sem estoque sincronizado é situação normal.
  estoque_atual     numeric(14,4),
  estoque_reservado numeric(14,4),
  estoque_synced_at timestamptz,
  raw_data          jsonb   default '{}',
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists update_bling2_products_updated_at on public.bling2_products;
create trigger update_bling2_products_updated_at
  before update on public.bling2_products
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_products_codigo   on public.bling2_products(codigo);
create index if not exists idx_bling2_products_situacao on public.bling2_products(situacao);
-- syncVariacoes varre só os produtos de formato 'V'.
create index if not exists idx_bling2_products_formato  on public.bling2_products(formato);


-- ── 3. bling2_product_variations ──────────────────────────────────────────
create table if not exists public.bling2_product_variations (
  id                uuid    not null default gen_random_uuid() primary key,
  bling_product_id  bigint  not null,
  bling_variacao_id bigint  not null,
  nome              text,
  codigo            text,
  preco             numeric(12,2),
  estoque_atual     numeric(14,4) default 0,
  raw_data          jsonb   default '{}',
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- O upsert do sync usa exatamente este par como onConflict.
  constraint bling2_product_variations_unique unique (bling_product_id, bling_variacao_id)
);

drop trigger if exists update_bling2_product_variations_updated_at on public.bling2_product_variations;
create trigger update_bling2_product_variations_updated_at
  before update on public.bling2_product_variations
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_variations_produto on public.bling2_product_variations(bling_product_id);


-- ── 4. bling2_contacts ────────────────────────────────────────────────────
create table if not exists public.bling2_contacts (
  id           uuid    not null default gen_random_uuid() primary key,
  bling_id     bigint  not null unique,
  nome         text    not null default '',
  fantasia     text,
  tipo_pessoa  text,
  cpf_cnpj     text,
  ie           text,
  email        text,
  telefone     text,
  celular      text,
  tipo_contato text,
  situacao     text,
  is_supplier  boolean default false,
  is_client    boolean default false,
  raw_data     jsonb   default '{}',
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists update_bling2_contacts_updated_at on public.bling2_contacts;
create trigger update_bling2_contacts_updated_at
  before update on public.bling2_contacts
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_contacts_cpf_cnpj on public.bling2_contacts(cpf_cnpj);
create index if not exists idx_bling2_contacts_tipo     on public.bling2_contacts(is_supplier, is_client);


-- ── 5. bling2_vendedores ──────────────────────────────────────────────────
create table if not exists public.bling2_vendedores (
  id                  uuid   not null default gen_random_uuid() primary key,
  bling_id            bigint not null unique,
  nome                text   not null default '',
  email               text,
  comissao_percentual numeric(6,3),
  situacao            text,
  raw_data            jsonb  default '{}',
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists update_bling2_vendedores_updated_at on public.bling2_vendedores;
create trigger update_bling2_vendedores_updated_at
  before update on public.bling2_vendedores
  for each row execute function update_updated_at_column();


-- ── 6. bling2_orders — pedidos de venda ───────────────────────────────────
create table if not exists public.bling2_orders (
  id             uuid   not null default gen_random_uuid() primary key,
  bling_id       bigint not null unique,
  numero         text,
  numero_loja    text,
  -- `data` é text no Bling 1 (vem 'AAAA-MM-DD' cru da API); mantido igual para
  -- que o mesmo código de sync valha nas duas integrações sem cast.
  data           text,
  data_saida     text,
  data_prevista  text,
  total_produtos numeric(12,2) default 0,
  total_desconto numeric(12,2) default 0,
  total_frete    numeric(12,2) default 0,
  total          numeric(12,2) default 0,
  situacao_id    bigint,
  situacao_valor text,
  contato_id     bigint,
  contato_nome   text,
  vendedor_id    bigint,
  loja_id        bigint,
  observacoes    text,
  items          jsonb,
  raw_data       jsonb  default '{}',
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.bling2_orders is
  'Pedidos de venda da segunda conta Bling. ESPELHO — não alimenta carboze_orders nem entra no faturamento.';

drop trigger if exists update_bling2_orders_updated_at on public.bling2_orders;
create trigger update_bling2_orders_updated_at
  before update on public.bling2_orders
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_orders_numero  on public.bling2_orders(numero);
create index if not exists idx_bling2_orders_data    on public.bling2_orders(data desc);
create index if not exists idx_bling2_orders_contato on public.bling2_orders(contato_id);
-- syncOrderDetails procura exatamente por `items is null`.
create index if not exists idx_bling2_orders_sem_itens on public.bling2_orders(bling_id) where items is null;


-- ── 7. bling2_nfe ─────────────────────────────────────────────────────────
-- SEM `order_id`, SEM `match_status`: aqui a NF não casa com pedido nenhum do
-- sistema. É o ponto onde o Bling 1 cruza com `carboze_orders` e é justamente
-- o que esta integração não deve fazer.
create table if not exists public.bling2_nfe (
  id                     uuid   not null default gen_random_uuid() primary key,
  bling_id               bigint not null unique,
  numero                 text,
  serie                  text,
  chave_acesso           text,
  data_emissao           date,
  contato_nome           text,
  contato_cnpj           text,
  valor_total            numeric(12,2),
  situacao               text,
  informacoes_adicionais text,
  xml_url                text,
  pdf_url                text,
  raw_data               jsonb,
  synced_at              timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.bling2_nfe is
  'NF-e da segunda conta Bling. Sem vínculo com carboze_orders — espelho puro.';

drop trigger if exists update_bling2_nfe_updated_at on public.bling2_nfe;
create trigger update_bling2_nfe_updated_at
  before update on public.bling2_nfe
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_nfe_data     on public.bling2_nfe(data_emissao desc);
create index if not exists idx_bling2_nfe_situacao on public.bling2_nfe(situacao);
-- A reconsulta das NFs que SUMIRAM da listagem (nota cancelada some do /nfe)
-- varre por synced_at.
create index if not exists idx_bling2_nfe_synced   on public.bling2_nfe(synced_at);


-- ── 8. bling2_contas_pagar ────────────────────────────────────────────────
create table if not exists public.bling2_contas_pagar (
  id             uuid   not null default gen_random_uuid() primary key,
  bling_id       bigint not null unique,
  numero         text,
  fornecedor_id  bigint,
  fornecedor     text,
  valor          numeric(14,2) default 0,
  saldo          numeric(14,2),
  vencimento     date,
  data_emissao   date,
  data_pagamento date,
  situacao       text,
  historico      text,
  raw_data       jsonb  default '{}',
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists update_bling2_contas_pagar_updated_at on public.bling2_contas_pagar;
create trigger update_bling2_contas_pagar_updated_at
  before update on public.bling2_contas_pagar
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_pagar_venc on public.bling2_contas_pagar(vencimento);


-- ── 9. bling2_contas_receber ──────────────────────────────────────────────
create table if not exists public.bling2_contas_receber (
  id             uuid   not null default gen_random_uuid() primary key,
  bling_id       bigint not null unique,
  numero         text,
  cliente_id     bigint,
  cliente        text,
  valor          numeric(14,2) default 0,
  saldo          numeric(14,2),
  vencimento     date,
  data_emissao   date,
  data_pagamento date,
  situacao       text,
  historico      text,
  raw_data       jsonb  default '{}',
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists update_bling2_contas_receber_updated_at on public.bling2_contas_receber;
create trigger update_bling2_contas_receber_updated_at
  before update on public.bling2_contas_receber
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_receber_venc on public.bling2_contas_receber(vencimento);


-- ── 10. bling2_pedidos_compra ─────────────────────────────────────────────
create table if not exists public.bling2_pedidos_compra (
  id                  uuid   not null default gen_random_uuid() primary key,
  bling_id            bigint not null unique,
  numero              text,
  fornecedor_id       bigint,
  fornecedor          text,
  fornecedor_documento text,
  total               numeric(14,2) default 0,
  data                date,
  data_prevista       date,
  situacao            text,
  items               jsonb,
  raw_data            jsonb  default '{}',
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists update_bling2_pedidos_compra_updated_at on public.bling2_pedidos_compra;
create trigger update_bling2_pedidos_compra_updated_at
  before update on public.bling2_pedidos_compra
  for each row execute function update_updated_at_column();

create index if not exists idx_bling2_compras_data on public.bling2_pedidos_compra(data desc);


-- ── 11. bling2_sync_log ───────────────────────────────────────────────────
create table if not exists public.bling2_sync_log (
  id             uuid    not null default gen_random_uuid() primary key,
  entity_type    text    not null,
  status         text    not null default 'running',
  records_synced integer default 0,
  records_failed integer default 0,
  error_message  text,
  triggered_by   uuid    references auth.users(id),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists idx_bling2_sync_log_entity  on public.bling2_sync_log(entity_type);
create index if not exists idx_bling2_sync_log_started on public.bling2_sync_log(started_at desc);


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — mesmo desenho do Bling 1
--   • token: só admin/CEO (é credencial, não dado)
--   • dado sincronizado: admin/CEO/gestor leem; escrita é admin/CEO
--   • edge function usa service_role, que ignora RLS
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'bling2_integration', 'bling2_products', 'bling2_product_variations',
    'bling2_contacts', 'bling2_vendedores', 'bling2_orders', 'bling2_nfe',
    'bling2_contas_pagar', 'bling2_contas_receber', 'bling2_pedidos_compra',
    'bling2_sync_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);

    if t = 'bling2_integration' then
      -- Token não é dado de gestão: gestor não lê.
      execute format($f$
        create policy "%s_write" on public.%I for all
        using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()))
      $f$, t, t);
    else
      execute format($f$
        create policy "%s_read" on public.%I for select
        using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()) or public.is_gestor(auth.uid()))
      $f$, t, t);
      execute format($f$
        create policy "%s_write" on public.%I for all
        using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()))
      $f$, t, t);
    end if;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) As 11 tabelas nasceram?
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'bling2\_%'
order by 1;

-- (b) Toda tabela com RLS ligada e política? Linha sem política = tabela que
--     ninguém consegue ler pelo app (só service_role). Esperado: 11 linhas,
--     rls_ligada = t, 2 políticas cada — menos `bling2_integration`, que tem 1
--     (gestor não lê token).
select c.relname as tabela, c.relrowsecurity as rls_ligada, count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname like 'bling2\_%' and c.relkind = 'r'   -- 'r' = tabela; sem isto vêm os índices junto
group by 1, 2
order by 1;

-- (c) PROVA DO ISOLAMENTO: nenhuma FK saindo de bling2_* para tabela do
--     schema public. Resultado esperado: VAZIO. (As FKs para `auth.users` —
--     connected_by e triggered_by — não aparecem porque a consulta se
--     restringe ao public; elas são esperadas e inofensivas.)
select tc.table_name as origem, kcu.column_name as coluna,
       ccu.table_name as destino
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name like 'bling2\_%'
order by 1, 2;

-- (d) O Bling 1 continua intocado — contagem de referência antes de sincronizar
--     qualquer coisa no 2.
select 'bling_orders' as tabela, count(*) from public.bling_orders
union all select 'bling_nfe',      count(*) from public.bling_nfe
union all select 'bling_products', count(*) from public.bling_products
union all select 'bling2_orders',  count(*) from public.bling2_orders
union all select 'bling2_nfe',     count(*) from public.bling2_nfe
union all select 'bling2_products',count(*) from public.bling2_products;
