-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas — fase 3a: a lista lê um RESUMO por conversa (23/11/2026)
--
-- Medido como quem atende: `carbo_wa_caixa` levava 0,6–2,3 s e 85 mil buffers
-- com ~60 conversas/dia, a cada 8 s, por atendente — e a tela ainda baixava
-- TODOS os contatos, atendimentos e etiquetas do número a cada recarga. Molde
-- da esteira (`carbo_esteira_cards`): uma linha por conversa, recalculada SÓ
-- quando a conversa muda.
--
--   carbo_wa_resumo                 uma linha por (número, cliente)
--   carbo_wa_resumo_calcular(...)   o cálculo — lê a VIEW viva
--                                   `carbo_wa_conversas`: a regra continua num
--                                   lugar só (nome, pedido, vínculo)
--   gatilhos                        recalculam o par na hora (mensagem do
--                                   cliente, resposta, aviso que saiu)
--   carbo_wa_resumo_fila + cron     rede de segurança: recalcula de novo o que
--                                   foi tocado nos últimos minutos (corrida
--                                   entre transações, gatilho que falhou)
--   carbo_wa_caixa_resumo(n, dias)  a lista, já com janela, status, dono e
--                                   etiquetas — só das conversas da lista
--
-- ⚠️ Os gatilhos NUNCA derrubam a gravação da mensagem: erro vira WARNING e o
-- par vai para a fila. A mensagem do cliente só existe aqui.
-- ⚠️ "Pendente" = mensagem do cliente depois da última resposta de GENTE (a
-- regra da 20261186). A marca de "resolvida" é aplicada na LEITURA (a tela),
-- por isso o resumo guarda os instantes das pendentes, não só a contagem.
-- ⚠️ Front antes do SQL não quebra: sem a função da lista, a tela usa a
-- `carbo_wa_caixa` de antes.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_wa_resumo (
  numero_id             text not null,
  wa_id                 text not null,
  ultima_em             timestamptz not null,
  ultima_wamid          text,
  ultima_texto          text,
  ultima_tipo           text,
  ultima_direcao        text,
  ultima_entrada_em     timestamptz,
  ultima_resposta_em    timestamptz,
  -- instantes das mensagens do cliente depois da última resposta de gente
  -- (no máximo as 50 mais recentes)
  pendentes_em          timestamptz[] not null default '{}',
  ultima_pendente_texto text,
  bling_id              bigint,
  sobre_a_etapa         text,
  vinculo_exato         boolean,
  cliente_pedido        text,
  calculado_em          timestamptz not null default now(),
  primary key (numero_id, wa_id)
);
create index if not exists carbo_wa_resumo_lista on public.carbo_wa_resumo (numero_id, ultima_em desc);

alter table public.carbo_wa_resumo enable row level security;
drop policy if exists carbo_wa_resumo_ler on public.carbo_wa_resumo;
create policy carbo_wa_resumo_ler on public.carbo_wa_resumo
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_wa_resumo to authenticated;

create table if not exists public.carbo_wa_resumo_fila (
  numero_id text not null,
  wa_id     text not null,
  tocado_em timestamptz not null default now(),
  primary key (numero_id, wa_id)
);
alter table public.carbo_wa_resumo_fila enable row level security;   -- sem policy: só o banco

