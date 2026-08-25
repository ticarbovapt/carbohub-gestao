-- ═══════════════════════════════════════════════════════════════════════════
-- O `ecommerce-sync` tem portaria — e o cron precisa da chave ANTES dela
--
-- ── O que estava aberto ───────────────────────────────────────────────────
--
-- A função subia sem verificação nenhuma: `verify_jwt = false` no config.toml,
-- `--no-verify-jwt` no deploy, e nada lendo segredo dentro do handler.
-- Qualquer um na internet podia chamá-la em laço.
--
-- O estrago não é vazamento de dado — é DESLIGAR as integrações:
--   · cada rodada gasta cota de API do Mercado Livre, da Amazon e da Shopee;
--   · na Shopee o `renovar()` usa REFRESH TOKEN ROTATIVO, e duas renovações
--     concorrentes invalidam a conexão. O conserto é refazer o OAuth à mão.
--
-- A irmã dela, `nuvemshop-carrinhos`, já faz certo desde o primeiro dia. A
-- diferença nunca foi decisão; foi esquecimento.
--
-- ── ⚠️ ORDEM OBRIGATÓRIA ─────────────────────────────────────────────────
--
--   1. Rode o BLOCO 1 (diagnóstico) e o BLOCO 2 (o cron passa a mandar a chave)
--   2. SÓ ENTÃO faça o deploy da função com a portaria
--
-- Invertido, o cron bate numa porta fechada sem chave e recebe 401 — e o
-- `pg_cron` marca `succeeded` do mesmo jeito, porque o sucesso dele é ter
-- POSTADO. Seria sincronismo morto sem uma linha de erro em lugar nenhum,
-- exatamente como as 25 h que o CRON_SECRET já custou a este projeto.
--
-- Nesta ordem não existe janela ruim: o header extra é ignorado pela função
-- antiga, que não o lê.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — como o job está hoje                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Olhe o `command`. Se ele JÁ tiver 'X-Cron-Secret', não há nada a fazer no
-- BLOCO 2 — vá direto ao deploy. Se não tiver (o esperado), o BLOCO 2 é
-- obrigatório antes do deploy.

select jobid, jobname, schedule, active, command
from cron.job
where command like '%/ecommerce-sync%' or jobname like '%ecommerce%';

-- O segredo existe onde os outros jobs o buscam?
select (select count(*) from private.cron_config where chave = 'rastreio_cron_secret') as tem_segredo;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o cron passa a mandar a chave                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Preserva a URL e o agendamento que estiverem no job atual em vez de
-- escrevê-los à mão. O job foi criado no PAINEL, e recriá-lo às cegas é como
-- se perde um parâmetro que só existe lá — a 20260880 já tinha tomado esse
-- cuidado com o mesmo job, pelo mesmo motivo.

do $$
declare
  v_seg  text;
  v_job  record;
  v_url  text;
  v_cron text;
begin
  select valor into v_seg from private.cron_config where chave = 'rastreio_cron_secret';
  if v_seg is null then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret). '
                    'Sem ele o cron não tem o que mandar, e fechar a função mataria o sync.';
  end if;

  select jobid, jobname, schedule, command into v_job
  from cron.job
  where command like '%/ecommerce-sync%'
  order by jobid limit 1;

  if v_job is null then
    raise exception 'Não achei job do ecommerce-sync em cron.job. '
                    'NÃO faça o deploy da portaria: quem chama a função hoje é outra coisa, '
                    'e fechá-la sem saber quem é derruba o sync.';
  end if;

  if v_job.command like '%X-Cron-Secret%' then
    raise notice 'Job % já manda o segredo. Nada a fazer; pode fazer o deploy.', v_job.jobname;
    return;
  end if;

  -- A URL exata que o job já usa (inclusive querystring, se houver).
  v_url := substring(v_job.command from 'https://[^'']+/functions/v1/ecommerce-sync[^'']*');
  if v_url is null then
    raise exception 'Não consegui extrair a URL do comando do job %. Comando: %',
                    v_job.jobname, v_job.command;
  end if;

  v_cron := v_job.schedule;
  raise notice 'Reagendando % (%) para mandar X-Cron-Secret. URL: %',
               v_job.jobname, v_cron, v_url;

  perform cron.schedule(
    v_job.jobname, v_cron,
    format($cmd$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_url, v_seg)
  );
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência (rode ANTES e DEPOIS do deploy)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ O comando tem de conter 'X-Cron-Secret'. Se não tiver, PARE — não
--     faça o deploy da função com portaria.
select jobname, schedule, (command like '%X-Cron-Secret%') as manda_o_segredo, command
from cron.job
where command like '%/ecommerce-sync%';

-- (b) ⭐ DEPOIS do deploy, este é o número que prova que não quebrou. O
--     `last_synced_at` das plataformas tem de continuar andando — dê 10 min.
--     ⚠️ `pg_cron` marcando `succeeded` NÃO prova nada: o sucesso dele é ter
--     POSTADO, e um 401 é um POST bem-sucedido.
select id, last_synced_at, (now() - last_synced_at) as atraso
from public.system_tokens
where id in ('mercadolivre','amazon','nuvemshop','shopee')
order by id;

-- (c) A porta responde? Chamada SEM segredo tem de dar 401. Rode no terminal,
--     não aqui:
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/ecommerce-sync
--
-- Esperado: 401. Se vier 200, o deploy não subiu. Se vier 500, o CRON_SECRET
-- não está cadastrado nos secrets da função — e aí o cron também está batendo
-- em porta fechada.
