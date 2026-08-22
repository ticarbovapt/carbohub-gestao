-- ═══════════════════════════════════════════════════════════════════════════
-- WHATSAPP CLOUD API (Meta) — FASE 1: a modelagem
--
-- A esteira da compra à entrega passa a falar pela API OFICIAL. As pipelines
-- comerciais (recompra e os três passos do carrinho) continuam na Evolution,
-- pelo n8n. O transporte passa a ser uma propriedade da ETAPA, não do sistema.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO LIGA NADA. Todos os templates continuam `ativo = false`
-- e nenhum código novo é chamado. Ela existe para o trabalho estar pronto
-- quando a Meta aprovar, e para as decisões abaixo ficarem escritas antes de
-- alguém precisar decidir com pressa.
--
-- Dados reais da conta (Business Portfolio 1683812456098514):
--   WABA ID           1777955220017913   ← gestão de templates
--   Phone Number ID   1255756280958635   ← ENVIO de mensagem
--   Número            +55 84 8876-9187 · CarboZé · Graph API v25.0
-- ⚠️ Os dois ids não são intercambiáveis, e trocá-los é o erro mais comum da
-- migração. Nenhum dos dois é segredo; o token e o app secret são, e ficam nos
-- secrets da função — nunca aqui.
--
--
-- ── ⚠️ As quatro coisas que MUDAM de significado ─────────────────────────
--
-- 1. A REDAÇÃO SAI DAQUI. Aprovado o template, o texto que o cliente lê é o da
--    Meta. `carbo_msg_templates.texto` vira espelho de conferência para as
--    etapas da Meta: editar ali não muda o que sai. Sem esta linha escrita, a
--    tela mostraria uma coisa e o cliente receberia outra — a mesma doença do
--    `quotePdf.ts`, que passou meses divergindo no `mkt` sem dar erro.
--
-- 2. "VARIÁVEL VAZIA APAGA A LINHA" MORRE. Era uma boa regra do texto livre:
--    pedido sem link de rastreio perdia a linha "Acompanhe aqui:" em vez de
--    mandar um rótulo seguido de nada. A Meta RECUSA o envio com parâmetro
--    vazio (erro 132000) e não aceita `\n`, tab nem 4+ espaços dentro de um
--    parâmetro (132007). O mesmo pedido que hoje sai com uma linha a menos
--    passaria a NÃO SAIR.
--
--    A substituta está em `meta_variaveis`, e ela tem duas faces de propósito:
--      · com `fallback`  → manda o texto de reserva
--      · sem `fallback`  → SEGURA o envio até o dado existir
--    O padrão (sem fallback) é o seguro. `rastreio` não tem fallback: mandar
--    "Código de rastreio: consulte" com um botão apontando para uma URL sem
--    código é pior do que esperar dez minutos pelo código de verdade.
--
-- 3. O PDF DA NOTA NÃO VAI MAIS JUNTO. Os seis templates foram submetidos com
--    `header: null` — sem cabeçalho não existe anexo de documento, e header é
--    coisa que se declara na APROVAÇÃO, não no envio. Anexar a NF ali era
--    decisão consciente ("o arquivo fica salvo na conversa, que é onde ele vai
--    procurar daqui a três meses") e ela se perde nesta troca. Fica registrado
--    para ser uma escolha, e não uma surpresa: recuperar isso é template novo,
--    com header DOCUMENT, e fila de aprovação de novo.
--
-- 4. "ENVIADO" PASSA A TER PROVA. Hoje `enviado` significa "o n8n aceitou o
--    POST" — o mesmo sinal fraco do `pg_cron` marcando `succeeded` por ter
--    postado, que já custou 25 h de sincronismo morto neste projeto. A Meta
--    devolve o `wamid` e depois reporta sent → delivered → read → failed. É o
--    ganho principal da troca, e é por isso que o envio vai DIRETO daqui para
--    o Graph API: passando pelo n8n, o wamid fica lá.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o transporte é da ETAPA                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_msg_templates
  add column if not exists canal_envio text not null default 'evolution'
    check (canal_envio in ('evolution','meta'));

comment on column public.carbo_msg_templates.canal_envio is
  'Por onde ESTA etapa sai. As seis da esteira vão pela Cloud API da Meta; recompra e carrinho seguem na Evolution pelo n8n. O padrão é evolution para que etapa nova nasça no caminho que não exige aprovação.';

alter table public.carbo_msg_templates
  add column if not exists meta_template_nome text;
alter table public.carbo_msg_templates
  add column if not exists meta_idioma text not null default 'pt_BR';

-- ── O mapeamento das variáveis ────────────────────────────────────────────
--
-- Array ORDENADO. A ordem tem de ser a mesma do corpo aprovado: o formato é
-- nomeado (`parameter_name`), o que protege contra trocar rastreio por número
-- do pedido, mas a Meta ainda espera os parâmetros na ordem em que aparecem.
--
--   nome      o `parameter_name` que vai no payload
--   de        a coluna de `carbo_msg_fila` que alimenta
--   fallback  texto quando o valor está vazio. AUSENTE = segura o envio.
alter table public.carbo_msg_templates
  add column if not exists meta_variaveis jsonb not null default '[]'::jsonb;

comment on column public.carbo_msg_templates.meta_variaveis is
  'Array ORDENADO de {nome, de, fallback}. `de` é a coluna de carbo_msg_fila. SEM `fallback` a variável é obrigatória e o envio ESPERA o dado — a Meta recusa parâmetro vazio (132000), então a regra antiga de apagar a linha não existe mais.';

-- ⚠️ O botão continua POSICIONAL (index 0) mesmo com o corpo nomeado, e o
-- parâmetro é só o SUFIXO da URL — nunca a URL inteira. Aqui se diz de qual
-- coluna sai o sufixo; sem valor, o envio espera, pela mesma regra acima.
alter table public.carbo_msg_templates
  add column if not exists meta_botao_url_de text;

comment on column public.carbo_msg_templates.meta_botao_url_de is
  'Coluna de carbo_msg_fila que alimenta o parâmetro do botão URL (index 0). O valor enviado é APENAS o sufixo — a base https://rastreio.carboze.com.br/rastreio/ está no template aprovado. NULL = template sem botão.';

-- ── O estado na Meta, espelhado ───────────────────────────────────────────
--
-- ⚠️ Esta coluna é uma TRAVA, não informação. Enquanto ela não for APPROVED, a
-- fila não entrega a etapa — então ligar `ativo` cedo demais não vira uma
-- rajada de erro 132001, vira nada. É o padrão "ausência FECHA" do CRON_SECRET
-- aplicado à aprovação.
alter table public.carbo_msg_templates
  add column if not exists meta_status text not null default 'PENDING'
    check (meta_status in ('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL'));
alter table public.carbo_msg_templates
  add column if not exists meta_status_em timestamptz;
alter table public.carbo_msg_templates
  add column if not exists meta_motivo_recusa text;

comment on column public.carbo_msg_templates.meta_status is
  'Espelho do status na Meta, atualizado pelo webhook message_template_status_update. É TRAVA: a fila não entrega etapa `meta` que não esteja APPROVED. Ligar `ativo` antes da aprovação não produz erro em massa — produz nada.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — os seis templates aprovados (ou em análise)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Nomes, ordem das variáveis e botões conferidos contra o `templates.json` da
-- conta. `saiu_entrega` é etapa nossa que não vem da view — ela nasce do
-- rastreio — e por isso estava fora da lista dos "cinco da esteira".

update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'pedido_confirmado_separacao',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"}
  ]'::jsonb,
  meta_botao_url_de = null