-- ── O cálculo ─────────────────────────────────────────────────────────────
-- UM par (`p_numero_id` + `p_wa_id`, histórico inteiro — o caminho dos
-- gatilhos) ou TODOS a partir de `p_desde` (a carga inicial).
-- ⚠️ SQL dinâmico de propósito: com o filtro escrito como igualdade simples,
-- o Postgres o empurra para dentro da view (UNION das duas origens) e usa o
-- índice do par. Escrito como `p is null or …`, o plano genérico calcularia a
-- view INTEIRA a cada mensagem que chega — dentro da transação do webhook.
create or replace function public.carbo_wa_resumo_calcular(
  p_numero_id text default null, p_wa_id text default null, p_desde timestamptz default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int; v_filtro text;
begin
  if p_numero_id is not null and p_wa_id is not null then
    v_filtro := 'c.numero_id = $1 and c.wa_id = $2';
  elsif p_desde is not null then
    v_filtro := 'c.ocorrido_em >= $3 and c.numero_id is not null and c.wa_id is not null';
  else
    raise exception 'carbo_wa_resumo_calcular: informe o par ou p_desde';
  end if;

  execute format($q$
  with v as (
    select c.numero_id, c.wa_id, c.wamid, c.direcao, c.tipo, c.texto, c.ocorrido_em,
           c.bling_id, c.sobre_a_etapa, c.vinculo_exato, c.cliente_pedido,
           (c.direcao = 'saida'
            and (c.tipo is distinct from 'template' or c.enviado_por_nome is not null)) as resp
      from public.carbo_wa_conversas c
     where %s
  ), w as (
    select v.*, max(v.ocorrido_em) filter (where v.resp) over (partition by v.numero_id, v.wa_id) as ult_resp
      from v
  ), a as (
    select w.numero_id, w.wa_id,
           max(w.ocorrido_em) as ultima_em,
           (array_agg(w.wamid   order by w.ocorrido_em desc, w.wamid desc))[1] as ultima_wamid,
           (array_agg(w.texto   order by w.ocorrido_em desc, w.wamid desc))[1] as ultima_texto,
           (array_agg(w.tipo    order by w.ocorrido_em desc, w.wamid desc))[1] as ultima_tipo,
           (array_agg(w.direcao order by w.ocorrido_em desc, w.wamid desc))[1] as ultima_direcao,
           max(w.ocorrido_em) filter (where w.direcao = 'entrada') as ultima_entrada_em,
           max(w.ult_resp) as ultima_resposta_em,
           array_agg(w.ocorrido_em order by w.ocorrido_em, w.wamid)
             filter (where w.direcao = 'entrada' and w.ocorrido_em > coalesce(w.ult_resp, '-infinity'::timestamptz)) as pend,
           (array_agg(w.texto order by w.ocorrido_em desc, w.wamid desc)
             filter (where w.direcao = 'entrada' and w.ocorrido_em > coalesce(w.ult_resp, '-infinity'::timestamptz)))[1] as ult_pend_texto,
           (array_agg(w.bling_id      order by w.ocorrido_em desc, w.wamid desc) filter (where w.bling_id is not null))[1] as bling_id,
           (array_agg(w.sobre_a_etapa order by w.ocorrido_em desc, w.wamid desc) filter (where w.bling_id is not null))[1] as sobre_a_etapa,
           (array_agg(w.vinculo_exato order by w.ocorrido_em desc, w.wamid desc) filter (where w.bling_id is not null))[1] as vinculo_exato,
           (array_agg(w.cliente_pedido order by w.ocorrido_em, w.wamid) filter (where w.cliente_pedido is not null))[1] as cliente_pedido
      from w
     group by w.numero_id, w.wa_id
  )
  insert into public.carbo_wa_resumo as r
    (numero_id, wa_id, ultima_em, ultima_wamid, ultima_texto, ultima_tipo, ultima_direcao,
     ultima_entrada_em, ultima_resposta_em, pendentes_em, ultima_pendente_texto,
     bling_id, sobre_a_etapa, vinculo_exato, cliente_pedido, calculado_em)
  select a.numero_id, a.wa_id, a.ultima_em, a.ultima_wamid, a.ultima_texto, a.ultima_tipo, a.ultima_direcao,
         a.ultima_entrada_em, a.ultima_resposta_em,
         coalesce(a.pend[greatest(1, coalesce(array_length(a.pend, 1), 0) - 49):], '{}'),
         a.ult_pend_texto, a.bling_id, a.sobre_a_etapa, a.vinculo_exato, a.cliente_pedido, now()
    from a
  on conflict (numero_id, wa_id) do update set
    ultima_em = excluded.ultima_em, ultima_wamid = excluded.ultima_wamid,
    ultima_texto = excluded.ultima_texto, ultima_tipo = excluded.ultima_tipo,
    ultima_direcao = excluded.ultima_direcao, ultima_entrada_em = excluded.ultima_entrada_em,
    ultima_resposta_em = excluded.ultima_resposta_em, pendentes_em = excluded.pendentes_em,
    ultima_pendente_texto = excluded.ultima_pendente_texto, bling_id = excluded.bling_id,
    sobre_a_etapa = excluded.sobre_a_etapa, vinculo_exato = excluded.vinculo_exato,
    cliente_pedido = excluded.cliente_pedido, calculado_em = now()
  where (r.ultima_em, r.ultima_wamid, r.ultima_texto, r.ultima_tipo, r.ultima_direcao,
         r.ultima_entrada_em, r.ultima_resposta_em, r.pendentes_em, r.ultima_pendente_texto,
         r.bling_id, r.sobre_a_etapa, r.vinculo_exato, r.cliente_pedido)
        is distinct from
        (excluded.ultima_em, excluded.ultima_wamid, excluded.ultima_texto, excluded.ultima_tipo,
         excluded.ultima_direcao, excluded.ultima_entrada_em, excluded.ultima_resposta_em,
         excluded.pendentes_em, excluded.ultima_pendente_texto, excluded.bling_id,
         excluded.sobre_a_etapa, excluded.vinculo_exato, excluded.cliente_pedido)
  $q$, v_filtro) using p_numero_id, p_wa_id, p_desde;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.carbo_wa_resumo_calcular(text, text, timestamptz) from anon, public, authenticated;
grant execute on function public.carbo_wa_resumo_calcular(text, text, timestamptz) to service_role;

-- ── Os gatilhos ───────────────────────────────────────────────────────────
create or replace function public.carbo_wa_resumo_tocar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- a fila primeiro: é a rede de segurança se o cálculo falhar ou correr
  begin
    insert into public.carbo_wa_resumo_fila (numero_id, wa_id, tocado_em)
    values (new.numero_id, new.wa_id, now())
    on conflict (numero_id, wa_id) do update set tocado_em = now();
  exception when others then
    raise warning 'carbo_wa_resumo_fila: %', sqlerrm;
  end;
  begin
    perform public.carbo_wa_resumo_calcular(new.numero_id, new.wa_id, null);
  exception when others then
    raise warning 'carbo_wa_resumo_calcular (%, %): %', new.numero_id, new.wa_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.carbo_wa_resumo_tocar() from anon, public, authenticated;

-- Mensagem do cliente e resposta do time. ⚠️ Status (enviado → entregue →
-- lido) NÃO entra: não muda o resumo, e é a gravação mais frequente.
drop trigger if exists trg_wa_resumo_msg_ins on public.carbo_wa_mensagens;
create trigger trg_wa_resumo_msg_ins
  after insert on public.carbo_wa_mensagens
  for each row when (new.numero_id is not null and new.wa_id is not null)
  execute function public.carbo_wa_resumo_tocar();
drop trigger if exists trg_wa_resumo_msg_upd on public.carbo_wa_mensagens;
create trigger trg_wa_resumo_msg_upd
  after update of texto, tipo, direcao, ocorrido_em, enviado_por_nome, numero_id, wa_id
  on public.carbo_wa_mensagens
  for each row when (new.numero_id is not null and new.wa_id is not null)
  execute function public.carbo_wa_resumo_tocar();

-- Aviso automático: entra na conversa quando SAI (a view só mostra
-- enviado/entregue/lido com wamid).
drop trigger if exists trg_wa_resumo_envio_ins on public.carbo_msg_envios;
create trigger trg_wa_resumo_envio_ins
  after insert on public.carbo_msg_envios
  for each row when (new.numero_id is not null and new.wa_id is not null and new.wamid is not null
                     and new.enviado_em is not null and new.status in ('enviado','entregue','lido'))
  execute function public.carbo_wa_resumo_tocar();
drop trigger if exists trg_wa_resumo_envio_upd on public.carbo_msg_envios;
create trigger trg_wa_resumo_envio_upd
  after update of status, wamid, wa_id, enviado_em, numero_id on public.carbo_msg_envios
  for each row when (new.numero_id is not null and new.wa_id is not null and new.wamid is not null
                     and new.enviado_em is not null and new.status in ('enviado','entregue','lido')
                     and (old.status is distinct from new.status and coalesce(old.status, '') not in ('enviado','entregue','lido')
                          or old.wamid is distinct from new.wamid
                          or old.wa_id is distinct from new.wa_id
                          or old.enviado_em is distinct from new.enviado_em
                          or old.numero_id is distinct from new.numero_id))
  execute function public.carbo_wa_resumo_tocar();

-- ── A rede de segurança (cron de 1 min) ──────────────────────────────────
-- Recalcula de novo o que foi tocado nos últimos 3 min (depois do commit das
-- transações que corriam juntas) e limpa o que já passou.
create or replace function public.carbo_wa_resumo_drenar()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_n int := 0;
begin
  for r in select numero_id, wa_id from public.carbo_wa_resumo_fila
            where tocado_em >= now() - interval '3 minutes' loop
    begin
      v_n := v_n + public.carbo_wa_resumo_calcular(r.numero_id, r.wa_id, null);
    exception when others then
      raise warning 'carbo_wa_resumo_drenar (%, %): %', r.numero_id, r.wa_id, sqlerrm;
    end;
  end loop;
  delete from public.carbo_wa_resumo_fila where tocado_em < now() - interval '3 minutes';
  return v_n;
end $$;
revoke execute on function public.carbo_wa_resumo_drenar() from anon, public, authenticated;

do $$
begin
  perform cron.unschedule('carbo-wa-resumo-1min');
exception when others then null;
end $$;
select cron.schedule('carbo-wa-resumo-1min', '* * * * *', 'select public.carbo_wa_resumo_drenar()');

-- ── A lista ───────────────────────────────────────────────────────────────
create or replace function public.carbo_wa_caixa_resumo(p_numero_id text, p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'wa_id', r.wa_id, 'numero_id', r.numero_id,
           'ultima_em', r.ultima_em, 'ultima_wamid', r.ultima_wamid, 'ultima_texto', r.ultima_texto,
           'ultima_tipo', r.ultima_tipo, 'ultima_direcao', r.ultima_direcao,
           'ultima_entrada_em', r.ultima_entrada_em, 'ultima_resposta_em', r.ultima_resposta_em,
           'pendentes_em', r.pendentes_em, 'ultima_pendente_texto', r.ultima_pendente_texto,
           'bling_id', r.bling_id, 'sobre_a_etapa', r.sobre_a_etapa, 'vinculo_exato', r.vinculo_exato,
           'cliente_pedido', r.cliente_pedido, 'nome_whatsapp', c.nome,
           'last_inbound_at', c.last_inbound_at,
           'at_status', a.status, 'at_desde', a.desde,
           'responsavel', a.responsavel, 'responsavel_nome', a.responsavel_nome,
           'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by t.nome)
                               from public.carbo_wa_conversa_tag ct
                               join public.carbo_wa_tags t on t.id = ct.tag_id and t.ativo is not false
                              where ct.numero_id = r.numero_id and ct.wa_id = r.wa_id), '[]'::jsonb))
           order by r.ultima_em desc), '[]'::jsonb)
    from public.carbo_wa_resumo r
    left join public.carbo_wa_contatos c on c.numero_id = r.numero_id and c.wa_id = r.wa_id
    left join public.carbo_wa_atendimento a on a.numero_id = r.numero_id and a.wa_id = r.wa_id
   where (select public.carbo_e_time_interno())
     and r.numero_id = p_numero_id
     and r.ultima_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)));
$$;
revoke execute on function public.carbo_wa_caixa_resumo(text, int) from anon, public;
grant execute on function public.carbo_wa_caixa_resumo(text, int) to authenticated, service_role;

-- O Realtime da lista passa a ser ESTA tabela (pequena, filtrável por número).
do $$
begin
  alter publication supabase_realtime add table public.carbo_wa_resumo;
exception when duplicate_object then null;
end $$;

-- ── A carga inicial: o que a caixa mostra (30 dias, com folga) ───────────
-- ⚠️ Com janela, o 1º cálculo de cada par só vê as mensagens dos 35 dias (a
-- mesma janela da `carbo_wa_caixa` de antes); o primeiro evento da conversa o
-- recalcula com o histórico inteiro.
select public.carbo_wa_resumo_calcular(null, null, now() - interval '35 days');

notify pgrst, 'reload schema';
