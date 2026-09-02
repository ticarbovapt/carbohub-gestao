-- ═══════════════════════════════════════════════════════════════════════════
-- Meta Ads: o gasto entra pelo GRÃO DO ANÚNCIO, e a janela é móvel
--
-- ── Por que grão de anúncio, e não de campanha ───────────────────────────
--
-- A tela pede drilldown campanha → conjunto → anúncio. Guardar no grão da
-- campanha economiza ~nada (são dezenas de linhas/dia, não milhões) e fecha a
-- porta do nível que decide criativo. Grão fino soma para cima; grão grosso
-- não se desagrega. Guardamos o mais fino que a API entrega de graça.
--
-- ── ⚠️ O ponto que quebra tudo se for ignorado: a janela é MÓVEL ─────────
--
-- A Meta atribui uma compra de HOJE ao clique de ATÉ 7 DIAS ATRÁS. Isso quer
-- dizer que a linha do dia 01 **muda** quando relida no dia 05. Um sync que
-- só busca "ontem" congela números errados para sempre e o ROAS do mês fica
-- sistematicamente subestimado — o gasto é definitivo, mas a conversão ainda
-- vai chegar.
--
-- Por isso a PK é (dia, ad_id) com UPSERT, e o sync relê uma janela de 30 dias
-- a cada rodada em vez de acrescentar o último dia. Reler é barato; ficar com
-- número velho é caro. Mesma lógica do estorno-antes-da-dedução da 20260956:
-- a ordem/rejanela existe porque o dado de fora se corrige sozinho.
--
-- ── Métrica derivada NÃO é coluna, de propósito ──────────────────────────
--
-- CPM, CPC, CTR, CPA e ROAS não entram como coluna. Todos saem de spend,
-- impressions, clicks, compras e valor_compras por divisão. Coluna derivada é
-- uma segunda verdade que envelhece sozinha — foi o que o `bling_nf_id` custou
-- aqui. A view `meta_ads_diario` faz a conta na hora, com guarda de zero.
--
-- ── O cru é a prova (mesma regra da 20260963/PayT) ───────────────────────
--
-- `raw` guarda o objeto de insight inteiro como veio. Quando a Meta renomear
-- um campo (e ela renomeia: reach e impressões de story saíram do Graph em
-- jun/2026), a resposta está guardada e é reprocessamento, não perda.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quais contas de anúncio entram                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.meta_ads_accounts (
  -- O id da conta na Meta, no formato act_123456789. É ele que vai na URL do
  -- Graph, então guardamos exatamente como a Meta escreve — sem prefixo
  -- removido, sem cast para número (o id estoura int e tem zeros à esquerda).
  act_id        text primary key,
  apelido       text not null,
  moeda         text,
  ativo         boolean not null default true,
  -- Quando a conta começou a rodar. Serve para o sync saber que não adianta
  -- pedir insight de antes disso.
  desde         date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.meta_ads_accounts is
  'Contas de anuncio da Meta que o meta-ads-sync deve ler. Cadastro manual: o '
  'token de System User pode enxergar contas que nao sao nossas, e ler tudo '
  'que ele alcanca traria gasto de terceiro para dentro do dashboard.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o insight diário, grão dia × anúncio                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.meta_ads_insights_daily (
  dia            date not null,
  ad_id          text not null,

  act_id         text not null references public.meta_ads_accounts(act_id) on delete cascade,
  campaign_id    text,
  campaign_name  text,
  adset_id       text,
  adset_name     text,
  ad_name        text,

  -- ── o que a Meta cobra ──────────────────────────────────────────────
  spend          numeric(14,2) not null default 0,
  impressions    bigint        not null default 0,
  clicks         bigint        not null default 0,
  -- inline_link_clicks: clique no LINK, não em qualquer lugar do anúncio.
  -- É o que faz sentido comparar com sessão/venda; `clicks` conta curtida,
  -- expandir comentário e afins, e por isso infla o CTR.
  link_clicks    bigint        not null default 0,
  reach          bigint        not null default 0,
  frequency      numeric(10,4) not null default 0,

  -- ── o que a Meta DIZ que vendeu ─────────────────────────────────────
  -- ⚠️ Nome com prefixo meta_ de propósito. Este número é a atribuição DELA
  -- (7d-clique/1d-visualização), não o faturamento do nosso banco, e os dois
  -- não batem — nunca bateram em lugar nenhum. Quando a atribuição própria
  -- entrar, as duas colunas convivem lado a lado na tela e a diferença entre
  -- elas é informação, não erro a esconder.
  meta_compras       integer       not null default 0,
  meta_valor_compras numeric(14,2) not null default 0,

  moeda           text,
  raw             jsonb not null,
  sincronizado_em timestamptz not null default now(),

  primary key (dia, ad_id)
);

create index if not exists meta_ads_insights_daily_dia_idx
  on public.meta_ads_insights_daily (dia desc);
create index if not exists meta_ads_insights_daily_campanha_idx
  on public.meta_ads_insights_daily (campaign_id, dia desc);
create index if not exists meta_ads_insights_daily_conta_idx
  on public.meta_ads_insights_daily (act_id, dia desc);

