-- ═══════════════════════════════════════════════════════════════════════════
-- O selo de conexão enxerga `ml_accounts`
--
-- Visto na tela em 21/09/2026: a aba ML Full mostrava "Aguardando integração"
-- e "Aguardando sincronização" com os números logo abaixo preenchidos — 13
-- vendas, R$ 1.944, 65 unidades, 3 aguardando envio · 7 em transporte · 3
-- entregues. A mesma tela dizendo que não há integração e exibindo o que ela
-- trouxe.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ A CAUSA: TABELA NOVA, LEITOR VELHO
--
-- `platform_connection_status` é uma view sobre `system_tokens`. A `20260986`
-- moveu as contas do ML para `ml_accounts` e deixou a linha antiga só como
-- rollback — e a conta Full NUNCA passou pelo fluxo velho, então não tem linha
-- lá. Sem linha, `is_connected` não é `false`: a plataforma simplesmente não
-- existe na view, e o front lê ausência como desconectado.
--
-- A LogHouse não expôs isso porque a linha antiga dela continua existindo e o
-- `ecommerce-sync` ainda grava `last_synced_at` nos DOIS lugares.
--
-- ⚠️ A lição é a de sempre neste repo, com outra roupa: criar a tabela nova é
-- metade do trabalho; a outra metade é a lista de quem lia a antiga. Aqui a
-- falha foi calada e ao CONTRÁRIO do que o selo existe para mostrar — ele
-- acusou desconexão num canal que estava trazendo venda.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ TRÊS COISAS QUE NÃO SE MEXEM
--
-- 1. MESMAS COLUNAS, MESMA ORDEM. `create or replace view` só aceita
--    acrescentar no fim; reordenar exige DROP, e o DROP leva junto os GRANTs.
--
-- 2. `security_invoker` continua DESLIGADO, como a `20260954` e a `20260964`
--    decidiram. Ligar exigiria policy de SELECT em `system_tokens` e em
--    `ml_accounts` para o time interno — e sem ela a view volta VAZIA e o selo
--    some para todo mundo. Trocar um vazamento pequeno (plataforma e
--    seller_id) por um painel cego não é conserto.
--    ⚠️ E aqui isso vira uma GARANTIA, não uma folga: `ml_accounts` guarda
--    `access_token` e `refresh_token` e por isso não tem policy de SELECT para
--    `authenticated`. É justamente por rodar como dono que a view consegue ler
--    a tabela — e ela expõe apenas `is_connected` e o `seller_id`, coluna por
--    coluna, NUNCA `select *`. Com `*`, credencial criada amanhã entraria
--    sozinha.
--
-- 3. NADA DE DUPLICATA. `mercadolivre` está nos dois lugares, então o ramo do
--    `system_tokens` passa a EXCLUIR o que já existe em `ml_accounts` — é o
--    mesmo `where not exists` que a `20260964` usou para a PayT, na direção
--    oposta. Duas linhas para a mesma plataforma fariam o `maybeSingle()` do
--    front devolver erro, e o selo sumiria nos dois canais de ML de uma vez.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o retrato de agora                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O `mercadolivre_full` NÃO aparece aqui, e é esse o defeito.
select platform, is_connected, last_synced_at, minutos_sem_sincronizar, now() as agora
from public.platform_connection_status order by platform;

-- (b) Mas a conta existe, está ativa e sincronizou. As duas consultas juntas
--     são a prova: o canal funciona e a view não o conhece.
select platform_key, seller_id, status,
       (access_token is not null) as tem_token,
       expires_at, last_synced_at, now() as agora
from public.ml_accounts order by platform_key;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view passa a somar as contas do ML                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.platform_connection_status as
-- ── Canais OAuth em `system_tokens`: a pergunta continua sendo o token ──────
--    ⚠️ Menos o que já está em `ml_accounts`, senão o ML viria duplicado.
select
  t.id          as platform,
  t.seller_id,
  case
    when t.access_token is not null
     and (t.expires_at is null or t.expires_at > now())
    then true
    else false
  end           as is_connected,
  t.updated_at,
  t.last_synced_at,
  case
    when t.last_synced_at is null then null
    else round(extract(epoch from (now() - t.last_synced_at)) / 60)::int
  end           as minutos_sem_sincronizar
from public.system_tokens t
where not exists (
  select 1 from public.ml_accounts a where a.platform_key = t.id
)

union all

-- ── Contas do Mercado Livre, que desde a 20260986 moram em `ml_accounts` ────
--
-- ⚠️ `status` entra na conta, e não é detalhe: uma conta em `reauth_required`
-- pode ter `access_token` ainda dentro da validade e mesmo assim estar morta —
-- o `refresh_token` é que queimou. Olhar só o token diria "Conectado" até o
-- access vencer, que é o mesmo engano das 20 h de 401 da `20260954`.
select
  a.platform_key          as platform,
  a.seller_id::text       as seller_id,
  (a.status = 'active'
   and a.access_token is not null
   and (a.expires_at is null or a.expires_at > now())) as is_connected,
  a.updated_at,
  a.last_synced_at,
  case
    when a.last_synced_at is null then null
    else round(extract(epoch from (now() - a.last_synced_at)) / 60)::int
  end                     as minutos_sem_sincronizar
from public.ml_accounts a

union all

-- ── PayT: canal de POSTBACK. Inalterado (ver 20260964). ─────────────────────
select
  'payt'                                            as platform,
  (select e.corpo->>'seller_id' from public.payt_eventos e
    order by e.recebido_em desc limit 1)            as seller_id,
  exists (select 1 from public.payt_eventos e)      as is_connected,
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
  'Status de conexao das plataformas para o front. Expoe se esta conectado — nunca os tokens. ⚠️ A pergunta MUDA por tipo de canal: em system_tokens (Amazon, Nuvemshop, Shopee) e "o token existe e nao venceu"; nas contas de ML, que desde a 20260986 moram em ml_accounts, entra tambem o `status` (reauth_required tem token valido e esta morta); na PayT, que e postback puro, e "ja chegou evento". O ramo de system_tokens EXCLUI o que ja esta em ml_accounts — duplicata faria o maybeSingle() do front dar erro e o selo sumir. Roda como DONO de proposito: e isso que a deixa ler ml_accounts, que nao tem policy de SELECT para authenticated por guardar credencial. Colunas UMA A UMA, nunca select *.';

grant select on public.platform_connection_status to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ O `mercadolivre_full` aparece e está conectado. E o `mercadolivre`
--     NÃO pode ter mudado de estado — se ele virou false, o ramo novo está
--     lendo `status` de um jeito que a conta antiga não satisfaz.
select platform, is_connected, last_synced_at, minutos_sem_sincronizar,
       (minutos_sem_sincronizar is not null and minutos_sem_sincronizar <= 60) as sincronizando,
       now() as agora
from public.platform_connection_status
order by platform;

-- (b) ⚠️ ZERO linhas. Qualquer linha aqui é plataforma duplicada, e duplicata
--     faz o `maybeSingle()` do front devolver ERRO — o selo some para aquele
--     canal em vez de ficar errado, que é o defeito com outra cara.
select platform, count(*) as vezes
from public.platform_connection_status
group by 1 having count(*) > 1;

-- (c) As colunas continuam as mesmas, na mesma ordem: platform, seller_id,
--     is_connected, updated_at, last_synced_at, minutos_sem_sincronizar.
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'platform_connection_status'
order by ordinal_position;

-- (d) ⚠️ A view não pode ter passado a expor credencial. Tem de vir ZERO.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'platform_connection_status'
  and column_name in ('access_token', 'refresh_token', 'scopes');
