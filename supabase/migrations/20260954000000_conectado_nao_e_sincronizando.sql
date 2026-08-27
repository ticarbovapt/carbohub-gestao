-- ═══════════════════════════════════════════════════════════════════════════
-- "Conectado" não é o mesmo que "sincronizando"
--
-- ── O furo, provado hoje ─────────────────────────────────────────────────
--
-- `platform_connection_status.is_connected` responde uma pergunta só: existe
-- `access_token` e ele ainda não venceu?
--
-- Em 26/08/2026 o `ecommerce-sync` passou ~20 h recebendo 401 do próprio cron
-- (a portaria subiu antes de o cron ganhar a chave). Nesse período TODOS os
-- tokens estavam válidos e não vencidos — o selo teria dito "Conectado" o
-- tempo inteiro, enquanto nenhum pedido entrava. E o `pg_cron` marcava
-- `succeeded`, porque o sucesso dele é ter POSTADO.
--
-- Um selo que só sabe dizer "o token existe" não serve para o que ele existe:
-- avisar que caiu.
--
-- ── O que entra ──────────────────────────────────────────────────────────
--
-- `last_synced_at` e os minutos desde então. Token válido com sincronismo
-- parado é o estado perigoso — o que parece saudável e não é. Agora ele tem
-- nome na tela.
--
-- ⚠️ Colunas NOVAS no FIM, ordem das antigas intacta: `create or replace view`
-- só acrescenta.
--
-- ⚠️ NÃO mexo no `security_invoker` desta view. Ela nasceu sem, roda com os
-- privilégios do dono e tem `grant to authenticated` — o que expõe plataforma,
-- `seller_id` e o booleano ao portal de lojas e ao de licenciados, que usam a
-- MESMA tabela `profiles`. É a mesma família do vazamento da `bling2_esteira`,
-- em escala muito menor (não expõe token nenhum). Ligar o invoker aqui exige
-- que `system_tokens` tenha policy de SELECT para o time interno; sem ela a
-- view volta VAZIA e o selo some para todo mundo. Medir antes, num passo
-- próprio — trocar um vazamento pequeno por um painel cego não é conserto.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o retrato de agora                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select id as plataforma, seller_id,
       (access_token is not null) as tem_token,
       expires_at,
       (expires_at is not null and expires_at <= now()) as token_vencido,
       last_synced_at,
       round(extract(epoch from (now() - last_synced_at)) / 60)::int as minutos_sem_sincronizar
from public.system_tokens
order by id;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view passa a contar as duas coisas                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.platform_connection_status as
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
  -- ── Colunas novas, no fim ───────────────────────────────────────────────
  -- ⚠️ Quando a última rodada REALMENTE trouxe dado. Token válido e este campo
  -- parado é o estado que engana: parece conectado e não está entrando nada.
  last_synced_at,
  case
    when last_synced_at is null then null
    else round(extract(epoch from (now() - last_synced_at)) / 60)::int
  end         as minutos_sem_sincronizar
from public.system_tokens;

comment on view public.platform_connection_status is
  'Status de conexão das plataformas para o front. Expõe se está conectado — nunca os tokens. ⚠️ `is_connected` responde apenas "o token existe e não venceu": ele ficou verdadeiro durante as ~20 h em que o ecommerce-sync recebia 401 do cron. Quem responde "está entrando dado?" é `minutos_sem_sincronizar`.';

grant select on public.platform_connection_status to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- As colunas novas chegaram, e na ordem certa (as antigas antes).
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'platform_connection_status'
order by ordinal_position;

-- ⭐ O que o selo vai mostrar em cada plataforma. `sincronizando` falso com
--    `is_connected` verdadeiro é exatamente o caso que o selo antigo não via.
select platform, is_connected, last_synced_at, minutos_sem_sincronizar,
       (minutos_sem_sincronizar is not null and minutos_sem_sincronizar <= 60) as sincronizando
from public.platform_connection_status
order by platform;
