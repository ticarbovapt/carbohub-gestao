-- ═══════════════════════════════════════════════════════════════════════════
-- A esteira parava de contar a verdade em dois pontos, e os dois são da view
--
-- Achados na auditoria de expedição de 25/08/2026, cruzando a planilha do
-- comercial com o nosso espelho do Melhor Envio.
--
-- ── DEFEITO 1: etiqueta que vence SOME em vez de aparecer ────────────────
--
--   melhorenvio_envio_vigente ... where e.bling_id is not null AND e.ativo
--
-- `ativo` é coluna gerada: `cancelado_em is null and expirado_em is null`.
-- A intenção era certa e está no comentário original: "sem esta view o envio
-- cancelado poderia marcar o pedido como enviado". Mas o filtro é largo demais.
--
-- Pedido cuja ÚNICA etiqueta venceu desaparece da view inteira. A esteira
-- então lê `me.situacao = null`, `me.expirado_em = null`, e o card cai para a
-- etapa anterior como se nada tivesse acontecido. Quem olha vê "NF emitida" e
-- conclui que falta gerar etiqueta — quando na verdade a etiqueta foi gerada,
-- paga, e VENCEU.
--
-- Foi assim que 6 etiquetas expiradas (R$ 688,10 de frete) ficaram invisíveis
-- até alguém montar uma planilha à mão. A informação existia no banco o tempo
-- todo; a view a jogava fora.
--
-- ⚠️ A correção NÃO é remover o filtro. É trocar EXCLUSÃO por PRECEDÊNCIA: a
-- etiqueta ativa continua ganhando sempre; a inativa só aparece quando não há
-- nenhuma ativa para aquele pedido. Assim um envio cancelado nunca desbanca um
-- ativo — que era o medo original, e continua atendido — e ao mesmo tempo
-- "venceu e ninguém refez" deixa de ser silêncio.
--
-- ── DEFEITO 2: `protocol` não é código de rastreio ───────────────────────
--
--   coalesce(e.tracking, e.self_tracking, e.protocol) as codigo
--
-- O `protocol` do Melhor Envio é a referência INTERNA do pedido dele, no
-- formato `ORD-202608141855367`. Não é código de transportadora e nunca vai
-- ser reconhecido por nenhuma.
--
-- Medido: dos 6 envios que o Melhor Envio marca como ENTREGUES e que o nosso
-- rastreio mostra sem status nenhum, 4 têm exatamente esse formato como
-- `codigo`. O `rastreio-sync` consulta, a transportadora responde vazio, e
-- `status` fica nulo para sempre — sem erro, porque resposta vazia não é erro.
-- O cliente recebeu o produto e o card nunca saiu de "etiqueta".
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o retrato ANTES (rode primeiro, para comparar depois)       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O NÚMERO QUE DECIDE TUDO: quantos envios têm vínculo com pedido.
--     Sem `bling_id` a view não enxerga o envio, e nenhuma correção de
--     precedência ajuda — o conserto seria na conciliação, não aqui.
select
  count(*)                                                           as envios,
  count(bling_id)                                                    as com_vinculo,
  count(*) - count(bling_id)                                         as sem_vinculo,
  count(*) filter (where entregue_em is not null)                    as entregues,
  count(*) filter (where entregue_em is not null and bling_id is null) as entregues_sem_vinculo,
  count(*) filter (where expirado_em is not null)                    as expiradas,
  count(*) filter (where expirado_em is not null and bling_id is not null) as expiradas_com_vinculo
from public.melhorenvio_envios;

-- (b) Quantos pedidos a view VÊ hoje, e quantos ela esconde por estarem
--     cancelados ou vencidos.
select
  (select count(*) from public.melhorenvio_envio_vigente)              as pedidos_visiveis_hoje,
  (select count(distinct bling_id) from public.melhorenvio_envios
    where bling_id is not null)                                       as pedidos_com_envio,
  (select count(distinct bling_id) from public.melhorenvio_envios
    where bling_id is not null and not ativo
      and bling_id not in (select bling_id from public.melhorenvio_envio_vigente))
                                                                      as pedidos_escondidos;

-- (c) Os códigos que nenhuma transportadora reconhece.
select count(*) filter (where codigo like 'ORD-%')   as codigo_e_referencia_interna,
       count(*) filter (where codigo is not null)    as com_codigo
from public.melhorenvio_envio_vigente;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view passa a mostrar o que venceu                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Coluna nova (`tem_ativo`) no FIM e ordem das antigas intacta:
-- `CREATE OR REPLACE VIEW` só acrescenta. E `security_invoker` REPETIDO —
-- republicar sem ele apaga as reloptions e a RLS deixa de valer.

