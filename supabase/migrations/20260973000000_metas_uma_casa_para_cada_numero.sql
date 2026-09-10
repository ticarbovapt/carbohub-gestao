-- ✅ JA APLICADA EM PRODUCAO em 2026-09-03 (via MCP do Supabase, com autorizacao
--    do usuario). O BLOCO 3 opcional (apertar RLS) NAO foi aplicado.
-- ⚠️ NAO REAPLIQUE: esta migracao NAO e idempotente. O bloco de guarda consulta
--    meta_insights / meta_sync_runs / meta_creatives, que ela mesma dropou, e o
--    ALTER ... ADD CONSTRAINT falha por ja existir.

-- ═══════════════════════════════════════════════════════════════════════════
-- Metas: uma casa para cada número
--
-- ── O estado que motivou isto ────────────────────────────────────────────
--
-- Três tabelas guardavam "meta" e discordavam entre si:
--
--   meta_ecommerce (platform IS NULL) → total do e-commerce
--   canal_metas    (canal = 'online') → total do e-commerce (OUTRO valor)
--   canal_metas    (canal = 'revenda')→ total da revenda
--
-- Julho/2026: a primeira dizia 70.000 e a segunda 27.000. Nenhum mês batia.
--
-- ⚠️ E o total do e-commerce estava DUPLICADO: maio tinha SEIS linhas
-- (5× 300.000 + 1× 130.000). A causa é o índice:
--
--   meta_ecommerce_month_platform_key  UNIQUE (month, platform)
--
-- Em Postgres NULL nunca é igual a NULL, então a constraint não alcança
-- justamente as linhas de total — que são as que têm `platform IS NULL`. Todo
-- "salvar" inseriu em vez de atualizar, e a tela passou a mostrar 300.000 ou
-- 130.000 conforme a ordenação da query.
--
-- Este projeto JÁ tinha apanhado disso e já sabia a cura — veja a tabela
-- vizinha, onde o mesmo problema com `linha` foi resolvido:
--
--   sales_targets_vendedor_month_linha_uq UNIQUE (vendedor_id, month, COALESCE(linha,''))
--
-- `meta_ecommerce` foi a única que ficou de fora.
--
-- ── A cura aqui NÃO é COALESCE, é tirar o sentinela ──────────────────────
--
-- Dava para repetir o truque do COALESCE. Não é o certo: o problema de fundo é
-- que `platform IS NULL` significa "esta linha não é uma plataforma, é outra
-- coisa" — duas entidades diferentes na mesma tabela. Tirando o sentinela, a
-- constraint que já existe volta a funcionar sozinha, sem índice especial que
-- o próximo dev precise descobrir.
--
-- Depois desta migração:
--   canal_metas    = a META GERAL por canal/mês  (online, revenda)
--   meta_ecommerce = só a DISTRIBUIÇÃO por plataforma
--   sales_targets  = só a DISTRIBUIÇÃO por vendedor
--
-- ── ⚠️ REVERSÃO CONSCIENTE de uma decisão anterior ───────────────────────
--
-- `useMetaEcommerce.ts` (na mutation `useUpsertMetaTarget`) recusa gravar a
-- meta total, com o argumento "a meta total é a soma das metas por plataforma".
-- Essa decisão está sendo REVERTIDA de propósito, a pedido: a operação define o
-- total primeiro (compromisso de diretoria) e distribui depois — top-down.
--
-- Total derivado da soma não consegue responder "faltam R$ 22.000 para
-- distribuir", e faz editar UM vendedor mudar a meta da empresa em silêncio.
-- O preço da reversão é ter dois números que podem divergir; a tela de
-- distribuição paga esse preço MOSTRANDO a diferença, e nunca corrigindo
-- sozinha.
--
-- ⚠️ Enquanto a tela nova não existe, nada quebra: a recusa da mutation
-- continua de pé e as telas atuais seguem exibindo total = soma.
--
-- ⚠️ RODE EM BLOCOS, e leia o relatório do BLOCO 5.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as três tabelas órfãs da tentativa anterior de Meta Ads     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `meta_insights`, `meta_sync_runs` e `meta_creatives` são de uma integração
-- com a Meta que nunca foi ligada: ZERO linhas nas três e NENHUM código no
-- repositório escrevendo nelas. Ficaram como armadilha — o nome sugere que o
-- gasto de anúncio já está resolvido, e não está.
--
-- ⚠️ A guarda abaixo é o que separa "limpeza" de "perda de dado". Se alguém
-- tiver ligado alguma coisa nelas entre o diagnóstico e a execução desta
-- migração, ela ABORTA em vez de dropar.

do $$
declare
  n_ins   bigint;
  n_runs  bigint;
  n_creat bigint;
begin
  select count(*) into n_ins   from public.meta_insights;
  select count(*) into n_runs  from public.meta_sync_runs;
  select count(*) into n_creat from public.meta_creatives;

  if n_ins > 0 or n_runs > 0 or n_creat > 0 then
    raise exception
      'ABORTADO: as tabelas antigas NAO estao vazias (meta_insights=%, meta_sync_runs=%, meta_creatives=%). Alguem ligou algo nelas. Investigue antes de dropar.',
      n_ins, n_runs, n_creat;
  end if;

  raise notice 'As tres tabelas antigas estao vazias, como esperado. Seguindo para o drop.';
end $$;

drop table if exists public.meta_creatives;
drop table if exists public.meta_insights;
drop table if exists public.meta_sync_runs;

