-- ═══════════════════════════════════════════════════════════════════════════
-- Categoria "Trade Marketing" no catálogo do MRP
--
-- Pedida em 21/09/2026 para material de ponto de venda — panfleto, expositor,
-- adesivo. **Os produtos entram depois**; hoje só precisa existir a categoria.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ELA NÃO É PRODUZIDA, E ISSO NÃO EXIGE NADA
--
-- Material de trade não tem ficha técnica e não entra no planejamento. Isso
-- sai de graça porque TODOS os caminhos de produção filtram por INCLUSÃO:
--
--   OPFormDialog        category === 'Produto Final' || 'Semi-acabado'
--   useProducibility    idem, nos quatro lugares
--   HAS_BOM_CATEGORIES  Set(['Produto Final','Semi-acabado'])
--
-- Fosse por EXCLUSÃO ("tudo menos Insumo"), a categoria nova entraria sozinha
-- no MRP e ninguém veria — foi o cuidado que se pagou aqui sem precisar mexer.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O QUE ESTA MIGRAÇÃO PROVAVELMENTE NÃO PRECISA FAZER
--
-- `mrp_products.category` nasceu `text` livre (`20260313120000`), sem CHECK.
-- Se continuar assim, **não há nada a rodar**: a categoria passa a existir só
-- com o deploy do front, e o BLOCO 1 não faz nada.
--
-- Mas a definição de NASCIMENTO não é a produção — a `20260918` já provou isso
-- com o CHECK da conciliação do Melhor Envio, que eu afirmei não existir e
-- existia. E restrição não mora só em `pg_constraint`: TRIGGER, RULE e DOMAIN
-- fazem o mesmo trabalho por outros meios, e foi um trigger
-- (`validate_stock_movement`) que deixou a dedução três dias abortando.
--
-- Por isso o BLOCO 0 pergunta pelos TRÊS, e o BLOCO 1 só age se achar algo.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — existe alguma restrição sobre `category`?                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) CHECK na tabela. ESPERADO: zero linhas, ou nenhuma que cite categoria.
select con.conname, pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'mrp_products' and con.contype = 'c';

-- (b) ⚠️ TRIGGER — a restrição que NÃO aparece em `pg_constraint`.
--     ESPERADO: nenhum que valide `category`. Leia o corpo dos que vierem.
select t.tgname, p.proname, pg_get_functiondef(p.oid) as corpo
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and c.relname = 'mrp_products' and not t.tgisinternal;

-- (c) O tipo da coluna. ESPERADO: `text`. Se vier um DOMAIN ou um enum, a
--     categoria nova exige `alter type ... add value` em arquivo SEPARADO —
--     valor de enum não pode ser usado na mesma transação em que nasce.
select column_name, data_type, udt_name, domain_name
from information_schema.columns
where table_schema = 'public' and table_name = 'mrp_products'
  and column_name = 'category';

-- (d) As categorias que já existem, com a contagem. É o retrato de antes —
--     `Trade Marketing` tem de aparecer com 0 (ausente) agora.
select coalesce(category, '(nulo)') as categoria, count(*) as produtos
from public.mrp_products group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — só rode se o BLOCO 0 achou um CHECK citando categorias      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Ele ABORTA quando não há o que fazer, em vez de fingir que fez. Migração
-- que não faz nada sem dizer é o modo de falhar mais caro deste repo.
--
-- ⚠️ E ele NÃO inventa a lista: lê a definição do CHECK atual e só acrescenta
-- o valor novo. Reescrever a lista de cabeça derrubaria qualquer categoria que
-- exista em produção e não esteja no repositório.

do $$
declare
  v_nome  text;
  v_def   text;
  v_nova  text;
begin
  select con.conname, pg_get_constraintdef(con.oid)
    into v_nome, v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'mrp_products' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%Carbonata%'
  limit 1;

  if v_nome is null then
    raise notice 'Nenhum CHECK de categoria em mrp_products — NADA A FAZER aqui.';
    raise notice 'A categoria passa a existir com o deploy do front. Encerre por aqui.';
    return;
  end if;

  if v_def ilike '%Trade Marketing%' then
    raise notice 'O CHECK % ja aceita Trade Marketing. Nada a fazer.', v_nome;
    return;
  end if;

  -- Acrescenta o valor logo antes do fecha-parênteses da lista.
  v_nova := regexp_replace(v_def, '\)\s*\)\s*$', ', ''Trade Marketing''::text))');
  if v_nova = v_def then
    raise exception 'Nao consegui acrescentar o valor ao CHECK automaticamente. Definicao atual: %', v_def;
  end if;

  execute format('alter table public.mrp_products drop constraint %I', v_nome);
  execute format('alter table public.mrp_products add constraint %I %s', v_nome, v_nova);
  raise notice 'CHECK % atualizado para aceitar Trade Marketing.', v_nome;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ O teste que importa: um produto de Trade Marketing ENTRA?
--     Insere, confere e apaga na mesma transação — não deixa lixo no catálogo.
--     ESPERADO: uma linha com `aceita = true`.
begin;
insert into public.mrp_products (product_code, name, category, is_active)
values ('ZZ-TESTE-TRADE', 'TESTE — apagar', 'Trade Marketing', false);

select 'aceita' as resultado, category
from public.mrp_products where product_code = 'ZZ-TESTE-TRADE';

rollback;

-- (b) O catálogo não mudou: nenhum produto de teste sobreviveu ao rollback.
--     ESPERADO: zero linhas.
select product_code, name from public.mrp_products
where product_code = 'ZZ-TESTE-TRADE';
