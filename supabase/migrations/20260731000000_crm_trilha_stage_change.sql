-- =====================================================================
-- Fase 3 — a trilha de movimentação do CRM passa a ser gravada pelo BANCO.
--
-- Antes: o front dava UPDATE na etapa e, num SEGUNDO insert, gravava a
-- atividade 'stage_change'. Três problemas:
--
--   1) Fora de transação. Se o insert falhasse (rede, RLS, aba fechada), o
--      card ficava movido e a história não existia. Sem erro na tela.
--   2) Só dois hooks faziam isso. useUpdateCRMLead aceita `stage` e não
--      gravava nada — ninguém chamava assim hoje, mas era um buraco a um
--      `mutate({ id, stage })` de distância.
--   3) `stage_from` vinha de um parâmetro do cliente. A tela de Pipelines não
--      passava esse parâmetro ao marcar perda: metade dos registros nascia
--      com a etapa de origem NULA.
--
-- Agora é um trigger AFTER UPDATE: vale para todo caminho — tela, RPC,
-- correção manual no SQL Editor — e `stage_from` vem do OLD.stage, que é a
-- verdade e não depende de ninguém lembrar de mandar.
--
-- É PRÉ-REQUISITO da tela de acompanhamento (fase 4): sem trilha confiável,
-- "quantos receberam movimentação" e "quantos ficaram parados" são chute.
--
-- Nada é reescrito: os 159 registros que já existem (desde 06/07/2026)
-- continuam como estão. Este trigger só passa a garantir os próximos.
--
-- ⚠️ RODAR NO SQL EDITOR EM BLOCOS SEPARADOS, um por vez. O SQL Editor roda
--    tudo numa transação só, e criar trigger em tabela viva junto com o resto
--    já causou deadlock 40P01 aqui antes.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a função que grava a trilha                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_sales_lead_log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  -- Só reage a mudança REAL de etapa ou de funil. Editar telefone não é
  -- movimentação — se fosse, a tela contaria como "tocou no lead" quem só
  -- corrigiu um e-mail.
  if new.stage is not distinct from old.stage
     and new.funnel_type is not distinct from old.funnel_type then
    return new;
  end if;

  -- Nome de quem moveu, resolvido no momento do evento. A timeline mostra o
  -- nome de então; se a pessoa mudar de nome depois, o histórico não se
  -- reescreve sozinho — é o mesmo critério do dicionário de rótulos de etapa.
  select coalesce(p.full_name, p.username)
    into v_nome
    from public.profiles p
   where p.id = auth.uid();

  -- Troca de funil ganha registro PRÓPRIO. Sem ele, a trilha de um lead que
  -- mudou de pipeline fica com etapas de um funil que ele não habita mais, e
  -- não há nada explicando o salto — foi assim que o lead de teste apareceu no
  -- Comercial Expansão com histórico de `novo ↔ contato`, que são etapas do
  -- Inbound. Vira obrigatório na fase 7 (duplicação Outbound → Inbound).
  if new.funnel_type is distinct from old.funnel_type then
    insert into public.crm_sales_lead_activities (
      lead_id, activity_type, subject, status, done_at,
      stage_from, stage_to, created_by, created_by_name, meta
    ) values (
      new.id,
      'funnel_change',
      coalesce(old.funnel_type, '?') || ' → ' || new.funnel_type,
      'done',
      now(),
      old.stage,
      new.stage,
      auth.uid(),
      v_nome,
      jsonb_build_object('funnel_from', old.funnel_type, 'funnel_to', new.funnel_type)
    );
  end if;

  -- Etapa igual + funil diferente = só a troca de funil, sem falso movimento.
  if new.stage is not distinct from old.stage then
    return new;
  end if;

  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, status, done_at,
    stage_from, stage_to, created_by, created_by_name, meta
  ) values (
    new.id,
    'stage_change',
    coalesce(old.stage, '?') || ' → ' || new.stage,
    'done',
    now(),
    old.stage,
    new.stage,
    auth.uid(),
    v_nome,
    -- O motivo sai da própria linha, e só quando ele MUDOU neste UPDATE.
    -- Assim um lead que já estava perdido e teve outro campo editado não
    -- gera um registro novo carregando o motivo antigo.
    case
      when new.lost_reason is not null
       and new.lost_reason is distinct from old.lost_reason
      then jsonb_build_object('lost_reason', new.lost_reason)
      else '{}'::jsonb
    end
  );

  return new;
end;
$$;

comment on function public.crm_sales_lead_log_stage_change() is
  'Grava a atividade stage_change na trilha do lead. SECURITY DEFINER porque a '
  'policy de INSERT de crm_sales_lead_activities exige created_by = auth.uid(), '
  'e o registro precisa existir mesmo quando quem move não é o dono do lead '
  '(ex.: gestor movendo card de outro vendedor).';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — liga o trigger na tabela                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- lock_timeout curto: a tabela está viva. Se não conseguir o lock em 5s,
-- falha limpo em vez de travar o app de quem está usando o CRM agora.
set lock_timeout = '5s';

drop trigger if exists trg_crm_sales_lead_stage_change on public.crm_sales_leads;

create trigger trg_crm_sales_lead_stage_change
  after update of stage, funnel_type on public.crm_sales_leads
  for each row
  execute function public.crm_sales_lead_log_stage_change();

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — índice para a tela de acompanhamento                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A tela pergunta "quantos leads distintos mudaram de etapa em cada dia".
-- Sem índice isso é varredura completa da tabela de atividades a cada
-- abertura — e ela cresce todo dia, para sempre.
--
-- SEM `concurrently` de propósito: o SQL Editor roda tudo numa transação, e
-- CREATE INDEX CONCURRENTLY não pode rodar dentro de uma. A tabela tem
-- poucas centenas de linhas hoje, então o índice comum sai instantâneo. Se um
-- dia for preciso recriar com a tabela grande, aí sim rodar o CONCURRENTLY
-- por fora do editor (psql), nunca aqui.
set lock_timeout = '5s';

create index if not exists idx_crm_sales_lead_act_stage_change
  on public.crm_sales_lead_activities (created_at desc, lead_id)
  where activity_type = 'stage_change';

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Move um lead qualquer para a etapa em que ele JÁ está (não muda nada) e
-- depois confere que nenhuma linha nova apareceu — o guard do `is not
-- distinct from` tem que segurar.
--
-- select count(*) as trilha_total,
--        count(*) filter (where stage_from is null) as sem_origem,
--        min(created_at) as primeira,
--        max(created_at) as ultima
--   from public.crm_sales_lead_activities
--  where activity_type = 'stage_change';
--
-- Depois de mover um card na tela, rodar de novo: trilha_total sobe em 1 e
-- sem_origem NÃO sobe.


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop trigger if exists trg_crm_sales_lead_stage_change on public.crm_sales_leads;
-- drop function if exists public.crm_sales_lead_log_stage_change();
-- drop index if exists public.idx_crm_sales_lead_act_stage_change;
-- (e reverter o commit do front, que voltaria a gravar pelo cliente)
