-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 3 — o envio postado vira "enviado" na Nuvemshop
--
-- É a ÚNICA fase que escreve fora daqui, e escrever aqui dispara e-mail para o
-- cliente. Por isso ela é a mais protegida das quatro.
--
-- ── O que dispara ─────────────────────────────────────────────────────────
--
-- Envio do Melhor Envio com `posted_at` (ou entregue), vinculado a um pedido
-- com CERTEZA, cujo pedido na loja ainda não está marcado como enviado.
--
-- ── ⚠️ As quatro travas ───────────────────────────────────────────────────
--
-- 1. SÓ VÍNCULO CONFIRMADO. `ambiguo` e `sem_match` nunca entram na fila. Um
--    pedido casado errado manda e-mail de rastreio para a pessoa errada — e
--    isso é pior do que não mandar, porque não se desfaz.
--
-- 2. SÓ O ENVIO VIGENTE. Etiqueta cancelada e refeita gera `me_id` novo; sem
--    isso, um envio CANCELADO marcaria o pedido como enviado. É o erro que
--    esta fase não pode cometer, apontado pelo dono do processo antes de eu
--    escrever uma linha.
--
-- 3. UMA VEZ, PARA SEMPRE. `carbo_fulfill_log` tem PK (platform, pedido_loja)
--    — a mesma máquina de `carbo_msg_envios`, que já garante isso há meses
--    neste projeto. E o registro é gravado ANTES da chamada: se a API cair no
--    meio, a linha fica como `erro` e não volta para a fila. Perder um aviso é
--    ruim; mandar o mesmo e-mail duas vezes é pior.
--
-- 4. FLAG E DRY-RUN, em tabela. Ligar a escrita não pode exigir deploy, e
--    desligá-la às pressas muito menos. Nasce DESLIGADA e em dry-run.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a chave da idempotência                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_fulfill_log (
  platform      text not null,
  pedido_loja   text not null,
  -- ⚠️ A PK é (plataforma, pedido), NÃO inclui o envio. De propósito: se a
  -- etiqueta for refeita e o pedido já tiver sido marcado como enviado, ele
  -- NÃO pode ser marcado de novo. A chave protege o CLIENTE de receber dois
  -- e-mails, não o envio de ser processado duas vezes.
  primary key (platform, pedido_loja),

  bling_id      bigint,
  me_id         text,
  rastreio      text,
  url_rastreio  text,

  status        text not null default 'pendente'
                  check (status in ('pendente','enviado','erro','ignorado','ensaio')),
  motivo        text,
  -- Auditoria: o que foi chamado e o que a Nuvemshop respondeu. Sem isto,
  -- "marquei como enviado" é palavra minha contra a da plataforma.
  requisicao    jsonb,
  resposta      jsonb,

  detectado_em  timestamptz not null default now(),
  enviado_em    timestamptz,
  disparado_por text not null default 'cron'
);

comment on table public.carbo_fulfill_log is
  'Registro de cada marcação de envio na loja. A PK (platform, pedido_loja) é a garantia de UM e-mail por pedido, para sempre — mesma máquina de carbo_msg_envios. Gravado ANTES da chamada: API que cai no meio deixa a linha como erro e não volta para a fila.';

create index if not exists carbo_fulfill_log_status_idx
  on public.carbo_fulfill_log (status, detectado_em desc);

alter table public.carbo_fulfill_log enable row level security;
drop policy if exists carbo_fulfill_log_leitura on public.carbo_fulfill_log;
drop policy if exists carbo_fulfill_log_service on public.carbo_fulfill_log;
create policy carbo_fulfill_log_leitura on public.carbo_fulfill_log
  for select to authenticated using (true);
create policy carbo_fulfill_log_service on public.carbo_fulfill_log
  for all to service_role using (true) with check (true);

grant select on public.carbo_fulfill_log to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a chave e o freio                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Nasce DESLIGADA e em DRY-RUN. Ligar é decisão de gente, tomada depois de
-- ler o que o ensaio registrou — não efeito colateral de rodar uma migração.

create table if not exists public.carbo_fulfill_config (
  id            boolean primary key default true check (id),
  -- Master switch. `false` = a função lê a fila, registra o que faria, e não
  -- chama a Nuvemshop.
  ativo         boolean not null default false,
  -- Mesmo com `ativo`, o dry-run manda registrar sem chamar. Existe separado do
  -- `ativo` porque são duas perguntas: "esta automação está no ar?" e "ela está
  -- em ensaio?". Um booleano só obrigaria a desligar tudo para ensaiar.
  dry_run       boolean not null default true,
  -- Teto por rodada. Um dia de postagem em lote não pode virar cem e-mails de
  -- uma vez — mesma razão do TETO do kanban-n8n.
  teto_rodada   integer not null default 20 check (teto_rodada between 1 and 200),
  atualizado_em timestamptz not null default now()
);

