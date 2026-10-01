-- ═══════════════════════════════════════════════════════════════════════════
-- O faturamento para de contar REMESSA — e passa a enxergar a natureza da FILIAL
--
-- Duas correções na mesma republicação, porque as duas são a mesma linha de
-- código e separá-las exigiria derrubar a view duas vezes.
--
-- ── 1. Remessa de entrega futura contava como receita ────────────────────
--
-- Medido em 01/10/2026 na Brisanet: a nota MÃE (natureza `15110465964`) fatura
-- o contrato inteiro — R$ 77.220 em duas notas — e as FILHAS (`15110465968`)
-- só movimentam a mercadoria, mês a mês, descontando dela. As duas contavam.
--
-- Medido nominalmente antes de mexer: 6 pedidos, **R$ 11.050,00**.
--
--   BLING-147     1.950,00
--   V2026080080   1.820,00
--   V2026090064   1.820,00
--   V2026090005   1.820,00
--   V2026090065   1.820,00
--   V2026090013   1.820,00
--
-- E faltam 14 parcelas do contrato, R$ 25.480, até abril/27.
--
-- ── 2. A view NÃO LIA a natureza da filial ───────────────────────────────
--
-- ⚠️ Achado lendo a definição VIVA (`pg_get_viewdef`), não a migração:
--
--     carbo_natureza_e_bonificacao(COALESCE(
--       (n.raw_data -> 'naturezaOperacao') ->> 'id',
--       (n2.raw_data -> 'naturezaOperacao') ->> 'id'))
--
-- O detalhe da conta 2 NÃO traz `naturezaOperacao` — medido hoje, 884 notas e
-- zero. A natureza da filial mora na coluna `natureza_operacao`, vinda do
-- `<natOp>` do XML, e a view não a lia. Resultado: **a bonificação da filial
-- contava como receita** (`Saida em bonificacao`, 2 notas, R$ 1.908,80), e a
-- regra da `20260981` valia só para a matriz sem ninguém saber.
--
-- ── As dependentes: UMA view e DUAS funções ──────────────────────────────
--
-- ⚠️ A primeira tentativa levou `2BP01` porque eu perguntei só por
-- `pg_depend` + `pg_rewrite`, que acha VIEWS. O CLAUDE.md já avisava: *"e
-- `prorettype` para as funções `returns setof`"*. São elas:
--
--     carbo_vendas_busca(text, integer)   a busca global do Sales
--     carbo_pdv_pedidos(text)             os pedidos de um PDV
--
-- ⚠️ E `DROP ... CASCADE` continua fora de questão, mesmo com o `HINT` do
-- Postgres sugerindo: cascade apaga as duas funções em silêncio, e a busca
-- global do Sales sumiria sem motivo aparente.
--
-- ⚠️ As funções NÃO são transcritas à mão. Os corpos são regex densos
-- (`\s+`, `\D`, `\m`, classes escapadas) e uma barra a mais quebra a busca de
-- um jeito que nenhum build pega. O BANCO copia melhor: o BLOCO 1 guarda
-- `pg_get_functiondef` numa tabela e o BLOCO 3 reexecuta. Zero transcrição,
-- zero escape.
--
-- ⚠️ RODE EM BLOCOS, NA ORDEM, e o BLOCO 0 ANTES.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. O número de ANTES. (já rodado em 01/10)              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO, medido: 1.302 pedidos / R$ 940.937,41.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — guardar as dependentes ANTES de qualquer drop               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Tabela REAL, não temporária: o SQL Editor pode rodar cada bloco numa
-- sessão diferente, e uma temp table desapareceria entre o BLOCO 1 e o 3 —
-- levando junto a única cópia das funções. Ela é apagada no fim, de propósito,
-- para não virar lixo permanente.
--
-- ⚠️ Os GRANTS vão junto: o `drop function` os leva, e sem eles o PostgREST
-- devolve "permission denied" para a busca global — com a função existindo. É
-- o modo de falhar mais confuso possível.

create table if not exists public.carbo_backup_20261029 (
  assinatura text primary key,
  definicao  text not null,
  grants     text not null default '',
  salvo_em   timestamptz not null default now()
);

insert into public.carbo_backup_20261029 (assinatura, definicao, grants)
select
  p.oid::regprocedure::text,
  pg_get_functiondef(p.oid),
  coalesce((
    select string_agg(
             format('grant execute on function %s to %s;',
                    p.oid::regprocedure,
                    -- ⚠️ `PUBLIC` NÃO é um role com nome — é palavra-chave.
                    -- `%I` o transforma em `"PUBLIC"` e o replay morre com
                    -- `42704 role "PUBLIC" does not exist`. Medido em 01/10/2026:
                    -- o `do` é atômico, então a falha derrubou a recriação das
                    -- DUAS funções e a busca global do Sales ficou fora do ar
                    -- com a view já republicada.
                    case when g.grantee = 'PUBLIC' then 'public'
                         else quote_ident(g.grantee) end),
             E'\n')
    from information_schema.role_routine_grants g
    -- ⚠️ Casa por `specific_name` (nome + oid), nunca só pelo nome: com
    -- sobrecarga, o nome sozinho devolveria os grants da função errada.
    where g.specific_schema = 'public'
      and g.specific_name   = p.proname || '_' || p.oid
  ), '')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'public.carbo_vendas_metrica'::regtype
