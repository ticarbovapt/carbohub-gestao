-- ═══════════════════════════════════════════════════════════════════════════
-- 20261153 — 667 cards parados em "Etiqueta" com o cliente já com o produto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A causa NÃO é a view. É de onde ela lê o "postado" e o "entregue":
--
--   melhor-envio-envios   lia só as 500 etiquetas MAIS RECENTES do ME (10 × 50).
--                         Com ~100 envios/dia, etiqueta de uma semana atrás já
--                         não aparece, e o `posted_at`/`delivered_at` que chega
--                         depois nunca era gravado no espelho.
--   rastreio-sync         `.limit(500)` SEM ordem sobre a esteira e os 60
--                         primeiros: sempre o mesmo pedaço, o resto nunca.
--
-- A correção mora nas DUAS funções (reconferência de todo envio em aberto pelo
-- `/shipment/tracking`, e fila que roda). Este arquivo só guarda os blocos que
-- rodam no SQL Editor — nenhuma view é republicada.
--
-- ⚠️ ORDEM: BLOCO 0 → BLOCO 1 → só então o merge (o push em `main` deploya as
-- funções, e na primeira hora centenas de cards andam de uma vez). Sem o
-- BLOCO 1, cada card destravado manda "em trânsito"/"entregue" no WhatsApp
-- para quem recebeu há dias.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir (só leitura)                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Os cards em Etiqueta, por canal e origem do rastreio.
select canal, rastreio_origem, me_situacao,
       count(*)                                                        as cards,
       count(*) filter (where coalesce(me_gerado_em, data_pedido::timestamptz)
                              < now() - interval '3 days')             as ha_mais_de_3_dias,
       min(data_pedido)                                                as mais_antigo
  from public.bling2_esteira
 where etapa = 'etiqueta'
 group by 1, 2, 3
 order by cards desc;

-- (b) A causa: envios abertos no espelho que a listagem não relê.
select count(*)                                                        as abertos_no_espelho,
       count(*) filter (where atualizado_em < now() - interval '1 hour') as fora_da_listagem,
       min(gerado_em)                                                  as mais_antigo
  from public.melhorenvio_envios
 where gerado_em is not null and entregue_em is null
   and cancelado_em is null and expirado_em is null;

-- (c) Quais avisos estão ligados nas etapas que os cards vão alcançar.
select etapa, ativo, canal_envio, meta_status
  from public.carbo_msg_templates
 where etapa in ('em_transito', 'saiu_entrega', 'entregue')
 order by etapa;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o freio, ANTES do deploy                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Card em Etiqueta ou Em trânsito com etiqueta de MAIS DE 3 DIAS não reavisa
-- quando destravar. Os de até 3 dias seguem normais (etiqueta de sexta é
-- postada na segunda). `on conflict do nothing`: o que já saiu não é tocado.
with ins as (
  insert into public.carbo_msg_envios (bling_id, etapa, status, motivo, telefone, enviado_em)
  select e.bling_id, x.etapa, 'ignorado',
         'freio 20261153: card parado em etiqueta, destravado pela reconferencia do ME',
         e.cliente_fone, now()
    from public.bling2_esteira e
   cross join (values ('em_transito'), ('saiu_entrega'), ('entregue')) as x(etapa)
   where e.etapa in ('etiqueta', 'em_transito')
     and coalesce(e.me_gerado_em, e.data_pedido::timestamptz) < now() - interval '3 days'
     and not (e.etapa = 'em_transito' and x.etapa = 'em_transito')
  on conflict do nothing
  returning etapa
)
select etapa, count(*) as freados from ins group by 1 order by 1;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferir, ~1 h depois do deploy                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select etapa, count(*) as cards
  from public.bling2_esteira
 where etapa in ('etiqueta', 'em_transito', 'entregue')
 group by 1 order by 1;

select count(*) filter (where atualizado_em < now() - interval '2 hours') as sem_conferir_ha_2h,
       count(*)                                                          as abertos_no_espelho
  from public.melhorenvio_envios
 where gerado_em is not null and entregue_em is null
   and cancelado_em is null and expirado_em is null;