create or replace view public.melhorenvio_envio_vigente
with (security_invoker = true) as
select distinct on (e.bling_id)
  e.bling_id,
  e.me_id,
  e.tracking,
  e.self_tracking,
  -- ⚠️ `protocol` SAIU do coalesce. Ele é `ORD-2026…`, a referência interna do
  -- Melhor Envio — consultar isso numa transportadora devolve vazio para
  -- sempre, e vazio não é erro, então ninguém percebe. `melhorenvio_tracking`
  -- entra no lugar dele: esse é código de verdade.
  coalesce(e.tracking, e.self_tracking, e.melhorenvio_tracking) as codigo,
  public.melhorenvio_situacao(e.cancelado_em, e.expirado_em, e.entregue_em,
                              e.postado_em, e.gerado_em, e.pago_em) as situacao,
  e.gerado_em, e.postado_em, e.entregue_em, e.expirado_em,
  e.transportadora, e.servico, e.prazo_dias, e.url_rastreio,
  e.vinculo_status, e.vinculo_via,
  e.destinatario_nome, e.destinatario_doc, e.valor,
  -- ── acrescentada aqui, no fim ───────────────────────────────────────────
  -- ⚠️ Diz se ESTA linha é uma etiqueta viva. `false` significa que o pedido
  -- não tem nenhuma etiqueta ativa e o que se vê é o último estado morto
  -- (vencida ou cancelada). É o que separa "ainda vai sair" de "não vai sair
  -- e ninguém refez" — a distinção que a tela não conseguia fazer.
  e.ativo                                                    as tem_ativo
from public.melhorenvio_envios e
-- ⚠️ O `and e.ativo` SAIU DAQUI e virou precedência no ORDER BY abaixo.
-- Filtrar aqui escondia o pedido inteiro quando a única etiqueta vencia.
where e.bling_id is not null
order by e.bling_id,
         -- ⚠️ ATIVO PRIMEIRO, e isto é o que preserva a garantia original:
         -- havendo qualquer etiqueta viva, ela ganha, e um envio cancelado
         -- nunca pode marcar o pedido como enviado. A inativa só aparece
         -- quando não sobrou nenhuma viva.
         e.ativo desc,
         e.gerado_em desc nulls last,
         e.criado_em_me desc nulls last,
         e.me_id desc;

comment on view public.melhorenvio_envio_vigente is
  'Um envio por pedido: o ATIVO mais recente; na falta de ativo, o último estado morto (vencido/cancelado), marcado com tem_ativo = false. ⚠️ Ativo tem precedência no ORDER BY — envio cancelado nunca desbanca um vivo. ⚠️ `codigo` NÃO usa `protocol`: ele é a referência interna ORD-… do Melhor Envio e nenhuma transportadora o reconhece. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.melhorenvio_envio_vigente to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o retrato DEPOIS                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ `pedidos_visiveis` tem de ter AUMENTADO em relação ao BLOCO 1(b).
--     A diferença é exatamente o que estava escondido.
select
  count(*)                                     as pedidos_visiveis,
  count(*) filter (where tem_ativo)            as com_etiqueta_viva,
  count(*) filter (where not tem_ativo)        as so_etiqueta_morta,
  count(*) filter (where codigo like 'ORD-%')  as ainda_com_referencia_interna
from public.melhorenvio_envio_vigente;

-- (b) ⭐ O QUE ESTAVA ESCONDIDO: pedido cuja etiqueta venceu e ninguém refez.
--     Estes são os que a esteira agora consegue mostrar — e cada um é frete
--     pago com encomenda que nunca saiu.
select v.bling_id, v.destinatario_nome, v.transportadora, v.valor,
       v.gerado_em::date, v.expirado_em::date,
       (now()::date - v.expirado_em::date) as dias_desde_o_vencimento
from public.melhorenvio_envio_vigente v
where not v.tem_ativo and v.expirado_em is not null
order by v.expirado_em;

-- (c) A esteira concorda? Um pedido com etiqueta morta não pode aparecer em
--     'etiqueta' — essa etapa promete um envio que não vai acontecer.
select e.etapa, count(*) as cards
from public.bling2_esteira e
join public.melhorenvio_envio_vigente v on v.bling_id = e.bling_id
where not v.tem_ativo
group by 1 order by 2 desc;

-- (c2) ⚠️ O ÚNICO CASO NOVO que esta mudança cria, medido antes de aceitar.
--
-- Com o filtro `and e.ativo`, um pedido cuja única etiqueta foi POSTADA,
-- ENTREGUE e depois CANCELADA sumia da view. Agora ele aparece — e a esteira
-- vai movê-lo para 'entregue', porque `entregue_em` está preenchido.
--
-- Testado num Postgres de rascunho: cancelada ANTES de postar não move card
-- nenhum (não há carimbo para mover), e cancelada com uma ativa ao lado perde
-- para a ativa. Sobra só esta forma.
--
-- É defensável: o pacote foi postado e chegou; cancelar a etiqueta depois é
-- ato administrativo, não desmentido da entrega. Mas é exatamente o cenário
-- que o desenho original queria evitar, então fica MEDIDO em vez de escondido.
-- Se vier vazio, é teórico. Se vier com linhas, me chame antes de confiar na
-- etapa desses cards.
select bling_id, destinatario_nome, valor,
       postado_em::date, entregue_em::date, cancelado_em::date
from public.melhorenvio_envios
where cancelado_em is not null and entregue_em is not null
  and bling_id is not null
order by cancelado_em desc;

-- (d) ⚠️ Os entregues que o nosso rastreio não enxerga. Depois desta migração
--     a esteira passa a movê-los pelo `me.entregue_em`, mesmo sem evento de
--     transportadora — o Melhor Envio preenche o silêncio, que é o que o
--     desenho sempre disse fazer.
select v.bling_id, v.destinatario_nome, v.codigo, v.entregue_em::date,
       r.status as nosso_status_de_rastreio
from public.melhorenvio_envio_vigente v
left join public.rastreio_envios r on r.codigo = v.codigo
where v.entregue_em is not null and r.status is null
order by v.entregue_em desc;
