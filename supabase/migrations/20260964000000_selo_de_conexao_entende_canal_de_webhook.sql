-- ═══════════════════════════════════════════════════════════════════════════
-- O selo de conexão entende canal que NÃO tem OAuth
--
-- ── O falso negativo ─────────────────────────────────────────────────────
--
-- `platform_connection_status` é uma view sobre `system_tokens`, e a pergunta
-- dela é uma só: existe `access_token` e ele não venceu? Isso funciona para ML,
-- Amazon, Nuvemshop e Shopee, que são OAuth.
--
-- ⚠️ A PayT não é. Ela não tem OAuth, não tem endpoint de consulta, não tem
-- token nenhum — é postback puro. Logo nunca terá linha em `system_tokens`, e o
-- selo diria **"Aguardando integração" para sempre**, inclusive com venda
-- entrando normalmente.
--
-- Um indicador que mente é pior que indicador nenhum: ele ensina a ignorar o
-- painel. E é o mesmo defeito que a `20260954` já corrigiu na outra direção —
-- lá o selo dizia "Conectado" durante 20 h em que nada entrava, porque o token
-- existia. As duas falhas têm a mesma raiz: medir a CREDENCIAL em vez de medir
-- o DADO.
--
-- ── A regra para canal de webhook ────────────────────────────────────────
--
-- Para a PayT, "conectado" passa a significar o que de fato importa: **já
-- chegou postback**. Se `payt_eventos` tem linha, o cadastro na PayT está
-- feito, a URL está certa e a `integration_key` bateu — as três coisas que
-- poderiam estar erradas, provadas de uma vez por um único evento.
--
-- E `last_synced_at` vira o instante do último postback, o que faz o estado
-- amarelo ("conectado e parado") funcionar de graça: PayT sem evento há muitas
-- horas num dia de vendas é exatamente o alarme que se quer, e é o único que
-- existe — sem API de consulta, não há como conferir de outro jeito.
--
-- ⚠️ NÃO ligo `security_invoker` aqui. A `20260954` explica: esta view nasceu
-- sem, e ligar exige policy de SELECT em `system_tokens` para o time interno —
-- sem ela a view volta VAZIA e o selo some para todo mundo. Trocar um vazamento
-- pequeno (plataforma e seller_id) por um painel cego não é conserto. Fica como
-- passo próprio, medido.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o retrato de agora                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- A PayT não aparece aqui, e é esse o problema.
select platform, is_connected, last_synced_at, minutos_sem_sincronizar
from public.platform_connection_status order by platform;

-- Mas já chegou postback dela.
select count(*) as eventos_payt, max(recebido_em) as ultimo
from public.payt_eventos;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view passa a somar os canais de webhook                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Mesmas colunas, MESMA ORDEM. `create or replace view` só aceita acrescentar
-- no fim; renomear ou reordenar exige DROP, e o DROP levaria junto os GRANTs.

create or replace view public.platform_connection_status as
-- ── Canais OAuth: a pergunta continua sendo o token ─────────────────────────
select
  id          as platform,
  seller_id,
  case
    when access_token is not null
     and (expires_at is null or expires_at > now())
    then true
    else false
  end         as is_connected,
  updated_at,
  last_synced_at,
  case
    when last_synced_at is null then null
    else round(extract(epoch from (now() - last_synced_at)) / 60)::int
  end         as minutos_sem_sincronizar
from public.system_tokens

union all

-- ── PayT: canal de POSTBACK. Não há token para perguntar; a prova de que a
--    integração existe é ter chegado evento. ⚠️ O `where not exists` evita
--    linha duplicada caso um dia alguém crie `system_tokens` para 'payt'.
select
  'payt'                                            as platform,
  (select e.corpo->>'seller_id' from public.payt_eventos e
    order by e.recebido_em desc limit 1)            as seller_id,
  exists (select 1 from public.payt_eventos e)        as is_connected,
  (select max(e.recebido_em) from public.payt_eventos e) as updated_at,
  (select max(e.recebido_em) from public.payt_eventos e) as last_synced_at,
  case
    when (select max(e.recebido_em) from public.payt_eventos e) is null then null
    else round(extract(epoch from (
           now() - (select max(e.recebido_em) from public.payt_eventos e)
         )) / 60)::int
  end                                               as minutos_sem_sincronizar
where not exists (select 1 from public.system_tokens t where t.id = 'payt');

comment on view public.platform_connection_status is
  'Status de conexão das plataformas para o front. Expõe se está conectado — nunca os tokens. ⚠️ A pergunta MUDA por tipo de canal: em OAuth (ML, Amazon, Nuvemshop, Shopee) é "o token existe e não venceu"; na PayT, que é postback puro e não tem OAuth, é "já chegou evento". Medir a credencial num canal que não tem credencial daria "Aguardando integração" para sempre, com venda entrando. Quem responde "está entrando dado?" nos dois casos é `minutos_sem_sincronizar`.';

grant select on public.platform_connection_status to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As colunas continuam as mesmas, na mesma ordem.
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'platform_connection_status'
order by ordinal_position;

-- (b) ⭐ A PayT aparece, e conectada — porque já recebeu postback.
--     Os outros canais não podem ter mudado de estado.
select platform, is_connected, last_synced_at, minutos_sem_sincronizar,
       (minutos_sem_sincronizar is not null and minutos_sem_sincronizar <= 60) as sincronizando
from public.platform_connection_status
order by platform;

-- (c) Nenhuma plataforma duplicada. Tem de vir ZERO linhas.
select platform, count(*)
from public.platform_connection_status
group by 1 having count(*) > 1;
