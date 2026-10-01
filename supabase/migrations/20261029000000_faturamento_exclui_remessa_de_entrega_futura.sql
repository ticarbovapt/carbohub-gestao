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
--   R$ 11.050   já contados em dobro
--   R$ 25.480   viriam nas 14 parcelas restantes, até abril/27
--
-- O catálogo (`carbo_naturezas_fiscais`, `20261028`) mostra 12 notas nessa
-- natureza, R$ 38.610 — a conferência (c) mede quanto disso estava mesmo
-- entrando no faturamento.
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
-- zero. A natureza da filial mora na coluna `natureza_operacao`, preenchida a
-- partir do `<natOp>` do XML, e a view não a lia. Resultado: **a bonificação da
-- filial contava como receita** (`Saida em bonificacao`, 2 notas, R$ 1.908,80),
-- e a regra da `20260981` valia só para a matriz sem ninguém saber.
--
-- ⚠️ A expressão da natureza foi para um LATERAL, num lugar só. Ela aparecia
-- QUATRO vezes no corpo da view — em `e_bonificacao`, em `conta_metrica` e
-- duas no `CASE` do `motivo_fora`. Quatro cópias de uma regra fiscal são quatro
-- lugares para divergir, e divergir aqui não dá erro: dá dinheiro contado
-- diferente conforme a coluna.
--
-- ⚠️ RODE EM BLOCOS, e o BLOCO 0 ANTES.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. O número de ANTES. Anote.                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Sem ele não existe conferência: o BLOCO 3 compara contra ISTO, e "parece
-- certo" não é medida. Era exatamente o que faltava quando a natureza mudou de
-- comparação, horas atrás.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (b) E quem são os afetados, nominalmente. Esta lista TEM de sumir do
--     faturamento depois — e só ela.
-- select o.order_number, o.customer_name, o.total, o.sale_date
-- from public.carbo_vendas_metrica o
-- left join public.bling_nfe  n  on n.bling_id  = o.bling_nf_id
-- left join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id
-- where o.conta_metrica
--   and public.carbo_natureza_sem_faturamento(coalesce(
--         (n.raw_data -> 'naturezaOperacao') ->> 'id',
--         n2.natureza_operacao,
--         (n2.raw_data -> 'naturezaOperacao') ->> 'id'))
-- order by o.total desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — republicar a view e a dependente                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ A dependente foi lida do BANCO (`pg_depend`), e é UMA — não três, como o
-- CLAUDE.md dizia. As outras duas já não existem. Lista de dependente vinda do
-- repositório é como a `20260981` levou um `2BP01` na cara.
--
-- ⚠️ NUNCA `DROP ... CASCADE`: cascade apaga a dependente em silêncio e ela
-- some do sistema sem erro. Aqui ela é dropada e recriada EXPLICITAMENTE, com
-- o corpo que `pg_get_viewdef` devolveu.
--
-- ⚠️ E as reloptions e os grants são REPOSTOS: `security_invoker = true` nas
-- duas (conferido em `pg_class.reloptions`), e o DROP leva os grants junto.
-- View que volta sem invoker roda com os privilégios do DONO e ignora RLS —
-- foi assim que a `bling2_esteira` vazou a logística inteira.

drop view if exists public.carbo_vendas_nf_cancelada;
drop view if exists public.carbo_vendas_metrica;

create view public.carbo_vendas_metrica
with (security_invoker = true) as
select
  o.*,
  coalesce(n.numero,  n2.numero)   as nf_numero,
  coalesce(n.situacao, n2.situacao) as nf_situacao,
  public.carbo_nf_valida(n.situacao) or public.bling2_nf_e_valida(n2.situacao) as nf_valida,
  -- ⚠️ `nf_invalida` é COLUNA BOOLEANA, fora do CASE, e é por ela que a
  -- `carbo_vendas_nf_cancelada` filtra. `motivo_fora` é rótulo de TELA e tem
  -- precedência: filtrar por aquela string faria um caso novo no CASE mudar,
  -- calado, o que outra view significa.
  public.carbo_nf_invalida(n.situacao)
    or (n2.bling_id is not null and not public.bling2_nf_e_valida(n2.situacao)) as nf_invalida,

  public.carbo_natureza_e_bonificacao(nat.natureza)   as e_bonificacao,
  -- Coluna NOVA: o irmão da bonificação. Os dois tiram do faturamento, por
  -- razões diferentes, e quem lê precisa poder separar os dois sem depender do
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
-- ⚠️ A natureza, num lugar SÓ. Ela aparecia quatro vezes no corpo desta view.
--
-- ⚠️ E a ORDEM do coalesce importa: `n2.natureza_operacao` vem ANTES do
-- `n2.raw_data`, porque o detalhe da conta 2 nunca traz `naturezaOperacao` —
-- a natureza da filial vem do `<natOp>` do XML e mora na coluna. O
-- `n2.raw_data` fica por último como rede, para o dia em que o Bling passar a
-- mandá-la.
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
-- ║ BLOCO 2 — as duas views voltaram inteiras?                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: as DUAS com {security_invoker=true}. Vazio aqui é o furo da
-- `bling2_esteira`.
-- select relname, reloptions from pg_class
-- where relname in ('carbo_vendas_metrica', 'carbo_vendas_nf_cancelada');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) O novo faturamento. Compare com o BLOCO 0: a diferença tem de ser
--     EXATAMENTE a soma da lista 0.(b), mais a bonificação da filial.
-- select count(*) as pedidos_que_contam, sum(total) as faturamento
-- from public.carbo_vendas_metrica where conta_metrica;

-- (b) Quem saiu, e por qual motivo. ⚠️ Os dois motivos aparecem separados —
--     é essa separação que a migração existe para preservar.
-- select motivo_fora, count(*) as pedidos, sum(total) as valor
-- from public.carbo_vendas_metrica
-- where motivo_fora in ('bonificacao', 'remessa_entrega_futura')
-- group by 1 order by 3 desc;

-- (c) ⚠️ A bonificação da FILIAL, que até agora contava. ESPERADO: as duas
--     notas (`Saida em bonificacao`) com motivo_fora = 'bonificacao'.
-- select o.order_number, o.total, o.bling_conta, n2.numero, n2.natureza_operacao,
--        o.motivo_fora, o.conta_metrica
-- from public.carbo_vendas_metrica o
-- join public.bling2_nfe n2 on n2.bling_id = o.bling2_nf_id
-- where public.carbo_natureza_e_bonificacao(n2.natureza_operacao);

-- (d) A dependente continua respondendo?
-- select count(*) as notas_canceladas from public.carbo_vendas_nf_cancelada;

-- (e) ⚠️ A lista de trabalho do catálogo. Depois desta migração ela continua
--     com as duas naturezas não classificadas que ele já achou
--     (`15110656619`, R$ 4.314,50 e `15109234302`, R$ 315) — elas são DECISÃO
--     fiscal, e classificá-las por conta própria seria inventar resposta.
-- select * from public.carbo_naturezas_fiscais
-- where suspeita_de_remessa order by valor desc;
