-- ════════════════════════════════════════════════════════════════════════
-- Máquina de Vendas — pipeline das descarbonizações (app Atendimento)
--
-- Substitui o Notion ("Carbovapt Pipeline" + "Máquina de Vendas"): o lead que
-- a Máquina de Vendas traz, do primeiro contato à execução, com a AGENDA do
-- técnico que executa e os lembretes dele.
--
--   mv_leads          um lead por linha (etapa, agenda, valores, parceiro)
--   mv_lead_eventos   o histórico — gravado por GATILHO, nunca pela tela
--   mv_aviso          dedupe dos lembretes (lead, tipo, instante)
--   mv_pessoas()      quem pode ser responsável/técnico (jsonb)
--   mv_avisar_lembretes()   cron: técnico 24 h e 1 h antes; follow-up do responsável
--
-- ⚠️ Nasceu numa BRANCH, guardada até a Máquina de Vendas voltar. Rodar os
--    blocos só junto do merge do front (rota /maquina-de-vendas).
-- ⚠️ Sem policy de DELETE: lead sai por `arquivado_em` — o histórico fica.
-- ⚠️ Os avisos são do tipo `mv_*`, cadastrados em `carbo_notif_tipos` na aba
--    `pessoal` (são da pessoa: o técnico escalado, o responsável pelo lead).
-- ════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — tabelas, RLS, gatilhos                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.mv_leads (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (length(trim(nome)) > 0),
  whatsapp           text,
  link_chat          text,
  cidade             text,
  uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  modelo             text,                     -- veículo(s): "Hilux 2019", "3 caminhões"
  veiculos           int  check (veiculos is null or veiculos between 1 and 500),
  valor              numeric(12,2) check (valor is null or valor >= 0),
  etapa              text not null default 'contato'
                     check (etapa in ('contato','orcado','agendado','executado','perdido')),
  motivo_perda       text,
  anotacoes          text,
  tomador_decisao    text,
  parceiro           text,                     -- licenciado que executa (texto do Notion)
  pago_para          text check (pago_para is null or pago_para in ('carbovapt','licenciado')),
  primeiro_contato_em date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  ultimo_contato_em  date,
  proximo_contato_em timestamptz,
  fechamento_em      date,
  pos_venda_nf       boolean not null default false,
  responsavel_id     uuid references auth.users(id) on delete set null,
  tecnico_id         uuid references auth.users(id) on delete set null,
  agendado_para      timestamptz,
  duracao_min        int not null default 90 check (duracao_min between 15 and 720),
  local_execucao     text,
  order_id           uuid references public.carboze_orders(id) on delete set null,
  arquivado_em       timestamptz,
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Agendado sem data não é agendado: a coluna mentiria na agenda do técnico.
  constraint mv_leads_agendado_tem_data check (etapa <> 'agendado' or agendado_para is not null)
);

create index if not exists mv_leads_etapa_idx       on public.mv_leads (etapa) where arquivado_em is null;
create index if not exists mv_leads_tecnico_idx     on public.mv_leads (tecnico_id, agendado_para);
create index if not exists mv_leads_responsavel_idx on public.mv_leads (responsavel_id);
create index if not exists mv_leads_agenda_idx      on public.mv_leads (agendado_para) where agendado_para is not null;
create index if not exists mv_leads_proximo_idx     on public.mv_leads (proximo_contato_em) where proximo_contato_em is not null;
create index if not exists mv_leads_created_by_idx  on public.mv_leads (created_by);
create index if not exists mv_leads_order_idx       on public.mv_leads (order_id);

create table if not exists public.mv_lead_eventos (
  id        bigint generated always as identity primary key,
  lead_id   uuid not null references public.mv_leads(id) on delete cascade,
  tipo      text not null,      -- criado | etapa | agenda | tecnico | arquivado | restaurado
  de        text,
  para      text,
  user_id   uuid default auth.uid(),
  em        timestamptz not null default now()
);
create index if not exists mv_lead_eventos_lead_idx on public.mv_lead_eventos (lead_id, em desc);

create table if not exists public.mv_aviso (
  lead_id uuid not null references public.mv_leads(id) on delete cascade,
  tipo    text not null,        -- lembrete_24h | lembrete_1h | followup
  chave   timestamptz not null, -- o instante avisado: mudou a data, avisa de novo
  em      timestamptz not null default now(),
  primary key (lead_id, tipo, chave)
);

alter table public.mv_leads        enable row level security;
alter table public.mv_lead_eventos enable row level security;
alter table public.mv_aviso        enable row level security;

