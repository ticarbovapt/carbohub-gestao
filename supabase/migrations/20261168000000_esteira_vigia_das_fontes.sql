-- 20261168 — o vigia das FONTES da esteira (17/11/2026)
--
-- O vigia da 20261159 cuida do ROBÔ que monta os cartões. Faltava quem cuida do que
-- alimenta e do que sai da esteira — todas falhas que o `pg_cron` marca `succeeded`
-- (o sucesso dele é ter POSTADO) e que só se veem abrindo a tela ou rodando SQL:
--
--   rastreio       o `rastreio-sync` não responde / falha / não alcança a fila no tempo
--   carrinho       o `nuvemshop-carrinhos` parou (o quadro de carrinho congela)
--   fila_timeout   a fila estourou o tempo — NENHUMA mensagem sai naquele minuto
--                  (setembro: 18 dias calado, 1.440 "succeeded" por dia)
--   whatsapp_vivo  o `whatsapp-meta` não responde
--   falhas_msg     taxa de `falhou` fora do normal (a base é 10–15%, a Meta decide)
--   ecommerce      o `ecommerce-sync` (ML, Amazon…) não responde ou falha
--   bling2         a conexão do Bling 2 foi desativada (o espelho para sem log)
--
-- Quem avisa: `carbo_esteira_vigiar_fontes()` (cron de 10 min, SQL puro). Quem recebe:
-- SÓ o TI (`carbo_ti`) — fan-out para o time seria o sininho ×30. UM aviso por problema,
-- repetido a cada hora enquanto durar, e UM "voltou" quando acaba. Sem problema, nada.
--
-- ⚠️ Lê o desfecho REAL em `net._http_response` (guardado por ~6 h pelo pg_net), nunca o
-- `cron.job_run_details`. Cada verificação se isola: erro numa NÃO derruba as outras, e
-- falta de evidência (tabela de respostas vazia) NÃO vira alarme — ausência de prova não é prova.
-- ⚠️ Roda no mesmo pg_cron que vigia: se o pg_cron inteiro cair, quem cobre é a tarja de status.
-- ⚠️ Os limiares (20 min, 3 timeouts, 40%) são de MEDIÇÃO: o normal da taxa de falha é 10–15%.

create table if not exists public.carbo_esteira_alarme_fonte (
  chave        text primary key,
  aberto_desde timestamptz,
  ultimo_aviso timestamptz,
  motivo       text
);
alter table public.carbo_esteira_alarme_fonte enable row level security;
revoke all on public.carbo_esteira_alarme_fonte from public, anon, authenticated;

insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('esteira_fonte_parada', '', 'ti', 'Fonte da Esteira com problema',
   'Rastreio, sync do carrinho, fila/envio do WhatsApp, e-commerce ou conexão do Bling 2 parou, falha ou está fora do normal.'),
  ('esteira_fonte_voltou', '', 'ti', 'Fonte da Esteira normalizada',
   'A fonte que estava com problema voltou ao normal.')
on conflict (tipo, referencia) do nothing;

create or replace function public.carbo_esteira_vigiar_fontes()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prob   jsonb := '{}'::jsonb;     -- chave -> motivo (só os que estão com problema)
  v_rot    constant jsonb := jsonb_build_object(
    'rastreio', 'Rastreio', 'carrinho', 'Sync do carrinho', 'fila_timeout', 'Fila estourando o tempo',
    'whatsapp_vivo', 'Envio do WhatsApp', 'falhas_msg', 'Falhas de mensagem',
    'ecommerce', 'Sync do e-commerce', 'bling2', 'Conexão do Bling 2');
  v_viva   boolean := false;          -- a tabela de respostas do pg_net tem evidência recente?
  r        record;
  v_n      int;
  v_total  int;
  v_falhou int;
  v_json   jsonb;
  v_avisos int := 0;
  v_st     public.carbo_esteira_alarme_fonte%rowtype;
  k        text;
