-- ─────────────────────────────────────────────────────────────────────────────
-- Demandas do TI que NÃO são programação.
--
-- Até aqui `kind` só aceitava 'bug' | 'sugestao' — quem precisava de um cabo de
-- monitor, de um login novo ou de ajuda pra usar uma tela abria "bug", o que
-- sujava a métrica de qualidade do software e fazia o pedido chegar rotulado
-- errado no sininho e no grupo Suporte TI.
--
-- Mudança ADITIVA: os dois tipos atuais continuam idênticos (mesmo valor, mesmo
-- texto de notificação). Nada é migrado nem reinterpretado — só passam a caber
-- três categorias novas:
--   infra   Infraestrutura/Equipamento (cabo, monitor, periférico, máquina, rede)
--   acesso  Acesso (criar login, liberar permissão, resetar senha)
--   ajuda   Suporte/Ajuda (dúvida de uso, "me ensina a…")
-- Sem categoria "outro" de propósito: caixa genérica vira lixeira e ninguém
-- consegue medir nada com ela.
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP/ADD CONSTRAINT pega AccessExclusiveLock na tabela. Ninguém escreve em
-- carbo_bug_reports por cron/sync (só usuário pelo app), mas o lock_timeout
-- garante que, se alguém estiver reportando bug neste segundo, a migração falha
-- rápido em vez de segurar a tabela — é só rodar de novo.
set lock_timeout = '5s';

alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_kind_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_kind_check
  check (kind in ('bug','sugestao','infra','acesso','ajuda'));

-- Rótulo do tipo para as mensagens automáticas (sininho + grupo do chat).
-- Fonte única no banco: sem isso, cada trigger precisaria repetir o CASE e um
-- pedido de cabo continuaria sendo anunciado como "🐞 Novo bug".
create or replace function public.carbo_bug_kind_label(p_kind text)
returns text language sql immutable set search_path = public as $$
  select case p_kind
    when 'sugestao' then '💡 Nova sugestão'
    when 'infra'    then '🔌 Equipamento/Infra'
    when 'acesso'   then '🔑 Pedido de acesso'
    when 'ajuda'    then '🙋 Pedido de ajuda'
    else '🐞 Novo bug reportado'   -- 'bug' e qualquer legado sem tipo
  end
$$;

-- 1) Novo report → avisa liderança/TI. Só o título passou a respeitar o tipo.
create or replace function public.carbo_bug_notify_gestores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
  select p.id,
         'bug_report',
         public.carbo_bug_kind_label(NEW.kind),
         coalesce(NEW.reporter_name, 'Alguém') || ' · ' || NEW.title,
         'carbo_bug_report',
         NEW.id::text
  from public.profiles p
  where (p.department in ('command', 'ti_suporte')
      or p.secondary_department in ('command', 'ti_suporte')
      or p.funcao in ('head', 'ceo', 'command')
      or p.secondary_funcao in ('head', 'ceo', 'command'))
    and p.id is distinct from NEW.reporter_id;
  return NEW;
end $$;

-- 2) Resolvido/recusado → avisa quem reportou. Bug e sugestão mantêm palavra por
--    palavra o texto antigo; os tipos novos ganham um genérico honesto
--    ("Demanda atendida") em vez de virarem "Bug resolvido".
create or replace function public.carbo_bug_notify_reporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status
     and NEW.status in ('resolved', 'declined')
     and NEW.reporter_id is not null then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
    values (
      NEW.reporter_id,
      case when NEW.status = 'resolved' then 'bug_resolved' else 'bug_update' end,
      case
        when NEW.status = 'resolved' and NEW.kind = 'sugestao' then '✅ Sugestão implementada'
        when NEW.status = 'resolved' and NEW.kind = 'bug'      then '✅ Bug resolvido'
        when NEW.status = 'resolved'                           then '✅ Demanda atendida'
        when NEW.kind = 'sugestao'                              then '🛈 Sugestão avaliada'
        else '🛈 Report avaliado'
      end,
      NEW.title || coalesce(' — ' || NEW.admin_notes, ''),
      'carbo_bug_report',
      NEW.id::text
    );
  end if;
  return NEW;
end $$;

-- 3) Ponte com o grupo "Suporte TI" do chat — mesmo motivo: o prefixo passa a
--    dizer o que a demanda é de verdade.
create or replace function public.carbo_bug_post_to_chat_ins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.chat_suporte_ti_post(
    replace(public.carbo_bug_kind_label(NEW.kind), '🐞 Novo bug reportado', '🐞 Novo bug')
    || ': ' || NEW.title
    || coalesce(' — ' || nullif(btrim(NEW.reporter_name), ''), '')
  );
  return NEW;
end $$;

notify pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Esperado: o CHECK listando os 5 tipos, e a contagem atual só com bug/sugestao
-- (nenhuma demanda existente foi tocada).
select pg_get_constraintdef(oid) as check_kind
  from pg_constraint where conname = 'carbo_bug_reports_kind_check';

select kind, count(*) as demandas
  from public.carbo_bug_reports
 group by kind
 order by 2 desc;