drop policy if exists mv_leads_ler     on public.mv_leads;
drop policy if exists mv_leads_criar   on public.mv_leads;
drop policy if exists mv_leads_editar  on public.mv_leads;
create policy mv_leads_ler    on public.mv_leads for select to authenticated using ((select public.carbo_e_time_interno()));
create policy mv_leads_criar  on public.mv_leads for insert to authenticated with check ((select public.carbo_e_time_interno()));
create policy mv_leads_editar on public.mv_leads for update to authenticated
  using ((select public.carbo_e_time_interno())) with check ((select public.carbo_e_time_interno()));

drop policy if exists mv_lead_eventos_ler on public.mv_lead_eventos;
create policy mv_lead_eventos_ler on public.mv_lead_eventos for select to authenticated
  using ((select public.carbo_e_time_interno()));
-- mv_aviso: nenhuma policy — só o cron (dono) lê e grava.

grant select, insert, update on public.mv_leads to authenticated;
grant select on public.mv_lead_eventos to authenticated;

-- updated_at + histórico + aviso ao técnico, num gatilho só (ordem garantida).
create or replace function public.trg_mv_leads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.trg_mv_leads_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quando text;
begin
  -- O histórico nunca derruba a gravação do lead.
  begin
    if tg_op = 'INSERT' then
      insert into public.mv_lead_eventos (lead_id, tipo, para) values (new.id, 'criado', new.etapa);
    else
      if new.etapa is distinct from old.etapa then
        insert into public.mv_lead_eventos (lead_id, tipo, de, para) values (new.id, 'etapa', old.etapa, new.etapa);
      end if;
      if new.agendado_para is distinct from old.agendado_para then
        insert into public.mv_lead_eventos (lead_id, tipo, de, para)
        values (new.id, 'agenda', old.agendado_para::text, new.agendado_para::text);
      end if;
      if new.tecnico_id is distinct from old.tecnico_id then
        insert into public.mv_lead_eventos (lead_id, tipo, de, para)
        values (new.id, 'tecnico', old.tecnico_id::text, new.tecnico_id::text);
      end if;
      if new.arquivado_em is distinct from old.arquivado_em then
        insert into public.mv_lead_eventos (lead_id, tipo)
        values (new.id, case when new.arquivado_em is null then 'restaurado' else 'arquivado' end);
      end if;
    end if;
  exception when others then
    raise warning 'mv_lead_eventos: %', sqlerrm;
  end;

  -- Aviso ao técnico: escalado, data mudou, ou o serviço saiu da agenda.
  -- Nunca para quem fez a mudança (ele já sabe).
  begin
    v_quando := to_char(new.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
    if new.tecnico_id is not null and new.agendado_para is not null and new.arquivado_em is null
       and new.etapa in ('orcado','agendado')
       and (tg_op = 'INSERT'
            or new.tecnico_id is distinct from old.tecnico_id
            or new.agendado_para is distinct from old.agendado_para)
       and new.tecnico_id is distinct from auth.uid() then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
      values (new.tecnico_id, 'mv_agenda',
              case when tg_op = 'UPDATE' and old.tecnico_id = new.tecnico_id and old.agendado_para is not null
                   then 'Descarbonização remarcada: ' else 'Descarbonização na sua agenda: ' end
                || left(new.nome, 60),
              v_quando || coalesce(' · ' || nullif(new.local_execucao, ''), '')
                || coalesce(' · ' || nullif(new.modelo, ''), ''),
              'mv_lead', new.id::text, false);
    end if;
    if tg_op = 'UPDATE' and old.tecnico_id is not null and old.agendado_para is not null
       and old.tecnico_id is distinct from auth.uid()
       and (new.tecnico_id is distinct from old.tecnico_id
            or new.etapa = 'perdido' and old.etapa <> 'perdido'
            or new.arquivado_em is not null and old.arquivado_em is null) then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
      values (old.tecnico_id, 'mv_agenda', 'Saiu da sua agenda: ' || left(new.nome, 60),
              to_char(old.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
              'mv_lead', new.id::text, false);
    end if;
  exception when others then
    raise warning 'mv aviso ao técnico: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists trg_mv_leads on public.mv_leads;
create trigger trg_mv_leads before update on public.mv_leads
  for each row execute function public.trg_mv_leads();
drop trigger if exists trg_mv_leads_depois on public.mv_leads;
create trigger trg_mv_leads_depois after insert or update on public.mv_leads
  for each row execute function public.trg_mv_leads_depois();

revoke execute on function public.trg_mv_leads()        from public, anon, authenticated;
revoke execute on function public.trg_mv_leads_depois() from public, anon, authenticated;

-- Realtime: o quadro de quem está olhando muda junto.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mv_leads') then
    alter publication supabase_realtime add table public.mv_leads;
  end if;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — pessoas (responsável/técnico) e lembretes               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- jsonb (nunca setof): o teto de 1.000 do PostgREST vale para RPC.
create or replace function public.mv_pessoas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.full_name, 'avatar_url', p.avatar_url)
                            order by p.full_name), '[]'::jsonb)
  from public.profiles p
  where (select public.carbo_e_time_interno())
    and public.carbo_interface_e_interna(p.allowed_interfaces)
    and coalesce(p.status, 'active') <> 'inactive'
    and p.full_name is not null;
