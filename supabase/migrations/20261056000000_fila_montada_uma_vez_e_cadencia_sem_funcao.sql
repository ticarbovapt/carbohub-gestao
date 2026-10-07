-- ═══════════════════════════════════════════════════════════════════════════
-- A fila é montada UMA vez — e a cadência das 9h volta, sem função por linha
--
-- `explain analyze` da `carbo_msg_fila` em 07/10/2026 (carrinho DESLIGADO):
--
--   Nested Loop                       (os templates ativos: 7 linhas)
--     -> Append  ... loops=7          a fila INTEIRA, ~430 ms CADA vez
--   Execution Time: 3013 ms
--
-- ⚠️ O CTE `base` (a união de esteira + saiu_entrega + recompra + carrinho) era
-- reavaliado UMA VEZ POR TEMPLATE ATIVO: o planejador escolheu laço com os
-- templates por fora e a fila inteira por dentro. Cada template ligado
-- MULTIPLICAVA o custo — ligar os três do carrinho levava de 7 para 10 voltas.
-- Com o banco ocupado, passava dos 8 s do `statement_timeout`, e com a fila em
-- timeout NENHUMA mensagem da Meta sai. Os timeouts esporádicos desde a manhã
-- (1 a 4 por meia hora) eram isto; a função da `20261054` só empurrou de vez.
--
-- 1. `base AS MATERIALIZED`: monta uma vez, junta depois. Mesmo resultado.
-- 2. Índice para o "comprou depois de abandonar" do carrinho: era seq scan em
--    `ecommerce_orders` por carrinho (1.645 voltas, ~1 ms cada).
-- 3. A cadência das 9h (D+1 / D+3) volta, com a conta ESCRITA na própria
--    consulta (subselect sobre o CTE `cfg`, como já era), em vez da função
--    `carbo_carrinho_horas_ate`, que o planejador não embutia. A função sai.
--
-- Tudo trocado no texto VIVO (`pg_get_viewdef`), com trava que ABORTA se o
-- trecho não aparecer exatamente uma vez, e com cópia em
-- `carbo_backup_viewdef` antes.
--
-- ⚠️ RODE EM BLOCOS, e MEÇA entre eles (blocos de conferência).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — índice + a fila montada uma vez                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create index if not exists ecommerce_orders_email_chave_idx
  on public.ecommerce_orders ((nullif(lower(trim(cliente_email)), '')));

do $$
declare
  v_def  text;
  v_opts text;
  v_n    int;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_msg_fila';

  if v_def ~ 'base AS MATERIALIZED' then
    raise notice 'carbo_msg_fila já materializa o base — nada a fazer';
    return;
  end if;

  select count(*) into v_n from regexp_matches(v_def, '\mbase AS \(', 'g');
  if v_n <> 1 then
    raise exception 'carbo_msg_fila: esperava 1 "base AS (", achei %', v_n;
  end if;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_msg_fila', v_def, v_opts, '20261056 — antes do base MATERIALIZED');

  v_def := regexp_replace(v_def, '\mbase AS \(', 'base AS MATERIALIZED (');

  execute format('create or replace view public.carbo_msg_fila %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                 rtrim(v_def, '; '));
end
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a cadência das 9h, escrita na consulta                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Só rode depois de MEDIR o BLOCO 1 (conferência a).
do $$
declare
  r       record;
  v_def   text;
  v_opts  text;
  v_n     int;
  v_conta text;
begin
  for r in
    select * from (values
      -- Na pipeline o viewdef escreve a coluna sem alias; na fila, `p.`.
      ('carbo_carrinho_pipeline', ''),
      ('carbo_msg_fila',          'p.')
    ) t(nome, alias)
  loop
    select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
      into v_def, v_opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.nome;

    if v_def ~ 'cfg\.hora_2' then
      raise notice '% já tem a cadência por hora do dia — nada a fazer', r.nome;
      continue;
    end if;

    -- O CTE `cfg` passa a trazer as quatro colunas novas.
    select count(*) into v_n from regexp_matches(v_def, 'carbo_carrinho_config\.horas_3,', 'g');
    if v_n <> 1 then
      raise exception '%: esperava 1 "carbo_carrinho_config.horas_3,", achei %', r.nome, v_n;
    end if;
    select count(*) into v_n from regexp_matches(v_def, 'SELECT\s+cfg\.horas_2\s+FROM\s+cfg', 'g');
    if v_n <> 1 then
      raise exception '%: esperava 1 "SELECT cfg.horas_2 FROM cfg", achei %', r.nome, v_n;
    end if;
    select count(*) into v_n from regexp_matches(v_def, 'SELECT\s+cfg\.horas_3\s+FROM\s+cfg', 'g');
    if v_n <> 1 then
      raise exception '%: esperava 1 "SELECT cfg.horas_3 FROM cfg", achei %', r.nome, v_n;
    end if;

    insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
    values (r.nome, v_def, v_opts, '20261056 — antes da cadência escrita na consulta');

    v_def := regexp_replace(v_def, 'carbo_carrinho_config\.horas_3,',
      'carbo_carrinho_config.horas_3, carbo_carrinho_config.hora_2, carbo_carrinho_config.dias_2, '
      || 'carbo_carrinho_config.hora_3, carbo_carrinho_config.dias_3,');

    -- Horas até as hora_N:00 (Brasília) de dias_N dias depois do dia da
    -- mensagem anterior; hora_N nula = as horas corridas de sempre.
    v_conta := 'SELECT CASE WHEN cfg.hora_2 IS NULL THEN cfg.horas_2::numeric ELSE '
      || '(EXTRACT(epoch FROM (((((timezone(''America/Sao_Paulo'', ' || r.alias || 'msg1_em))::date + cfg.dias_2) '
      || '+ make_time(cfg.hora_2, 0, 0)) AT TIME ZONE ''America/Sao_Paulo'') - ' || r.alias || 'msg1_em)) / 3600.0) END FROM cfg';
    v_def := regexp_replace(v_def, 'SELECT\s+cfg\.horas_2\s+FROM\s+cfg', v_conta);

    v_conta := 'SELECT CASE WHEN cfg.hora_3 IS NULL THEN cfg.horas_3::numeric ELSE '
      || '(EXTRACT(epoch FROM (((((timezone(''America/Sao_Paulo'', ' || r.alias || 'msg2_em))::date + cfg.dias_3) '
      || '+ make_time(cfg.hora_3, 0, 0)) AT TIME ZONE ''America/Sao_Paulo'') - ' || r.alias || 'msg2_em)) / 3600.0) END FROM cfg';
    v_def := regexp_replace(v_def, 'SELECT\s+cfg\.horas_3\s+FROM\s+cfg', v_conta);

    execute format('create or replace view public.%I %s as %s',
                   r.nome,
                   case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                   rtrim(v_def, '; '));
  end loop;
end
$$;

-- A função da 20261054 não é mais usada por ninguém.
drop function if exists public.carbo_carrinho_horas_ate(timestamptz, int);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) O tempo da fila — rode depois do BLOCO 1 e de novo depois do BLOCO 2.
--     ESPERADO: bem abaixo de 1.000 ms (era 3.013 ms).
-- explain (analyze, buffers)
-- select * from public.carbo_msg_fila where canal_envio = 'meta' order by prioridade limit 150;
--
-- (b) A régua: proxima_em dos carrinhos em msg1/msg2 cai às 09:00.
-- select checkout_id, coluna, timezone('America/Sao_Paulo', proxima_em) as proxima
--   from public.carbo_carrinho_pipeline where coluna in ('aberto','msg1','msg2');
