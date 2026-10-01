-- ═══════════════════════════════════════════════════════════════════════════
-- O backfill do detalhe da NF da filial ganha rodada própria
--
-- Medido em 01/10/2026, depois de a escada do rodapé entrar no ar:
--
--   notas 879 · com_natureza 0 · com_pdf 237 · ja_passaram_pelo_codigo_novo 113
--
-- ⚠️ 113 é EXATAMENTE o mesmo número de antes do deploy da natureza. Não é o
-- `<natOp>` que falhou — é que a rodada de detalhe não andou desde então. E a
-- razão é a cadência:
--
--   bling2-sync-incremental   * * * * *       janela de 8 DIAS
--   all (com o backfill)      11:30 e 17:30   teto de 40 por rodada
--
-- As 110 notas que ganharam rodapé são as que caem dentro da janela de 8 dias.
-- O histórico — 766 notas — drena a **80 por dia**, então levaria dez dias, e
-- nesse tempo nem o casamento por rodapé nem a natureza existem para elas.
--
-- Isso não era defeito enquanto o detalhe servia só para preencher
-- `valor_total` de nota nova. Virou defeito quando o detalhe passou a ser a
-- ÚNICA fonte do rodapé e da natureza: aí o histórico inteiro vira fila.
--
-- ⚠️ RODE EM BLOCOS. O BLOCO 1 depende do deploy do `bling2-sync` com a
-- entidade `nfe_detalhe` (já na `main`).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. A referência de antes.                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select count(*)                                       as notas,
--        count(*) filter (where raw_detalhe is null)    as na_fila,
--        count(*) filter (where natureza_operacao is not null) as com_natureza
-- from public.bling2_nfe;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o cron do backfill                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- 40 notas × 6 rodadas por hora = 240/h. As 766 drenam em ~3 h, contra dez
-- dias.
--
-- ⚠️ Minuto :09, ÍMPAR e fora da grade cheia. Ocupados hoje: :00 e todos os
-- pares (o `bling2-bridge` é `*/2`), :05 e múltiplos (os três `*/5`), :03
-- order_details, :04 carrinhos, :06 melhor-envio, :07 nfe_recheck, :08
-- deduz-estoque. Empilhar não dá erro — dá dois picos que ninguém liga a nada.

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'bling2-nfe-detalhe-10min' loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'bling2-nfe-detalhe-10min',
    '9-59/10 * * * *',
    $cmd$
    select net.http_post(
      url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
      ),
      body    := '{"source":"cron-nfe-detalhe","fases":["nfe_detalhe"]}'::jsonb
    ) as request_id;
    $cmd$
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — devolver à fila as 113 detalhadas pelo código ANTIGO        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Elas têm `raw_detalhe` preenchido, e a fila é `raw_detalhe is null` — ou
-- seja, nunca mais voltariam. Ficariam sem natureza PARA SEMPRE, e a natureza
-- é o que separa venda de remessa de bonificação no casamento.
--
-- Foi um efeito da própria correção que evitou a fila infinita: `raw_detalhe`
-- responde "esta nota já passou pelo código novo?" — e, para estas, a resposta
-- do banco é "sim" quando a verdade é "passou pelo ANTIGO".
--
-- ⚠️ E isto CONVERGE, uma vez só: o detalhe sempre grava `raw_detalhe`, mesmo
-- quando não acha rodapé nem natureza. Nota cujo XML não resolve sai da fila na
-- primeira tentativa.

update public.bling2_nfe
   set raw_detalhe = null
 where natureza_operacao is null
   and raw_detalhe is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ, e com uns 20 min.        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O job está de pé?
-- select jobname, schedule, active from cron.job where jobname = 'bling2-nfe-detalhe-10min';

-- (b) A fila está andando? `na_fila` tem de CAIR a cada 10 min, e
--     `com_natureza` tem de SUBIR.
-- select count(*)                                              as notas,
--        count(*) filter (where raw_detalhe is null)           as na_fila,
--        count(*) filter (where natureza_operacao is not null) as com_natureza,
--        count(*) filter (where informacoes_adicionais is not null) as com_obs
-- from public.bling2_nfe;

-- (c) ⚠️ O desfecho REAL das chamadas. `cron.job_run_details` diz só que o
--     POST saiu — `net.http_post` é assíncrono, e o sucesso dele é ter
--     POSTADO. É a cegueira que já custou 18 dias de WhatsApp parado e 25 h de
--     sync morto neste projeto.
-- select status_code, count(*), max(created) as ultima
-- from net._http_response
-- where created > now() - interval '1 hour'
-- group by 1 order by 1;

-- (d) Depois da fila drenar: quantas notas o XML NÃO resolveu. Estas são as
--     que só o vínculo manual alcança — e o número precisa ser pequeno.
-- select count(*) as sem_natureza_mesmo_depois
-- from public.bling2_nfe
-- where raw_detalhe is not null and natureza_operacao is null;
