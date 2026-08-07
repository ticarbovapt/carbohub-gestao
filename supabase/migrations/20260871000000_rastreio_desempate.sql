-- ═══════════════════════════════════════════════════════════════════════════
-- Trajeto: desempate por etapa quando o horário é igual
--
-- O card mostrava "Saiu para entrega" ACIMA de "Entregue", com os dois em
-- 05/08 17:18 — o mesmo minuto. Não é dado errado: o Mercado Livre carimba
-- `date_first_visit` e `date_delivered` no MESMO instante quando o pacote é
-- entregue na primeira visita, que é o caso comum.
--
-- A ordenação era só `ocorrido_em desc`. Empate em SQL não tem ordem definida,
-- então o desempate saía por acaso — e metade das vezes saía errado, dizendo
-- que o pedido está a caminho quando ele já chegou. Num painel que existe para
-- responder "onde está?", essa é a pior linha possível para estar errada.
--
-- O desempate é a ordem do FLUXO: entre dois eventos do mesmo instante, o que
-- está mais adiante no caminho é o mais recente. Só vale para empate; onde há
-- diferença de tempo, o tempo continua mandando.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rastreio_ordem_etapa(p_status text)
returns smallint language sql immutable set search_path = public as $$
  select case p_status
    when 'entregue'     then 7
    when 'devolvido'    then 6
    when 'problema'     then 5
    when 'saiu_entrega' then 4
    when 'em_transito'  then 3
    when 'postado'      then 2
    when 'cancelado'    then 1
    else 0
  end::smallint
$$;

comment on function public.rastreio_ordem_etapa is
  'Posição da etapa no fluxo de entrega. Serve para desempatar eventos com o mesmo carimbo de tempo — o Mercado Livre grava "saiu para entrega" e "entregue" no mesmo instante quando entrega na primeira visita.';


create or replace view public.rastreio_card
with (security_invoker = true) as
select
  e.codigo,
  e.fonte,
  e.bling_id,
  e.fonte_id,
  e.transportadora,
  e.servico,
  e.status,
  e.status_descricao,
  e.previsao_entrega,
  e.postado_em,
  e.entregue_em,
  e.ultimo_evento_em,
  e.url_rastreio,
  e.consultado_em,
  e.erro,
  (e.previsao_entrega is not null
     and e.entregue_em is null
     and e.previsao_entrega < current_date)                    as atrasado,
  (select count(*) from public.rastreio_eventos v where v.codigo = e.codigo) as qtd_eventos,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'ocorrido_em', v.ocorrido_em,
             'descricao',   v.descricao,
             'status',      v.status,
             'cidade',      v.cidade,
             'uf',          v.uf)
           -- Tempo manda; empate desempata pela etapa mais adiantada.
           order by v.ocorrido_em desc,
                    public.rastreio_ordem_etapa(v.status) desc)
    from public.rastreio_eventos v
    where v.codigo = e.codigo
  ), '[]'::jsonb)                                              as eventos
from public.rastreio_envios e;

grant select on public.rastreio_card to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O caso do print: onde havia empate, "Entregue" tem de estar no topo.
select codigo,
       eventos -> 0 ->> 'descricao' as evento_no_topo,
       eventos -> 0 ->> 'ocorrido_em' as quando
from public.rastreio_card
where entregue_em is not null
limit 10;

-- (b) Quantos empates existem de fato — a dimensão do problema.
select count(*) as pares_no_mesmo_instante
from public.rastreio_eventos a
join public.rastreio_eventos b
  on b.codigo = a.codigo and b.ocorrido_em = a.ocorrido_em and b.descricao <> a.descricao;
