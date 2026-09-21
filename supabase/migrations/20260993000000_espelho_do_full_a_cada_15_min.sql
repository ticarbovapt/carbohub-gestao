-- ═══════════════════════════════════════════════════════════════════════════
-- O espelho do ML Full passa de 1 h para 15 min
--
-- Pedido do dono do processo em 21/09/2026, com estas palavras: *"tem que
-- atualizar ao vivo sozinho"*.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ "AO VIVO" SÃO DUAS COISAS, E SÓ UMA MORA AQUI
--
--   o CRON busca no ML           ← o que torna o dado FRESCO   (esta migração)
--   a TELA relê o nosso banco    ← o que faz o número MUDAR sozinho (o hook)
--
-- Acelerar só a tela daria a sensação de tempo real sobre um número de uma
-- hora atrás — o pior dos dois mundos, porque a pessoa passa a confiar mais
-- num dado que não melhorou. Por isso as duas mudam na MESMA tarefa:
-- `useMlFull.ts` ganhou `refetchInterval` de 1 min.
--
-- ⚠️ E o limiar de "espelho velho" do `MlFullPainel.tsx` foi junto: era 3 h,
-- calibrado para o cron de 1 h. Mantê-lo faria a tela levar duas horas e meia
-- para acusar um espelho parado. Agendamento e limiar andam JUNTOS — deixar um
-- para trás é a mesma doença dos comentários de cron que já não valem.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE 15 MIN, E NÃO 1
--
-- O custo de uma rodada é pequeno (hoje 3 anúncios: um `items/search`, uma
-- chamada `/items?ids=` e uma `/inventories/.../stock/fulfillment` por anúncio
-- de fulfillment), mas a PERGUNTA que a tela responde é "preciso mandar mais
-- para o Full?" — e essa decisão se toma em dias, não em minutos. Um minuto só
-- gastaria cota da API relendo saldo que não mudou.
--
-- ⚠️ Minuto 11, ÍMPAR e fora da grade cheia. Ocupados: `:00` e todos os pares
-- (`bling2-bridge` é `*/2`), `:05` e múltiplos (os três `*/5`), `:03`
-- order_details, `:04` carrinhos, `:06` melhor-envio, `:07` nfe_recheck, `:08`
-- deduz-estoque, `:09/30` ml-token-refresh. Empilhar não dá erro — dá dois
-- picos que ninguém liga a nada.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o retrato de agora                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O job atual. Esperado: `ml-estoque-full-1h`, schedule `21 * * * *`.
select jobid, jobname, schedule, active
from cron.job where jobname like 'ml-%' order by jobname;

-- (b) As últimas rodadas dele. `succeeded` aqui significa só que o POST saiu —
--     quem prova que o ML respondeu é `ml_accounts.last_synced_at`.
select j.jobname, d.status, d.start_time, d.return_message
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname like 'ml-estoque-full%'
order by d.start_time desc limit 5;

-- (c) Quando o espelho leu o ML pela última vez, e quantas linhas ele tem.
select count(*) as linhas, max(sincronizado_em) as ultimo, now() as agora
from public.ml_estoque_full;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — reagenda                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O job TROCA DE NOME (`-1h` → `-15min`), porque nome que mente sobre a
-- cadência é o que faz alguém calcular atraso errado meses depois. Por isso é
-- unschedule + schedule, e não `cron.alter_job`.

do $$
begin
  -- Idempotente: rodar de novo não falha por o job já não existir.
  if exists (select 1 from cron.job where jobname = 'ml-estoque-full-1h') then
    perform cron.unschedule('ml-estoque-full-1h');
  end if;
  if exists (select 1 from cron.job where jobname = 'ml-estoque-full-15min') then
    perform cron.unschedule('ml-estoque-full-15min');
  end if;
end $$;

select cron.schedule(
  'ml-estoque-full-15min',
  '11-59/15 * * * *',
  $$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/ml-estoque-full',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', '0c6d2689-f436-47f0-b5da-fb64a6ce9c78'),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
  $$
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ UM job só, com o nome novo e `11-59/15`. Duas linhas aqui significam
--     que o antigo sobreviveu — e aí o ML seria consultado em dobro.
select jobid, jobname, schedule, active
from cron.job where jobname like 'ml-estoque-full%' order by jobname;

-- (b) ⚠️ Nenhum outro job no minuto 11. Colisão não dá erro: dá dois picos
--     simultâneos que ninguém liga a nada depois.
select jobname, schedule from cron.job
where schedule like '%11%' order by jobname;

-- (c) Depois do próximo minuto :11, :26, :41 ou :56 — o espelho andou?
--     `ultimo` tem de estar a menos de 15 min de `agora`.
select count(*) as linhas, max(sincronizado_em) as ultimo, now() as agora,
       round(extract(epoch from (now() - max(sincronizado_em)))/60) as min_atras
from public.ml_estoque_full;
