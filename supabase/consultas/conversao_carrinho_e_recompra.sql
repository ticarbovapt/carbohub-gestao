-- ════════════════════════════════════════════════════════════════════════════
-- CONVERSÃO das réguas de WhatsApp: recuperação de carrinho e recompra.
-- SÓ LEITURA. Cada bloco devolve UMA tabela (o SQL Editor mostra só a última).
--
-- Pedido do dono do processo (28/10/2026): quantos receberam, quantos
-- compraram, quem respondeu (e em qual mensagem), se um atendente respondeu
-- de volta ou se o cliente ficou sem resposta.
--
-- Definições (iguais nos dois blocos):
--   RECEBEU       mensagem que SAIU (status enviado/entregue/lido). Erro,
--                 ignorado e pendente não contam.
--   RESPONDEU     primeira mensagem do CLIENTE no MESMO número nosso, depois
--                 do 1º envio e até 7 dias depois do último.
--   EM QUAL MSG   a que o cliente respondeu citando (responde_a = wamid); sem
--                 citação, a última que tinha chegado antes da resposta.
--   ATENDENTE     mensagem de uma PESSOA (enviado_por preenchido) no mesmo par
--                 de números, até 7 dias depois da resposta. Aviso automático
--                 não conta.
--   COMPROU       carrinho: pedido Nuvemshop do mesmo e-mail depois do
--                 abandono, ou carrinho marcado concluído (PayT); recompra:
--                 pedido ATENDIDO (situação 9) no Bling 2 do mesmo CPF/CNPJ.
--                 Conta como CONVERSÃO só a compra DEPOIS do 1º envio.
--
-- ⚠️ É OBSERVAÇÃO, não atribuição: a pessoa pode ter comprado sem ler a
-- mensagem. "Comprou depois de receber" é o que o dado sabe dizer.
-- ⚠️ Mesma pessoa com dois carrinhos: a resposta conta para os dois.
-- ════════════════════════════════════════════════════════════════════════════


