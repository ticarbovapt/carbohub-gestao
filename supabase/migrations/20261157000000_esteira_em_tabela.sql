-- ═══════════════════════════════════════════════════════════════════════════
-- 20261157 — A ESTEIRA EM TABELA: o custo deixa de seguir o histórico (16/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo: a esteira tem de aguentar 100× as vendas de hoje,
-- sem limitador. Medido num Postgres local com os índices REAIS de produção
-- (BLOCO C/D de 16/11) e os dados multiplicados:
--
--                                  1×         10×        100×
--   ler a bling2_esteira         0,13 s      3,3 s      17,5 s   ← a view
--   carbo_recompra_pipeline      0,15 s      1,1 s      21   s
--
-- A view recalcula o histórico INTEIRO a cada leitura (nada a limita por data;
-- tudo é hash join com seq scan) e a fila do WhatsApp (limite 8 s) a lê por
-- TRÊS caminhos por minuto. Estourava por volta de 5× o volume de hoje.
--
-- O desenho:
--   1. `carbo_esteira_cards`  — um cartão por pedido, com as MESMAS colunas da
--      view de hoje (mais `calculado_em`, que a view fina esconde);
--   2. `bling2_esteira` continua existindo com o MESMO nome e as MESMAS colunas,
--      agora um `select` simples da tabela — fila, telas, Pendências, parados e
--      recompra não mudam uma linha (view é amarrada por OID, e o
--      `create or replace view` mantém o objeto);
--   3. `carbo_esteira_atualizar()` (cron de 1 min) recalcula SÓ o que mudou:
--      lê a coluna de alteração de cada fonte (pedido, nota, etiqueta, rastreio,
--      loja, código CZ, contato) e recalcula aqueles cartões pela função
--      `carbo_esteira_calcular(ids)`, que é a MESMA definição da view,
--      restringida a esses ids;
--   4. uma varredura de segurança recalcula os cartões EM ANDAMENTO que ficaram
--      30 min sem recálculo, e o que a detecção não pegar entra por ela.
--
-- Medido a 100× (540 mil cartões): ler a esteira 17,5 s → 65 ms; cartões em
-- andamento 41 ms; fatia de 7 dias da fila 60 ms; recalcular 500 cartões ~1 s.
--
-- ⚠️ A etapa NÃO depende do relógio: `melhorenvio_situacao` é immutable e a view
-- não usa now(). Cartão só muda quando uma FONTE muda — é isso que torna a
-- detecção por coluna de alteração exata, e não uma aproximação.
-- ⚠️ A função de cálculo é montada a partir do TEXTO VIVO da view
-- (`pg_get_viewdef`), com cinco trocas de texto, cada uma exigindo EXATAMENTE
-- uma ocorrência. Nada é transcrito do repositório (lição da `20261019`).
-- ⚠️ O BLOCO 3 compara a tabela com a view antiga ANTES de trocar, e ABORTA se
-- divergir além de ruído de sincronização em andamento.
-- ⚠️ DESFAZER: BLOCO R no fim (devolve o texto antigo da view e desliga o cron).
-- A foto `antes-reforma-2026-11-14` também continua valendo.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — índices que a detecção usa (tabelas pequenas: segundos)     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Só LEITURA de "o que mudou desde o último minuto". O de `numero_loja` serve
-- também à `ecommerce_aguardando_bling` (o NOT EXISTS por numero_loja).
create index if not exists bling2_orders_synced_idx     on public.bling2_orders (synced_at);
create index if not exists bling2_orders_numero_loja_idx on public.bling2_orders (numero_loja) where numero_loja is not null;
create index if not exists bling2_orders_payt_trans_idx
  on public.bling2_orders ((split_part(numero_loja, '_', 3))) where left(numero_loja, 5) = 'PAYT_';
create index if not exists bling_orders_synced_idx      on public.bling_orders (synced_at);
create index if not exists bling_orders_numero_loja_idx on public.bling_orders (numero_loja) where numero_loja is not null;
create index if not exists bling_nfe_synced_idx         on public.bling_nfe (synced_at);
create index if not exists bling2_contacts_updated_idx  on public.bling2_contacts (updated_at);
create index if not exists ecommerce_orders_synced_idx  on public.ecommerce_orders (synced_at);
create index if not exists melhorenvio_envios_atualizado_idx on public.melhorenvio_envios (atualizado_em);
create index if not exists rastreio_envios_consultado_idx on public.rastreio_envios (consultado_em);
create index if not exists carbo_pedido_codigo_criado_idx on public.carbo_pedido_codigo (criado_em);
create index if not exists carboze_orders_created_idx   on public.carboze_orders (created_at);
analyze public.bling2_orders;
analyze public.ecommerce_orders;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — tabela, fila, log, função de cálculo e o robô               ║
-- ║ (nada muda de comportamento: a view ainda é a de hoje)                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  v_def  text;
  v_opts text;
  v_fn   text;
  v_n    int;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'bling2_esteira' and c.relkind = 'v';
  if v_def is null then
    raise exception 'View public.bling2_esteira não encontrada';
  end if;

  -- Já aplicada? A view viva é um select da tabela: não há nada a fazer.
  if v_def ~* 'carbo_esteira_cards' then
    raise notice 'BLOCO 2: a esteira já é tabela — pulando';
    return;
  end if;

  v_def := regexp_replace(rtrim(v_def, E'; \n'), E'\\s+$', '');

  -- A cópia da view antiga, com OUTRO nome: é a "verdade" contra a qual a tabela
  -- é conferida, e a forma (o tipo composto) da função de cálculo.
  execute format('create or replace view public.bling2_esteira_calc %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end, v_def);

  -- A tabela: mesmas colunas e tipos, por construção (sai da própria view).
  if to_regclass('public.carbo_esteira_cards') is null then
    execute 'create table public.carbo_esteira_cards as select * from public.bling2_esteira_calc with no data';
    alter table public.carbo_esteira_cards add column calculado_em timestamptz not null default now();
    alter table public.carbo_esteira_cards add primary key (bling_id);
    create index carbo_esteira_cards_etapa_idx   on public.carbo_esteira_cards (etapa);
    create index carbo_esteira_cards_data_idx    on public.carbo_esteira_cards (data_pedido, bling_id);
    create index carbo_esteira_cards_rastreio_idx on public.carbo_esteira_cards (rastreio) where rastreio is not null;
    create index carbo_esteira_cards_varredura_idx on public.carbo_esteira_cards (calculado_em)
      where etapa not in ('entregue', 'cancelado');
  end if;

  -- ── A função de cálculo: a MESMA definição, restringida a p_ids ─────────────
  -- Cinco trocas de texto. Cada uma EXIGE exatamente uma ocorrência: se a view
  -- viva não for a que esta migração conhece, ABORTA em vez de adivinhar.
  v_fn := v_def;

  select count(*) into v_n from regexp_matches(v_fn, 'WITH\s+plataforma\s+AS\s+\(', 'g');
  if v_n <> 1 then raise exception 'esperava 1 "WITH plataforma AS (", achei %', v_n; end if;
  v_fn := regexp_replace(v_fn, 'WITH\s+plataforma\s+AS\s+\(',
$a$WITH alvo2 AS (
  SELECT bling_id, numero_loja FROM public.bling2_orders WHERE bling_id = ANY (p_ids)
), alvo1 AS (
  SELECT bling_id, numero_loja FROM public.bling_orders
   WHERE bling_id IN (SELECT - x FROM unnest(p_ids) x WHERE x < 0)
), alvo_tr AS (
  SELECT split_part(numero_loja, '_', 3) AS tr FROM alvo2 WHERE left(COALESCE(numero_loja, ''), 5) = 'PAYT_'
), ptc_alvo AS (
  SELECT e.platform_order_number AS carrinho
    FROM public.ecommerce_orders e
   WHERE e.platform = 'payt' AND e.platform_order_number IS NOT NULL
     AND split_part(e.order_id, '-', 1) IN (SELECT tr FROM alvo_tr)
), alvo_pon AS (
  SELECT numero_loja AS pon FROM alvo2 UNION SELECT numero_loja FROM alvo1 UNION SELECT carrinho FROM ptc_alvo
), plataforma AS ($a$);

  select count(*) into v_n from regexp_matches(v_fn, 'WHERE\s+\(e\.platform_order_number\s+IS\s+NOT\s+NULL\)', 'g');
  if v_n <> 1 then raise exception 'esperava 1 WHERE da plataforma, achei %', v_n; end if;
  v_fn := regexp_replace(v_fn, 'WHERE\s+\(e\.platform_order_number\s+IS\s+NOT\s+NULL\)',
    'WHERE (e.platform_order_number IS NOT NULL) AND e.platform_order_number IN (SELECT pon FROM alvo_pon)');

  select count(*) into v_n from regexp_matches(v_fn,
    'WHERE\s+\(\(e\.platform\s+=\s+''payt''::text\)\s+AND\s+\(e\.platform_order_number\s+IS\s+NOT\s+NULL\)\)', 'g');
  if v_n <> 1 then raise exception 'esperava 1 WHERE do payt_carrinho, achei %', v_n; end if;
  v_fn := regexp_replace(v_fn,
    'WHERE\s+\(\(e\.platform\s+=\s+''payt''::text\)\s+AND\s+\(e\.platform_order_number\s+IS\s+NOT\s+NULL\)\)',
    'WHERE ((e.platform = ''payt''::text) AND (e.platform_order_number IS NOT NULL) AND (split_part(e.order_id, ''-''::text, 1) IN (SELECT tr FROM alvo_tr)))');

  select count(*) into v_n from regexp_matches(v_fn,
    'WHERE\s+\(\(bo\.situacao_id\s+=\s+ANY', 'g');
  if v_n <> 1 then raise exception 'esperava 1 WHERE do ramo Bling 2, achei %', v_n; end if;
  v_fn := regexp_replace(v_fn, 'WHERE\s+\(\(bo\.situacao_id\s+=\s+ANY',
    'WHERE (bo.bling_id = ANY (p_ids)) AND ((bo.situacao_id = ANY');

  select count(*) into v_n from regexp_matches(v_fn,
    'WHERE\s+\(\(bl\.e_online\s+IS\s+TRUE\)\s+AND\s+\(NOT\s+COALESCE\(bl\.ignorar,\s+false\)\)\)', 'g');
  if v_n <> 1 then raise exception 'esperava 1 WHERE do ramo Bling 1, achei %', v_n; end if;
  v_fn := regexp_replace(v_fn,
    'WHERE\s+\(\(bl\.e_online\s+IS\s+TRUE\)\s+AND\s+\(NOT\s+COALESCE\(bl\.ignorar,\s+false\)\)\)',
    'WHERE ((- b1.bling_id) = ANY (p_ids)) AND ((bl.e_online IS TRUE) AND (NOT COALESCE(bl.ignorar, false)))');

  execute 'create or replace function public.carbo_esteira_calcular(p_ids bigint[]) '
       || 'returns setof public.bling2_esteira_calc language sql stable security definer '
       || 'set search_path = public as $fn$ ' || v_fn || ' $fn$';
end $$;

revoke all on function public.carbo_esteira_calcular(bigint[]) from public, anon, authenticated;

-- ── Fila de recálculo, estado, log ──────────────────────────────────────────
create table if not exists public.carbo_esteira_pendentes (
  bling_id bigint primary key,
  desde    timestamptz not null default now()
);
create table if not exists public.carbo_esteira_estado (
  id             boolean primary key default true check (id),
  ultima_leitura timestamptz
);
insert into public.carbo_esteira_estado (id) values (true) on conflict do nothing;
create table if not exists public.carbo_esteira_atualizacao_log (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  detectados  int not null,
  pendentes_antes int not null,
  processados int not null,
  pendentes_depois int not null,
  ms          int not null
);
create index if not exists carbo_esteira_atualizacao_log_em_idx on public.carbo_esteira_atualizacao_log (em);

alter table public.carbo_esteira_cards           enable row level security;
alter table public.carbo_esteira_pendentes       enable row level security;
alter table public.carbo_esteira_estado          enable row level security;
alter table public.carbo_esteira_atualizacao_log enable row level security;
-- A view `bling2_esteira` é security_invoker: quem lê passa pela RLS DESTA tabela,
-- e a regra é a mesma das tabelas de origem (time interno).
drop policy if exists carbo_esteira_cards_ler on public.carbo_esteira_cards;
create policy carbo_esteira_cards_ler on public.carbo_esteira_cards
  for select to authenticated using ((select public.carbo_e_time_interno()));
drop policy if exists carbo_esteira_log_ler on public.carbo_esteira_atualizacao_log;
create policy carbo_esteira_log_ler on public.carbo_esteira_atualizacao_log
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_esteira_cards, public.carbo_esteira_atualizacao_log to authenticated;

-- ── O robô ──────────────────────────────────────────────────────────────────
create or replace function public.carbo_esteira_atualizar(p_limite int default 3000, p_varredura int default 1500)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini    timestamptz := clock_timestamp();
  v_desde  timestamptz;
  v_det    int := 0;
  v_k      int := 0;
  v_antes  int;
  v_ids    bigint[];
  v_depois int;
begin
  if not pg_try_advisory_xact_lock(hashtext('carbo_esteira_atualizar')) then
    return jsonb_build_object('pulou', true);
  end if;

  select ultima_leitura into v_desde from carbo_esteira_estado where id;
  -- Sem marca ainda (primeira rodada): olha só os últimos 15 min; o resto já foi
  -- preenchido pela migração e a varredura cobre qualquer coisa que escape.
  v_desde := coalesce(v_desde, now() - interval '15 minutes') - interval '2 minutes';

  -- ── O que MUDOU, fonte por fonte (cada uma pela sua coluna de alteração) ──
  insert into carbo_esteira_pendentes (bling_id)
  select distinct id from (
    -- o próprio pedido do Bling 2
    select bling_id as id from bling2_orders where synced_at >= v_desde
    union all  -- a nota fiscal dele
    select o.bling_id from bling2_nfe n join bling2_orders o on o.nf_bling_id = n.bling_id where n.synced_at >= v_desde
    union all  -- a etiqueta do Melhor Envio
    select bling_id from melhorenvio_envios where atualizado_em >= v_desde and bling_id is not null
    union all  -- o rastreio
    select bling_id from rastreio_envios where consultado_em >= v_desde and bling_id is not null
    union all  -- o código CZ
    select bling_id from carbo_pedido_codigo where criado_em >= v_desde
    union all  -- o vínculo com o pedido do sistema (external_ref 'bling2-<id>')
    select substring(external_ref from 8)::bigint from carboze_orders
     where created_at >= v_desde and external_ref like 'bling2-%' and substring(external_ref from 8) ~ '^[0-9]{1,15}$'
    union all  -- o status da loja (Nuvemshop, ML, PayT...): por número do pedido na loja...
    select o.bling_id from ecommerce_orders e join bling2_orders o on o.numero_loja = e.platform_order_number
     where e.synced_at >= v_desde
    union all  -- ...e, na PayT, pela transação dentro do carrinho
    select o.bling_id from ecommerce_orders e
      join bling2_orders o on left(o.numero_loja, 5) = 'PAYT_' and split_part(o.numero_loja, '_', 3) = split_part(e.order_id, '-', 1)
     where e.synced_at >= v_desde and e.platform = 'payt'
    union all  -- o contato (nome/telefone) — só cartão EM ANDAMENTO
    select o.bling_id from bling2_contacts c
      join bling2_orders o on o.contato_id = c.bling_id
      join carbo_esteira_cards k on k.bling_id = o.bling_id and k.etapa not in ('entregue', 'cancelado')
     where c.updated_at >= v_desde
    union all  -- Bling 1 (matriz): o pedido, a nota e o status da loja — id NEGATIVO
    select - bling_id from bling_orders where synced_at >= v_desde
    union all
    select - substring(c.external_ref from 7)::bigint from bling_nfe n join carboze_orders c on c.id = n.order_id
     where n.synced_at >= v_desde and c.external_ref like 'bling-%' and substring(c.external_ref from 7) ~ '^[0-9]{1,15}$'
    union all
    select - b.bling_id from ecommerce_orders e join bling_orders b on b.numero_loja = e.platform_order_number
     where e.synced_at >= v_desde
    union all  -- pedido NOVO que a detecção por data não pegou (ids crescem)
    select bling_id from (select bling_id from bling2_orders
                           where bling_id > (select coalesce(max(bling_id), 0) from carbo_esteira_cards)
                           order by bling_id limit 5000) novos
  ) q
  on conflict do nothing;
  get diagnostics v_det = row_count;

  -- ── Varredura de segurança: em andamento e sem recálculo há 30 min ─────────
  insert into carbo_esteira_pendentes (bling_id)
  select bling_id from carbo_esteira_cards
   where etapa not in ('entregue', 'cancelado') and calculado_em < now() - interval '30 minutes'
   order by calculado_em limit p_varredura
  on conflict do nothing;

  select count(*) into v_antes from carbo_esteira_pendentes;

  -- ── Recalcula: o que está em andamento (ou é novo) vem ANTES do encerrado ──
  select coalesce(array_agg(bling_id), '{}') into v_ids from (
    select q.bling_id
      from carbo_esteira_pendentes q
      left join carbo_esteira_cards c on c.bling_id = q.bling_id
     order by (c.etapa in ('entregue', 'cancelado')) nulls first, q.desde, q.bling_id
     limit p_limite) s;

  if cardinality(v_ids) > 0 then
    delete from carbo_esteira_cards where bling_id = any (v_ids);
    insert into carbo_esteira_cards
      select x.*, now() from carbo_esteira_calcular(v_ids) x;
    delete from carbo_esteira_pendentes where bling_id = any (v_ids);
    v_k := cardinality(v_ids);
  end if;

  update carbo_esteira_estado set ultima_leitura = v_ini where id;
  select count(*) into v_depois from carbo_esteira_pendentes;

  insert into carbo_esteira_atualizacao_log (detectados, pendentes_antes, processados, pendentes_depois, ms)
  values (v_det, v_antes, v_k, v_depois, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
  delete from carbo_esteira_atualizacao_log where em < now() - interval '7 days';

  return jsonb_build_object('detectados', v_det, 'processados', v_k, 'pendentes', v_depois);
end $$;
revoke all on function public.carbo_esteira_atualizar(int, int) from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — preenche, CONFERE com a view antiga e troca a view          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Tudo ou nada: qualquer exceção desfaz o bloco inteiro e a view antiga continua.
do $$
declare
  v_def    text;
  v_opts   text;
  v_cols   text;
  v_inicio timestamptz := clock_timestamp();
  v_calc   bigint;
  v_so_a   bigint;
  v_so_b   bigint;
  v_t0     timestamptz;
  v_ms     numeric;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'bling2_esteira' and c.relkind = 'v';
  if v_def ~* 'carbo_esteira_cards' then
    raise notice 'BLOCO 3: a esteira já é tabela — pulando';
    return;
  end if;
  if to_regclass('public.bling2_esteira_calc') is null or to_regclass('public.carbo_esteira_cards') is null then
    raise exception 'rode o BLOCO 2 antes';
  end if;

  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
    from pg_attribute where attrelid = 'public.bling2_esteira_calc'::regclass and attnum > 0 and not attisdropped;

  -- Preenche (no volume de hoje: ~1 s) a partir da view antiga.
  truncate public.carbo_esteira_cards;
  execute 'insert into public.carbo_esteira_cards select *, now() from public.bling2_esteira_calc';
  execute 'analyze public.carbo_esteira_cards';

  -- Confere nos DOIS sentidos. Divergência pequena = sincronização que gravou no
  -- meio (o robô a pega na primeira rodada); grande = a função não é a view.
  execute 'select count(*) from public.bling2_esteira_calc' into v_calc;
  execute format('select count(*) from (select * from public.bling2_esteira_calc except select %s from public.carbo_esteira_cards) a', v_cols) into v_so_a;
  execute format('select count(*) from (select %s from public.carbo_esteira_cards except select * from public.bling2_esteira_calc) b', v_cols) into v_so_b;
  if v_so_a + v_so_b > greatest(10, v_calc * 0.005) then
    raise exception 'ABORTADO: a tabela diverge da view (só na view: %, só na tabela: %, de % linhas). Nada foi trocado.',
      v_so_a, v_so_b, v_calc;
  end if;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('bling2_esteira', v_def, v_opts, '20261157 — antes da esteira em tabela');

  -- ⚠️ `create or replace` mantém o OBJETO: a fila, a recompra, os parados e as
  -- telas continuam amarrados a ele. As reloptions vão junto (sem o `with`, o
  -- security_invoker se perderia).
  execute format('create or replace view public.bling2_esteira %s as select %s from public.carbo_esteira_cards',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end, v_cols);

  -- A marca do robô começa ANTES do preenchimento: o que mudou durante ele entra.
  update public.carbo_esteira_estado set ultima_leitura = v_inicio - interval '5 minutes' where id;

  v_t0 := clock_timestamp();
  perform count(*) from public.carbo_msg_fila;
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000);
  raise notice 'ok: % cartões; divergência na conferência % + %; a fila levou % ms', v_calc, v_so_a, v_so_b, v_ms;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — liga o robô (de minuto em minuto) e roda uma vez            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select cron.unschedule(jobid) from cron.job where jobname = 'carbo-esteira-atualizar-1min';
select cron.schedule('carbo-esteira-atualizar-1min', '* * * * *', $$select public.carbo_esteira_atualizar()$$);
select public.carbo_esteira_atualizar();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferir (rode alguns minutos depois)                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) O robô está rodando e dando conta. ESPERADO: uma linha por minuto,
--     `pendentes_depois` perto de 0 e `ms` em centenas.
-- select em, detectados, pendentes_antes, processados, pendentes_depois, ms
--   from public.carbo_esteira_atualizacao_log order by id desc limit 10;
--
-- (b) A tabela continua igual à esteira calculada. ESPERADO: 0 e 0 (ou poucas
--     linhas de sincronização em andamento, que somem na rodada seguinte).
-- select 'so_na_view_calculada', count(*) from (select * from public.bling2_esteira_calc
--   except select bling_id, pedido_numero, pedido_loja, canal, loja_id, data_pedido, total, cliente, cliente_doc,
--   cliente_fone, entrega_endereco, entrega_bairro, entrega_cidade, entrega_uf, entrega_cep, nf_numero, nf_chave,
--   nf_situacao, nf_data, nf_pdf, transportadora, servico, rastreio, volumes, peso_kg, items, carboze_order_id,
--   carboze_order_number, etapa, tem_status_da_plataforma, pedido_codigo, rastreio_origem, me_situacao,
--   me_gerado_em, me_expirado_em, rastreio_transportadora, me_tem_ativo, e_online from public.carbo_esteira_cards) a;
--
-- (c) A fila (antes 1.477 ms). ESPERADO: o mesmo ou menos.
-- explain (analyze, buffers off) select count(*) from public.carbo_msg_fila;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO R — DESFAZER (só se precisar)                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select cron.unschedule(jobid) from cron.job where jobname = 'carbo-esteira-atualizar-1min';
-- do $$
-- declare v record;
-- begin
--   select def, opcoes into v from public.carbo_backup_viewdef
--    where nome = 'bling2_esteira' and motivo like '20261157%' order by id desc limit 1;
--   if v.def is null then raise exception 'backup da view não encontrado'; end if;
--   execute format('create or replace view public.bling2_esteira %s as %s',
--                  case when v.opcoes is null then '' else 'with (' || v.opcoes || ')' end, rtrim(v.def, '; '));
-- end $$;
