-- =====================================================================
-- Quadros do Marketing: LEMBRETE e RECORRÊNCIA nas datas do cartão
-- (mapeamento Trello × sistema, prioridade MÉDIA, "Datas").
--
-- LEMBRETE — "avisar N minutos antes da entrega", como no Trello.
-- ⚠️ É COMPLEMENTO do aviso diário de prazo (`mkt_avisar_prazos`, 11:17 UTC),
-- não substituto: aquele avisa todo cartão com prazo, sem ninguém pedir; este
-- só avisa quem ESCOLHEU um lembrete, na hora escolhida.
-- ⚠️ Mesma trava de dedupe (`mkt_aviso_prazo`, chave cartão + tipo + prazo):
-- rodar de novo não avisa de novo, MUDAR o prazo avisa de novo.
-- ⚠️ Não avisa lembrete VELHO: quem põe "1 dia antes" num cartão que vence
-- daqui a 2 horas recebe o aviso na hora; quem põe lembrete num cartão que
-- venceu ontem não recebe nada (atrasado é com o aviso diário).
--
-- RECORRÊNCIA — ao CONCLUIR um cartão recorrente nasce a próxima ocorrência
-- (o que o Trello faz). Gatilho, e não tela: o círculo da frente do cartão, o
-- "Concluído" do cartão aberto e a edição rápida concluem por caminhos
-- diferentes, e regra na tela seria regra que um deles esquece.
-- ⚠️ A recorrência MUDA DE DONO: sai do cartão concluído e vai para o novo.
-- Sem isso, desmarcar e marcar o concluído de novo criaria outra cópia.
-- ⚠️ A próxima data anda a partir da ENTREGA, não de hoje (como no Trello),
-- e pula o que já passou: concluir com uma semana de atraso um cartão diário
-- não cria sete cartões nem um que já nasce atrasado.
-- ⚠️ A cópia leva etiquetas, membros, campos e checklist DESMARCADO; não leva
-- comentários nem anexos (são da ocorrência que passou) nem `trello_id`.
-- ⚠️ Se a cópia falhar, a conclusão falha junto e a tela mostra o erro:
-- engolir aqui seria a recorrência sumindo calada.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só lê)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: colunas = 0 · o check de `tipo` com 'amanha','hoje','atrasou'
-- · cron_prazos = 1 · cron_lembretes = 0
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'mkt_cards'
      and column_name in ('lembrete_minutos','recorrencia')) as colunas,
  (select string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
     from pg_constraint where conrelid = 'public.mkt_aviso_prazo'::regclass and contype = 'c') as check_tipo,
  (select count(*) from cron.job where jobname = 'mkt-avisar-prazos') as cron_prazos,
  (select count(*) from cron.job where jobname = 'mkt-lembretes-5min') as cron_lembretes;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — colunas e o tipo 'lembrete' no dedupe                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.mkt_cards add column if not exists lembrete_minutos integer;