begin
  -- Sem evidência recente de NENHUMA função, as verificações de "não responde" não valem.
  begin
    select exists (select 1 from net._http_response where created > now() - interval '20 minutes') into v_viva;
  exception when others then v_viva := false;
  end;

  -- 1. rastreio-sync ──────────────────────────────────────────────────────────
  begin
    if v_viva then
      select created, status_code, content into r
        from net._http_response where content like '%fila_aberta%' order by created desc limit 1;
      -- ⚠️ `not found or r.created …` NÃO serve: o plpgsql não garante curto-circuito, e ler
      -- `r` sem ter sido preenchido dá erro — que o bloco engoliria, e o alarme sumiria calado.
      if not found then
        v_prob := v_prob || jsonb_build_object('rastreio', 'o rastreio-sync não responde há mais de 20 min');
      elsif r.created < now() - interval '20 minutes' then
        v_prob := v_prob || jsonb_build_object('rastreio', 'o rastreio-sync não responde há mais de 20 min');
      elsif r.status_code <> 200 then
        v_prob := v_prob || jsonb_build_object('rastreio', 'a última rodada do rastreio-sync falhou (HTTP ' || r.status_code || ')');
      else
        v_n := 0;
        for r in select content from net._http_response where content like '%fila_aberta%'
                  order by created desc limit 3 loop
          begin
            if (r.content::jsonb ->> 'parou_por_tempo') = 'true' then v_n := v_n + 1; end if;
          exception when others then null;   -- corpo que não é JSON não conta como "parou por tempo"
          end;
        end loop;
        if v_n = 3 then
          v_prob := v_prob || jsonb_build_object('rastreio', 'as 3 últimas rodadas do rastreio pararam por tempo: a fila não cabe no orçamento (falta capacidade)');
        end if;
      end if;
    end if;
  exception when others then null;
  end;

  -- 2. sync do carrinho ───────────────────────────────────────────────────────
  begin
    if exists (select 1 from public.nuvemshop_carrinhos where checkout_id > 0 and atualizado_em < now() - interval '45 minutes')
       and not exists (select 1 from public.nuvemshop_carrinhos where checkout_id > 0 and atualizado_em >= now() - interval '45 minutes') then
      select round(extract(epoch from now() - max(atualizado_em)) / 60) into v_n
        from public.nuvemshop_carrinhos where checkout_id > 0;
      v_prob := v_prob || jsonb_build_object('carrinho', 'o sync da Nuvemshop não grava carrinho há ' || v_n || ' min');
    end if;
  exception when others then null;
  end;

  -- 3. WhatsApp: fila estourando e função muda ───────────────────────────────
  begin
    if v_viva then
      select count(*) into v_n from net._http_response
       where created > now() - interval '30 minutes'
         and content like '%fila:%' and content like '%statement timeout%';
      if v_n >= 3 then
        v_prob := v_prob || jsonb_build_object('fila_timeout',
          'a leitura da fila estourou o tempo ' || v_n || ' vezes em 30 min (whatsapp-meta ou rastreio-sync) — se for o WhatsApp, nenhuma mensagem sai nesses minutos');
      end if;
      if not exists (select 1 from net._http_response
                      where created > now() - interval '10 minutes'
                        -- As DUAS formas de resposta normal do whatsapp-meta: a rodada com fila
                        -- (`segurados`/`enviados`) e a fila VAZIA (`nada a avisar pela Meta`) —
                        -- esta é a comum de madrugada. Só a primeira daria alarme toda noite.
                        and ((content like '%"segurados"%' and content like '%"enviados"%')
                             or content like '%nada a avisar pela Meta%')) then
        v_prob := v_prob || jsonb_build_object('whatsapp_vivo', 'o whatsapp-meta não devolveu uma rodada válida nos últimos 10 min');
      end if;
    end if;
  exception when others then null;
  end;

  -- 4. taxa de falha das mensagens (base 10–15%; só alarma com volume) ────────
  begin
    select count(*) filter (where status in ('enviado','entregue','lido','falhou')),
           count(*) filter (where status = 'falhou')
      into v_total, v_falhou
      from public.carbo_msg_envios
     where coalesce(enviado_em, detectado_em) > now() - interval '2 hours';
    if v_total >= 30 and v_falhou::numeric / v_total > 0.40 then
      v_prob := v_prob || jsonb_build_object('falhas_msg',
        v_falhou || ' de ' || v_total || ' mensagens falharam nas últimas 2 h (' ||
        round(100.0 * v_falhou / v_total) || '%; o normal é 10–15%) — veja erro_codigo em carbo_msg_envios');
    end if;
  exception when others then null;
  end;

  -- 5. ecommerce-sync ─────────────────────────────────────────────────────────
  begin
    if v_viva then
      select created, status_code into r
        from net._http_response where content like '%"synced"%' order by created desc limit 1;
      if not found then
        v_prob := v_prob || jsonb_build_object('ecommerce', 'o ecommerce-sync não responde há mais de 20 min');
      elsif r.created < now() - interval '20 minutes' then
        v_prob := v_prob || jsonb_build_object('ecommerce', 'o ecommerce-sync não responde há mais de 20 min');
      elsif r.status_code <> 200 then
        v_prob := v_prob || jsonb_build_object('ecommerce', 'a última rodada do ecommerce-sync falhou (HTTP ' || r.status_code || ')');
      end if;
    end if;
  exception when others then null;
  end;

  -- 6. conexão do Bling 2 ─────────────────────────────────────────────────────
  begin
    if exists (select 1 from public.bling2_integration)
       and not exists (select 1 from public.bling2_integration where is_active) then
      v_prob := v_prob || jsonb_build_object('bling2', 'a conexão do Bling 2 está desativada — o espelho para sem deixar log (reconectar em /integracoes/bling2)');
    end if;
  exception when others then null;
  end;

  -- ── Abre, repete (1/h) e fecha cada alarme ──────────────────────────────────
  for k in select jsonb_object_keys(v_rot) loop
    insert into public.carbo_esteira_alarme_fonte (chave) values (k) on conflict do nothing;
    select * into v_st from public.carbo_esteira_alarme_fonte where chave = k for update;

    if v_prob ? k then
      if v_st.aberto_desde is null or v_st.ultimo_aviso < now() - interval '1 hour' then
        insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
        select p.id, 'esteira_fonte_parada', 'Esteira: ' || (v_rot ->> k),
               v_prob ->> k, 'esteira', null, false
          from public.profiles p
         where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
        v_avisos := v_avisos + 1;
        update public.carbo_esteira_alarme_fonte
           set aberto_desde = coalesce(aberto_desde, now()), ultimo_aviso = now(), motivo = v_prob ->> k
         where chave = k;
      end if;
    elsif v_st.aberto_desde is not null then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
      select p.id, 'esteira_fonte_voltou', 'Esteira: ' || (v_rot ->> k) || ' normalizada',
             'Voltou ao normal. Estava com problema desde ' ||
             to_char(v_st.aberto_desde at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.',
             'esteira', null, false
        from public.profiles p
       where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
      v_avisos := v_avisos + 1;
      update public.carbo_esteira_alarme_fonte
         set aberto_desde = null, ultimo_aviso = null, motivo = null where chave = k;
    end if;
  end loop;

  return jsonb_build_object('problemas', v_prob, 'avisos', v_avisos, 'evidencia_do_pg_net', v_viva);
end $$;

revoke all on function public.carbo_esteira_vigiar_fontes() from public, anon, authenticated;
comment on function public.carbo_esteira_vigiar_fontes is
  'Vigia as fontes da Esteira (rastreio, carrinho, fila e envio do WhatsApp, falhas, e-commerce, Bling 2). Avisa SÓ o TI, 1×/h enquanto durar e 1× quando normaliza. Cron carbo-esteira-vigiar-fontes-10min.';

select cron.unschedule(jobid) from cron.job where jobname = 'carbo-esteira-vigiar-fontes-10min';
select cron.schedule('carbo-esteira-vigiar-fontes-10min', '9-59/10 * * * *', $$select public.carbo_esteira_vigiar_fontes()$$);
