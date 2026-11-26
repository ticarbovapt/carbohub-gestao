-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência de NF das vendas: o que a NOTA desfez, a NOTA refaz
--
-- Pedido do dono do processo (26/11/2026), depois do V2026110025 (R$ 26.000) e
-- do V2026110040, cancelados pela ponte do Bling 2 com a nota ainda em
-- autorização (corrigido na 20261202): *"quando isso acontecer … na próxima
-- conferência, identifique se o estado mudou de emitida para cancelada, de
-- cancelada para emitida, de pendente para autorizado … senão a NF ia ser
-- perdida e o cara não ia receber a comissão"*. Os dois saíram do faturamento
-- e da comissão, e ninguém foi avisado: a ponte cancela calada.
--
-- `carbo_nf_reconferir_vendas()` (cron `carbo-nf-reconferir-30min`, SQL puro):
--
--   1. REABRE a venda V… que foi cancelada AUTOMATICAMENTE (último cancelamento
--      sem usuário, nos últimos 60 dias) e cuja nota HOJE é válida — nota que
--      estava em voo e foi autorizada, ou nota reemitida e vinculada de novo.
--      Volta ao status e à etapa de ANTES do cancelamento (etapa "Gerar NF"
--      com nota válida vai a "Emitir Etiqueta", como faz o gatilho da NF).
--   2. Se o cancelamento ESTORNOU estoque (`stock_deducted` mudou), não reabre
--      sozinho — reabrir não deduz de novo, e o saldo ficaria inflado. Avisa
--      para reabrir no Rastreio (que deduz na separação).
--   3. AVISA cancelamento automático pela nota: a ponte do Bling 2 cancelava
--      sem avisar ninguém. O vendedor recebe (a matriz já avisava pelo
--      `carbo_avisar_nf_invalida`, então lá vai só ao TI).
--
-- ⚠️ Cancelamento feito por GENTE nunca é desfeito: o critério é o último
-- cancelamento ter `user_id` nulo no `order_audit_logs`.
-- ⚠️ `trg_carbo_cancelamento_nao_ressuscita` continua recusando reabertura por
-- rotina. A ÚNICA exceção é a marca `carbo.reabre_por_nf`, local da transação,
-- que só esta função liga (o PostgREST não expõe `set_config`).
-- ⚠️ Cada fato é registrado UMA vez (`carbo_nf_reconferencia`, único por
-- pedido + ação + instante do cancelamento): rodar de novo não reavisa.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── O registro ────────────────────────────────────────────────────────────
create table if not exists public.carbo_nf_reconferencia (
  id            bigserial primary key,
  em            timestamptz not null default now(),
  pedido_id     uuid not null,
  order_number  text,
  acao          text not null check (acao in ('reaberto', 'reabrir_a_mao', 'cancelado_por_nf')),
  conta         smallint,
  nf_numero     text,
  situacao_nf   text,
  cancelado_em  timestamptz not null,
  status_antes  text,
  etapa_antes   text,
  etapa_depois  text,
  detalhe       text
);
create unique index if not exists carbo_nf_reconferencia_uq
  on public.carbo_nf_reconferencia (pedido_id, acao, cancelado_em);

comment on table public.carbo_nf_reconferencia is
  'Conferência de NF das vendas (20261203): venda reaberta porque a nota voltou a valer, venda a reabrir à mão (houve estorno de estoque) e venda cancelada automaticamente pela nota. Uma linha por fato.';

alter table public.carbo_nf_reconferencia enable row level security;
drop policy if exists carbo_nf_reconferencia_ler on public.carbo_nf_reconferencia;
create policy carbo_nf_reconferencia_ler on public.carbo_nf_reconferencia
  for select to authenticated using ((select public.carbo_e_time_interno()));
revoke all on public.carbo_nf_reconferencia from anon;
grant select on public.carbo_nf_reconferencia to authenticated;