where etapa = 'confirmado';

update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'nota_fiscal_emitida',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"},
    {"nome":"nf","de":"nf"}
  ]'::jsonb,
  meta_botao_url_de = null
where etapa = 'nf_emitida';

-- ⚠️ `rastreio` SEM fallback, aqui e nos outros dois com botão. A etapa
-- `etiqueta` também dispara por `me.situacao = 'gerado'`, e etiqueta gerada no
-- Melhor Envio pode ainda não ter código. Sem código, o corpo diria "Código de
-- rastreio:" seguido de reserva e o botão apontaria para uma URL truncada —
-- o cliente clica e cai numa página de erro. Melhor o aviso chegar dez minutos
-- depois, com o código certo.
update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'pedido_aguardando_coleta',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"},
    {"nome":"transportadora","de":"transportadora","fallback":"transportadora"},
    {"nome":"rastreio","de":"rastreio"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio'
where etapa = 'etiqueta';

-- `previsao` COM fallback: ela vem de `rastreio_card.previsao_entrega` e é
-- nula com frequência (o Melhor Envio nem sempre devolve prazo). Segurar o
-- aviso de "a caminho" por falta de previsão seria trocar a informação que
-- importa — o código de rastreio — por uma que é acessório.
update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'pedido_a_caminho',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"},
    {"nome":"transportadora","de":"transportadora","fallback":"transportadora"},
    {"nome":"rastreio","de":"rastreio"},
    {"nome":"previsao","de":"previsao","fallback":"a confirmar"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio'
where etapa = 'em_transito';

update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'pedido_saiu_para_entrega',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"},
    {"nome":"rastreio","de":"rastreio"}
  ]'::jsonb,
  meta_botao_url_de = 'rastreio'
where etapa = 'saiu_entrega';

update public.carbo_msg_templates set
  canal_envio = 'meta',
  meta_template_nome = 'pedido_entregue',
  meta_variaveis = '[
    {"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"},
    {"nome":"pedido","de":"pedido"}
  ]'::jsonb,
  meta_botao_url_de = null