-- A integração viva da Meta é a `meta_ads_*` (migração 20260972), alimentada
-- pela edge function `meta-ads-sync`.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o total muda de casa (RODE ESTE BLOCO INTEIRO DE UMA VEZ)   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ NÃO QUEBRE ESTE BLOCO EM PARTES. A seleção do vencedor, a cópia para
-- `canal_metas` e o DELETE têm de acontecer na MESMA transação — rodar o
-- DELETE sem o INSERT apaga o total sem ter para onde copiá-lo.
--
-- (A primeira versão disto usava uma tabela temporária entre os blocos. Com
-- `on commit drop` ela morre no fim da transação, e o editor de SQL roda cada
-- execução na sua própria — o bloco seguinte não a encontraria. Por isso é um
-- CTE dentro de um comando só.)
--
-- Regra da desduplicação: vence a linha MAIS RECENTE do mês (`updated_at`
-- maior). É o que a pessoa digitou por último — cada "salvar" queria ser um
-- update e virou insert por causa do índice.
--
-- ⚠️ CONSEQUÊNCIA EM MAIO/2026: as seis linhas são 5× 300.000 e 1× 130.000, e
-- a mais recente (28/05) é a de **130.000**. Portanto maio passa a valer
-- 130.000, não 300.000. Se o número certo for outro, corrija DEPOIS da
-- migração — está registrado aqui para não passar despercebido.
--
-- ⚠️ DECISÃO DO USUÁRIO (01/09/2026): onde as duas fontes discordavam, vence
-- `meta_ecommerce`. Julho passa de 27.000 para **70.000**.
--
-- `canal_metas` já tem a constraint certa — UNIQUE (ano, mes, canal), sem NULL
-- nenhum envolvido — então o upsert é seguro por construção.

begin;

with vencedores as (
  select distinct on (month)
         month, target_amount
  from public.meta_ecommerce
  where platform is null
  order by month, updated_at desc, id desc
)
insert into public.canal_metas (ano, mes, canal, valor, updated_at)
select extract(year  from v.month)::int,
       extract(month from v.month)::int,
       'online',
       v.target_amount,
       now()
from vencedores v
on conflict (ano, mes, canal) do update
  set valor = excluded.valor,
      updated_at = now();

-- Meses que só existiam em `canal_metas` (set–dez/2026, 27.000) NÃO são
-- tocados: não havia total concorrente em `meta_ecommerce` para discordar.

delete from public.meta_ecommerce where platform is null;

commit;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — some o sentinela, e a constraint volta a funcionar          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.meta_ecommerce
  add constraint meta_ecommerce_platform_obrigatoria
  check (platform is not null);

comment on constraint meta_ecommerce_platform_obrigatoria on public.meta_ecommerce is
  'A meta TOTAL nao mora aqui: mora em canal_metas(canal=online). Linha sem '
  'plataforma escapava do UNIQUE (month, platform), porque NULL <> NULL, e '
  'duplicava o total a cada salvamento.';

comment on table public.meta_ecommerce is
  'DISTRIBUICAO da meta de e-commerce por plataforma. O total do mes esta em '
  'canal_metas (canal = online). A soma daqui NAO precisa fechar com o total — '
  'a diferenca e o que a tela de distribuicao mostra como "falta distribuir".';

comment on table public.canal_metas is
  'META GERAL por canal e mes: online (e-commerce) e revenda (vendedores). '
  'E o numero definido primeiro, de cima para baixo; a distribuicao vive em '
  'meta_ecommerce (por plataforma) e sales_targets (por vendedor).';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o que esta migração deliberadamente NÃO faz                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- 1. NÃO força a soma a fechar com o total. Maio fica com 130.000 de total e
--    140.000 distribuídos; julho com 70.000 e 140.000. Ajustar isso é decisão
--    de negócio, e é exatamente o que a tela nova vai expor. Migração que
--    "conserta" meta sozinha inventa número.
--
-- 2. NÃO mexe nas linhas da plataforma `vindi` (R$ 210.000 em mai–jul). Ela
--    não está em `ALL_PLATFORMS` no código, então esse valor é invisível na
--    tela hoje — mas apagar dado histórico sem ordem explícita é pior que
--    deixá-lo visível no relatório abaixo.
--
-- 3. NÃO cria meta para `shopee` nem `payt`, que já vendem e não têm meta.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — relatório: rode e LEIA                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 5.1 — total (canal_metas) × distribuído (meta_ecommerce), mês a mês
select cm.ano, cm.mes,
       cm.valor::int                                as meta_geral,
       coalesce(sum(me.target_amount)::int, 0)      as distribuido,
       (cm.valor - coalesce(sum(me.target_amount), 0))::int as falta_distribuir,
       string_agg(me.platform || '=' || me.target_amount::int::text, ' | '
                  order by me.platform)             as detalhe
from public.canal_metas cm
left join public.meta_ecommerce me
       on me.month = make_date(cm.ano, cm.mes, 1)
where cm.canal = 'online'
group by cm.ano, cm.mes, cm.valor
order by cm.ano, cm.mes;

-- 5.2 — ⚠️ o valor órfão: plataformas com meta que a tela não soma
select platform, count(*) as meses, sum(target_amount)::int as total
from public.meta_ecommerce
where platform not in ('mercadolivre', 'nuvemshop', 'amazon', 'shopee', 'payt')
group by platform;

-- 5.3 — não pode sobrar nenhuma linha sem plataforma. Tem de vir ZERO.
select count(*) as linhas_sem_plataforma_devem_ser_zero
from public.meta_ecommerce where platform is null;
