-- Agendamento do aviso ao cliente. A cada 10 minutos: rápido o bastante para a
-- mensagem chegar junto com o fato, espaçado o bastante para não virar polling.
do $$
declare v_segredo text;
begin
  select valor into v_segredo from private.cron_config where chave = 'rastreio_cron_secret';
  if v_segredo is null then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret).';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'kanban-n8n-10min';
  perform cron.schedule('kanban-n8n-10min', '*/10 * * * *', format($cmd$
    select net.http_post(
      url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/kanban-n8n',
      headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
      body    := '{"source":"cron"}'::jsonb
    ) as request_id;
  $cmd$, v_segredo));
end $$;

select jobid, jobname, schedule, active from cron.job where jobname = 'kanban-n8n-10min';