-- ── BLOCO 1 — RECUPERAÇÃO DE CARRINHO ───────────────────────────────────────
with env as (
  select v.bling_id as checkout_id,
         min(coalesce(v.enviado_em, v.detectado_em)) filter (where v.etapa = 'carrinho_1') as m1,
         min(coalesce(v.enviado_em, v.detectado_em)) filter (where v.etapa = 'carrinho_2') as m2,
         min(coalesce(v.enviado_em, v.detectado_em)) filter (where v.etapa = 'carrinho_3') as m3,
         max(v.wamid) filter (where v.etapa = 'carrinho_1') as w1,
         max(v.wamid) filter (where v.etapa = 'carrinho_2') as w2,
         max(v.wamid) filter (where v.etapa = 'carrinho_3') as w3,
         max(v.wa_id) as wa_id, max(v.numero_id) as numero_id
    from public.carbo_msg_envios v
   where v.etapa in ('carrinho_1','carrinho_2','carrinho_3')
     and v.status in ('enviado','entregue','lido')
   group by 1
),
base as (
  select e.*, c.total, c.abandonado_em,
         least(e.m1, e.m2, e.m3)    as primeiro,
         greatest(e.m1, e.m2, e.m3) as ultimo,
         least(c.completado_em, (
           select min(o.ordered_at) from public.ecommerce_orders o
            where o.platform = 'nuvemshop' and o.status <> 'cancelled'
              and nullif(lower(trim(o.cliente_email)), '') = nullif(lower(trim(c.email)), '')
              and o.ordered_at >= c.abandonado_em)) as comprou_em
    from env e
    join public.nuvemshop_carrinhos c on c.checkout_id = e.checkout_id
),
resp as (
  select b.*,
         r.ocorrido_em as respondeu_em,
         case
           when r.ocorrido_em is null then null
           when r.responde_a is not null and r.responde_a = b.w3 then 3
           when r.responde_a is not null and r.responde_a = b.w2 then 2
           when r.responde_a is not null and r.responde_a = b.w1 then 1
           when b.m3 is not null and r.ocorrido_em >= b.m3 then 3
           when b.m2 is not null and r.ocorrido_em >= b.m2 then 2
           else 1
         end as resp_msg
    from base b
    left join lateral (
      select m.ocorrido_em, m.responde_a
        from public.carbo_wa_mensagens m
       where m.wa_id = b.wa_id and m.numero_id = b.numero_id
         and m.direcao = 'entrada'
         and m.ocorrido_em > b.primeiro
         and m.ocorrido_em < b.ultimo + interval '7 days'
       order by m.ocorrido_em
       limit 1
    ) r on true
),
fim as (
  select x.*,
         (x.comprou_em is not null and x.comprou_em >= x.primeiro) as converteu,
         (x.comprou_em is not null and x.comprou_em <  x.primeiro) as comprou_antes,
         (select min(h.ocorrido_em) from public.carbo_wa_mensagens h
           where h.wa_id = x.wa_id and h.numero_id = x.numero_id
             and h.direcao = 'saida' and h.enviado_por is not null
             and h.ocorrido_em > x.respondeu_em
             and h.ocorrido_em < x.respondeu_em + interval '7 days') as atendente_em
    from resp x
)
select ordem, indicador, qtd, valor from (
  select 1 ordem, 'Período (1º envio → último)' indicador, null::bigint qtd,
         to_char(min(primeiro) at time zone 'America/Sao_Paulo','DD/MM/YYYY') || ' → ' ||
         to_char(max(ultimo)   at time zone 'America/Sao_Paulo','DD/MM/YYYY') valor from fim
  union all select 2,  'Carrinhos que receberam ao menos 1 mensagem', count(*), null from fim
  union all select 3,  '  receberam a 1ª',  count(*) filter (where m1 is not null), null from fim
  union all select 4,  '  receberam a 2ª',  count(*) filter (where m2 is not null), null from fim
  union all select 5,  '  receberam a 3ª',  count(*) filter (where m3 is not null), null from fim
  union all select 6,  'COMPRARAM depois de receber (conversão)', count(*) filter (where converteu),
         round(100.0 * count(*) filter (where converteu) / nullif(count(*),0), 1) || '% · R$ ' ||
         to_char(coalesce(sum(total) filter (where converteu),0), 'FM999G999G990D00') from fim
  union all select 7,  '  já tinham comprado ANTES da 1ª mensagem (não conta)', count(*) filter (where comprou_antes), null from fim
  union all select 8,  'RESPONDERAM', count(*) filter (where respondeu_em is not null),
         round(100.0 * count(*) filter (where respondeu_em is not null) / nullif(count(*),0), 1) || '% dos que receberam' from fim
  union all select 9,  '  responderam à 1ª mensagem', count(*) filter (where resp_msg = 1), null from fim
  union all select 10, '  responderam à 2ª mensagem', count(*) filter (where resp_msg = 2), null from fim
  union all select 11, '  responderam à 3ª mensagem', count(*) filter (where resp_msg = 3), null from fim
  union all select 12, '  responderam E compraram', count(*) filter (where respondeu_em is not null and converteu), null from fim
  union all select 13, '  responderam e NÃO compraram', count(*) filter (where respondeu_em is not null and not converteu), null from fim
  union all select 14, '  um atendente respondeu', count(*) filter (where atendente_em is not null),
         'mediana ' || coalesce(to_char(percentile_cont(0.5) within group (order by atendente_em - respondeu_em)
                                         filter (where atendente_em is not null), 'HH24"h"MI'), '—') || ' até responder' from fim
  union all select 15, '  FICARAM SEM RESPOSTA de atendente', count(*) filter (where respondeu_em is not null and atendente_em is null), null from fim
  union all select 16, '  atendente respondeu → compraram', count(*) filter (where atendente_em is not null and converteu), null from fim
  union all select 17, '  sem resposta → compraram', count(*) filter (where respondeu_em is not null and atendente_em is null and converteu), null from fim
  union all select 18, 'NÃO responderam e compraram', count(*) filter (where respondeu_em is null and converteu), null from fim
  union all select 19, 'NÃO responderam e não compraram', count(*) filter (where respondeu_em is null and not converteu and not comprou_antes), null from fim
  union all select 20, 'Compraram depois da 1ª (antes de chegar a 2ª)', count(*) filter (where converteu and (m2 is null or comprou_em < m2)), null from fim
  union all select 21, 'Compraram depois da 2ª (antes de chegar a 3ª)', count(*) filter (where converteu and m2 is not null and comprou_em >= m2 and (m3 is null or comprou_em < m3)), null from fim
  union all select 22, 'Compraram depois da 3ª', count(*) filter (where converteu and m3 is not null and comprou_em >= m3), null from fim
) t
order by ordem;