-- ── A trava de ressurreição ganha UMA exceção, só desta conferência ──────
-- Troca no TEXTO VIVO (pg_get_functiondef), nunca reescrita a partir do repo:
-- a produção não é o repositório. Exige UMA ocorrência de `auth.uid() is null`;
-- senão aborta (e a migração inteira não entra).
create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);

do $do$
declare
  v_def text;
  v_n   int;
begin
  v_def := pg_get_functiondef('public.carbo_cancelamento_nao_ressuscita()'::regprocedure);
  if v_def ~* 'carbo\.reabre_por_nf' then
    raise notice 'a trava de ressurreição já conhece a conferência de NF';
    return;
  end if;
  select count(*) into v_n from regexp_matches(v_def, 'auth\.uid\(\)\s+is\s+null', 'gi');
  if v_n <> 1 then
    raise exception 'carbo_cancelamento_nao_ressuscita: esperava 1 "auth.uid() is null", achei %', v_n;
  end if;
  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('carbo_cancelamento_nao_ressuscita', v_def);
  execute regexp_replace(v_def, '(auth\.uid\(\)\s+is\s+null)',
    E'\\1\n     and coalesce(current_setting(''carbo.reabre_por_nf'', true), '''') <> ''on''', 'i');
  if pg_get_functiondef('public.carbo_cancelamento_nao_ressuscita()'::regprocedure) !~* 'carbo\.reabre_por_nf' then
    raise exception 'a troca na trava de ressurreição não pegou';
  end if;
end $do$;

comment on function public.carbo_cancelamento_nao_ressuscita is
  'Impede que sincronização (service_role, sem auth.uid()) desfaça um cancelamento. Reabertura por usuário autenticado continua permitida, e a conferência de NF (carbo_nf_reconferir_vendas, marca local carbo.reabre_por_nf) reabre o que a própria nota cancelou.';

-- ── Os avisos entram no porteiro das notificações ────────────────────────
insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('nf_reconferida', '', 'pessoal', 'NF da sua venda conferida',
   'A venda da pessoa foi reaberta porque a nota voltou a valer, ou cancelada automaticamente pela nota.'),
  ('nf_reconferida_ti', '', 'ti', 'Conferência de NF das vendas',
   'Venda reaberta, a reabrir à mão ou cancelada automaticamente pela situação da nota.')
on conflict (tipo, referencia) do nothing;