where etapa = 'entregue';

-- As comerciais ficam onde estão, e agora está escrito.
update public.carbo_msg_templates set canal_envio = 'evolution'
where etapa in ('recompra','carrinho_1','carrinho_2','carrinho_3');

-- ⚠️ E `meta_status` NULL nelas: "não se aplica", não "esperando aprovação".
-- O `default 'PENDING'` da coluna carimbou as dez linhas, e quem abrisse esta
-- tabela daqui a três meses leria que os templates do carrinho aguardam a Meta
-- — eles nem vão para lá. A trava não muda: ela só olha `meta_status` quando
-- `canal_envio = 'meta'`.
alter table public.carbo_msg_templates
  alter column meta_status drop not null;

update public.carbo_msg_templates
set meta_status = null
where canal_envio = 'evolution';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o registro passa a saber o que aconteceu DEPOIS do envio    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.carbo_msg_envios
  add column if not exists canal text not null default 'evolution';
alter table public.carbo_msg_envios
  add column if not exists wamid text;
-- ⚠️ O número que a Meta devolve pode ser DIFERENTE do que mandamos: no Brasil
-- o 9º dígito varia por DDD e por idade do cadastro. `contacts[0].wa_id` é o
-- número real na base do WhatsApp, e é ELE que serve para os próximos envios.
-- Guardar só o que enviamos é como guardar o endereço que digitamos em vez do
-- que o carteiro usou.
alter table public.carbo_msg_envios
  add column if not exists wa_id text;
alter table public.carbo_msg_envios
  add column if not exists erro_codigo integer;
alter table public.carbo_msg_envios
  add column if not exists erro_detalhe text;
alter table public.carbo_msg_envios
  add column if not exists payload jsonb;
alter table public.carbo_msg_envios
  add column if not exists entregue_em timestamptz;
alter table public.carbo_msg_envios
  add column if not exists lido_em timestamptz;

-- O webhook encontra o envio pelo wamid. Único porque a Meta não reaproveita.
create unique index if not exists carbo_msg_envios_wamid_idx
  on public.carbo_msg_envios (wamid) where wamid is not null;

alter table public.carbo_msg_envios
  drop constraint if exists carbo_msg_envios_status_check;
alter table public.carbo_msg_envios
  add constraint carbo_msg_envios_status_check
  check (status in ('pendente','enviado','erro','ignorado','entregue','lido','falhou'));

comment on column public.carbo_msg_envios.wamid is
  'Id da mensagem na Meta (wamid.HBg…). É a chave pela qual o webhook de status reporta entregue/lido/falhou. Sem ele, "enviado" significa apenas "a API aceitou".';