-- ── BLOCO 2 — RÉGUA DE RECOMPRA ─────────────────────────────────────────────
with env as (
  select v.bling_id, coalesce(v.enviado_em, v.detectado_em) as enviado_em,
         v.wamid, v.wa_id, v.numero_id, v.canal
    from public.carbo_msg_envios v
   where v.etapa = 'recompra'
     and v.status in ('enviado','entregue','lido')
),
base as (
  select e.*, bo.total as total_original, ct.cpf_cnpj,
         rc.recomprou_em, rc.valor_recompra
    from env e
    join public.bling2_orders bo on bo.bling_id = e.bling_id
    left join public.bling2_contacts ct on ct.bling_id = bo.contato_id
    left join lateral (
      select min(left(b2.data, 10)::date) as recomprou_em, sum(b2.total) as valor_recompra
        from public.bling2_orders b2
        join public.bling2_contacts c2 on c2.bling_id = b2.contato_id
       where ct.cpf_cnpj is not null
         and c2.cpf_cnpj = ct.cpf_cnpj
         and b2.bling_id <> e.bling_id
         and b2.situacao_id = 9
         and b2.data ~ '^\d{4}-\d{2}-\d{2}'
         and left(b2.data, 10)::date >= (e.enviado_em at time zone 'America/Sao_Paulo')::date
    ) rc on true
),
resp as (
  select b.*,
         (select min(m.ocorrido_em) from public.carbo_wa_mensagens m
           where m.wa_id = b.wa_id and m.numero_id = b.numero_id
             and m.direcao = 'entrada'
             and m.ocorrido_em > b.enviado_em
             and m.ocorrido_em < b.enviado_em + interval '7 days') as respondeu_em
    from base b
),
fim as (
  select x.*,
         (x.recomprou_em is not null) as converteu,
         (select min(h.ocorrido_em) from public.carbo_wa_mensagens h
           where h.wa_id = x.wa_id and h.numero_id = x.numero_id
             and h.direcao = 'saida' and h.enviado_por is not null
             and h.ocorrido_em > x.respondeu_em
             and h.ocorrido_em < x.respondeu_em + interval '7 days') as atendente_em
    from resp x
)
select ordem, indicador, qtd, valor from (
  select 1 ordem, 'Período (1ª oferta → última)' indicador, null::bigint qtd,
         to_char(min(enviado_em) at time zone 'America/Sao_Paulo','DD/MM/YYYY') || ' → ' ||
         to_char(max(enviado_em) at time zone 'America/Sao_Paulo','DD/MM/YYYY') valor from fim
  union all select 2,  'Clientes que receberam a oferta', count(*), null from fim
  union all select 3,  '  pela Meta (dá para medir resposta)', count(*) filter (where wa_id is not null), null from fim
  union all select 4,  '  sem CPF/CNPJ no Bling (não dá para medir recompra)', count(*) filter (where cpf_cnpj is null), null from fim
  union all select 5,  'RECOMPRARAM depois da oferta (conversão)', count(*) filter (where converteu),
         round(100.0 * count(*) filter (where converteu) / nullif(count(*) filter (where cpf_cnpj is not null),0), 1) ||
         '% dos que têm CPF/CNPJ · R$ ' || to_char(coalesce(sum(valor_recompra) filter (where converteu),0), 'FM999G999G990D00') from fim
  union all select 6,  '  em até 7 dias da oferta', count(*) filter (where converteu and recomprou_em < (enviado_em at time zone 'America/Sao_Paulo')::date + 7), null from fim
  union all select 7,  '  em até 30 dias da oferta', count(*) filter (where converteu and recomprou_em < (enviado_em at time zone 'America/Sao_Paulo')::date + 30), null from fim
  union all select 8,  'RESPONDERAM', count(*) filter (where respondeu_em is not null),
         round(100.0 * count(*) filter (where respondeu_em is not null) / nullif(count(*) filter (where wa_id is not null),0), 1) || '% dos que receberam pela Meta' from fim
  union all select 9,  '  responderam E recompraram', count(*) filter (where respondeu_em is not null and converteu), null from fim
  union all select 10, '  responderam e NÃO recompraram', count(*) filter (where respondeu_em is not null and not converteu), null from fim
  union all select 11, '  um atendente respondeu', count(*) filter (where atendente_em is not null),
         'mediana ' || coalesce(to_char(percentile_cont(0.5) within group (order by atendente_em - respondeu_em)
                                         filter (where atendente_em is not null), 'HH24"h"MI'), '—') || ' até responder' from fim
  union all select 12, '  FICARAM SEM RESPOSTA de atendente', count(*) filter (where respondeu_em is not null and atendente_em is null), null from fim
  union all select 13, '  atendente respondeu → recompraram', count(*) filter (where atendente_em is not null and converteu), null from fim
  union all select 14, '  sem resposta → recompraram', count(*) filter (where respondeu_em is not null and atendente_em is null and converteu), null from fim
  union all select 15, 'NÃO responderam e recompraram', count(*) filter (where respondeu_em is null and converteu), null from fim
  union all select 16, 'NÃO responderam e não recompraram', count(*) filter (where respondeu_em is null and not converteu), null from fim
) t
order by ordem;