-- ── A conferência ─────────────────────────────────────────────────────────
create or replace function public.carbo_nf_reconferir_vendas(p_ensaio boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r            record;
  v_ult        record;
  v_acao       text;
  v_etapa      text;
  v_status     text;
  v_titulo     text;
  v_corpo      text;
  v_reabertos  int := 0;
  v_a_mao      int := 0;
  v_cancelados int := 0;
  v_lista      jsonb := '[]'::jsonb;
begin
  -- Candidatas: venda V… cancelada nos últimos 60 dias, com a situação da nota
  -- de cada conta. Conjunto pequeno — o histórico só é lido para elas.
  for r in
    select o.id, o.order_number, o.customer_name, o.total, o.vendedor_id,
           o.stock_deducted, o.bling_nf_id, o.bling2_nf_id,
           n1.numero  as nf1_numero, n1.situacao as nf1_situacao,
           bo.situacao_id as pedido2_situacao,
           coalesce(n2b.numero, n2.numero)     as nf2_numero,
           coalesce(n2b.situacao, n2.situacao) as nf2_situacao
      from public.carboze_orders o
      left join public.bling_nfe  n1  on n1.bling_id = o.bling_nf_id
      left join public.bling2_orders bo on o.external_ref = 'bling2-' || bo.bling_id
      left join public.bling2_nfe n2b on n2b.bling_id = bo.nf_bling_id
      left join public.bling2_nfe n2  on n2.bling_id = o.bling2_nf_id
     where o.status = 'cancelled'
       and o.order_number like 'V%'
       and o.updated_at > now() - interval '60 days'
       and (o.bling_nf_id is not null or o.bling2_nf_id is not null or bo.bling_id is not null)
  loop
    -- O último cancelamento deste pedido, e quem o fez.
    select a.created_at, a.user_id, a.before_data
      into v_ult
      from public.order_audit_logs a
     where a.table_name = 'carboze_orders'
       and a.record_id = r.id
       and a.action = 'UPDATE'
       and a.after_data->>'status' = 'cancelled'
       and a.before_data->>'status' is distinct from 'cancelled'
     order by a.created_at desc
     limit 1;

    -- Sem registro, ou cancelado por gente: não é desta conferência.
    continue when v_ult.created_at is null or v_ult.user_id is not null;
    continue when v_ult.created_at < now() - interval '60 days';

    v_acao := null;
    if (r.pedido2_situacao is distinct from 12)
       and (public.bling2_nf_e_valida(r.nf2_situacao) or public.carbo_nf_valida(r.nf1_situacao)) then
      -- A nota hoje vale: reabre, ou pede para reabrir à mão se houve estorno.
      v_acao := case
        when coalesce((v_ult.before_data->>'stock_deducted')::boolean, false)
             is distinct from coalesce(r.stock_deducted, false)
        then 'reabrir_a_mao' else 'reaberto' end;
    elsif v_ult.created_at > now() - interval '2 days'
       and (r.pedido2_situacao = 12
            or public.carbo_nf_invalida(r.nf2_situacao)
            or public.carbo_nf_invalida(r.nf1_situacao)) then
      v_acao := 'cancelado_por_nf';
    end if;
    continue when v_acao is null;

    -- Já registrado para este cancelamento: nada a fazer de novo.
    continue when exists (select 1 from public.carbo_nf_reconferencia c
                           where c.pedido_id = r.id and c.acao = v_acao
                             and c.cancelado_em = v_ult.created_at);

    v_status := coalesce(nullif(v_ult.before_data->>'status', ''), 'pending');
    if v_status in ('quote', 'cancelled') then v_status := 'pending'; end if;
    v_etapa  := coalesce(nullif(v_ult.before_data->>'fulfillment_stage', ''), 'nova_venda');
    if v_etapa = 'gerar_nf' then v_etapa := 'emitir_etiqueta'; end if;

    v_lista := v_lista || jsonb_build_object(
      'pedido', r.order_number, 'acao', v_acao,
      'nf', coalesce(r.nf2_numero, r.nf1_numero),
      'situacao_nf', coalesce(r.nf2_situacao, r.nf1_situacao),
      'cancelado_em', v_ult.created_at, 'etapa_destino', v_etapa);

    if p_ensaio then
      continue;
    end if;

    if v_acao = 'reaberto' then
      -- Um pedido que falha não pode parar a conferência dos outros.
      begin
        perform set_config('carbo.reabre_por_nf', 'on', true);
        update public.carboze_orders
           set status = v_status::public.order_status,
               fulfillment_stage = v_etapa,
               updated_at = now()
         where id = r.id and status = 'cancelled';
        perform set_config('carbo.reabre_por_nf', 'off', true);
      exception when others then
        perform set_config('carbo.reabre_por_nf', 'off', true);
        raise warning 'conferência de NF: não reabriu % — %', r.order_number, sqlerrm;
        continue;
      end;
      v_reabertos := v_reabertos + 1;
      begin
        insert into public.order_status_history (order_id, status, notes, changed_by)
        values (r.id, v_status::public.order_status,
                'Reaberto pela conferência de NF: a nota '
                  || coalesce(r.nf2_numero, r.nf1_numero, '?') || ' está '
                  || coalesce(r.nf2_situacao, r.nf1_situacao, '?')
                  || ' — o cancelamento automático de '
                  || to_char(v_ult.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
                  || ' foi desfeito.',
                null);
      exception when others then null;
      end;
    elsif v_acao = 'reabrir_a_mao' then
      v_a_mao := v_a_mao + 1;
    else
      v_cancelados := v_cancelados + 1;
    end if;

    insert into public.carbo_nf_reconferencia
      (pedido_id, order_number, acao, conta, nf_numero, situacao_nf, cancelado_em,
       status_antes, etapa_antes, etapa_depois, detalhe)
    values
      (r.id, r.order_number, v_acao,
       case when r.nf2_situacao is not null or r.pedido2_situacao is not null then 2 else 1 end,
       coalesce(r.nf2_numero, r.nf1_numero), coalesce(r.nf2_situacao, r.nf1_situacao),
       v_ult.created_at, v_ult.before_data->>'status', v_ult.before_data->>'fulfillment_stage',
       case when v_acao = 'reaberto' then v_etapa end,
       case when r.pedido2_situacao = 12 then 'pedido cancelado no Bling 2' end)
    on conflict (pedido_id, acao, cancelado_em) do nothing;

    v_titulo := case v_acao
      when 'reaberto'      then 'Venda ' || r.order_number || ' reaberta — NF voltou a valer'
      when 'reabrir_a_mao' then 'Venda ' || r.order_number || ' — NF voltou a valer, reabrir no Rastreio'
      else                      'Venda ' || r.order_number || ' cancelada pela NF'
    end;
    v_corpo := coalesce(r.customer_name, 'cliente') || ' · R$ '
      || to_char(coalesce(r.total, 0), 'FM999G999G990D00')
      || ' · NF ' || coalesce(r.nf2_numero, r.nf1_numero, '?')
      || ' ' || coalesce(r.nf2_situacao, r.nf1_situacao, case when r.pedido2_situacao = 12 then 'pedido cancelado no Bling' end, '')
      || case v_acao
           when 'reaberto' then '. Voltou para ' || v_etapa || ' e conta de novo no faturamento e na comissão.'
           when 'reabrir_a_mao' then '. O cancelamento estornou estoque: reabra arrastando o card no Rastreio (a separação deduz de novo).'
           else '. A venda saiu do faturamento e da comissão. Se a nota for reemitida, a conferência reabre sozinha.'
         end;

    -- Vendedor: sempre, menos o cancelamento da matriz (o gatilho da NF já avisa).
    if r.vendedor_id is not null
       and not (v_acao = 'cancelado_por_nf' and r.nf2_situacao is null and r.pedido2_situacao is null) then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
      values (r.vendedor_id, 'nf_reconferida', v_titulo, v_corpo, 'carboze_order', r.id::text);
    end if;

    -- TI: sempre.
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
    select p.id, 'nf_reconferida_ti', v_titulo, v_corpo, 'carboze_order', r.id::text
      from public.profiles p
     where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
  end loop;

  return jsonb_build_object(
    'ensaio', p_ensaio,
    'reabertos', v_reabertos,
    'reabrir_a_mao', v_a_mao,
    'cancelados_avisados', v_cancelados,
    'pedidos', v_lista);
end $$;

comment on function public.carbo_nf_reconferir_vendas is
  'Conferência de NF das vendas V… canceladas automaticamente: reabre a que tem nota válida de novo (ou pede reabertura à mão se houve estorno de estoque) e avisa o cancelamento automático pela nota. Ensaio por padrão; o cron chama com false. Registro em carbo_nf_reconferencia.';

revoke execute on function public.carbo_nf_reconferir_vendas(boolean) from public, anon, authenticated;
grant execute on function public.carbo_nf_reconferir_vendas(boolean) to service_role;

-- ── O agendamento ─────────────────────────────────────────────────────────
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'carbo-nf-reconferir-30min') then
    perform cron.unschedule('carbo-nf-reconferir-30min');
  end if;
  perform cron.schedule('carbo-nf-reconferir-30min', '29-59/30 * * * *',
                        'select public.carbo_nf_reconferir_vendas(false)');
end $cron$;