alter table public.mkt_cards add column if not exists recorrencia text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mkt_cards_lembrete_minutos_check') then
    alter table public.mkt_cards add constraint mkt_cards_lembrete_minutos_check
      check (lembrete_minutos is null or lembrete_minutos between 0 and 20160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mkt_cards_recorrencia_check') then
    alter table public.mkt_cards add constraint mkt_cards_recorrencia_check
      check (recorrencia is null or recorrencia in ('diaria','semanal','mensal','anual'));
  end if;
end $$;

-- O check de `tipo` do dedupe é refeito com 'lembrete'. Procurado pelo
-- CONTEÚDO, não pelo nome: o nome é o que o Postgres escolheu na criação.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.mkt_aviso_prazo'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%atrasou%'
  loop
    execute format('alter table public.mkt_aviso_prazo drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.mkt_aviso_prazo add constraint mkt_aviso_prazo_tipo_check
  check (tipo in ('amanha','hoje','atrasou','lembrete'));

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o lembrete (cron a cada 5 min)                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Quem recebe: os mesmos do aviso diário — MEMBROS; sem membro, quem criou.
create or replace function public.mkt_avisar_lembretes()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with alvo as (
    select c.id, c.title, c.due_date, c.created_by, b.title as quadro, c.lembrete_minutos
    from public.mkt_cards c
    join public.mkt_lists  l on l.id = c.list_id
    join public.mkt_boards b on b.id = c.board_id
    where c.lembrete_minutos is not null and c.due_date is not null
      and not c.is_complete and not c.is_archived
      and not l.is_archived and not b.is_archived and c.mirror_of is null
      and c.due_date - make_interval(mins => c.lembrete_minutos) <= now()
      and c.due_date > now() - interval '30 minutes'
  ), novos as (
    insert into public.mkt_aviso_prazo (card_id, tipo, due_date)
    select id, 'lembrete', due_date from alvo
    on conflict do nothing
    returning card_id
  ), quem as (
    select a.*, m.user_id from alvo a join novos n on n.card_id = a.id
    join public.mkt_card_members m on m.card_id = a.id
    union
    select a.*, a.created_by from alvo a join novos n on n.card_id = a.id
    where a.created_by is not null
      and not exists (select 1 from public.mkt_card_members m where m.card_id = a.id)
  )
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select q.user_id, 'mkt_prazo',
         'Lembrete: "' || left(q.title, 80) || '" ' ||
           case when q.due_date <= now() then 'venceu agora' else 'vence às ' ||
             to_char(q.due_date at time zone 'America/Sao_Paulo', 'HH24:MI') ||
             case when (q.due_date at time zone 'America/Sao_Paulo')::date
                       <> (now() at time zone 'America/Sao_Paulo')::date
                  then ' de ' || to_char(q.due_date at time zone 'America/Sao_Paulo', 'DD/MM') else '' end end,
         q.quadro || ' · entrega ' ||
           to_char(q.due_date at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
         'mkt_card', q.id, false
  from quem q
  join public.profiles p on p.id = q.user_id
  where public.carbo_interface_e_interna(p.allowed_interfaces);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mkt_avisar_lembretes() from public, anon, authenticated;

-- Minuto 1, 6, 11…: a grade de 5 em 5 cai sempre sobre algum job; este é SQL
-- puro e leve, e fica fora do :00 e dos :05.
select cron.unschedule('mkt-lembretes-5min') where exists (select 1 from cron.job where jobname = 'mkt-lembretes-5min');
select cron.schedule('mkt-lembretes-5min', '1-59/5 * * * *', $$select public.mkt_avisar_lembretes()$$);

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — recorrência: concluir cria a próxima ocorrência          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.trg_mkt_recorrencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_passo interval; v_due timestamptz; v_delta interval;
  v_novo uuid := gen_random_uuid(); v_pos double precision; v_prox double precision;
  k record; v_k uuid;
begin
  if not (new.is_complete and not old.is_complete) then return null; end if;
  if new.recorrencia is null or new.due_date is null or new.mirror_of is not null or new.is_archived then return null; end if;

  v_passo := case new.recorrencia when 'diaria' then interval '1 day' when 'semanal' then interval '7 days'
                                  when 'mensal' then interval '1 month' else interval '1 year' end;
  v_due := new.due_date + v_passo;
  while v_due <= now() loop v_due := v_due + v_passo; end loop;
  v_delta := v_due - new.due_date;

  -- Logo abaixo do concluído, na mesma lista.
  select min(position) into v_prox from public.mkt_cards
   where list_id = new.list_id and not is_archived and position > new.position;
  v_pos := case when v_prox is null then new.position + 1024 else (new.position + v_prox) / 2 end;

  insert into public.mkt_cards (id, board_id, list_id, title, description, position, start_date, due_date,
                                is_complete, cover, location_lat, location_lng, location_name, created_by,
                                lembrete_minutos, recorrencia)
  values (v_novo, new.board_id, new.list_id, new.title, new.description, v_pos,
          new.start_date + v_delta, v_due, false, new.cover,
          new.location_lat, new.location_lng, new.location_name, coalesce(auth.uid(), new.created_by),
          new.lembrete_minutos, new.recorrencia);

  insert into public.mkt_card_labels (card_id, label_id)
  select v_novo, label_id from public.mkt_card_labels where card_id = new.id;
  insert into public.mkt_card_members (card_id, user_id)
  select v_novo, user_id from public.mkt_card_members where card_id = new.id;
  insert into public.mkt_card_field_values (card_id, field_id, value)
  select v_novo, field_id, value from public.mkt_card_field_values where card_id = new.id;
  for k in select id, title, position from public.mkt_checklists where card_id = new.id loop
    insert into public.mkt_checklists (card_id, title, position) values (v_novo, k.title, k.position) returning id into v_k;
    insert into public.mkt_checklist_items (checklist_id, text, is_done, position, due_date, assignee_id)
    select v_k, text, false, position, due_date + v_delta, assignee_id
      from public.mkt_checklist_items where checklist_id = k.id;
  end loop;

  -- A recorrência passa para o novo. (O gatilho é `update of is_complete`,
  -- então este update não o dispara de novo.)
  update public.mkt_cards set recorrencia = null where id = new.id;
  return null;
end $$;

drop trigger if exists trg_mkt_recorrencia on public.mkt_cards;
create trigger trg_mkt_recorrencia
  after update of is_complete on public.mkt_cards
  for each row execute function public.trg_mkt_recorrencia();

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: colunas = 2 · lembrete_aceito = true · cron = 1 · gatilho = 1
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'mkt_cards'
      and column_name in ('lembrete_minutos','recorrencia')) as colunas,
  (select bool_or(pg_get_constraintdef(oid) ilike '%lembrete%') from pg_constraint
    where conrelid = 'public.mkt_aviso_prazo'::regclass and contype = 'c') as lembrete_aceito,
  (select count(*) from cron.job where jobname = 'mkt-lembretes-5min') as cron,
  (select count(*) from pg_trigger where tgname = 'trg_mkt_recorrencia') as gatilho;