on conflict (assinatura) do update
  set definicao = excluded.definicao, grants = excluded.grants, salvo_em = now();

-- ⚠️ CONFIRA ANTES DE SEGUIR: tem de vir DUAS linhas, com `definicao` longa.
-- Zero aqui significa que o BLOCO 3 não terá o que recriar — e aí o BLOCO 2
-- apaga as funções para sempre.
select assinatura, length(definicao) as tamanho, grants <> '' as tem_grants
from public.carbo_backup_20261029;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — derrubar e republicar a view                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A ORDEM é obrigatória: as funções dependem do TIPO da view, então saem
-- primeiro. Nenhum CASCADE.
--
-- ⚠️ E as reloptions e os grants são REPOSTOS: `security_invoker = true` nas
-- duas views (conferido em `pg_class.reloptions`). View que volta sem invoker
-- roda com os privilégios do DONO e ignora RLS — foi assim que a
-- `bling2_esteira` vazou a logística inteira da Carbo.

drop function if exists public.carbo_vendas_busca(text, integer);
drop function if exists public.carbo_pdv_pedidos(text);
drop view     if exists public.carbo_vendas_nf_cancelada;
drop view     if exists public.carbo_vendas_metrica;

create view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  coalesce(n.numero,   n2.numero)   as nf_numero,
  coalesce(n.situacao, n2.situacao) as nf_situacao,
  public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao) as nf_valida,
  -- ⚠️ `nf_invalida` é COLUNA BOOLEANA, fora do CASE, e é por ela que a
  -- `carbo_vendas_nf_cancelada` filtra. `motivo_fora` é rótulo de TELA e tem
  -- PRECEDÊNCIA: filtrar por aquela string faria um caso novo no CASE mudar,
  -- calado, o que outra view significa.
  public.carbo_nf_invalida(n.situacao)
    or (n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)) as nf_invalida,

  public.carbo_natureza_e_bonificacao(nat.natureza)   as e_bonificacao,
  -- Coluna NOVA: o irmão da bonificação. Os dois tiram do faturamento por
  -- razões diferentes, e quem lê precisa separar os dois sem depender do
  -- rótulo de tela.
  public.carbo_natureza_sem_faturamento(nat.natureza) as sem_faturamento,

  coalesce(o.sale_date, o.created_at::date) as data_efetiva,

  (o.status <> all (array['quote'::order_status, 'cancelled'::order_status]))
    and not public.carbo_natureza_e_bonificacao(nat.natureza)
    and not public.carbo_natureza_sem_faturamento(nat.natureza)
    and (
      public.carbo_nf_valida(n.situacao)
      or public.bling2_nf_e_valida(n2.situacao)
      or (o.status = any (array['invoiced'::order_status, 'shipped'::order_status, 'delivered'::order_status]))
    ) as conta_metrica,

  case
    -- Estado do PEDIDO primeiro.
    when o.status = 'quote'::order_status     then 'orcamento'::text
    when o.status = 'cancelled'::order_status then 'cancelado'::text
    -- Depois a NATUREZA da nota. ⚠️ A posição é a regra: antes de
    -- `nf_invalida`/`aguardando_nf`, porque nota de bonificação ou de remessa
    -- não tem nada de inválida, e "aguardando emissão" mandaria alguém emitir
    -- uma segunda.
    when public.carbo_natureza_e_bonificacao(nat.natureza)   then 'bonificacao'::text
    when public.carbo_natureza_sem_faturamento(nat.natureza) then 'remessa_entrega_futura'::text
    -- Por último o estado da NOTA.
    when public.carbo_nf_invalida(n.situacao) then 'nf_invalida'::text
    when n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao) then 'nf_invalida'::text
    when not public.carbo_nf_valida(n.situacao)
         and not public.bling2_nf_e_valida(n2.situacao)
         and (o.status <> all (array['invoiced'::order_status, 'shipped'::order_status, 'delivered'::order_status]))
      then 'aguardando_nf'::text
    else null::text
  end as motivo_fora
from public.carboze_orders o
left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id
-- ⚠️ A natureza, num lugar SÓ. Ela aparecia QUATRO vezes no corpo desta view
-- — em `e_bonificacao`, em `conta_metrica` e duas no CASE. Quatro cópias de
-- uma regra fiscal são quatro lugares para divergir, e divergir aqui não dá
-- erro: dá dinheiro contado diferente conforme a coluna.
--
-- ⚠️ E a ORDEM do coalesce importa: `n2.natureza_operacao` vem ANTES do
-- `n2.raw_data`, porque o detalhe da conta 2 nunca traz `naturezaOperacao`. O
-- `raw_data` fica por último como rede, para o dia em que o Bling mandá-la.
left join lateral (
  select coalesce(
    (n.raw_data  -> 'naturezaOperacao') ->> 'id',
    n2.natureza_operacao,
    (n2.raw_data -> 'naturezaOperacao') ->> 'id'
  ) as natureza
) nat on true;

