-- ═══════════════════════════════════════════════════════════════════════════
-- Pós-venda: a lista "Para tratar" (23/11/2026)
--
-- A tela /pos-venda passou a abrir em três abas — Para tratar · Casos abertos ·
-- Todos os pedidos (pedido do dono do processo: "muita informação, cheio de
-- botões, confuso"). "Para tratar" é o que precisa de alguém AGORA, de
-- QUALQUER data:
--
--   · problema na entrega, sem caso aberto e sem tratativa encerrada; ou
--   · reclamação do WhatsApp que ninguém está tratando (`pendente`, a MESMA
--     expressão que a função já devolvia para a tela).
--
-- `carbo_posvenda` ganha `p_so_atencao`. As reclamações entram pelos últimos
-- 90 dias (janela DECLARADA): pedido entregue não está no conjunto de pedidos
-- em andamento, e sem isto quem reclamou de um pedido entregue nunca entraria.
--
-- ⚠️ Troca no TEXTO VIVO (`prosrc`), por padrão (`\s+`) e exigindo UMA
-- ocorrência de cada trecho; não bateu ⇒ ABORTA e nada muda. O antes vai para
-- `carbo_backup_funcoes`. Parâmetro novo muda a assinatura: a antiga é APAGADA
-- (duas assinaturas = `function is not unique`).
-- ⚠️ Os outros modos (período, casos, um pedido) não mudam: a nova condição
-- só vale com `p_so_atencao`, e o conjunto extra de pedidos é filtrado por ela.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);
alter table public.carbo_backup_funcoes enable row level security;

do $m$
declare
  v_oid  oid;
  v_src  text;
  v_n    int;
  v_tr   text[][] := array[
    -- 1) a validação do período não vale para a fila
    array[$p$if\s+not\s+p_so_casos\s+and\s+p_pedido\s+is\s+null\s+then$p$,
          $r$if not p_so_casos and not p_so_atencao and p_pedido is null then$r$],
    -- 2) desde quando ler as reclamações
    array[$p$when\s+p_so_casos\s+then\s+\(select\s+min\(e\.data_pedido\)$p$,
          $r$when p_so_atencao then current_date - 90
    when p_so_casos then (select min(e.data_pedido)$r$],
    -- 3) os pedidos com reclamação entram no conjunto
    array[$p$union\s+select\s+bling_id\s+from\s+abertos_caso\s*\)$p$,
          $r$union
    select bling_id from abertos_caso
    union
    select x.bling_id
      from public.carbo_posvenda_reclamacoes(
             coalesce(v_desde, current_date)::timestamp at time zone 'America/Sao_Paulo', null) x
     where p_so_atencao and x.bling_id is not null
  )$r$],
    -- 4) o que vai na lista
    array[$p$when\s+p_so_casos\s+then\s+c\.bling_id\s+in\s+\(select\s+bling_id\s+from\s+abertos_caso\)$p$,
          $r$when p_so_atencao then
                   (c.problema is not null and not c.trato_final
                    and coalesce(c.caso ->> 'status', '') <> 'aberto')
                   or (r.bling_id is not null and coalesce(c.caso ->> 'status', '') <> 'aberto'
                       and (c.caso is null or c.caso ->> 'desfecho' = 'cancelado'
                            or (c.caso ->> 'encerrado_em')::timestamptz < r.ultima_em))
                 when p_so_casos then c.bling_id in (select bling_id from abertos_caso)$r$]
  ];
  i int;
begin
  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'carbo_posvenda'
     and pg_get_function_identity_arguments(p.oid)
         = 'p_de date, p_ate date, p_corte date, p_so_casos boolean, p_pedido bigint';
  if v_oid is null then
    raise exception 'ABORTADO: carbo_posvenda(date, date, date, boolean, bigint) não encontrada';
  end if;
  if v_src ~ 'p_so_atencao' then
    raise exception 'ABORTADO: o texto vivo já fala em p_so_atencao';
  end if;

  insert into public.carbo_backup_funcoes (funcao, definicao)
  values ('carbo_posvenda (antes de 20261181)', pg_get_functiondef(v_oid));

  for i in 1 .. array_length(v_tr, 1) loop
    select count(*) into v_n from regexp_matches(v_src, v_tr[i][1], 'g');
    if v_n <> 1 then
      raise exception 'ABORTADO: trecho % achado % vezes no texto vivo (esperado 1)', i, v_n;
    end if;
    v_src := regexp_replace(v_src, v_tr[i][1], v_tr[i][2]);
  end loop;

  drop function public.carbo_posvenda(date, date, date, boolean, bigint);
  execute format($f$
    create function public.carbo_posvenda(
      p_de         date    default null,
      p_ate        date    default null,
      p_corte      date    default date '2026-11-06',
      p_so_casos   boolean default false,
      p_pedido     bigint  default null,
      p_so_atencao boolean default false
    )
    returns jsonb
    language plpgsql stable security definer set search_path = public as %L
  $f$, v_src);
end $m$;

comment on function public.carbo_posvenda(date, date, date, boolean, bigint, boolean) is
  'Pós-venda (Atendimento /pos-venda): todo pedido do período menos o ML Full, com o problema, a tratativa, o caso e a reclamação do WhatsApp. p_so_casos = casos abertos de qualquer data; p_pedido = um pedido só; p_so_atencao = a lista Para tratar (problema sem caso nem tratativa encerrada, ou reclamação pendente dos últimos 90 dias). Ver 20261172/73/74/81.';

revoke execute on function public.carbo_posvenda(date, date, date, boolean, bigint, boolean) from public, anon;
grant execute on function public.carbo_posvenda(date, date, date, boolean, bigint, boolean) to authenticated;

-- Conferência que ABORTA
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'carbo_posvenda') <> 1 then
    raise exception 'ABORTADO: carbo_posvenda ficou com mais de uma assinatura';
  end if;
  if has_function_privilege('anon', 'public.carbo_posvenda(date, date, date, boolean, bigint, boolean)', 'execute') then
    raise exception 'ABORTADO: anon executa carbo_posvenda';
  end if;
  if not has_function_privilege('authenticated', 'public.carbo_posvenda(date, date, date, boolean, bigint, boolean)', 'execute') then
    raise exception 'ABORTADO: a tela não executa carbo_posvenda';
  end if;
end $$;