-- ── BLOCO 3 — QUEM FICOU SEM RESPOSTA (a lista, para alguém retomar) ────────
-- Carrinho e recompra juntos: cliente respondeu e nenhuma PESSOA respondeu
-- de volta em 7 dias. Os mais recentes primeiro.
with car as (
  select v.bling_id, 'carrinho' as regua, v.wa_id, v.numero_id,
         min(coalesce(v.enviado_em, v.detectado_em)) as primeiro
    from public.carbo_msg_envios v
   where v.etapa in ('carrinho_1','carrinho_2','carrinho_3')
     and v.status in ('enviado','entregue','lido') and v.wa_id is not null
   group by 1, 2, 3, 4
  union all
  select v.bling_id, 'recompra', v.wa_id, v.numero_id, coalesce(v.enviado_em, v.detectado_em)
    from public.carbo_msg_envios v
   where v.etapa = 'recompra' and v.status in ('enviado','entregue','lido') and v.wa_id is not null
),
r as (
  select c.*,
         (select m.ocorrido_em from public.carbo_wa_mensagens m
           where m.wa_id = c.wa_id and m.numero_id = c.numero_id and m.direcao = 'entrada'
             and m.ocorrido_em > c.primeiro and m.ocorrido_em < c.primeiro + interval '10 days'
           order by m.ocorrido_em limit 1) as respondeu_em,
         (select m.texto from public.carbo_wa_mensagens m
           where m.wa_id = c.wa_id and m.numero_id = c.numero_id and m.direcao = 'entrada'
             and m.ocorrido_em > c.primeiro and m.ocorrido_em < c.primeiro + interval '10 days'
           order by m.ocorrido_em limit 1) as disse
    from car c
)
select r.regua,
       to_char(r.respondeu_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as respondeu,
       r.wa_id as whatsapp,
       left(r.disse, 120) as o_que_disse
  from r
 where r.respondeu_em is not null
   and not exists (select 1 from public.carbo_wa_mensagens h
                    where h.wa_id = r.wa_id and h.numero_id = r.numero_id
                      and h.direcao = 'saida' and h.enviado_por is not null
                      and h.ocorrido_em > r.respondeu_em
                      and h.ocorrido_em < r.respondeu_em + interval '7 days')
 order by r.respondeu_em desc;
