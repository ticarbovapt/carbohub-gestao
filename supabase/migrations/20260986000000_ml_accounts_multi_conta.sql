-- ═══════════════════════════════════════════════════════════════════════════
-- Mercado Livre multi-conta — `ml_accounts` (Fase 0)
--
-- `system_tokens.id` é chave de TEXTO com uma linha por plataforma, e o código
-- lia `.eq("id", "mercadolivre")` fixo. Conectar a segunda conta pelo fluxo
-- antigo sobrescrevia a primeira: ela caía calada, e o sintoma seria "parou de
-- sincronizar" sem erro nenhum.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O DEFEITO QUE ESTA MIGRAÇÃO CORRIGE É VIVO, E É DE UMA CONTA SÓ
--
-- O `refresh_token` do ML é de USO ÚNICO: cada renovação devolve um novo e
-- invalida o anterior. E DUAS funções renovam de forma independente, sem
-- coordenação nenhuma:
--
--   ecommerce-sync   cron de 5 min, renova quando falta < 5 min para expirar
--   ml-auth          renova toda vez que alguém abre a tela de integrações
--
-- Se as duas lerem a linha antes de qualquer uma gravar, a segunda manda um
-- `refresh_token` já queimado e recebe `invalid_grant`. Até aí seria uma falha
-- recuperável — mas o `ml-auth` reagia APAGANDO A LINHA:
--
--     // Refresh failed — mark as disconnected
--     await supabase.from("system_tokens").delete().eq("id", conta);
--
-- Ou seja: uma corrida de segundos desconectava a integração, e só voltava com
-- OAuth manual. Isso já era possível com UMA conta; com duas, dobra.
--
-- ⚠️ Apagar a linha é perder o `refresh_token` que talvez ainda funcionasse —
-- o `invalid_grant` pode ser da corrida, não da credencial. Quem apaga
-- transforma "tente de novo" em "refaça o OAuth".
--
-- A correção tem duas partes, e as duas estão aqui:
--   BLOCO 3  `ml_token_trocar` — troca CONDICIONAL, quem perde a corrida relê
--   BLOCO 4  `status = 'reauth_required'` em vez de DELETE
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE `platform_key` E NÃO `seller_account` EM `ecommerce_orders`
--
-- O briefing propõe manter `platform = 'mercadolivre'` para as duas contas e
-- distinguir por uma coluna `seller_account`. Não dá, por um motivo que ele
-- não trata: **`carbo_canal_estoque` é chaveada por `platform`**.
--
-- Com as duas contas sob a mesma chave, a venda do Full deduziria da LogHouse
-- — mercadoria que nunca saiu de lá. E como a REMESSA de reposição também
-- deduz, a mesma saída seria contada duas vezes: o erro de 31/08/2026, que
-- custou uma contagem física inteira. Para a proposta dele funcionar,
-- `carbo_canal_estoque`, `carbo_estoque_consumo`, o ensaio e o estorno
-- teriam TODOS de virar `(platform, seller_account)`.
--
-- A síntese: `ml_accounts` governa CONTA e TOKEN (que é o ganho real do
-- briefing — status, reauth_required, last_error, uma linha por vendedor), e
-- `platform_key` liga cada conta ao CANAL que o resto do sistema já entende.
--
-- ⚠️ O que se PERDE, registrado: o sistema não sabe sozinho que os dois são o
-- mesmo marketplace. Somar "todo o ML" exige listar as duas chaves. Numa
-- TERCEIRA conta isso incomoda, e aí a coluna do briefing passa a valer a pena
-- — junto com a mudança em `carbo_canal_estoque`, que é o preço dela.
--
-- ⚠️ RODE EM BLOCOS, na ordem. Nenhum bloco apaga nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO do antes (leitura pura)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Rode e GUARDE o resultado. É contra ele que o BLOCO 5 confere se a conta
-- atravessou a migração com o token intacto — sem a foto, a conferência
-- compararia o resultado com ele mesmo, que é a doença da `20260941`.

select id, seller_id, expires_at, last_synced_at, updated_at,
       length(coalesce(access_token, ''))  as tam_access,
       length(coalesce(refresh_token, '')) as tam_refresh
