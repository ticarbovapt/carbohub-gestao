-- =====================================================================
-- Fases 5 e 6 — o cadastro do SDR e a coluna Nutrição.
--
--   1) QUALIFICAÇÃO em quatro colunas. O critério de saída de "Qualificado"
--      é volume + dor + decisor + prazo, e nenhum dos quatro tinha onde ser
--      gravado: sobrava `notes`, texto livre. O closer recebia um parágrafo
--      corrido e ligava de novo para perguntar o que o SDR já perguntou.
--      Colunas, e não custom_fields, porque isso vira relatório ("quantos SQL
--      sem decisor?") e porque a duplicação da fase 7 copia campo a campo.
--
--   2) ORIGEM normalizada. Três convenções gravavam na mesma coluna:
--      `prospeccao_ativa` (default do banco), "Prospecção ativa" (formulário)
--      e "Meta Ads" (webhook). Um `group by source` já devolvia categoria
--      duplicada antes de existir integração de anúncio de verdade.
--
--   3) NUTRIÇÃO ganha prazo de etapa. A coluna em si é só front (stage é texto
--      livre, sem CHECK) — aqui entra só o SLA, porque a linha do f12/nutricao
--      já foi inserida na fase 4. Este bloco existe para o caso de ela não ter
--      entrado, e é idempotente.
--
-- Retrato ANTES de normalizar (medido em 26/07, 95 leads):
--   Prospecção ativa            39
--   Meta Ads                    35
--   Follow up (base comercial)  15   ← não vinha do formulário; lote importado
--   Indicação                    4
--   Formulário CarboVapt         2
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os quatro campos de qualificação                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.crm_sales_leads
  add column if not exists qual_volume  text,
  add column if not exists qual_dor     text,
  add column if not exists qual_decisor text,
  add column if not exists qual_prazo   text;

reset lock_timeout;

comment on column public.crm_sales_leads.qual_volume  is 'Qualificação: frota/consumo declarado.';
comment on column public.crm_sales_leads.qual_dor     is 'Qualificação: o problema que o lead relatou.';
comment on column public.crm_sales_leads.qual_decisor is 'Qualificação: nome e cargo de quem assina.';
comment on column public.crm_sales_leads.qual_prazo   is 'Qualificação: quando pretende resolver.';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — ANTES de normalizar: ver o estrago atual                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Rode e GUARDE o resultado. É o retrato do problema, e serve para conferir
-- que o bloco 3 não inventou nem perdeu categoria.
--
-- select source, count(*) from public.crm_sales_leads group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — normaliza a origem para snake_case                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Mapeia os rótulos conhecidos. Qualquer valor NÃO previsto vira 'outro' e é
-- preservado em custom_fields.source_original — perder de onde veio um lead
-- para arrumar uma coluna seria trocar um problema por outro pior.
update public.crm_sales_leads
   set custom_fields = coalesce(custom_fields, '{}'::jsonb)
                       || jsonb_build_object('source_original', source)
 where source is not null
   and source not in (
     'prospeccao_ativa','indicacao','evento','meta_ads','google_ads','tiktok_ads',
     'ml_ads','shopee_ads','linkedin_ads','landing_page','whatsapp','formulario',
     'google_merchant','organico','bling','followup_base','outro'
   );

