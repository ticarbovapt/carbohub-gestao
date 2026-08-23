-- ═══════════════════════════════════════════════════════════════════════════
-- Agendar mensagem — dentro da janela, sempre
--
-- ── ⚠️ A propriedade que torna isto simples ──────────────────────────────
--
-- A janela de 24 h só se ESTENDE, nunca encolhe: ela é `last_inbound_at + 24h`,
-- e `last_inbound_at` só anda para a frente (o cliente escrever de novo empurra
-- o fim para mais longe).
--
-- Consequência: um horário que cabe na janela AGORA continua cabendo na hora de
-- disparar. A validação no momento de agendar é suficiente — não existe o caso
-- de "agendei para daqui a 3 h e a janela encolheu".
--
-- Mesmo assim a função confere de novo antes de enviar. Não por causa da
-- janela, mas porque 3 h é tempo suficiente para o número virar inválido, o
-- token expirar ou alguém ter respondido no meio — e mandar às cegas depois de
-- esperar é pior do que não agendar.
--
-- ── ⚠️ Falha agendada tem de GRITAR ──────────────────────────────────────
--
-- Quem agenda vai embora achando que está resolvido. Se falhar, ninguém está
-- olhando — é o oposto de um envio manual, onde o erro aparece na cara de quem
-- clicou. Por isso `status = 'falhou'` guarda o motivo em texto legível, e a
-- tela mostra o agendamento pendente o tempo todo, com o horário.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.carbo_wa_agendadas (
  id          uuid primary key default gen_random_uuid(),
  wa_id       text not null,
  texto       text not null check (length(trim(texto)) between 1 and 4096),
  enviar_em   timestamptz not null,

  status      text not null default 'pendente'
                check (status in ('pendente','enviado','cancelado','falhou')),
  -- ⚠️ Em texto legível, não em código. Quem agendou não está olhando quando
  -- falha; a mensagem tem de explicar sozinha na volta.
  motivo      text,
  wamid       text,
  erro_codigo integer,

  criado_por  uuid,
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz
);

create index if not exists carbo_wa_agendadas_fila_idx
  on public.carbo_wa_agendadas (enviar_em) where status = 'pendente';
create index if not exists carbo_wa_agendadas_conversa_idx
  on public.carbo_wa_agendadas (wa_id, enviar_em desc);

comment on table public.carbo_wa_agendadas is
  'Mensagens de texto livre marcadas para sair mais tarde. ⚠️ Só dentro da janela de 24h — e como a janela só se ESTENDE (last_inbound_at só anda para a frente), o que cabe nela ao agendar continua cabendo ao enviar.';

alter table public.carbo_wa_agendadas enable row level security;
drop policy if exists carbo_wa_agendadas_leitura on public.carbo_wa_agendadas;
drop policy if exists carbo_wa_agendadas_escrita on public.carbo_wa_agendadas;
drop policy if exists carbo_wa_agendadas_service on public.carbo_wa_agendadas;

create policy carbo_wa_agendadas_leitura on public.carbo_wa_agendadas
  for select to authenticated using (public.carbo_e_time_interno());
create policy carbo_wa_agendadas_escrita on public.carbo_wa_agendadas
  for all to authenticated
  using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());
create policy carbo_wa_agendadas_service on public.carbo_wa_agendadas
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.carbo_wa_agendadas to authenticated;


-- ── A fila do disparo ─────────────────────────────────────────────────────
--
-- ⚠️ A janela é conferida AQUI também, e não só na tela. A tela é a primeira
-- barreira; esta é a que vale, porque ela roda no minuto do envio.

create or replace view public.carbo_wa_agendadas_fila
with (security_invoker = true) as
select
  a.id, a.wa_id, a.texto, a.enviar_em,
  c.last_inbound_at,
  c.last_inbound_at + interval '24 hours' as janela_ate,
  (c.last_inbound_at > now() - interval '24 hours') as janela_aberta
from public.carbo_wa_agendadas a
left join public.carbo_wa_contatos c on c.wa_id = a.wa_id
where a.status = 'pendente'
  and a.enviar_em <= now();

comment on view public.carbo_wa_agendadas_fila is
  'O que já passou da hora e ainda não saiu, com o estado da janela no INSTANTE da leitura. A função de envio decide olhando isto — a validação da tela é a primeira barreira, esta é a que vale.';

grant select on public.carbo_wa_agendadas_fila to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a tela vê o agendamento ao vivo                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Duas pessoas atendendo não podem agendar duas respostas para o mesmo cliente
-- sem enxergar uma a outra.

do $$
begin
  alter publication supabase_realtime add table public.carbo_wa_agendadas;
exception when duplicate_object then null;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o cron                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- De minuto em minuto: é a menor granularidade que a tela oferece, e agendar
-- para 14:30 e sair 14:35 seria estranho para quem escolheu o horário.

do $$
declare v_seg text; j bigint;
begin
  select valor into v_seg from private.cron_config where chave = 'rastreio_cron_secret';
  if v_seg is null or v_seg = '' then
    raise exception 'Falta o segredo em private.cron_config.';
  end if;

  for j in select jobid from cron.job where jobname = 'whatsapp-agendadas-1min' loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'whatsapp-agendadas-1min', '* * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/whatsapp-agendadas',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_seg)
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Nasce vazia.
select count(*) as agendamentos from public.carbo_wa_agendadas;

-- (b) O cron está no ar?
select jobname, schedule, active from cron.job where jobname = 'whatsapp-agendadas-1min';

-- (c) ⚠️ A consulta de acompanhamento. Rode de vez em quando: agendamento que
--     falhou não avisa ninguém — quem agendou foi embora achando que estava
--     resolvido.
select id, wa_id, enviar_em, status, motivo, erro_codigo, left(texto, 60) as texto
from public.carbo_wa_agendadas
where status in ('pendente','falhou')
order by enviar_em;