from public.system_tokens
where id like 'mercadolivre%'
order by id;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela de contas                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.ml_accounts (
  -- O `user_id` do ML. É a identidade real da conta — `platform_key` é só o
  -- nome que o nosso sistema dá a ela.
  seller_id        bigint primary key,

  -- ⚠️ O ELO com o resto do sistema: é este valor que vai para
  -- `ecommerce_orders.platform`, e é por ele que `carbo_canal_estoque` decide
  -- se a venda deduz estoque. UNIQUE porque duas contas não podem disputar o
  -- mesmo canal: se disputassem, a dedução de uma valeria pela outra.
  platform_key     text not null unique
                   check (platform_key in ('mercadolivre', 'mercadolivre_full')),

  nickname         text,
  label            text,
  site_id          text not null default 'MLB',

  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  scopes           text,

  -- ⚠️ `reauth_required` existe para NÃO ficar tentando em loop. Sem ele, uma
  -- conta com refresh morto bate na API a cada 5 min para sempre, e o log vira
  -- ruído que ninguém lê — o mesmo mecanismo que fez ninguém perceber o
  -- `CRON_SECRET` ausente por 25 h.
  status           text not null default 'active'
                   check (status in ('active', 'reauth_required', 'disabled')),

  last_refresh_at  timestamptz,
  last_synced_at   timestamptz,
  last_error       text,
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.ml_accounts is
  'Contas de vendedor do Mercado Livre, uma linha por seller_id. platform_key e o ELO com ecommerce_orders.platform e com carbo_canal_estoque — e e por isso que ele e UNIQUE: duas contas no mesmo canal fariam a regra de estoque de uma valer pela outra. Tokens NUNCA vao ao front: use ml_accounts_public.';

comment on column public.ml_accounts.status is
  'active | reauth_required | disabled. reauth_required existe para PARAR de tentar: refresh morto sem esse estado bate na API a cada 5 min para sempre e o log vira ruido que ninguem le.';

drop trigger if exists update_ml_accounts_updated_at on public.ml_accounts;
create trigger update_ml_accounts_updated_at
  before update on public.ml_accounts
  for each row execute function public.update_updated_at_column();

alter table public.ml_accounts enable row level security;

-- ⚠️ SEM policy de leitura para `authenticated`. A tabela guarda access_token e
-- refresh_token: qualquer policy de SELECT aqui entregaria as credenciais do
-- ML pelo PostgREST a quem estiver logado — e o portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`. O front lê a view do BLOCO 2.
drop policy if exists "service escreve ml_accounts" on public.ml_accounts;
create policy "service escreve ml_accounts"
  on public.ml_accounts for all to service_role using (true) with check (true);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view SEM token, para o front                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Colunas listadas UMA A UMA, nunca `select *`. Com `*`, uma coluna nova de
-- credencial acrescentada amanhã entraria na view sozinha e vazaria sem
-- ninguém escrever uma linha de código. É o mesmo raciocínio do `o.*` da
-- `carbo_vendas_metrica`, só que aqui o custo é um segredo, não um erro 42P16.

create or replace view public.ml_accounts_public
with (security_invoker = true) as
select
  a.seller_id,
  a.platform_key,
  a.nickname,
  a.label,
  a.site_id,
  a.status,
  a.expires_at,
  -- Derivados, para a tela não ter de recalcular (e não ter duas regras).
  (a.expires_at is not null and a.expires_at <= now())              as token_expirado,
  greatest(0, extract(epoch from (a.expires_at - now())) / 60)::int as minutos_para_expirar,
  a.last_refresh_at,
  a.last_synced_at,
  a.last_error,
  a.connected_at,
  a.updated_at
from public.ml_accounts a;

comment on view public.ml_accounts_public is
  'Contas do ML SEM token nenhum, para o front. Colunas listadas uma a uma de proposito: com select *, coluna de credencial criada amanha entraria aqui sozinha e vazaria sem ninguem escrever codigo.';

grant select on public.ml_accounts_public to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a troca ATÔMICA do refresh_token                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- A correção da corrida descrita no cabeçalho.
--
-- Quem vai renovar passa o `refresh_token` QUE LEU. O update só acerta a linha
-- se ela ainda tiver aquele valor — ou seja, se ninguém renovou no meio. Quem
-- perde a corrida recebe `false`, e o contrato é: **releia a linha e use o
-- token novo**, nunca tente renovar de novo.
--
-- ⚠️ Troca condicional em vez de `pg_advisory_xact_lock`: o lock exigiria
-- segurar uma transação ABERTA durante uma chamada HTTP ao ML. Transação
-- aberta esperando rede é como se prende uma conexão do pool por 30 s e se
-- descobre no dia do pico.
--
-- ⚠️ `security definer` porque a tabela é service_role-only e o cron chama por
-- RPC; `revoke from public/anon/authenticated` para que ninguém mais a chame —
-- ela grava credencial.

create or replace function public.ml_token_trocar(
  p_seller_id            bigint,
  p_refresh_token_lido   text,
  p_access_token         text,
  p_refresh_token_novo   text,
  p_expires_at           timestamptz,
  p_scopes               text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_linhas integer;
begin
  update public.ml_accounts
     set access_token    = p_access_token,
         refresh_token   = p_refresh_token_novo,
         expires_at      = p_expires_at,
         scopes          = coalesce(p_scopes, scopes),
         status          = 'active',
         last_error      = null,
         last_refresh_at = now(),
         updated_at      = now()
   where seller_id = p_seller_id
     -- ⚠️ A CONDIÇÃO INTEIRA está nesta linha: só troca quem ainda está de
     -- posse do token que leu.
     and refresh_token = p_refresh_token_lido;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end $$;

comment on function public.ml_token_trocar is
  'Troca CONDICIONAL do refresh_token do ML, que e de USO UNICO. Devolve false quando outro worker ja renovou — e nesse caso o chamador tem de RELER a linha e usar o token novo, nunca tentar renovar de novo. Sem isso, dois refresh simultaneos queimam o token e a conta cai.';

revoke all on function public.ml_token_trocar(bigint, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.ml_token_trocar(bigint, text, text, text, timestamptz, text)
  to service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — falha de refresh MARCA, nunca apaga                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O `ml-auth` apagava a linha no `invalid_grant`, e o `invalid_grant` pode
-- ser só a corrida. Apagar troca "tente de novo" por "refaça o OAuth" — e
-- ainda joga fora o `refresh_token`, que é a única coisa capaz de recuperar a
-- conexão sem intervenção humana.

create or replace function public.ml_conta_marcar_erro(
  p_seller_id bigint,
  p_erro      text,
  p_fatal     boolean default false
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ml_accounts
     set status     = case when p_fatal then 'reauth_required' else status end,
         last_error = left(coalesce(p_erro, ''), 500),
         updated_at = now()
   where seller_id = p_seller_id;
$$;

comment on function public.ml_conta_marcar_erro is
  'Registra falha na conta do ML. p_fatal = true so para invalid_grant DEFINITIVO (status vira reauth_required e para de tentar). NUNCA apaga a linha: o refresh_token e o que permite recuperar sem OAuth manual, e o invalid_grant pode ser apenas a corrida de dois refresh simultaneos.';

revoke all on function public.ml_conta_marcar_erro(bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.ml_conta_marcar_erro(bigint, text, boolean) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a conta ATUAL atravessa, sem perder o token                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ SÓ LÊ `system_tokens`. Nenhum update, nenhum delete: a linha antiga fica
-- lá, com o token válido, como rollback. O código novo tem fallback para ela
-- (ver `_shared/ml.ts`), então uma migração incompleta não desconecta nada —
-- ela se completa sozinha na primeira rodada do sync.
--
-- `on conflict do nothing`: rodar de novo não sobrescreve um token que já foi
-- renovado pelo código novo com um mais velho vindo da tabela antiga. Migração
-- idempotente que anda para trás é pior que migração que falha.

insert into public.ml_accounts
  (seller_id, platform_key, label, access_token, refresh_token, expires_at, last_synced_at)
select
  t.seller_id::bigint,
  'mercadolivre',
  'ML LogHouse (despacho nosso)',
  t.access_token,
  t.refresh_token,
  t.expires_at,
  t.last_synced_at
from public.system_tokens t
where t.id = 'mercadolivre'
  and t.seller_id is not null
  and t.seller_id ~ '^[0-9]+$'
on conflict (seller_id) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A pergunta que importa: o token ATRAVESSOU intacto?
--     Compare com a foto do BLOCO 0. As três colunas `igual_*` têm de vir
--     TODAS true. Qualquer false significa que a conta atual perdeu a
--     credencial — e aí NÃO conecte a segunda conta, me chame.
select
  a.seller_id,
  a.platform_key,
  a.status,
  a.access_token  = t.access_token   as igual_access,
  a.refresh_token = t.refresh_token  as igual_refresh,
  a.expires_at    = t.expires_at     as igual_expires
from public.ml_accounts a
join public.system_tokens t on t.id = a.platform_key
where a.platform_key = 'mercadolivre';

-- (b) A linha antiga continua lá? Tem de vir 1. Ela é o rollback.
select count(*) as system_tokens_intacto
from public.system_tokens where id = 'mercadolivre';

-- (c) A view do front não vaza token. Esperado: ZERO colunas com 'token' no
--     nome. Se vier qualquer linha, a view está expondo credencial.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'ml_accounts_public'
  and (column_name ilike '%token%' or column_name ilike '%secret%');

-- (d) A troca condicional funciona nos DOIS sentidos.
--     Esperado: `com_token_certo` = true, `com_token_errado` = false.
--     ⚠️ Não altera nada de verdade: grava os MESMOS valores que já estão lá.
select
  public.ml_token_trocar(
    a.seller_id, a.refresh_token, a.access_token, a.refresh_token, a.expires_at
  ) as com_token_certo,
  public.ml_token_trocar(
    a.seller_id, 'valor-que-nao-existe', a.access_token, a.refresh_token, a.expires_at
  ) as com_token_errado
from public.ml_accounts a
where a.platform_key = 'mercadolivre';

-- (e) O canal do Full já existe em carbo_canal_estoque e NÃO deduz?
--     Esperado: mercadolivre ativo=true · mercadolivre_full ativo=false e
--     deduz_a_partir_de NULO. (Vem da 20260985 — se não vier, rode-a antes.)
select platform, warehouse_code, ativo, deduz_a_partir_de
from public.carbo_canal_estoque
where platform like 'mercadolivre%'
order by platform;