insert into public.carbo_fulfill_config (id) values (true) on conflict (id) do nothing;

alter table public.carbo_fulfill_config enable row level security;
drop policy if exists carbo_fulfill_config_read  on public.carbo_fulfill_config;
drop policy if exists carbo_fulfill_config_write on public.carbo_fulfill_config;
create policy carbo_fulfill_config_read on public.carbo_fulfill_config
  for select to authenticated using (true);
create policy carbo_fulfill_config_write on public.carbo_fulfill_config
  for update to authenticated using (true) with check (true);

grant select on public.carbo_fulfill_config to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a fila                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Uma linha por pedido que DEVE ser marcado como enviado e ainda não foi.
-- A função não decide nada: lê daqui e executa.

create or replace view public.carbo_fulfill_fila
with (security_invoker = true) as
with pedido as (
  -- ⚠️ A Nuvemshop é chamada pelo ID INTERNO, e `ecommerce_orders` guarda uma
  -- linha por ITEM com `order_id = '<pedido>-<item>'`. A raiz é o id de
  -- verdade — a mesma regra que já conta pedido no dashboard.
  select
    o.platform_order_number,
    public.ecommerce_pedido_raiz(o.platform, o.order_id) as loja_order_id,
    -- O status mais AVANÇADO entre as linhas do pedido. Se qualquer linha já
    -- diz enviado, o pedido está enviado.
    max(case lower(o.status)
          when 'delivered' then 3 when 'shipped' then 2
          when 'cancelled' then -1 when 'paid' then 1 else 0 end) as avanco
  from public.ecommerce_orders o
  where o.platform = 'nuvemshop' and o.platform_order_number is not null
  group by 1, 2
)
select
  v.bling_id,
  b.pedido_loja,
  p.loja_order_id,
  v.me_id,
  v.codigo                       as rastreio,
  v.url_rastreio,
  v.transportadora,
  v.servico,
  v.postado_em,
  v.situacao,
  b.cliente,
  b.total
from public.melhorenvio_envio_vigente v
join public.bling2_esteira b on b.bling_id = v.bling_id
join pedido p on p.platform_order_number = b.pedido_loja
where
  -- Trava 1: só vínculo com CERTEZA. Nem `ambiguo`, nem `sem_match`.
  v.vinculo_status in ('confirmado','manual')
  -- Trava 2: o vigente já vem filtrado (nem cancelado, nem vencido), e aqui só
  -- entra quem de fato saiu.
  and v.situacao in ('postado','entregue')
  and v.codigo is not null
  -- A loja ainda não sabe. `avanco < 2` = não está shipped nem delivered.
  -- ⚠️ E `avanco >= 0` exclui cancelado: marcar como enviado um pedido que a
  -- loja cancelou seria escrever por cima de uma decisão do cliente.
  and p.avanco between 0 and 1
  -- Trava 3: uma vez, para sempre.
  and not exists (
    select 1 from public.carbo_fulfill_log l
    where l.platform = 'nuvemshop' and l.pedido_loja = b.pedido_loja
  );

comment on view public.carbo_fulfill_fila is
  'Pedidos que devem ser marcados como enviados na loja e ainda não foram. Só vínculo confirmado, só envio vigente e postado, só pedido que a loja ainda não sabe. A função de escrita não decide nada: lê daqui.';

grant select on public.carbo_fulfill_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência ANTES de ligar                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A chave está DESLIGADA e em ensaio? Tem de vir false / true.
select ativo, dry_run, teto_rodada from public.carbo_fulfill_config;

-- (b) ⚠️ QUEM RECEBERIA E-MAIL se você ligasse agora. Leia esta lista antes
--     de qualquer coisa: cada linha é um cliente que vai ser notificado.
select pedido_loja, cliente, total, transportadora, rastreio,
       postado_em::date, situacao
from public.carbo_fulfill_fila
order by postado_em;

-- (c) O tamanho do disparo inicial. Se for grande, ligue com o teto baixo e
--     acompanhe as primeiras rodadas antes de abrir.
select count(*) as pedidos_na_fila from public.carbo_fulfill_fila;

-- (d) ⚠️ A prova de que a trava do vínculo funciona: nenhum ambíguo ou
--     sem_match pode aparecer na fila. Tem de vir ZERO.
select count(*) as vazamento_de_vinculo_incerto
from public.carbo_fulfill_fila f
join public.melhorenvio_envios e on e.me_id = f.me_id
where e.vinculo_status not in ('confirmado','manual');

-- (e) ⚠️ A prova da trava do envio cancelado: nenhum pedido cuja etiqueta
--     vigente esteja cancelada ou vencida pode estar aqui. Tem de vir ZERO.
select count(*) as vazamento_de_envio_morto
from public.carbo_fulfill_fila f
join public.melhorenvio_envios e on e.me_id = f.me_id
where e.cancelado_em is not null or e.expirado_em is not null;
