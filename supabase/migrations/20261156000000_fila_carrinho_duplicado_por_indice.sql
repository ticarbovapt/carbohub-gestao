-- ═══════════════════════════════════════════════════════════════════════════
-- 20261156 — A fila do WhatsApp levava 14 s, e o limite é 8 s (15/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Medido no raio-x da reforma da Esteira (`supabase/consultas/esteira_raio_x.sql`):
--
--   explain analyze select count(*) from carbo_msg_fila   →   14.303 ms
--   net._http_response, 24 h                              →   360 timeouts
--
-- Com a fila em timeout, NENHUMA mensagem da Meta sai naquele minuto, nem as
-- da esteira (é a doença dos 18 dias de setembro voltando devagar).
--
-- O culpado não é a esteira (568 ms) nem a recompra (641 ms): são os TRÊS
-- ramos de carrinho da fila, ~4.340 ms cada. Dentro de cada um, o mesmo passo:
--
--   SubPlan "tem_mais_novo"   3,6 ms × 1.193 carrinhos = 4,3 s
--   Index Scan using nuvemshop_carrinhos_abertos_idx (abandonado_em > …)
--   Rows Removed by Filter: 588    ← regexp_replace do telefone por linha
--
-- O "existe carrinho mais novo da mesma pessoa" (e-mail OU telefone) varre
-- todo carrinho aberto mais novo e roda `regexp_replace` em cada um: custo ao
-- QUADRADO do número de carrinhos. Cresceu com a PayT entrando na tabela
-- (`20261052`), e cresce sozinho a cada dia.
--
-- A correção, nas duas peças:
--   1. DOIS índices por expressão (a chave do e-mail e a do telefone, só dos
--      abertos) — a busca vira igualdade em índice;
--   2. o `exists (e-mail OR telefone)` vira `exists (e-mail) OR exists
--      (telefone)`. É a MESMA pergunta (∃ x: A ∨ B  ≡  ∃ A ∨ ∃ B); separada,
--      cada metade usa o seu índice. Junta, o planejador escolhe o índice de
--      data e volta aos 4 s — medido num Postgres 16 local com 1.700
--      carrinhos: 4.513 ms → 11 ms, e a MESMA contagem de duplicados.
--
-- ⚠️ Só o trecho do `tem_mais_novo` muda, trocado no texto VIVO
-- (`pg_get_viewdef`), com o antes em `carbo_backup_viewdef` e na foto
-- `antes-reforma-2026-11-14`. A `carbo_msg_fila` lê a pipeline, então ela
-- herda a correção sem ser tocada.
-- ⚠️ O BLOCO 2 confere SOZINHO que nenhum carrinho mudou de coluna (impressão
-- digital de checkout_id → coluna antes e depois, na MESMA transação). Mudou
-- um, ele aborta e nada fica.
-- ⚠️ Desfazer: `carbo_foto_esteira_restaurar('antes-reforma-2026-11-14', false)`
-- volta a view; os índices podem ficar (não mudam resultado de nada).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — os dois índices (tabela pequena: segundos, sem efeito)      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ As expressões são as MESMAS, letra a letra, das da view — índice por
-- expressão só é usado quando a consulta escreve a expressão igual.
create index if not exists nuvemshop_carrinhos_email_chave_aberto_idx
  on public.nuvemshop_carrinhos ((nullif(lower(trim(email)), '')))
  where completado_em is null and nullif(lower(trim(email)), '') is not null;

create index if not exists nuvemshop_carrinhos_fone_chave_aberto_idx
  on public.nuvemshop_carrinhos ((regexp_replace(coalesce(telefone, ''), '\D', '', 'g')))
  where completado_em is null
    and nullif(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), '') is not null;