comment on view public.carbo_vendas_metrica is
  'carboze_orders + o estado fiscal da nota. conta_metrica diz se o pedido entra no faturamento; motivo_fora diz por que nao entra (ROTULO de tela, com precedencia — nao use como chave de filtro, use as colunas booleanas). A natureza e resolvida num LATERAL unico e vale para as DUAS contas: id na matriz, descricao na filial.';

grant all on public.carbo_vendas_metrica to anon, authenticated, service_role;


-- A dependente, byte a byte como `pg_get_viewdef` devolveu.
create view public.carbo_vendas_nf_cancelada
with (security_invoker = true) as
 SELECT o.order_number,
    o.customer_name,
    o.total,
    o.bling_conta,
    COALESCE(o.invoice_number, o.invoice2_number) AS nf_numero,
    m.nf_situacao,
    o.sale_date,
    o.updated_at
   FROM carboze_orders o
     JOIN carbo_vendas_metrica m ON m.id = o.id
  WHERE m.nf_invalida AND (o.status <> ALL (ARRAY['quote'::order_status, 'cancelled'::order_status]));

grant all on public.carbo_vendas_nf_cancelada to anon, authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — devolver as funções, do backup                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Reexecuta o texto que o PRÓPRIO BANCO devolveu. Nenhuma transcrição: os
-- corpos têm regex com barras invertidas, e uma barra a mais quebra a busca
-- global do Sales sem erro de sintaxe nenhum.

-- ⚠️ CONSERTO DE 01/10/2026, aplicado em produção: a primeira versão gerava
-- `to "PUBLIC"` e o replay morreu com `42704 role "PUBLIC" does not exist`. O
-- `do` é atômico, então NENHUMA das duas funções voltou — a view já estava
-- republicada e a busca global do Sales ficou fora. Quem já tem backup gravado
-- com o texto velho conserta sem regerar nada (regerar é IMPOSSÍVEL: as funções
-- já não existem, e a tabela é a única cópia):
--
--   update public.carbo_backup_20261029
--      set grants = replace(grants, ' to "PUBLIC";', ' to public;')
--    where grants like '% to "PUBLIC";%';

do $recria$
declare
  r record;
  n int := 0;
begin
  for r in select assinatura, definicao, grants from public.carbo_backup_20261029 loop
    execute r.definicao;
    if r.grants <> '' then execute r.grants; end if;
    n := n + 1;
  end loop;

  if n = 0 then
    -- ⚠️ Falha ALTO. Zero aqui com as funções já derrubadas significa que elas
    -- não existem mais em lugar nenhum — e um aviso silencioso faria isso só
    -- aparecer quando alguém usasse a busca do Sales.
    raise exception 'O backup estava VAZIO: as funções não foram recriadas. Restaure de uma migração anterior ANTES de continuar.';
  end if;

  raise notice '% funções recriadas', n;
end $recria$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ As duas funções voltaram? ESPERADO: DUAS linhas.
-- select p.oid::regprocedure as assinatura
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prorettype = 'public.carbo_vendas_metrica'::regtype;

-- (b) A busca global do Sales responde? ESPERADO: linhas da Brisanet.
-- select order_number, customer_name, total
-- from public.carbo_vendas_busca('brisanet', 5);

-- (c) As views voltaram com invoker? ESPERADO: as duas com
--     {security_invoker=true}. Vazio é o furo da `bling2_esteira`.
-- select relname, reloptions from pg_class
-- where relname in ('carbo_vendas_metrica', 'carbo_vendas_nf_cancelada');

-- (d) O faturamento novo. ESPERADO: 1.302 − 6 = **1.296 pedidos**, e
--     940.937,41 − 11.050,00 = **R$ 929.887,41** … MENOS a bonificação da
--     filial, que também sai agora. Se der diferente dos dois valores, o que
--     mudou não foi só o que eu previ — pare e meça com a (e).
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (e) Quem saiu, e por qual motivo — os dois SEPARADOS, que é a razão de
--     existir um rótulo próprio.
-- select motivo_fora, count(*) as pedidos, sum(total) as valor
-- from public.carbo_vendas_metrica
-- where motivo_fora in ('bonificacao', 'remessa_entrega_futura')
-- group by 1 order by 3 desc;

-- (f) A dependente continua respondendo?
-- select count(*) as notas_canceladas from public.carbo_vendas_nf_cancelada;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — limpar o backup. SÓ DEPOIS da conferência (a) e (b).        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Enquanto esta tabela existir, as funções têm cópia. Apagá-la antes de
-- conferir troca uma rede por nada.

-- drop table public.carbo_backup_20261029;
