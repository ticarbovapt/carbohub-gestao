-- Esquema MÍNIMO para testar a 20261177 (só as colunas que as views leem).
drop schema if exists public cascade; create schema public;
drop schema if exists cron cascade; create schema cron;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
grant usage on schema public to authenticated, anon, service_role;

create table cron.job (jobid serial primary key, jobname text, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns int language sql as
  $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
create function cron.unschedule(id int) returns boolean language sql as $$ delete from cron.job where jobid = id; select true $$;

create function public.carbo_e_time_interno() returns boolean language sql as $$ select true $$;
create table public.carbo_backup_viewdef (id bigserial primary key, nome text not null, def text not null, opcoes text, motivo text, guardado_em timestamptz default now());

create table public.carbo_msg_config (id boolean primary key default true, inicio_em timestamptz);
insert into public.carbo_msg_config values (true, '2026-09-21');
create table public.carbo_carrinho_config (id boolean primary key default true, minutos_1 int default 15, horas_2 int default 24, horas_3 int default 48,
  valor_minimo numeric default 0, inicio_em timestamptz default now(), hora_2 int, dias_2 int not null default 1, hora_3 int, dias_3 int not null default 2);
insert into public.carbo_carrinho_config (id) values (true);

create table public.carbo_msg_templates (
  etapa text primary key check (etapa in ('confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue','recompra','carrinho_1','carrinho_2','carrinho_3')),
  ativo boolean not null default false, titulo text not null, texto text not null, atraso_min int not null default 0,
  atualizado_em timestamptz not null default now(), atualizado_por uuid, instancia text,
  canal_envio text not null default 'evolution', meta_template_nome text, meta_idioma text not null default 'pt_BR',
  meta_variaveis jsonb not null default '[]', meta_botao_url_de text, meta_status text not null default 'PENDING',
  numero_id text, teto_diario int, liberar_anteriores boolean not null default false,
  hora_inicio int, hora_fim int, dias_uteis boolean not null default false);
insert into public.carbo_msg_templates (etapa, ativo, titulo, texto, canal_envio, meta_template_nome, meta_status, numero_id, instancia, liberar_anteriores, hora_inicio, hora_fim, dias_uteis, meta_variaveis)
values ('recompra', true, 'Recompra', 'Oi {{primeiro_nome}}', 'meta', 'recompra_lembrete', 'APPROVED', '1274076859132981', 'carbo-comercial', true, 0, 24, false,
        '[{"nome":"primeiro_nome","de":"primeiro_nome","fallback":"tudo bem"}]'),
       ('entregue', true, 'Entregue', 'x', 'meta', 'entregue_t', 'APPROVED', null, null, false, null, null, false, '[]');

create table public.carbo_msg_envios (bling_id bigint not null, etapa text not null, primary key (bling_id, etapa),
  detectado_em timestamptz not null default now(), enviado_em timestamptz, telefone text, mensagem text,
  status text not null default 'pendente', motivo text, resposta jsonb, canal text, wamid text, wa_id text,
  erro_codigo int, erro_detalhe text, payload jsonb, entregue_em timestamptz, lido_em timestamptz, numero_id text);

create table public.carbo_wa_numeros (phone_number_id text primary key, ativo boolean);
insert into public.carbo_wa_numeros values ('1274076859132981', true), ('1255756280958635', true);
create table public.rastreio_card (codigo text, url_rastreio text, previsao_entrega date, status text, entregue_em timestamptz);
create table public.bling2_esteira (bling_id bigint, etapa text, cliente_fone text, cliente text, pedido_loja text, pedido_numero text,
  pedido_codigo text, canal text, total numeric, nf_numero text, nf_pdf text, transportadora text, servico text, rastreio text,
  entrega_cidade text, entrega_uf text, rastreio_transportadora text, me_situacao text, data_pedido date);
create table public.carbo_carrinho_pipeline (checkout_id bigint, coluna text, msg1_em timestamptz, msg2_em timestamptz);
create table public.nuvemshop_carrinhos (checkout_id bigint primary key, abandonado_em timestamptz not null, completado_em timestamptz,
  cliente text, telefone text, email text, total numeric default 0, produtos text, link text);

create table public.carbo_recompra_config (id boolean primary key default true check (id), dias_para_ofertar int not null default 30,
  dias_para_desistir int not null default 2, atualizado_em timestamptz not null default now());
insert into public.carbo_recompra_config (id) values (true);
create table public.carbo_recompra_base (bling_id bigint primary key, pedido_loja text, canal text, cliente text, cliente_fone text,
  cpf_cnpj text, total numeric, entrega_cidade text, entrega_uf text, entregue_em timestamptz, origem text, ofertado_em timestamptz,
  recomprou boolean, contato_id bigint, calculado_em timestamptz not null default now());
create table public.bling2_orders (bling_id bigint primary key, items jsonb, contato_id bigint);

create function public.carbo_fone_chave(p text) returns text language sql immutable as $$
  select case
    when d is null or d = ''                          then null
    when d like '55%' and length(d) in (12, 13)       then substr(d, 3, 2) || right(d, 8)
    when length(d) in (10, 11)                        then substr(d, 1, 2) || right(d, 8)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x; $$;
create table public.carbo_wa_nao_contatar (chave text primary key, wa_id text, numero_id text, motivo text, marcado_por uuid,
  marcado_em timestamptz not null default now(), removido_em timestamptz, removido_por uuid);
create table public.carbo_wa_mensagens (wamid text primary key, wa_id text, numero_id text, direcao text, tipo text, texto text, ocorrido_em timestamptz);
create table public.ecommerce_orders (platform text, order_id text, ordered_at timestamptz, status text, cliente_fone text);
create function public.ecommerce_status_e_venda(p_status text) returns boolean language sql immutable as
  $$ select lower(coalesce(p_status, '')) in ('paid', 'shipped', 'delivered') $$;
