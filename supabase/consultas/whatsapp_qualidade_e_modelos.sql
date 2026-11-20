-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp: conferir os modelos na Meta, a nota dos números e testar um envio
-- (20/11/2026 — régua de recompra de 7 dias, migração 20261179)
--
-- Roda no SQL Editor, UM bloco por vez. O segredo do cron é COPIADO de dentro
-- do banco (do job `bling2-sync-incremental`) e nunca aparece no resultado.
-- ═══════════════════════════════════════════════════════════════════════════


-- BLOCO 1 — CONFERIR os 14 modelos da recompra contra o que a Meta aprovou.
-- Não manda mensagem. Devolve uma linha com o `request_id` (nenhuma linha =
-- não consegui ler o segredo do cron, e nada foi chamado).
-- Para conferir TODOS os modelos da Meta (esteira e carrinho também), tire o
-- `&etapa=recompra_` da URL.
select net.http_post(
         url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/whatsapp-meta?conferir=1&etapa=recompra_',
         body := '{}'::jsonb,
         headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', s.segredo),
         timeout_milliseconds := 60000) as request_id
  from (select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] as segredo
          from cron.job where jobname = 'bling2-sync-incremental' limit 1) s
 where s.segredo is not null;


-- BLOCO 2 — o RESULTADO da conferência (espere uns 15 s depois do BLOCO 1).
-- Uma linha por modelo. ESPERADO: ok = true nos 14, problemas vazio.
-- `avisos` não impede o envio (ex.: rodapé na Meta, texto do espelho).
with r as (
  select content::jsonb as c, created
    from net._http_response
   where content like '%"modelos_com_problema"%'
   order by created desc limit 1
)
select m->>'etapa' as etapa, (m->>'ok')::boolean as ok, m->>'ativo' as ligado,
       m->'problemas' as problemas, m->'avisos' as avisos,
       m->>'qualidade_modelo' as nota_do_modelo, m->>'rodape_na_meta' as rodape_na_meta,
       to_char(r.created at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as conferido_em
  from r, jsonb_array_elements(r.c->'detalhe') m
 order by 1;


-- BLOCO 3 — a NOTA de cada número na Meta, e se as ofertas estão pausadas.
-- GREEN = verde. Pausa a partir de `pausa_qualidade` (YELLOW = amarelo ou pior).
select rotulo, numero_exibicao, funcao, qualidade, qualidade_limite, pausa_qualidade,
       comercial_pausado,
       to_char(qualidade_lida_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as lida_em,
       qualidade_erro
  from public.carbo_wa_numeros
 where ativo
 order by ordem;

-- O histórico das notas (cada troca, para sempre).
select n.rotulo, h.qualidade, h.limite,
       to_char(h.em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as em
  from public.carbo_wa_qualidade_hist h
  join public.carbo_wa_numeros n on n.phone_number_id = h.numero_id
 order by h.em desc limit 30;


-- BLOCO 4 — TESTE de verdade: manda UM modelo para o SEU celular, pelo número
-- do Clube e com o link cadastrado. Não mexe na fila nem na régua de ninguém.
-- ⚠️ EDITE `v_fone` (e, se quiser, `v_etapa`). Do jeito que está, RECUSA rodar.
do $teste$
declare
  v_fone   text := null;                     -- ex.: '84999998888'
  v_etapa  text := 'recompra_frasco_d1';     -- ou recompra_sache_d1, recompra_frasco_d7…
  v_segredo text;
begin
  if v_fone is null then
    raise exception 'Preencha v_fone com o seu celular antes de rodar.';
  end if;
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_segredo
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_segredo is null then
    raise exception 'Não consegui ler o segredo do job bling2-sync-incremental.';
  end if;
  perform net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/whatsapp-meta'
           || '?teste=' || v_fone || '&etapa=' || v_etapa || '&nome=Ana',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_segredo),
    timeout_milliseconds := 30000);
end $teste$;

-- O resultado do teste (espere uns 5 s). ESPERADO: "ok": true e a mensagem
-- chegando no celular como "Ana" com o link do kit.
select status_code, content::jsonb ->> 'ok' as ok, content::jsonb ->> 'etapa' as etapa,
       content::jsonb ->> 'erro' as erro,
       to_char(created at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as em
  from net._http_response
 where content like '%mensagem REAL para um número%'
 order by created desc limit 3;


-- BLOCO 5 — quando os FRASCOS e os SACHÊS entram na régua (os próximos dias).
-- Cada linha é o dia em que o Dia 1 sai (entrega + 45 dias frasco, + 30 sachê).
select fluxo, (entregue_em::date + dias_apos_entrega) as dia_do_dia_1, count(*) as clientes
  from public.carbo_recompra_pipeline
 where coluna = 'entregue' and nullif(btrim(coalesce(cliente_fone, '')), '') is not null
 group by 1, 2
 order by 2, 1
 limit 30;


-- BLOCO 6 — PAUSAR as ofertas de um número na mão (emergência), e liberar.
-- update public.carbo_wa_numeros
--    set comercial_pausado = true, comercial_pausado_motivo = 'pausado à mão: <por quê>'
--  where funcao = 'recompra';
--
-- update public.carbo_wa_numeros
--    set comercial_pausado = false, comercial_pausado_motivo = null
--  where funcao = 'recompra';
