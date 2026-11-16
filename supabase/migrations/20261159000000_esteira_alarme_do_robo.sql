-- 20261159 — o alarme do robô da esteira (16/11/2026)
--
-- Desde a 20261157 a esteira é uma TABELA mantida por `carbo_esteira_atualizar()`
-- (cron de 1 min). Cron parado = esteira CONGELADA, sem erro nenhum: o pg_cron
-- marcaria `succeeded` mesmo assim e a tela mostraria cartões de ontem. Este
-- alarme é o que impede o congelamento de ser calado.
--
-- Quem avisa: `carbo_esteira_vigiar()` (cron de 10 min, SQL puro). Quem recebe: SÓ
-- o TI (flag `carbo_ti`) — fan-out para o time inteiro seria o sininho ×30.
-- Três sinais, todos medidos no próprio banco:
--   · robô parado   `carbo_esteira_estado.ultima_leitura` com mais de 5 min
--   · robô sem dar conta   a fila de pendentes tem item esperando há mais de 15 min
--   · cron sumido ou desligado   `cron.job` sem o job, ou `active = false`
-- UM aviso por problema, repetido a cada hora enquanto durar, e UM "voltou" quando
-- acaba (quem passou a manhã com a esteira parada precisa LER que normalizou).
-- Sem problema não manda nada.
--
-- ⚠️ O alarme roda no MESMO pg_cron que ele vigia: se o pg_cron inteiro cair, ninguém
-- avisa. Esse caso é o da tarja de status (sonda externa), não deste alarme.

create table if not exists public.carbo_esteira_alarme (
  id           boolean primary key default true check (id),
  aberto_desde timestamptz,
  ultimo_aviso timestamptz,
  motivo       text
);
insert into public.carbo_esteira_alarme (id) values (true) on conflict do nothing;
alter table public.carbo_esteira_alarme enable row level security;
revoke all on public.carbo_esteira_alarme from public, anon, authenticated;

insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('esteira_robo_parado', '', 'ti', 'Esteira parada',
   'O robô que atualiza a Esteira do On-line parou ou não está dando conta. Os cartões ficam congelados.'),
  ('esteira_robo_voltou', '', 'ti', 'Esteira normalizada',
   'O robô da Esteira voltou a atualizar.')
on conflict (tipo, referencia) do nothing;

create or replace function public.carbo_esteira_vigiar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_atraso  interval;
  v_espera  interval;
  v_pend    int;
  v_job     record;
  v_motivo  text := null;
  v_est     public.carbo_esteira_alarme%rowtype;
  v_avisou  boolean := false;
begin
  select now() - ultima_leitura into v_atraso from carbo_esteira_estado where id;
  select now() - min(desde), count(*) into v_espera, v_pend from carbo_esteira_pendentes;

  begin
    select active into v_job from cron.job where jobname = 'carbo-esteira-atualizar-1min';
    if not found then
      v_motivo := 'o agendamento carbo-esteira-atualizar-1min não existe mais';
    elsif not v_job.active then
      v_motivo := 'o agendamento carbo-esteira-atualizar-1min está desligado';
    end if;
  exception when others then
    null;  -- sem acesso ao cron: os outros dois sinais continuam valendo
  end;

  if v_motivo is null and (v_atraso is null or v_atraso > interval '5 minutes') then
    v_motivo := 'o robô não atualiza há ' ||
                coalesce(round(extract(epoch from v_atraso) / 60)::text || ' min', 'tempo indeterminado');
  end if;
  if v_motivo is null and v_espera > interval '15 minutes' then
    v_motivo := 'há ' || v_pend || ' cartão(ões) esperando atualização, o mais antigo há ' ||
                round(extract(epoch from v_espera) / 60) || ' min — o robô não está dando conta';
  end if;

  select * into v_est from carbo_esteira_alarme where id;

  if v_motivo is not null then
    if v_est.aberto_desde is null or v_est.ultimo_aviso < now() - interval '1 hour' then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
      select p.id, 'esteira_robo_parado', 'Esteira do On-line parada',
             'Os cartões não estão sendo atualizados: ' || v_motivo ||
             '. Olhe carbo_esteira_atualizacao_log e o agendamento carbo-esteira-atualizar-1min.',
             'esteira', null, false
        from public.profiles p
       where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
      v_avisou := true;
      update carbo_esteira_alarme
         set aberto_desde = coalesce(aberto_desde, now()), ultimo_aviso = now(), motivo = v_motivo
       where id;
    end if;
  elsif v_est.aberto_desde is not null then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select p.id, 'esteira_robo_voltou', 'Esteira do On-line normalizada',
           'O robô voltou a atualizar os cartões. Parada desde ' ||
           to_char(v_est.aberto_desde at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.',
           'esteira', null, false
      from public.profiles p
     where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
    v_avisou := true;
    update carbo_esteira_alarme set aberto_desde = null, ultimo_aviso = null, motivo = null where id;
  end if;

  return jsonb_build_object('problema', v_motivo, 'avisou', v_avisou,
                            'atraso_min', round(extract(epoch from v_atraso) / 60),
                            'pendentes', v_pend);
end $$;
revoke all on function public.carbo_esteira_vigiar() from public, anon, authenticated;
comment on function public.carbo_esteira_vigiar is
  'Vigia o robô da Esteira (parado, sem dar conta, cron sumido). Avisa SÓ o TI, uma vez por hora enquanto durar e uma vez quando normaliza. Cron carbo-esteira-vigiar-10min.';

select cron.unschedule(jobid) from cron.job where jobname = 'carbo-esteira-vigiar-10min';
select cron.schedule('carbo-esteira-vigiar-10min', '1-59/10 * * * *', $$select public.carbo_esteira_vigiar()$$);