comment on column public.meta_ads_insights_daily.raw is
  'O objeto de insight inteiro, como veio do Graph. Fonte da verdade: se o '
  'parser errar ou a Meta renomear campo, reprocessa daqui.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o rastro de cada rodada                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem isto, "o dashboard está desatualizado" não tem resposta: não dá para
-- saber se o cron não rodou, se o token venceu ou se a conta não teve gasto.

create table if not exists public.meta_ads_sync_log (
  id            bigint generated always as identity primary key,
  rodou_em      timestamptz not null default now(),
  origem        text not null,                  -- cron | manual
  act_id        text,
  desde         date,
  ate           date,
  linhas        integer not null default 0,
  ok            boolean not null default true,
  erro          text,
  duracao_ms    integer
);

create index if not exists meta_ads_sync_log_rodou_idx
  on public.meta_ads_sync_log (rodou_em desc);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a view que a tela lê (métrica derivada na hora)             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Toda divisão é protegida com nullif. Dia com gasto e zero impressão
-- existe (anúncio recém-aprovado), e sem a guarda o dashboard inteiro quebra
-- num "division by zero" em vez de mostrar um traço na célula.

create or replace view public.meta_ads_diario as
select
  i.dia,
  i.act_id,
  a.apelido            as conta,
  i.campaign_id, i.campaign_name,
  i.adset_id,    i.adset_name,
  i.ad_id,       i.ad_name,
  i.spend, i.impressions, i.clicks, i.link_clicks, i.reach, i.frequency,
  i.meta_compras, i.meta_valor_compras, i.moeda,

  round(i.spend / nullif(i.impressions, 0) * 1000, 2) as cpm,
  round(i.spend / nullif(i.link_clicks, 0), 2)        as cpc,
  round(i.link_clicks::numeric
        / nullif(i.impressions, 0) * 100, 2)          as ctr,
  round(i.spend / nullif(i.meta_compras, 0), 2)       as cpa,
  round(i.meta_valor_compras / nullif(i.spend, 0), 2) as roas,

  i.sincronizado_em
from public.meta_ads_insights_daily i
join public.meta_ads_accounts a using (act_id);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — RLS: quem trabalha aqui lê; só o service role escreve       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.meta_ads_accounts       enable row level security;
alter table public.meta_ads_insights_daily enable row level security;
alter table public.meta_ads_sync_log       enable row level security;

drop policy if exists "meta ads contas: autenticado le" on public.meta_ads_accounts;
create policy "meta ads contas: autenticado le"
  on public.meta_ads_accounts for select
  to authenticated using (true);

drop policy if exists "meta ads insights: autenticado le" on public.meta_ads_insights_daily;
create policy "meta ads insights: autenticado le"
  on public.meta_ads_insights_daily for select
  to authenticated using (true);

drop policy if exists "meta ads log: autenticado le" on public.meta_ads_sync_log;
create policy "meta ads log: autenticado le"
  on public.meta_ads_sync_log for select
  to authenticated using (true);

-- ⚠️ Nenhuma policy de INSERT/UPDATE/DELETE, e isso é intencional: a escrita é
-- exclusiva do meta-ads-sync via service role (que ignora RLS). Gasto de
-- anúncio digitado à mão por um usuário seria dado inventado dentro de um
-- número que a diretoria vai usar para decidir verba.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o cron: 3x/dia, janela móvel de 30 dias                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- 3x porque o número intradiário da Meta muda ao longo do dia e o time olha o
-- painel de manhã, depois do almoço e no fim do dia. Rodar de hora em hora não
-- melhora decisão nenhuma e só gasta cota da API.
--
-- ⚠️ Troque TROQUE_PELO_CRON_SECRET pelo valor real antes de rodar este bloco
-- — é o mesmo segredo que o bling-auto-sync já usa.

select cron.schedule(
  'meta-ads-sync-manha',
  '0 10 * * *',                                   -- 07:00 BRT
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', 'TROQUE_PELO_CRON_SECRET'
    ),
    body    := '{"dias":30,"source":"cron"}'::jsonb
  ) as request_id;
  $cmd$
);

select cron.schedule(
  'meta-ads-sync-tarde',
  '0 16 * * *',                                   -- 13:00 BRT
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', 'TROQUE_PELO_CRON_SECRET'
    ),
    body    := '{"dias":30,"source":"cron"}'::jsonb
  ) as request_id;
  $cmd$
);

select cron.schedule(
  'meta-ads-sync-noite',
  '0 22 * * *',                                   -- 19:00 BRT
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', 'TROQUE_PELO_CRON_SECRET'
    ),
    body    := '{"dias":30,"source":"cron"}'::jsonb
  ) as request_id;
  $cmd$
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — cadastre as contas ANTES da primeira rodada                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem linha aqui o sync não faz nada (e loga "nenhuma conta ativa"), de
-- propósito: é melhor não trazer nada do que trazer a conta errada.
--
-- insert into public.meta_ads_accounts (act_id, apelido, moeda, desde) values
--   ('act_SEU_ID_AQUI', 'CarboZé — principal', 'BRL', '2026-01-01')
-- on conflict (act_id) do nothing;
