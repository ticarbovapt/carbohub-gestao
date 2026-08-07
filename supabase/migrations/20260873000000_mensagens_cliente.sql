-- ═══════════════════════════════════════════════════════════════════════════
-- Aviso ao cliente a cada movimentação da esteira
--
-- O quadro anda sozinho (Bling → NF → etiqueta → transportadora → entrega). A
-- cada avanço o cliente recebe um WhatsApp. A mensagem é montada AQUI, pronta,
-- e o n8n só entrega — o workflow dele já aceita `card.mensagem` e, quando ela
-- vem, nem consulta os templates dele. Uma redação, um lugar.
--
-- ── Quem decide que houve movimentação ────────────────────────────────────
--
-- O banco, e só ele. A etapa é CALCULADA pela view `bling2_esteira`; não existe
-- registro de transição. Se a tela disparasse ao renderizar, um F5 reenviaria
-- tudo — é exatamente o erro que já custou três toasts de venda por pedido
-- antigo depois de um refresh.
--
-- Então o que existe é o oposto: uma tabela do que JÁ FOI avisado. A chave
-- (bling_id, etapa) é única, e é ela que garante uma mensagem por etapa por
-- pedido, para sempre — mesmo que o cron rode duas vezes, mesmo que o pedido
-- volte de etapa, mesmo que alguém reprocesse a esteira.
--
-- ⚠️ NA ATIVAÇÃO, os pedidos que já existem são marcados como avisados sem
-- enviar nada. Sem isso, a primeira rodada mandaria ~600 mensagens para
-- clientes de semanas atrás — gente que já recebeu o produto levando "seu
-- pedido foi confirmado". Isso não se desfaz depois.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Os textos, editáveis pela tela ─────────────────────────────────────────

