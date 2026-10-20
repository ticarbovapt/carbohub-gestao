-- ============================================================================
-- 20261118 — O Ops passa a ENXERGAR (e abrir) a OS do portal de licenciados
--
-- Pedido do dono do processo (20/10/2026): a tela de OS do Sales foi para o
-- Ops (`/campo/os`), no lugar da antiga, que lia `crm_os` — tabela vazia.
-- A OS de verdade mora em `licenciados.service_orders`, e quem a lê de fora do
-- portal passa por `licenciados.is_carbo_sales()`, que só aceitava a flag
-- `carbo_crm`. Sem isto, quem tem SÓ o Ops abriria a tela vazia, calado.
--
-- ⚠️ O que muda é UMA linha: a função aceita `carbo_crm` OU `carbo_ops`. Todas
-- as portas que a chamam (RLS de service_orders/os_customers/os_vehicles,
-- os_create, os_create_from_sale, os_find_customer) passam a valer para o Ops
-- do MESMO jeito que valem para o Sales — inclusive a amarração da OS criada à
-- Carbox interna. E o `/vender` do Ops, que já cria OS a partir da venda, para
-- de ser recusado para quem não tem o Sales.
--
-- ⚠️ Troca no texto VIVO (pg_get_functiondef), não reescrita de memória, e só
-- se achar EXATAMENTE uma vez a forma esperada. Backup em carbo_backup_funcoes.
-- ============================================================================


-- ── BLOCO 0 — MEDE (só leitura) ─────────────────────────────────────────────
-- (a) a definição viva — tem de conter  'carbo_crm' = any(
select pg_get_functiondef('licenciados.is_carbo_sales()'::regprocedure) as definicao_viva;

-- (b) quem GANHA acesso à OS com isto (tem o Ops e não tem o Sales)
select p.full_name, p.department::text as departamento, p.funcao
  from public.profiles p
 where 'carbo_ops'  = any(coalesce(p.allowed_interfaces, '{}'::text[]))
   and not ('carbo_crm' = any(coalesce(p.allowed_interfaces, '{}'::text[])))
 order by 1;


-- ── BLOCO 1 — APLICA ────────────────────────────────────────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('licenciados.is_carbo_sales()'::regprocedure);
  v_novo text;
  v_n    int;
begin
  if v_def ~ 'carbo_ops' then
    raise notice 'is_carbo_sales já aceita carbo_ops — nada a fazer';
    return;
  end if;

  select count(*) into v_n
    from regexp_matches(v_def, '''carbo_crm''\s*=\s*any\s*\(', 'g');
  if v_n <> 1 then
    raise exception 'Forma inesperada da is_carbo_sales (achei % ocorrências de ''carbo_crm'' = any). Nada foi mudado; mande o BLOCO 0 (a).', v_n;
  end if;

  create table if not exists public.carbo_backup_funcoes (
    nome text not null, definicao text not null, guardado_em timestamptz not null default now()
  );
  insert into public.carbo_backup_funcoes (nome, definicao)
  values ('licenciados.is_carbo_sales() · antes da 20261118', v_def);

  v_novo := regexp_replace(
    v_def,
    '''carbo_crm''\s*=\s*any\s*\(\s*coalesce\s*\(\s*p\.allowed_interfaces\s*,\s*''\{\}''::text\[\]\s*\)\s*\)',
    'coalesce(p.allowed_interfaces, ''{}''::text[]) && array[''carbo_crm'',''carbo_ops'']::text[]'
  );
  if v_novo = v_def then
    raise exception 'A troca não casou (a expressão difere do esperado). Nada foi mudado; mande o BLOCO 0 (a).';
  end if;

  execute v_novo;
end $$;


-- ── BLOCO 2 — CONFERE ───────────────────────────────────────────────────────
-- Esperado: aceita_ops = true e aceita_sales = true.
select
  pg_get_functiondef('licenciados.is_carbo_sales()'::regprocedure) ~ 'carbo_ops' as aceita_ops,
  pg_get_functiondef('licenciados.is_carbo_sales()'::regprocedure) ~ 'carbo_crm' as aceita_sales;
