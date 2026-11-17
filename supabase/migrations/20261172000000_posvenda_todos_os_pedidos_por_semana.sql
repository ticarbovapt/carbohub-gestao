-- ═══════════════════════════════════════════════════════════════════════════
-- 20261172 — Pós-venda: TODOS os pedidos, semana a semana (Atendimento, `/pendencias`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 17/11/2026, sobre a tela de Pendências de
-- entrega (20261154):
--   * navegar SEMANA A SEMANA (domingo a sábado) clicando, sem dropdown, nas
--     duas abas (antes e a partir de 06/11); mês e período como alternativa;
--   * pedido do ML FULL NÃO entra — a logística e o pós-venda são do Mercado
--     Livre;
--   * TODO o resto entra, MESMO ENTREGUE — "depois de entregue pode ter
--     problema também". A tela vira uma tela de pós-venda.
--
-- `carbo_posvenda(de, ate, corte)` devolve:
--   itens    todo pedido com `data_pedido` no período (menos o Full), com o
--            problema julgado (NULO quando não há) e o trato
--   abertos  { antes, novos }: problemas sem trato final, no histórico TODO —
--            o selo das abas
--   semanas  [{ semana, antes, n }]: onde estão os problemas em aberto (o
--            domingo da semana), para o seletor apontar semana com pendência
--   primeiro o dia do pedido mais antigo (o limite do "‹")
--
-- ⚠️ O JULGAMENTO é cópia LITERAL do da `carbo_entrega_pendencias` (20261154):
-- mesma ordem, mesmos limiares da `carbo_esteira_limite`. Aquela continua no
-- banco (a consulta `esteira_como_usuario.sql` a mede) e a tela deixa de usá-la;
-- mudou a régua de problema, mude nas duas.
-- ⚠️ "Full" é CADASTRO, não nome: o ramo do Bling 1 (`bling_id` negativo) cuja
-- loja tem `bling_lojas.plataforma_fatura` (20261091) — a loja cuja nota e
-- entrega são da plataforma. Loja nova assim sai sozinha; `canal = 'ML Full'`
-- é rótulo do cadastro e muda com uma renomeada.
-- ⚠️ O rastreio casa pelo código do Bling OU pelo da transportadora (o do
-- Melhor Envio): antes era só o do Bling, e o card cujo código veio só do ME
-- não tinha previsão nem "problema na transportadora" (P7 da reforma).
-- ⚠️ Os problemas só existem nas quatro etapas em aberto — entregue e cancelado
-- não têm régua automática. Problema DEPOIS da entrega é o trato de quem atende.
-- ⚠️ `jsonb`, nunca `setof`; SECURITY DEFINER guardada no corpo (no SQL Editor
-- ela RECUSA — sem usuário não há time interno, e isso está certo).
-- ⚠️ O período tem teto de 400 dias: é a página da tela, não um export.
-- Não move card nenhum: não toca `bling2_esteira`, `carbo_msg_fila` nem trato.
-- ═══════════════════════════════════════════════════════════════════════════

-- As etapas em aberto entram SEMPRE (o selo das abas olha o histórico todo).
do $$
begin
  if to_regclass('public.carbo_esteira_cards') is not null then
    execute $i$create index if not exists carbo_esteira_cards_abertos_idx
      on public.carbo_esteira_cards (etapa)
      where etapa in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito')$i$;
  end if;
end $$;

create or replace function public.carbo_posvenda(
  p_de    date,
  p_ate   date,
  p_corte date default date '2026-11-06'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim      jsonb;
  v_itens    jsonb;
  v_semanas  jsonb;
  v_antes    int;
  v_novos    int;
  v_primeiro date;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_ate - p_de > 400 then
    raise exception 'Período longo demais (máximo 400 dias)' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(etapa, dias), '{}'::jsonb) into v_lim
    from public.carbo_esteira_limite where ativo;

  with lim as (
    select coalesce((v_lim ->> 'confirmado')::int, 2)   as confirmado,
           coalesce((v_lim ->> 'nf_emitida')::int, 3)   as nf_emitida,
           coalesce((v_lim ->> 'etiqueta')::int, 3)     as etiqueta,
           coalesce((v_lim ->> 'em_transito')::int, 15) as em_transito
  ),
  alvo as (
    select bling_id from public.bling2_esteira where data_pedido between p_de and p_ate
    union
    select bling_id from public.bling2_esteira
     where etapa in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito')
  ),
  base as materialized (
    select e.*, r.status as r_status, r.status_descricao as r_descricao,
           r.previsao_entrega, r.postado_em as r_postado_em, r.entregue_em as r_entregue_em,
           r.ultimo_evento_em, r.url_rastreio
      from alvo a
      join public.bling2_esteira e on e.bling_id = a.bling_id
      left join lateral (
        select x.* from public.rastreio_envios x
         where x.codigo in (e.rastreio, e.rastreio_transportadora)
         order by (x.codigo = e.rastreio) desc nulls last
         limit 1
      ) r on true
     where not exists (
       select 1 from public.bling_lojas l
        where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null)
  ),
  julgado as materialized (
    select b.*,
      case
        when b.etapa not in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito') then null
        when b.r_status in ('problema', 'devolvido') then 'transportadora'
        when b.etapa <> 'em_transito' and b.me_situacao = 'vencido'
             and b.me_tem_ativo is not true then 'vencida'
        when b.etapa <> 'em_transito' and b.me_situacao = 'cancelado'
             and b.me_tem_ativo is not true then 'cancelada'
        when b.etapa = 'etiqueta'
             and coalesce(b.me_gerado_em, b.nf_data::timestamptz, b.data_pedido::timestamptz)
                 < now() - make_interval(days => l.etiqueta) then 'nao_postado'
        when b.etapa = 'em_transito'
             and coalesce(b.previsao_entrega + 2,
                          coalesce(b.r_postado_em::date, b.data_pedido) + l.em_transito)
                 < current_date then 'atrasado'
        when b.etapa = 'nf_emitida'
             and coalesce(b.nf_data::timestamptz, b.data_pedido::timestamptz)
                 < now() - make_interval(days => l.nf_emitida) then 'sem_etiqueta'
        when b.etapa = 'confirmado'
             and b.data_pedido < current_date - l.confirmado then 'sem_nf'
      end as problema,
      case
        when b.r_status in ('problema', 'devolvido') then b.ultimo_evento_em
        when b.me_situacao = 'vencido' then b.me_expirado_em
        when b.etapa = 'etiqueta' then coalesce(b.me_gerado_em, b.nf_data::timestamptz, b.data_pedido::timestamptz)
        when b.etapa = 'em_transito' then coalesce(b.previsao_entrega::timestamptz, b.r_postado_em, b.data_pedido::timestamptz)
        when b.etapa = 'nf_emitida' then coalesce(b.nf_data::timestamptz, b.data_pedido::timestamptz)
        else b.data_pedido::timestamptz
      end as desde,
      (b.data_pedido - extract(dow from b.data_pedido)::int) as semana
      from base b cross join lim l
  ),
  com_trato as materialized (
    select j.*, t.situacao as t_situacao, t.observacao as t_observacao,
           t.atualizado_em as t_em, nullif(btrim(pr.full_name), '') as t_por,
           t.bling_id is not null as tem_trato,
           coalesce(t.situacao in ('reembolsado', 'resolvido', 'sem_solucao'), false) as trato_final
      from julgado j
      left join public.carbo_entrega_trato t on t.bling_id = j.bling_id
      left join public.profiles pr on pr.id = t.atualizado_por
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'bling_id',        c.bling_id,
              'pedido_numero',   c.pedido_numero,
              'pedido_loja',     c.pedido_loja,
              'pedido_codigo',   c.pedido_codigo,
              'canal',           c.canal,
              'data_pedido',     c.data_pedido,
              'total',           c.total,
              'cliente',         c.cliente,
              'cliente_fone',    c.cliente_fone,
              'cidade',          c.entrega_cidade,
              'uf',              c.entrega_uf,
              'etapa',           c.etapa,
              'problema',        c.problema,
              'desde',           c.desde,
              'previsao',        c.previsao_entrega,
              'entregue_em',     c.r_entregue_em,
              'rastreio_status', c.r_descricao,
              'transportadora',  c.transportadora,
              'rastreio',        coalesce(c.rastreio_transportadora, c.rastreio),
              'url_rastreio',    c.url_rastreio,
              'nf_numero',       c.nf_numero,
              'antes_do_corte',  c.data_pedido < p_corte,
              'trato', case when not c.tem_trato then null else jsonb_build_object(
                         'situacao', c.t_situacao, 'observacao', c.t_observacao,
                         'em', c.t_em, 'por', c.t_por) end
            ) order by c.data_pedido, c.bling_id), '[]'::jsonb)
       from com_trato c where c.data_pedido between p_de and p_ate),
    (select coalesce(jsonb_agg(jsonb_build_object('semana', s.semana, 'antes', s.antes, 'n', s.n)
                               order by s.semana, s.antes), '[]'::jsonb)
       from (select c.semana, c.data_pedido < p_corte as antes, count(*) as n
               from com_trato c
              where c.problema is not null and not c.trato_final
              group by 1, 2) s),
    (select count(*) from com_trato c
      where c.problema is not null and not c.trato_final and c.data_pedido < p_corte),
    (select count(*) from com_trato c
      where c.problema is not null and not c.trato_final and c.data_pedido >= p_corte)
    into v_itens, v_semanas, v_antes, v_novos;

  select min(e.data_pedido) into v_primeiro
    from public.bling2_esteira e
   where not exists (
     select 1 from public.bling_lojas l
      where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null);

  return jsonb_build_object(
    'gerado_em', now(),
    'corte',     p_corte,
    'de',        p_de,
    'ate',       p_ate,
    'primeiro',  v_primeiro,
    'abertos',   jsonb_build_object('antes', v_antes, 'novos', v_novos),
    'semanas',   v_semanas,
    'itens',     v_itens);
end $$;

comment on function public.carbo_posvenda(date, date, date) is
  'Pós-venda (Atendimento /pendencias): todo pedido do período menos o ML Full (loja com plataforma_fatura), com o problema julgado pela MESMA régua da carbo_entrega_pendencias e o trato. Ver 20261172.';

revoke execute on function public.carbo_posvenda(date, date, date) from public, anon;
grant execute on function public.carbo_posvenda(date, date, date) to authenticated;

-- Conferência que aborta: a função existe e `anon` não a executa.
do $$
begin
  if to_regprocedure('public.carbo_posvenda(date, date, date)') is null then
    raise exception 'ABORTADO: carbo_posvenda não foi criada';
  end if;
  if has_function_privilege('anon', 'public.carbo_posvenda(date, date, date)', 'execute') then
    raise exception 'ABORTADO: anon executa carbo_posvenda';
  end if;
end $$;
