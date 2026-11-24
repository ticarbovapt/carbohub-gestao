-- ═══════════════════════════════════════════════════════════════════════════
-- CRON_SECRET exposto no repositório (24/11/2026) — DIAGNÓSTICO e TROCA
-- ═══════════════════════════════════════════════════════════════════════════
-- O repositório é PÚBLICO e DOIS valores de `X-Cron-Secret` estão escritos em
-- claro em migrações já aplicadas (que NÃO são reescritas — ver CLAUDE.md,
-- "CRON_SECRET em claro no repositório"):
--
--   A  md5 6497996d80a40c25d79af481eda97acf   20260625150000 · 20260710330000 ·
--                                             20260711120000 · 20260837000000 ·
--                                             20260838000000 · 20261024000000
--   B  md5 102f2cc286dd4fc998cbe32224952ed4   20260993000000 (ml-estoque-full)
--
-- Este arquivo NUNCA contém o valor: compara por md5 e por `position()` contra
-- o segredo lido do próprio banco. Rode no SQL Editor, UM BLOCO POR VEZ (o
-- editor mostra só o resultado da ÚLTIMA consulta do bloco).
--
-- NÃO é migração de propósito: a integração GitHub→Supabase rodaria sozinha, e
-- a troca depende de passos fora do banco (secret nas Edge Functions e no
-- GitHub) que só a pessoa faz.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0a — SÓ LEITURA. O segredo do arquivo ainda é o que está em uso? ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- "Em uso" = o do `bling2-sync-incremental`, que devolve 202 a cada minuto
-- (referência da 20261036). Uma linha só. Leitura:
--   em_uso_e_A = true  ou  em_uso_e_B = true  ⇒ o segredo VIVO está público: TROCAR.
--   os dois false                              ⇒ os do repo já não valem; confira
--                                                jobs_com_segredo_divergente (são 401).
--   segredo_em_uso_lido = false                ⇒ o job de referência não existe ou
--                                                não tem o cabeçalho: PARE e avise.
with ref as (
  select (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1] as v
  from cron.job where jobname = 'bling2-sync-incremental' limit 1
), j as (
  select jobname,
         (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1] as s,
         command
  from cron.job
  where command ilike '%wpkfirmapxevzpxjovjr.supabase.co/functions/v1/%'
)
select
  (select v is not null from ref)                                         as segredo_em_uso_lido,
  (select md5(v) = '6497996d80a40c25d79af481eda97acf' from ref)          as em_uso_e_A,
  (select md5(v) = '102f2cc286dd4fc998cbe32224952ed4' from ref)          as em_uso_e_B,
  (select count(*) from j where s is not null)                            as jobs_com_segredo,
  (select count(*) from j where s is not null and s = (select v from ref)) as jobs_com_o_segredo_em_uso,
  (select count(*) from j where s is not null and s <> (select v from ref)) as jobs_com_segredo_divergente,
  (select count(*) from j where md5(s) = '6497996d80a40c25d79af481eda97acf') as jobs_ainda_com_A,
  (select count(*) from j where md5(s) = '102f2cc286dd4fc998cbe32224952ed4') as jobs_ainda_com_B,
  (select count(*) from pg_proc p, ref
    where ref.v is not null and position(ref.v in p.prosrc) > 0)          as funcoes_com_o_segredo_no_corpo;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0b — SÓ LEITURA. Job a job (sem o valor)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- `qual` = em_uso · A · B · outro · (vazio = job sem cabeçalho X-Cron-Secret).
-- `outro`/`A`/`B` diferente do em_uso = esse job está levando 401 hoje.
-- `segredo_fora_do_cabecalho` = o valor em uso aparece no comando por OUTRO
-- caminho (ex.: `?secret=`), que a troca também precisa alcançar.
with ref as (
  select (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1] as v
  from cron.job where jobname = 'bling2-sync-incremental' limit 1
)
select c.jobid, c.jobname, c.schedule, c.active,
       case
         when x.s is null then null
         when x.s = ref.v then 'em_uso'
         when md5(x.s) = '6497996d80a40c25d79af481eda97acf' then 'A'
         when md5(x.s) = '102f2cc286dd4fc998cbe32224952ed4' then 'B'
         else 'outro'
       end as qual,
       (x.s is null and ref.v is not null and position(ref.v in c.command) > 0) as segredo_fora_do_cabecalho,
       c.command ilike '%wpkfirmapxevzpxjovjr.supabase.co/functions/v1/%'   as chama_nossa_funcao