-- ── ⚠️ O status só ANDA para a frente ─────────────────────────────────────
--
-- A Meta reentrega webhooks e não garante ordem. Sem esta regra, um `delivered`
-- atrasado chegando depois do `read` rebaixaria a mensagem de "lida" para
-- "entregue" — e o relatório mostraria menos leitura do que houve.
--
-- A exceção é `failed`, que precisa poder vencer um `sent` anterior: a falha
-- 131026 (número não tem WhatsApp) chega DEPOIS do aceite. Mas não vence
-- entrega: falha depois de entregue não existe, e aceitar isso apagaria a
-- prova de que o cliente recebeu.

create or replace function public.carbo_msg_status_rank(p_status text)
returns integer language sql immutable as $$
  select case p_status
    when 'pendente'  then 0
    when 'ignorado'  then 0
    when 'erro'      then 1
    when 'falhou'    then 1
    when 'enviado'   then 2
    when 'entregue'  then 3
    when 'lido'      then 4
    else 0
  end;
$$;

create or replace function public.carbo_msg_status_meta(
  p_wamid   text,
  p_status  text,               -- sent | delivered | read | failed
  p_quando  timestamptz default now(),
  p_erro_codigo integer default null,
  p_erro_detalhe text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_novo text;
  v_atual text;
begin
  v_novo := case lower(p_status)
              when 'sent'      then 'enviado'
              when 'delivered' then 'entregue'
              when 'read'      then 'lido'
              when 'failed'    then 'falhou'
              else null end;
  if v_novo is null then return false; end if;

  select status into v_atual from public.carbo_msg_envios where wamid = p_wamid;
  -- Envio que não conhecemos: não inventa linha. Pode ser mensagem mandada por
  -- fora do sistema (teste no painel), e criar registro para ela sujaria a
  -- contagem do que a esteira avisou.
  if v_atual is null then return false; end if;

  if v_novo = 'falhou' then
    -- Falha só vale enquanto não houve entrega.
    if public.carbo_msg_status_rank(v_atual) >= 3 then return false; end if;
  elsif public.carbo_msg_status_rank(v_novo) <= public.carbo_msg_status_rank(v_atual) then
    return false;
  end if;

  update public.carbo_msg_envios set
    status = v_novo,
    entregue_em = case when v_novo in ('entregue','lido')
                       then coalesce(entregue_em, p_quando) else entregue_em end,
    lido_em     = case when v_novo = 'lido'
                       then coalesce(lido_em, p_quando) else lido_em end,
    erro_codigo = coalesce(p_erro_codigo, erro_codigo),
    erro_detalhe= coalesce(p_erro_detalhe, erro_detalhe),
    motivo      = case when v_novo = 'falhou'
                       then coalesce(p_erro_detalhe, motivo) else motivo end
  where wamid = p_wamid;

  return true;
end $$;

comment on function public.carbo_msg_status_meta is
  'Aplica um status do webhook da Meta ao envio. O status só ANDA (a Meta reentrega e não garante ordem); failed é a única exceção, e mesmo ela não vence uma entrega já registrada.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a janela de 24 h, e a reentrega do webhook                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Toda a esteira é conversa INICIADA pela empresa, então é sempre template e a
-- janela não entra na conta. Ela entra na conta do ATENDIMENTO: quando o
-- cliente responde, abre-se 24 h em que dá para mandar texto livre. Sem saber
-- disso, o time responde e a Meta recusa com 131047.
--
-- Guardar por `wa_id` e não por `bling_id`: a janela é da PESSOA, não do
-- pedido. Quem tem dois pedidos abertos tem uma janela só.

create table if not exists public.carbo_wa_contatos (
  wa_id           text primary key,
  nome            text,
  last_inbound_at timestamptz,
  criado_em       timestamptz not null default now()
);

comment on table public.carbo_wa_contatos is
  'Quem falou com o número oficial e quando. `last_inbound_at` é o que abre a janela de 24h para texto livre — fora dela, só template (erro 131047). A janela é da PESSOA, não do pedido.';

create or replace function public.carbo_wa_janela_aberta(p_wa_id text)
returns boolean language sql stable as $$
  select coalesce(
    (select last_inbound_at > now() - interval '24 hours'
     from public.carbo_wa_contatos where wa_id = p_wa_id),
    false);
$$;

-- ⚠️ A Meta REENTREGA webhook, e reentrega gera processamento duplicado. Para
-- status isso é inofensivo (a regra do rank já ignora), mas para mensagem
-- recebida seria uma resposta do cliente contada duas vezes. A chave é
-- explícita: id do evento + o que ele diz.
create table if not exists public.carbo_wa_eventos (
  chave       text primary key,
  recebido_em timestamptz not null default now()
);

comment on table public.carbo_wa_eventos is
  'Idempotência do webhook da Meta: chave = <id>:<status> para statuses, <id> para mensagens recebidas. A Meta reentrega, e reentrega sem esta tabela vira evento contado duas vezes.';

alter table public.carbo_wa_contatos enable row level security;
alter table public.carbo_wa_eventos  enable row level security;
drop policy if exists carbo_wa_contatos_leitura on public.carbo_wa_contatos;
drop policy if exists carbo_wa_contatos_service on public.carbo_wa_contatos;
drop policy if exists carbo_wa_eventos_service  on public.carbo_wa_eventos;
create policy carbo_wa_contatos_leitura on public.carbo_wa_contatos
  for select to authenticated using (true);
create policy carbo_wa_contatos_service on public.carbo_wa_contatos
  for all to service_role using (true) with check (true);
-- ⚠️ `carbo_wa_eventos` NÃO ganha policy de leitura: é tabela de máquina, e
-- não há nada nela que uma tela precise. Menos superfície, menos decisão.
create policy carbo_wa_eventos_service on public.carbo_wa_eventos
  for all to service_role using (true) with check (true);

grant select on public.carbo_wa_contatos to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a fila entrega o que o remetente precisa                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Colunas NOVAS, todas no fim — `create or replace view` aceita acrescentar ao
-- final, nunca renomear ou reordenar. O corpo é idêntico ao da 20260913 fora
-- as seis linhas finais e a trava do `meta_status`.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
with cfg as (
  select minutos_1, horas_2, horas_3, valor_minimo, inicio_em
  from public.carbo_carrinho_config where id
),
base as (
  select e.bling_id, e.etapa, e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text as link_carrinho, null::text as produtos
  from public.bling2_esteira e
  where e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'saiu_entrega', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text
  from public.bling2_esteira e
  join public.rastreio_card r on r.codigo = e.rastreio
  where r.status = 'saiu_entrega' and r.entregue_em is null and e.etapa <> 'cancelado'

  union all

  select e.bling_id, 'recompra', e.cliente_fone, e.cliente, e.pedido_loja, e.pedido_numero,
         e.pedido_codigo, e.canal, e.total, e.nf_numero, e.nf_pdf, e.transportadora,
         e.servico, e.rastreio, e.entrega_cidade, e.entrega_uf,
         null::text, null::text
  from public.bling2_esteira e
  join public.carbo_recompra_pipeline p on p.bling_id = e.bling_id
  where p.coluna = 'ofertar'

  union all

  select c.checkout_id, 'carrinho_1', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'aberto'
    and now() >= c.abandonado_em + ((select minutos_1 from cfg) || ' minutes')::interval

  union all

  select c.checkout_id, 'carrinho_2', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg1'
    and now() >= p.msg1_em + ((select horas_2 from cfg) || ' hours')::interval

  union all

  select c.checkout_id, 'carrinho_3', c.telefone, c.cliente, null, null,
         null, 'Nuvemshop', c.total, null, null, null,
         null, null, null, null,
         c.link, c.produtos
  from public.carbo_carrinho_pipeline p
  join public.nuvemshop_carrinhos c on c.checkout_id = p.checkout_id
  where p.coluna = 'msg2'
    and now() >= p.msg2_em + ((select horas_3 from cfg) || ' hours')::interval
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
  b.total::numeric(12,2)                           as valor,
  b.nf_numero                                      as nf,
  b.nf_pdf                                         as link_nota,
  b.transportadora,
  b.servico,
  b.rastreio,
  b.entrega_cidade                                 as cidade,
  b.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao,
  t.instancia,
  b.link_carrinho,
  b.produtos,
  case when b.etapa in ('carrinho_1','carrinho_2','carrinho_3','recompra')
       then 1 else 0 end                          as prioridade,
  -- ── Colunas NOVAS, todas no fim ─────────────────────────────────────────
  t.canal_envio,
  t.meta_template_nome,
  t.meta_idioma,
  t.meta_variaveis,
  t.meta_botao_url_de,
  t.meta_status
from base b
join public.carbo_msg_templates t on t.etapa = b.etapa and t.ativo
left join public.rastreio_card r on r.codigo = b.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = b.bling_id
    and v.etapa = b.etapa
    -- Linha `pendente` CONTINUA na fila de propósito: é assim que o atraso_min
    -- do template funciona, e agora também a espera por variável obrigatória.
    and v.status <> 'pendente'
)
  and nullif(trim(coalesce(b.cliente_fone, '')), '') is not null
  -- ⚠️ A TRAVA DA APROVAÇÃO. Etapa da Meta só entra na fila com o template
  -- APPROVED. Ligar `ativo` antes da aprovação passa a não produzir nada, em
  -- vez de produzir uma rajada de erro 132001 com o cliente sem receber e o
  -- registro marcado como enviado.
  and (t.canal_envio <> 'meta' or t.meta_status = 'APPROVED');

grant select on public.carbo_msg_fila to authenticated;

comment on view public.carbo_msg_fila is
  'O que está esperando aviso, de QUATRO origens: etapa da esteira, saiu_entrega (rastreio), régua de recompra e os três passos da recuperação de carrinho. Carrega o transporte da etapa (canal_envio) e, para a Meta, o nome do template e o mapeamento ordenado das variáveis. ⚠️ Linha `pendente` em carbo_msg_envios CONTINUA na fila de propósito: é assim que funcionam o atraso_min e a espera por variável obrigatória. ⚠️ Etapa `meta` só entra com meta_status = APPROVED.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O mapa completo. Seis linhas `meta` PENDING e quatro `evolution`.
select etapa, ativo, canal_envio, meta_template_nome, meta_status,
       jsonb_array_length(meta_variaveis) as vars, meta_botao_url_de
from public.carbo_msg_templates
order by canal_envio, etapa;

-- (b) ⚠️ A prova de que nada foi ligado. Tem de vir ZERO ativo.
select count(*) as templates_ligados from public.carbo_msg_templates where ativo;

-- (c) ⚠️ A prova da trava da aprovação: com tudo PENDING, nenhuma etapa da
--     Meta pode entrar na fila mesmo que alguém ligue o `ativo`. Tem de vir
--     ZERO — e continuar zero até a Meta aprovar.
select count(*) as meta_na_fila from public.carbo_msg_fila where canal_envio = 'meta';

-- (d) O ensaio do mapeamento, sem enviar nada: para cada etapa da Meta, quais
--     pedidos de hoje TERIAM todas as variáveis obrigatórias e quais ficariam
--     esperando. É a medida de quanto a regra nova segura na prática.
with alvo as (
  select t.etapa, t.meta_template_nome, v->>'nome' as variavel,
         v->>'de' as coluna, (v ? 'fallback') as tem_fallback
  from public.carbo_msg_templates t,
       lateral jsonb_array_elements(t.meta_variaveis) v
  where t.canal_envio = 'meta'
)
select etapa, meta_template_nome,
       string_agg(variavel || case when tem_fallback then '' else ' (obrigatória)' end,
                  ', ' order by variavel) as variaveis
from alvo group by 1, 2 order by 1;

-- (e) ⚠️ Quantos pedidos em `etiqueta` estão SEM código de rastreio hoje. São
--     exatamente os que a regra nova vai segurar em vez de mandar um botão
--     quebrado. Se o número for grande, vale rever a decisão antes de ligar.
select count(*) as etiqueta_sem_codigo
from public.bling2_esteira
where etapa = 'etiqueta' and rastreio is null;