create table if not exists public.carbo_msg_templates (
  etapa       text primary key
                check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito','entregue')),
  ativo       boolean not null default false,
  titulo      text not null,
  texto       text not null,
  -- Minutos de espera depois de a etapa ser detectada. Serve para a mensagem
  -- de pós-entrega: avisar "chegou?" no mesmo minuto em que a transportadora
  -- baixa a entrega é pedir avaliação antes de a pessoa abrir a caixa.
  atraso_min  integer not null default 0 check (atraso_min >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

comment on table public.carbo_msg_templates is
  'Texto de cada aviso ao cliente, editável em /ecommerce/mensagens. Variáveis no formato {{nome}}. `ativo` desligado = etapa não dispara.';

comment on column public.carbo_msg_templates.atraso_min is
  'Espera antes de enviar. Existe para o pós-entrega: perguntar "chegou tudo certo?" no minuto da baixa é antes de a pessoa abrir a caixa.';

insert into public.carbo_msg_templates (etapa, ativo, titulo, texto, atraso_min) values
  ('confirmado', false, 'Compra identificada',
   'Oi, {{primeiro_nome}}! Aqui é da Carbo 👋' || chr(10) || chr(10) ||
   'Recebemos seu pedido {{pedido}} e ele já está em separação.' || chr(10) ||
   'Assim que a nota for emitida e o envio postado, te aviso por aqui com o código de rastreio.' || chr(10) || chr(10) ||
   'Qualquer dúvida é só responder esta mensagem.', 0),

  ('nf_emitida', false, 'Nota fiscal emitida',
   'Oi, {{primeiro_nome}}! Boas notícias 📄' || chr(10) || chr(10) ||
   'A nota fiscal do seu pedido {{pedido}} foi emitida (NF {{nf}}).' || chr(10) ||
   'O próximo passo é a coleta pela transportadora — te aviso assim que sair.', 0),

  ('etiqueta', false, 'Etiqueta gerada',
   'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} está embalado e aguardando a coleta da {{transportadora}}.' || chr(10) ||
   'Assim que ela retirar, te mando o rastreio.', 0),

  ('em_transito', false, 'A caminho — com rastreio',
   'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} saiu para entrega 🚚' || chr(10) || chr(10) ||
   'Transportadora: {{transportadora}}' || chr(10) ||
   'Código de rastreio: {{rastreio}}' || chr(10) ||
   'Acompanhe aqui: {{link_rastreio}}' || chr(10) ||
   'Previsão de entrega: {{previsao}}' || chr(10) || chr(10) ||
   'Se precisar de qualquer coisa, é só chamar.', 0),

  ('entregue', false, 'Pós-entrega',
   'Oi, {{primeiro_nome}}! Seu pedido {{pedido}} foi entregue ✅' || chr(10) || chr(10) ||
   'Deu tudo certo com a entrega? Se faltou alguma coisa ou o produto chegou com problema, me responde aqui que eu resolvo.' || chr(10) || chr(10) ||
   'Se estiver tudo ok, ficamos felizes em ter você com a gente 💚', 180)
on conflict (etapa) do nothing;


-- ── O que já foi avisado ───────────────────────────────────────────────────

create table if not exists public.carbo_msg_envios (
  bling_id    bigint not null,
  etapa       text   not null,
  -- Chave dupla: uma mensagem por etapa por pedido, para sempre. É o que
  -- segura o cron rodando duas vezes e o pedido que volta de etapa.
  primary key (bling_id, etapa),

  detectado_em timestamptz not null default now(),
  enviado_em   timestamptz,
  telefone     text,
  mensagem     text,
  status       text not null default 'pendente'
                 check (status in ('pendente','enviado','erro','ignorado')),
  motivo       text,
  resposta     jsonb
);

create index if not exists carbo_msg_envios_status_idx
  on public.carbo_msg_envios (status, detectado_em desc);

comment on table public.carbo_msg_envios is
  'Registro do que já foi avisado ao cliente. A PK (bling_id, etapa) é a garantia de uma mensagem por etapa por pedido — o cron é idempotente por causa dela.';


-- ── Marco zero: o que existe hoje NÃO é avisado ───────────────────────────
--
-- Sem isto, a primeira rodada trataria 148 pedidos como "acabou de mudar de
-- etapa" e mandaria centenas de mensagens para gente que já recebeu o produto.
-- Marca tudo como ignorado, com o motivo escrito.

insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, enviado_em)
select e.bling_id, e.etapa, 'ignorado', 'já existia quando o aviso foi ligado', now()
from public.bling2_esteira e
on conflict (bling_id, etapa) do nothing;


-- ── A fila ─────────────────────────────────────────────────────────────────
--
-- Uma linha por pedido que MUDOU para uma etapa ainda não avisada, já com todos
-- os campos que os textos usam. A função de envio não faz consulta nenhuma: lê
-- daqui, troca as variáveis e entrega ao n8n.

create or replace view public.carbo_msg_fila
with (security_invoker = true) as
select
  e.bling_id,
  e.etapa,
  t.titulo,
  t.texto,
  t.atraso_min,
  e.cliente_fone                                   as telefone,
  e.cliente                                        as nome,
  split_part(trim(e.cliente), ' ', 1)              as primeiro_nome,
  coalesce(e.pedido_loja, e.pedido_numero, '')     as pedido,
  e.canal,
  e.total                                          as valor,
  e.nf_numero                                      as nf,
  e.transportadora,
  e.servico,
  e.rastreio,
  e.entrega_cidade                                 as cidade,
  e.entrega_uf                                     as uf,
  r.url_rastreio                                   as link_rastreio,
  r.previsao_entrega                               as previsao
from public.bling2_esteira e
join public.carbo_msg_templates t
  on t.etapa = e.etapa and t.ativo
left join public.rastreio_card r
  on r.codigo = e.rastreio
where not exists (
  select 1 from public.carbo_msg_envios v
  where v.bling_id = e.bling_id and v.etapa = e.etapa
)
  -- Sem telefone não há o que fazer. Fica de fora da fila em vez de virar
  -- erro repetido a cada rodada.
  and nullif(trim(coalesce(e.cliente_fone, '')), '') is not null;

comment on view public.carbo_msg_fila is
  'Pedidos que mudaram para uma etapa ainda não avisada, com os campos que os textos usam. A função de envio só troca as variáveis e entrega ao n8n.';

grant select on public.carbo_msg_fila, public.carbo_msg_templates, public.carbo_msg_envios to authenticated;


-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.carbo_msg_templates enable row level security;
alter table public.carbo_msg_envios    enable row level security;

drop policy if exists carbo_msg_templates_leitura on public.carbo_msg_templates;
drop policy if exists carbo_msg_templates_escrita on public.carbo_msg_templates;
drop policy if exists carbo_msg_envios_leitura    on public.carbo_msg_envios;
drop policy if exists carbo_msg_envios_service    on public.carbo_msg_envios;
drop policy if exists carbo_msg_templates_service on public.carbo_msg_templates;

create policy carbo_msg_templates_leitura on public.carbo_msg_templates
  for select to authenticated using (true);
-- Editar o texto é decisão de quem opera; a tela fica no admin.
create policy carbo_msg_templates_escrita on public.carbo_msg_templates
  for update to authenticated using (true) with check (true);
create policy carbo_msg_envios_leitura on public.carbo_msg_envios
  for select to authenticated using (true);

create policy carbo_msg_templates_service on public.carbo_msg_templates
  for all to service_role using (true) with check (true);
create policy carbo_msg_envios_service on public.carbo_msg_envios
  for all to service_role using (true) with check (true);

grant update (ativo, titulo, texto, atraso_min, atualizado_em, atualizado_por)
  on public.carbo_msg_templates to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Os cinco textos, todos DESLIGADOS. Nada dispara até alguém ligar na tela.
select etapa, ativo, titulo, atraso_min, length(texto) as tamanho
from public.carbo_msg_templates order by
  array_position(array['confirmado','nf_emitida','etiqueta','em_transito','entregue'], etapa);

-- (b) O marco zero. Estes NÃO serão avisados — é o que impede o disparo em
--     massa para clientes antigos.
select status, motivo, count(*) as pedidos
from public.carbo_msg_envios group by 1, 2;

-- (c) A fila tem de estar VAZIA agora (nenhum template ativo).
select count(*) as na_fila from public.carbo_msg_fila;