analyze public.nuvemshop_carrinhos;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o `tem_mais_novo` em duas metades, com a conferência dentro ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  v_def    text;
  v_opts   text;
  v_novo   text;
  v_trecho text;
  v_n      int;
  v_antes  text;
  v_depois text;
  v_cards  int;
  v_t0     timestamptz;
  v_ms     numeric;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_carrinho_pipeline';

  if v_def is null then
    raise exception 'View public.carbo_carrinho_pipeline não encontrada';
  end if;

  -- ⚠️ Exatamente UM `tem_mais_novo` e UM `exists` sobre `c2`. Zero ou dois é
  -- sinal de que a view viva não é a que esta migração conhece: ABORTA.
  select count(*) into v_n from regexp_matches(v_def, 'AS\s+tem_mais_novo', 'g');
  if v_n <> 1 then
    raise exception 'esperava 1 "AS tem_mais_novo", achei %', v_n;
  end if;
  select count(*) into v_n from regexp_matches(v_def, 'nuvemshop_carrinhos\s+c2\M', 'g');
  if v_n = 2 and v_def ~ 'OR\s+\(?\s*EXISTS' then
    raise notice 'já aplicada (o tem_mais_novo já está em duas metades) — nada a fazer';
    return;
  end if;
  if v_n <> 1 then
    raise exception 'esperava 1 "nuvemshop_carrinhos c2", achei %', v_n;
  end if;

  -- O trecho inteiro, do "(EXISTS" até o "AS tem_mais_novo" (que é único).
  -- O `pg_get_viewdef` embrulha o EXISTS num parêntese próprio; ele entra no
  -- trecho, e a contagem de parênteses tem de fechar — senão a troca deixaria
  -- um aberto e a view não compilaria.
  v_trecho := substring(v_def from
    '\(\s*EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?nuvemshop_carrinhos\s+c2\s+WHERE.*\)\s+AS\s+tem_mais_novo');
  if v_trecho is null then
    raise exception 'não achei o EXISTS do tem_mais_novo';
  end if;
  if length(v_trecho) - length(replace(v_trecho, '(', ''))
     <> length(v_trecho) - length(replace(v_trecho, ')', '')) then
    raise exception 'o trecho do tem_mais_novo não fecha os parênteses: %', left(v_trecho, 600);
  end if;
  -- Sanidade: é a pergunta que esta migração conhece (outro alias, outra regra ⇒ para).
  if v_trecho !~ 'c2\.checkout_id\s*<>\s*c\.checkout_id'
     or v_trecho !~ 'c2\.abandonado_em\s*>\s*c\.abandonado_em'
     or v_trecho !~ 'c2\.completado_em\s+IS\s+NULL'
     or v_trecho !~ 'c2\.email' or v_trecho !~ 'c2\.telefone'
     or v_trecho ~* 'carbo_' then
    raise exception 'o tem_mais_novo vivo não é o esperado: %', left(v_trecho, 600);
  end if;

  -- A impressão digital de ANTES: cada carrinho e a coluna em que está.
  execute 'select md5(string_agg(checkout_id::text || '':'' || coluna, '','' order by checkout_id)),
                  count(*)
             from public.carbo_carrinho_pipeline'
     into v_antes, v_cards;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_carrinho_pipeline', v_def, v_opts,
          '20261156 — antes do tem_mais_novo em duas metades');

  v_novo := replace(v_def, v_trecho, $novo$(EXISTS (
          SELECT 1 FROM public.nuvemshop_carrinhos c2
           WHERE c2.checkout_id <> c.checkout_id
             AND c2.abandonado_em > c.abandonado_em
             AND c2.completado_em IS NULL
             AND NULLIF(lower(TRIM(BOTH FROM c2.email)), '') IS NOT NULL
             AND NULLIF(lower(TRIM(BOTH FROM c2.email)), '') = NULLIF(lower(TRIM(BOTH FROM c.email)), ''))
       OR EXISTS (
          SELECT 1 FROM public.nuvemshop_carrinhos c2
           WHERE c2.checkout_id <> c.checkout_id
             AND c2.abandonado_em > c.abandonado_em
             AND c2.completado_em IS NULL
             AND NULLIF(regexp_replace(COALESCE(c2.telefone, ''), '\D', '', 'g'), '') IS NOT NULL
             AND regexp_replace(COALESCE(c2.telefone, ''), '\D', '', 'g')
               = regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g'))) AS tem_mais_novo$novo$);

  -- ⚠️ As reloptions (security_invoker) vão JUNTO: `create or replace view`
  -- sem `with` as APAGA.
  execute format('create or replace view public.carbo_carrinho_pipeline %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                 rtrim(v_novo, '; '));

  -- A impressão digital de DEPOIS, na mesma transação (o mesmo now()).
  execute 'select md5(string_agg(checkout_id::text || '':'' || coluna, '','' order by checkout_id))
             from public.carbo_carrinho_pipeline'
     into v_depois;
  if v_depois is distinct from v_antes then
    raise exception 'ABORTADO: algum carrinho mudou de coluna com a troca (nada foi gravado)';
  end if;

  -- O tempo da fila depois (o antes era 14.303 ms).
  v_t0 := clock_timestamp();
  perform count(*) from public.carbo_msg_fila;
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000);

  raise notice 'ok: % carrinhos, todos na mesma coluna; a fila levou % ms', v_cards, v_ms;
end
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferir                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) Quanto a fila leva agora. ESPERADO: Execution Time bem abaixo de 3.000 ms.
-- explain (analyze, buffers off) select count(*) from public.carbo_msg_fila;
--
-- (b) A view manteve o security_invoker e usa as duas metades.
-- select relname, reloptions,
--        (select count(*) from regexp_matches(pg_get_viewdef(oid), 'nuvemshop_carrinhos c2', 'g')) as buscas_c2
--   from pg_class where relname = 'carbo_carrinho_pipeline';
--
-- (c) ~1 h depois: os timeouts pararam. ESPERADO: 0.
-- select count(*) filter (where content like '%statement timeout%') as timeouts, count(*) as respostas
--   from net._http_response where created > now() - interval '1 hour';