$$;
revoke execute on function public.mv_pessoas() from public, anon;
grant execute on function public.mv_pessoas() to authenticated;

create or replace function public.mv_avisar_lembretes()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  -- Técnico: 24 h e 1 h antes. Atrasado não avisa (passou de 30 min, é tarde).
  with alvo as (
    select l.*, t.tipo, t.antes
    from public.mv_leads l
    cross join (values ('lembrete_24h', interval '24 hours'), ('lembrete_1h', interval '1 hour')) t(tipo, antes)
    where l.tecnico_id is not null and l.agendado_para is not null and l.arquivado_em is null
      and l.etapa in ('orcado','agendado')
      and l.agendado_para - t.antes <= now()
      and l.agendado_para > now() - interval '30 minutes'
      -- 1 h antes já cobre o de 24 h para quem foi agendado em cima da hora.
      and not (t.tipo = 'lembrete_24h' and l.agendado_para - interval '1 hour' <= now())
  ), novos as (
    insert into public.mv_aviso (lead_id, tipo, chave)
    select id, tipo, agendado_para from alvo
    on conflict do nothing
    returning lead_id, tipo
  )
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select a.tecnico_id, 'mv_lembrete',
         case when a.tipo = 'lembrete_1h' then 'Daqui a 1 hora: '
              when (a.agendado_para at time zone 'America/Sao_Paulo')::date
                   = (now() at time zone 'America/Sao_Paulo')::date then 'Hoje: '
              else 'Amanhã: ' end
           || 'descarbonização · ' || left(a.nome, 60),
         to_char(a.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
           || coalesce(' · ' || nullif(a.local_execucao, ''), '')
           || coalesce(' · ' || nullif(a.modelo, ''), ''),
         'mv_lead', a.id::text, false
  from alvo a join novos x on x.lead_id = a.id and x.tipo = a.tipo;
  get diagnostics k = row_count; n := n + k;

  -- Responsável: retomar o contato na data combinada.
  with alvo as (
    select l.* from public.mv_leads l
    where l.responsavel_id is not null and l.proximo_contato_em is not null
      and l.arquivado_em is null and l.etapa in ('contato','orcado')
      and l.proximo_contato_em <= now()
      and l.proximo_contato_em > now() - interval '2 days'
  ), novos as (
    insert into public.mv_aviso (lead_id, tipo, chave)
    select id, 'followup', proximo_contato_em from alvo
    on conflict do nothing
    returning lead_id
  )
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select a.responsavel_id, 'mv_followup', 'Retomar contato: ' || left(a.nome, 60),
         coalesce(nullif(a.modelo, '') || ' · ', '') || coalesce(a.cidade || coalesce('/' || a.uf, ''), ''),
         'mv_lead', a.id::text, false
  from alvo a join novos x on x.lead_id = a.id;
  get diagnostics k = row_count; n := n + k;

  delete from public.mv_aviso where em < now() - interval '90 days';
  return n;
end $$;
revoke execute on function public.mv_avisar_lembretes() from public, anon, authenticated;

-- Os tipos novos passam pelo porteiro (20261136) como avisos PESSOAIS.
insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('mv_agenda',   '', 'pessoal', 'Agenda de descarbonização', 'Serviço da Máquina de Vendas entrou, mudou ou saiu da sua agenda.'),
  ('mv_lembrete', '', 'pessoal', 'Lembrete de descarbonização', 'Serviço da sua agenda amanhã ou daqui a 1 hora.'),
  ('mv_followup', '', 'pessoal', 'Retomar contato', 'Lead da Máquina de Vendas com retorno combinado para agora.')
on conflict do nothing;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — agendador (rodar por último)                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A cada 10 min, minuto 9: SQL puro e leve.
select cron.unschedule('mv-lembretes-10min') where exists (select 1 from cron.job where jobname = 'mv-lembretes-10min');
select cron.schedule('mv-lembretes-10min', '9-59/10 * * * *', $$select public.mv_avisar_lembretes()$$);

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência (leitura)                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select
--   (select count(*) from pg_class where relname in ('mv_leads','mv_lead_eventos','mv_aviso')) = 3 as tabelas,
--   (select count(*) from public.carbo_notif_tipos where tipo like 'mv\_%') = 3                  as tipos,
--   (select count(*) from cron.job where jobname = 'mv-lembretes-10min') = 1                    as cron,
--   (select count(*) from pg_publication_tables where tablename = 'mv_leads') = 1               as realtime;
