-- ═══════════════════════════════════════════════════════════════════════════
-- A NF da filial liga ao pedido em ~3 minutos, não ~20 (24/11/2026)
--
-- Depois da 20261192 o caminho da nota B2B é uma fila de agendamentos:
--
--   releitura da nota          a cada 10 min   → agora a cada 1 min
--   detalhe (`nfe_recente`)    a cada 1 min      (inalterado)
--   vínculo `vincula-nf-filial` a cada 5 min   → agora a cada 1 min
--
-- Pior caso de ~20 min para ~3. Pergunta do dono do processo: "tenho que
-- esperar 20min? pq tanto tempo?" — a logística espera a nota para imprimir a
-- etiqueta.
--
-- Os dois são SQL puro e leves: a releitura só olha nota válida sem natureza
-- dos últimos 60 dias (com 30 min entre tentativas, que continuam valendo), e
-- o vínculo só grava quando algo MUDA (20261107). O custo de API não muda: quem
-- chama o Bling é o `nfe_recente`, que já roda de minuto em minuto.
--
-- ⚠️ Só ajusta TEMPO: job ausente vira WARNING, nunca aborta (migração que
-- aborta trava as seguintes).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_job  text;
  v_id   bigint;
begin
  foreach v_job in array array['bling2-reler-nfe-sem-natureza-10min', 'vincula-nf-filial'] loop
    select jobid into v_id from cron.job where jobname = v_job;
    if v_id is null then
      raise warning 'job % não existe — cadência não alterada', v_job;
    else
      perform cron.alter_job(v_id, schedule := '* * * * *');
    end if;
  end loop;
end $$;