from cron.job c
cross join ref
cross join lateral (
  select (regexp_match(c.command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1] as s
) x
order by qual nulls last, c.jobname;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0c — SÓ LEITURA. A cópia em `private.cron_config`               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Várias migrações (rastreio, kanban-n8n, carrinho, agendadas, ME) copiam o
-- segredo DAQUI ao agendar. ESPERADO: `igual_ao_em_uso = true`.
-- 42P01 (tabela não existe) = nada a trocar aqui.
select chave,
       md5(valor) = '6497996d80a40c25d79af481eda97acf' as e_A,
       md5(valor) = '102f2cc286dd4fc998cbe32224952ed4' as e_B,
       valor = (select (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1]
                  from cron.job where jobname = 'bling2-sync-incremental' limit 1) as igual_ao_em_uso
from private.cron_config
order by chave;


-- ═══════════════════════════════════════════════════════════════════════════
-- DAQUI PARA BAIXO: A TROCA. Só com a aprovação do dono do processo, e só se o
-- BLOCO 0a disse `em_uso_e_A` ou `em_uso_e_B` = true.
--
-- Ordem (a janela de 401 é de ~1–2 min entre o passo 2 e o 3; os jobs são
-- idempotentes e a rodada seguinte recupera — só o WhatsApp atrasa um minuto):
--   1. BLOCO 1 — gera o segredo novo NO BANCO e mostra (só na sua tela).
--   2. Fora do banco, colando o valor do BLOCO 1:
--        Supabase → Edge Functions → Secrets → CRON_SECRET
--        GitHub   → Settings → Secrets and variables → Actions → CRON_SECRET
--   3. BLOCO 2 — reagenda TODOS os crons copiando do banco (nunca digitado).
--   4. BLOCO 3 — conferência (2 min depois).
--   5. BLOCO 4 — apaga a tabela do segredo novo.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — gerar o segredo novo (idempotente: rodar de novo NÃO troca) ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `on conflict do nothing`: se você rodar duas vezes, o valor que você já
-- copiou continua sendo o do banco. 64 hex = 256 bits, de dois uuid v4.
create table if not exists private.cron_segredo_novo (
  id        boolean primary key default true check (id),
  valor     text not null,
  criado_em timestamptz not null default now()
);
revoke all on private.cron_segredo_novo from public, anon, authenticated;
alter table private.cron_segredo_novo enable row level security;

insert into private.cron_segredo_novo (valor)
values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- Copie ESTE valor para os dois secrets (passo 2). Não cole no chat.
select valor as copie_para_o_secret_CRON_SECRET, criado_em
from private.cron_segredo_novo;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — reagendar todos os crons com o segredo novo                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Rode LOGO DEPOIS de salvar o secret nas Edge Functions.
-- Troca, em todo job que chama função NOSSA: (1) o valor do cabeçalho
-- X-Cron-Secret, qualquer que seja (inclusive A/B/outro que hoje levam 401);
-- (2) qualquer outra ocorrência do segredo em uso (ex.: `?secret=`).
-- Também atualiza `private.cron_config` onde o valor era o em uso.
-- ⚠️ ABORTA (nada muda) se não ler o antigo ou o novo, se já foi trocado, ou
-- se sobrar o antigo em qualquer job/função depois da troca.
-- Backup do comando de cada job em `private.cron_backup_rotacao`.
do $rot$
declare
  v_old text;
  v_new text;
  r     record;
  v_cmd text;
  n_job int := 0;
  n_cfg int := 0;
  n_rest int;
begin
  select (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1]
    into v_old
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  select valor into v_new from private.cron_segredo_novo where id;

  if v_old is null or btrim(v_old) = '' then
    raise exception 'Nao li o segredo em uso do job bling2-sync-incremental. Nada foi trocado.';
  end if;
  if v_new is null or length(v_new) < 32 then
    raise exception 'Segredo novo ausente: rode o BLOCO 1 antes. Nada foi trocado.';
  end if;
  if v_old = v_new then
    raise exception 'O bling2-sync-incremental ja usa o segredo novo: a troca ja foi feita. Va ao BLOCO 3.';
  end if;

  create table if not exists private.cron_backup_rotacao (
    jobid    bigint,
    jobname  text,
    command  text,
    salvo_em timestamptz not null default now()
  );
  revoke all on private.cron_backup_rotacao from public, anon, authenticated;
  alter table private.cron_backup_rotacao enable row level security;

  for r in
    select jobid, jobname, command
      from cron.job
     where command ilike '%wpkfirmapxevzpxjovjr.supabase.co/functions/v1/%'
       and (command ~* 'x-cron-secret' or position(v_old in command) > 0)
  loop
    insert into private.cron_backup_rotacao (jobid, jobname, command)
    values (r.jobid, r.jobname, r.command);

    -- v_new é só hex: não tem `\` nem `&` para virar referência no replace.
    v_cmd := regexp_replace(
               r.command,
               '(x-cron-secret[''"]?\s*[,:]\s*[''"])[^''"]+([''"])',
               '\1' || v_new || '\2',
               'gi');
    v_cmd := replace(v_cmd, v_old, v_new);

    if v_cmd is distinct from r.command then
      perform cron.alter_job(r.jobid, command := v_cmd);
      n_job := n_job + 1;
    end if;
  end loop;

  if to_regclass('private.cron_config') is not null then
    execute 'update private.cron_config set valor = $1 where valor = $2'
      using v_new, v_old;
    get diagnostics n_cfg = row_count;
  end if;

  -- Sobrou o antigo em algum lugar? Então não fecha: desfaz tudo.
  select count(*) into n_rest from cron.job where position(v_old in command) > 0;
  if n_rest > 0 then
    raise exception 'Ainda ha % job(s) com o segredo antigo. Nada foi trocado.', n_rest;
  end if;
  select count(*) into n_rest from pg_proc where position(v_old in prosrc) > 0;
  if n_rest > 0 then
    raise exception '% funcao(oes) tem o segredo antigo no corpo; trocar a mao antes. Nada foi trocado.', n_rest;
  end if;

  raise notice 'Trocado em % job(s) e % linha(s) de private.cron_config.', n_job, n_cfg;
end $rot$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência. Rode 2 min depois do BLOCO 2, uma de cada vez  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) ESPERADO: jobs_com_o_novo = jobs_com_segredo e os outros dois zero.
--     Só jobs que chamam função NOSSA (cabeçalho de serviço externo não é tocado).
select
  count(*) filter (where s is not null)                                   as jobs_com_segredo,
  count(*) filter (where s = (select valor from private.cron_segredo_novo)) as jobs_com_o_novo,
  count(*) filter (where md5(s) in ('6497996d80a40c25d79af481eda97acf',
                                    '102f2cc286dd4fc998cbe32224952ed4'))  as jobs_com_A_ou_B,
  count(*) filter (where s is not null
                     and s <> (select valor from private.cron_segredo_novo)) as jobs_divergentes
from cron.job
cross join lateral (
  select (regexp_match(command, 'x-cron-secret[''"]?\s*[,:]\s*[''"]([^''"]+)[''"]', 'i'))[1] as s
) x
where command ilike '%wpkfirmapxevzpxjovjr.supabase.co/functions/v1/%';

-- (b) ESPERADO: 401 = 0 nos últimos 2 min (200/202 voltando).
--     ⚠️ NÃO use `cron.job_run_details`: ele diz `succeeded` mesmo com 401.
--     Se vier 401: o secret das Edge Functions não foi salvo (ou não pegou
--     ainda) — confira lá; o banco já está com o novo.
select status_code, count(*) as respostas, max(created) as ultima
from net._http_response
where created > now() - interval '2 minutes'
group by status_code
order by status_code;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — limpeza (só depois do BLOCO 3 limpo)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O segredo novo já mora nos comandos dos jobs e nos dois secrets; a tabela
-- não precisa guardá-lo. O backup guarda o ANTIGO (que já é público) e serve
-- de volta: `cron.alter_job(jobid, command := <command do backup>)`.
drop table if exists private.cron_segredo_novo;
