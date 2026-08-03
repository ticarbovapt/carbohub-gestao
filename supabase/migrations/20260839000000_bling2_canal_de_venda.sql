-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 — canal de venda (Shopee, Mercado Livre, Nuvemshop, balcão…)
--
-- O Bling mostra o canal como um ícone colorido ao lado de cada NF e de cada
-- pedido. Isso vem na API — `loja: { id, unidadeNegocio: { id } }` —, mas até
-- agora ficava só dentro do `raw_data`, invisível para qualquer consulta.
-- Sem ele, R$ 34 mil de nota fiscal são um bolo só: não dá para saber quanto
-- é marketplace e quanto é venda direta, que era justamente o motivo de
-- puxar esses dados.
--
-- ⚠️ O Bling manda SÓ O ID, sem nome. Daí a tabela `bling2_lojas`: um de-para
-- que ALGUÉM preenche uma vez. E o sync cadastra sozinho todo id novo que
-- aparecer, com nome vazio.
--
-- Esse auto-cadastro é o ponto do desenho, não um detalhe. Se o de-para fosse
-- uma lista fixa no código, no dia em que a Shopee for conectada os pedidos
-- dela virariam um id desconhecido — e apareceriam como "—" ou cairiam num
-- "outros" que ninguém questiona. Você olharia o faturamento por canal com um
-- canal inteiro faltando, sem nada avisando. Com o auto-cadastro, surge uma
-- linha "(sem nome)" na tela, impossível de não ver.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. As colunas ─────────────────────────────────────────────────────────
alter table public.bling2_nfe
  add column if not exists loja_id            bigint,
  add column if not exists unidade_negocio_id bigint;

alter table public.bling2_orders
  add column if not exists unidade_negocio_id bigint;

comment on column public.bling2_nfe.loja_id is
  'Canal de venda da nota (o ícone colorido na tela do Bling). De-para em bling2_lojas.';

create index if not exists idx_bling2_nfe_loja    on public.bling2_nfe(loja_id);
create index if not exists idx_bling2_orders_loja on public.bling2_orders(loja_id);


-- ── 2. O de-para ──────────────────────────────────────────────────────────
create table if not exists public.bling2_lojas (
  bling_id           bigint primary key,
  -- NULL de propósito: loja recém-descoberta nasce sem nome, e é isso que a
  -- torna visível. Preencher é ação humana.
  nome               text,
  unidade_negocio_id bigint,
  -- Marca canal que não deve entrar no faturamento (loja de teste, por ex.).
  ignorar            boolean not null default false,
  primeiro_visto_em  timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.bling2_lojas is
  'De-para id → nome do canal de venda do Bling 2. O sync cadastra id novo com nome vazio; batizar é manual.';

drop trigger if exists update_bling2_lojas_updated_at on public.bling2_lojas;
create trigger update_bling2_lojas_updated_at
  before update on public.bling2_lojas
  for each row execute function update_updated_at_column();

alter table public.bling2_lojas enable row level security;
drop policy if exists "bling2_lojas_read"  on public.bling2_lojas;
drop policy if exists "bling2_lojas_write" on public.bling2_lojas;
create policy "bling2_lojas_read" on public.bling2_lojas for select
  using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()) or public.is_gestor(auth.uid()));
-- Gestor também ESCREVE aqui: batizar canal é trabalho de quem opera, não de
-- admin de banco. É a única tabela do Bling 2 assim, e de propósito.
create policy "bling2_lojas_write" on public.bling2_lojas for all
  using (public.is_admin(auth.uid()) or public.is_ceo(auth.uid()) or public.is_gestor(auth.uid()));