update public.crm_sales_leads
   set source = case lower(btrim(source))
     when 'prospecção ativa'      then 'prospeccao_ativa'
     when 'prospeccao ativa'      then 'prospeccao_ativa'
     when 'indicação'             then 'indicacao'
     when 'indicacao'             then 'indicacao'
     when 'evento'                then 'evento'
     -- Lote importado da base comercial. Descoberto ao medir a coluna antes de
     -- normalizar; não vinha do formulário nem de webhook.
     when 'follow up (base comercial)' then 'followup_base'
     when 'followup_base'              then 'followup_base'
     when 'meta ads'              then 'meta_ads'
     when 'google ads'            then 'google_ads'
     when 'tiktok ads'            then 'tiktok_ads'
     when 'ml ads'                then 'ml_ads'
     when 'shopee ads'            then 'shopee_ads'
     when 'linkedin ads'          then 'linkedin_ads'
     when 'landing page'          then 'landing_page'
     when 'chatwoot / whatsapp'   then 'whatsapp'
     when 'formulário carbovapt'  then 'formulario'
     when 'formulario carbovapt'  then 'formulario'
     when 'google merchant'       then 'google_merchant'
     when 'orgânico'              then 'organico'
     when 'organico'              then 'organico'
     when 'bling'                 then 'bling'
     when 'outro'                 then 'outro'
     -- Já normalizado numa passada anterior: deixa como está.
     when 'prospeccao_ativa' then 'prospeccao_ativa'
     when 'meta_ads'         then 'meta_ads'
     when 'google_ads'       then 'google_ads'
     when 'tiktok_ads'       then 'tiktok_ads'
     when 'ml_ads'           then 'ml_ads'
     when 'shopee_ads'       then 'shopee_ads'
     when 'linkedin_ads'     then 'linkedin_ads'
     when 'landing_page'     then 'landing_page'
     when 'whatsapp'         then 'whatsapp'
     when 'formulario'       then 'formulario'
     when 'google_merchant'  then 'google_merchant'
     else 'outro'
   end
 where source is not null;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — trava a coluna no conjunto fechado                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- SEM isso a coluna volta a sujar na primeira integração nova. O CHECK é o que
-- garante que `group by source` continue significando alguma coisa daqui a um
-- ano. NOT VALID + VALIDATE em dois passos: o VALIDATE não bloqueia escrita.
--
-- ⚠️ ATENÇÃO PARA A FASE 11. Os dois webhooks (crm-webhook-meta e
-- crm-webhook-chatwoot) gravam `source` com o rótulo cru — "Meta Ads" e
-- "ChatWoot / WhatsApp". Hoje isso NÃO quebra, porque eles escrevem na tabela
-- `crm_leads` (a do Controle legado), que este CHECK não toca — é justamente o
-- defeito B1. Mas no dia em que forem redirecionados para `crm_sales_leads`,
-- eles precisam passar a gravar 'meta_ads' e 'whatsapp', senão o INSERT falha
-- e o lead se perde em silêncio dentro da edge function.
set lock_timeout = '5s';

alter table public.crm_sales_leads
  drop constraint if exists crm_sales_leads_source_ck;

alter table public.crm_sales_leads
  add constraint crm_sales_leads_source_ck check (
    source is null or source in (
      'prospeccao_ativa','indicacao','evento','meta_ads','google_ads','tiktok_ads',
      'ml_ads','shopee_ads','linkedin_ads','landing_page','whatsapp','formulario',
      'google_merchant','organico','bling','followup_base','outro'
    )
  ) not valid;

reset lock_timeout;

alter table public.crm_sales_leads validate constraint crm_sales_leads_source_ck;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — prazo da etapa Nutrição (idempotente)                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
insert into public.crm_stage_sla (funnel_type, stage, prazo_dias)
values ('f12','nutricao',30)
on conflict (funnel_type, stage) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select source, count(*) from public.crm_sales_leads group by 1 order by 2 desc;
--   → só ids em snake_case. O total tem que bater com o do bloco 2.
--
-- select id, contact_name, custom_fields->>'source_original' as veio_como
--   from public.crm_sales_leads
--  where custom_fields ? 'source_original';
--   → os que caíram em 'outro' por não estarem no mapa. Se aparecer algo que
--     merecia categoria própria, acrescente em SOURCES (types/crm.ts) e no
--     CHECK, e corrija estas linhas.


-- ─── Rollback ────────────────────────────────────────────────────────
-- alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_source_ck;
-- update public.crm_sales_leads
--    set source = custom_fields->>'source_original'
--  where custom_fields ? 'source_original';
-- alter table public.crm_sales_leads
--   drop column if exists qual_volume, drop column if exists qual_dor,
--   drop column if exists qual_decisor, drop column if exists qual_prazo;
