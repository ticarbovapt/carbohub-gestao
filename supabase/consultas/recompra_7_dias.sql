-- ═══════════════════════════════════════════════════════════════════════════
-- Régua de recompra de 7 dias (20261177) — CONFERÊNCIA. Só leitura.
-- Cole UM bloco por vez no SQL Editor (ele mostra só o resultado do último).
-- ═══════════════════════════════════════════════════════════════════════════


-- BLOCO 1 — os 14 templates. ESPERADO: 14 linhas, ativo = false, PENDING até a
-- Meta aprovar (o webhook troca para APPROVED sozinho), link vazio até o BLOCO 5.
select etapa, ativo, meta_status, meta_template_nome,
       meta_variaveis->1->>'fallback' as link_checkout,
       hora_inicio, hora_fim, dias_uteis, numero_id
  from public.carbo_msg_templates
 where etapa ~ '^recompra'
 order by etapa;


-- BLOCO 2 — quantos pedidos entregues em cada fluxo. Confira se o "padrão"
-- (frasco) não está engolindo sachê: se houver muito pedido de sachê caindo em
-- frasco, o padrão de itens (`carbo_recompra_fluxos.padrao`) precisa de ajuste.
select coalesce(b.fluxo, '(sem)') as fluxo, count(*) as pedidos,
       count(*) filter (where not b.recomprou) as sem_recompra
  from public.carbo_recompra_base b
 group by 1 order by 1;

-- 2b — amostra dos itens de cada fluxo (para conferir a classificação).
select b.fluxo, o.bling_id,
       (select string_agg(coalesce(i->>'codigo','') || ' ' || coalesce(i->>'descricao',''), ' | ')
          from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]' end) i) as itens
  from public.carbo_recompra_base b
  join public.bling2_orders o on o.bling_id = b.bling_id
 order by b.entregue_em desc
 limit 40;


-- BLOCO 3 — o quadro da régua: quantos em cada coluna.
select coluna, fluxo, count(*)
  from public.carbo_recompra_pipeline
 group by 1, 2 order by 1, 2;


-- BLOCO 4 — o que sairia AGORA (antes de ligar). Enquanto o Dia 1 de um fluxo
-- não está ligado e aprovado, o passo 1 aparece como `recompra` (a oferta
-- antiga). Este número é o tamanho da primeira leva quando ligar.
select etapa, count(*) from public.carbo_recompra_devido group by 1 order by 1;


-- BLOCO 5 — o link de cada fluxo (o checkout da Payt com os 20% aplicados).
-- ⚠️ EDITE os dois links antes de rodar. Sem link, a fila SEGURA o envio
-- ("esperando: link_checkout"), nunca manda mensagem sem link.
-- select public.carbo_recompra_definir_link('sache',  'https://COLE-AQUI-O-LINK-DO-KIT-10-SACHES');
-- select public.carbo_recompra_definir_link('frasco', 'https://COLE-AQUI-O-LINK-DO-KIT-5-FRASCOS');


-- BLOCO 6 — LIGAR (só com os 14 APPROVED no BLOCO 1 e os dois links no lugar).
-- A oferta antiga (`recompra`) para de sair sozinha: o passo 1 passa a ser o
-- Dia 1 novo no instante em que ele estiver ligado.
-- update public.carbo_msg_templates set ativo = true
--  where etapa ~ '^recompra_[a-z]+_d[1-7]$' and meta_status = 'APPROVED';


-- BLOCO 7 — o tempo da fila (ESPERADO: na casa de 1,5 s, como hoje).
-- explain (analyze, buffers off)
-- select * from public.carbo_msg_fila where canal_envio = 'meta' order by prioridade limit 150;


-- BLOCO 8 — quem pediu para parar e entrou sozinho na lista "não contatar".
select chave, motivo, marcado_em
  from public.carbo_wa_nao_contatar
 where marcado_por is null and removido_em is null
 order by marcado_em desc
 limit 50;


-- BLOCO 9 — quem RESPONDEU e saiu da régua (20261178). Cada linha é um cliente
-- que escreveu depois de receber a régua; a coluna diz onde o card está.
select r.bling_id, p.cliente, p.coluna,
       to_char(r.respondeu_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as respondeu,
       left(m.texto, 80) as o_que_escreveu
  from public.carbo_recompra_respostas r
  join public.carbo_recompra_pipeline p using (bling_id)
  left join public.carbo_wa_mensagens m on m.wamid = r.wamid_resposta
 order by r.respondeu_em desc
 limit 50;
