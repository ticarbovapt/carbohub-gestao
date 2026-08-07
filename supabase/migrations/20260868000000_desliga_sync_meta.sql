-- ═══════════════════════════════════════════════════════════════════════════
-- Desliga o cron `sync-meta-30min`
--
-- Ele foi agendado em 23/07/2026 e rodou 719 vezes até 07/08. Falhou nas 719,
-- sempre com a mesma resposta:
--
--     500 — "Falta o secret META_ACCESS_TOKEN."
--
-- O secret nunca foi criado. Ou seja: a função não quebrou em algum momento,
-- ela nunca funcionou — e por isso NUNCA escreveu nada em lugar nenhum. Seja
-- qual for o destino que ela teria, nada pode depender de um dado que jamais
-- existiu, e ninguém sentiu falta em quinze dias.
--
-- Do lado de cá também não há consumidor: nenhuma tabela de anúncio ou
-- campanha, e a tela `Campanhas` do `apps/mkt` é um placeholder "em
-- construção". Os leads do Meta, confirmado com o dono do processo, não entram
-- no sistema por essa via.
--
-- Manter ligado custaria um System User no Business Manager, um secret para
-- rotacionar e 48 chamadas por dia à API do Meta — tudo para alimentar nada.
-- Então desliga. Quando o módulo de Campanhas for construído, a integração
-- volta junto: com token, versionada em `supabase/functions/` e com destino
-- que alguma tela lê.
--
-- ⚠️ Só o AGENDAMENTO sai. A edge function `sync-meta` continua publicada no
-- Supabase; ninguém a chama. Ela não está no repo (foi criada pelo painel), e
-- é por isso que este arquivo existe: sem ele, o motivo de o cron ter sumido
-- não estaria escrito em lugar nenhum.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_jobid bigint;
begin
  -- Pelo NOME, não pelo id: o jobid é 14 hoje, mas é sequência do banco e não
  -- vale nada em outro ambiente.
  select jobid into v_jobid from cron.job where jobname = 'sync-meta-30min';

  if v_jobid is null then
    raise notice 'sync-meta-30min já não existe — nada a fazer.';
  else
    perform cron.unschedule(v_jobid);
    raise notice 'sync-meta-30min (jobid %) desagendado.', v_jobid;
  end if;
end $$;


-- ── Conferência ────────────────────────────────────────────────────────────

-- Não pode voltar nada.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'sync-meta-30min' or command ilike '%sync-meta%';

-- Daqui a uma hora esta contagem tem de estar parada. O `net._http_response`
-- é podado (~6h), então rode de novo mais tarde: se `ultima` não avançar,
-- acabou de verdade.
select count(*) as falhas_na_janela, max(created) as ultima
from net._http_response
where content::text ilike '%META_ACCESS_TOKEN%';
