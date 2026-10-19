-- ─────────────────────────────────────────────────────────────────────────
-- Repassar DE NOVO leva o card de volta a "Oportunidade Qualificada" (19/10/2026)
--
-- Bug relatado pelo dono do processo no Pré-Vendas: "tirei o card para
-- repassar de novo, e ele não voltou de jeito nenhum para oportunidade
-- qualificada".
--
-- Causa: `crm_sales_lead_repassar` é idempotente — se o card do SDR já tem
-- cópia no closer (`origin_lead_id`), ela DEVOLVE a cópia e sai. Só que saía
-- ANTES do `update ... set stage = 'repassado'`, que mora no fim da função.
-- Resultado: o SDR tira o card da coluna (arrastando), repassa de novo, a
-- tela diz "Repassado ao closer" e o card continua onde estava — para sempre.
--
-- Correção, só no ramo "já existe":
--   1. o card do SDR volta a `repassado` (se não estiver lá);
--   2. a cópia do closer, se tinha sido ARQUIVADA, volta à fila — repassar de
--      novo para um card que ninguém vê seria o mesmo bug com outra cara;
--   3. um marco na timeline dos DOIS cards ("Repassado de novo"), para o closer
--      saber por que o card voltou.
-- ⚠️ A cópia NÃO é recriada nem sobrescrita: ela tem o trabalho do closer.
--
-- ⚠️ A função foi alterada várias vezes POR TEXTO no banco (20261048, 20261063,
-- 20261082, 20261093, 20261094). Por isso esta migração também troca o TEXTO
-- VIVO (`pg_get_functiondef`), com a âncora conferida: se ela não aparecer
-- EXATAMENTE uma vez, aborta sem mudar nada. O texto de antes vai para
-- `carbo_backup_funcoes`.
-- ⚠️ A RPC é a MESMA do Sales (f12 → f11). O comportamento novo vale lá
-- também, e é o certo lá também: lá o bug existia igual.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def   text := pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure);
  -- ⚠️ Âncora por PADRÃO, não texto exato: a primeira versão desta migração
  -- comparava espaços e quebras de linha e achou 0 em produção (19/10/2026) —
  -- o texto vivo não é o do repositório. Continua exigindo UMA ocorrência.
  v_de    text := 'if\s+v_atual\s+is\s+not\s+null\s+then\s+return\s+v_atual\s*;\s*end\s+if\s*;';
  v_para  text := E'if v_atual is not null then
    -- (20261098) Repassar DE NOVO: o card do SDR volta a "repassado", e a
    -- cópia do closer, se arquivada, volta à fila. A cópia não é recriada.
    if v_lead.stage is distinct from ''repassado'' then
      update public.crm_sales_leads set deleted_at = null
       where id = v_atual and deleted_at is not null;
      insert into public.crm_sales_lead_activities (
        lead_id, activity_type, subject, body, status, done_at, created_by, meta
      ) values
        (v_atual, ''note'', ''Repassado de novo pelo SDR'', nullif(trim(p_nota), ''''),
         ''done'', now(), auth.uid(), jsonb_build_object(''origin_lead_id'', p_lead)),
        (p_lead, ''note'', ''Repassado de novo ao closer'', nullif(trim(p_nota), ''''),
         ''done'', now(), auth.uid(), jsonb_build_object(''copia_lead_id'', v_atual));
      update public.crm_sales_leads set stage = ''repassado'' where id = p_lead;
    end if;
    return v_atual;
  end if;';
  v_n int;
begin
  v_n := regexp_count(v_def, v_de, 1, 'i');
  if v_n <> 1 then
    raise exception 'ABORTADO: a âncora apareceu % vez(es) em crm_sales_lead_repassar (esperado 1). Nada mudou.', v_n;
  end if;

  insert into public.carbo_backup_funcoes (funcao, definicao)
  values ('public.crm_sales_lead_repassar(uuid,text)', v_def);

  execute regexp_replace(v_def, v_de, v_para, 'i');
end $$;