-- ── 3. Backfill — sem tocar no Bling ──────────────────────────────────────
-- O `raw_data` de todas as 136 notas e 147 pedidos já está no banco desde a
-- primeira sincronização. Dá para preencher tudo daqui, sem re-sincronizar.
update public.bling2_nfe set
  loja_id            = nullif(raw_data #>> '{loja,id}', '')::bigint,
  unidade_negocio_id = nullif(raw_data #>> '{loja,unidadeNegocio,id}', '')::bigint
where raw_data ? 'loja' and loja_id is null;

update public.bling2_orders set
  unidade_negocio_id = nullif(raw_data #>> '{loja,unidadeNegocio,id}', '')::bigint
where raw_data ? 'loja' and unidade_negocio_id is null;

-- Semeia o de-para com tudo que já apareceu, de pedidos E de notas.
insert into public.bling2_lojas (bling_id, unidade_negocio_id)
select loja_id, max(unidade_negocio_id)
from (
  select loja_id, unidade_negocio_id from public.bling2_orders where loja_id is not null
  union all
  select loja_id, unidade_negocio_id from public.bling2_nfe    where loja_id is not null
) t
group by loja_id
on conflict (bling_id) do nothing;

-- A loja 0 é "sem canal": venda de balcão/manual. Ela tem nome desde já
-- porque não existe nada para descobrir sobre ela.
update public.bling2_lojas set nome = 'Venda direta (sem canal)'
where bling_id = 0 and nome is null;


-- ── 4. Faturamento por canal ──────────────────────────────────────────────
--
-- ⚠️ LISTA BRANCA de situação, não lista negra. Só entram as situações
-- sabidamente válidas. Com lista negra, uma situação nova do Bling entraria
-- no faturamento sem ninguém notar — e contar nota cancelada como receita já
-- aconteceu neste sistema, no Bling 1. Errar para menos é visível (alguém
-- reclama que falta); errar para mais ninguém questiona.
--
-- A conferência (c) lá embaixo lista o que ficou de fora, para nada sumir
-- calado.
create or replace view public.bling2_faturamento_por_canal
with (security_invoker = true) as
select
  n.loja_id,
  coalesce(
    nullif(l.nome, ''),
    'Loja ' || n.loja_id || ' — SEM NOME, batize em bling2_lojas'
  )                                             as canal,
  date_trunc('month', n.data_emissao)::date     as mes,
  count(*)                                      as notas,
  sum(n.valor_total)                            as faturamento
from public.bling2_nfe n
left join public.bling2_lojas l on l.bling_id = n.loja_id
where n.situacao in ('Autorizada', 'Emitida DANFE', 'Registrada')
  and coalesce(l.ignorar, false) = false
  and n.data_emissao is not null
group by 1, 2, 3;

comment on view public.bling2_faturamento_por_canal is
  'Faturamento do Bling 2 por canal e mês. Só situações válidas (lista branca) e canais não ignorados.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O de-para nasceu com os canais certos? Esperado: 4 linhas (3 canais +
--     a loja 0). As de `nome` nulo são as que VOCÊ precisa batizar — abra
--     Cadastros > Lojas Virtuais no Bling e compare pelo id.
select bling_id, nome, unidade_negocio_id, primeiro_visto_em
from public.bling2_lojas
order by nome nulls first, bling_id;

-- (b) O backfill pegou todas as notas? `sem_loja` tem de ser 0.
select count(*) as notas,
       count(*) filter (where loja_id is null) as sem_loja
from public.bling2_nfe;

-- (c) O que a lista branca DEIXOU DE FORA, e quanto. Situação conhecida como
--     inválida (Cancelada/Rejeitada) aqui é o esperado. Situação que você não
--     reconhece = rótulo novo do Bling que precisa entrar na lista branca.
select situacao, count(*) as notas, sum(valor_total) as valor
from public.bling2_nfe
where situacao is null or situacao not in ('Autorizada', 'Emitida DANFE', 'Registrada')
group by 1 order by 3 desc nulls last;

-- (d) O resultado: faturamento por canal e mês.
select canal, mes, notas, faturamento
from public.bling2_faturamento_por_canal
order by mes desc, faturamento desc;
