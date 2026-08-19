-- ═══════════════════════════════════════════════════════════════════════════
-- A tela de Estoque dos Vendedores volta a mostrar as caixas
--
-- ── O sintoma ─────────────────────────────────────────────────────────────
--
-- `/suprimentos/vendedores` aparecia VAZIA — "Nenhum vendedor tem caixa ainda"
-- — mesmo com 10 vendedores marcados e 10 caixas criadas no banco. Sem erro no
-- console, sem nada no log. Só uma tela dizendo que não existe o que existe.
--
-- ── A causa, e ela é um erro meu de desenho ────────────────────────────────
--
-- `vendedor_estoque` foi criada com `security_invoker = true` — a RLS de QUEM
-- CONSULTA vale dentro da view. Isso está certo e continua valendo: sem isso a
-- view seria um furo por onde qualquer autenticado leria o que a policy nega.
--
-- O erro foi o JOIN:
--
--     join public.profiles p on p.id = w.owner_id
--
-- `profiles` tem policy por departamento:
--
--     auth.uid() is not null and can_access_profile(auth.uid(), id)
--
-- Os vendedores são do Comercial. Quem trabalha em Suprimentos não passa nessa
-- regra para o perfil deles — e como o join é INNER, a linha do perfil sumir
-- leva a CAIXA junto. O saldo estava lá, legível (as policies de
-- `warehouse_stock` liberam leitura); o que escondia tudo era o nome.
--
-- ⚠️ A lição: view com `security_invoker` herda a RLS de TODA tabela que ela
-- toca, não só da principal. Um inner join com uma tabela mais restrita vira um
-- filtro invisível — e o modo de falhar é o pior possível, porque "vazio" é uma
-- resposta plausível.
--
-- ⚠️ E o diagnóstico enganou de novo: `select * from vendedor_estoque` no SQL
-- Editor devolvia 90 linhas certinhas. O editor roda como superusuário e IGNORA
-- RLS — ele nunca reproduz o que o navegador vê. Para testar RLS é preciso
-- perguntar pela função da policy (ver a conferência no fim).
--
-- ── A correção ────────────────────────────────────────────────────────────
--
-- A view passa a ser SECURITY DEFINER, com o gate ESCRITO nela. Não é abrir
-- mão de segurança — é trocar uma regra herdada por acaso (a de leitura de
-- perfil, que existe para outra finalidade) por uma regra declarada:
--
--     quem tem acesso ao Ops vê TODAS as caixas
--     o vendedor vê a DELE
--
-- É a mesma régua da fase 0, que já governa quem edita saldo. Antes a leitura
-- estava aberta demais de um lado (qualquer autenticado, se passasse no join) e
-- fechada demais do outro (ninguém do Ops passava).
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — quem pode ver caixa                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Função separada, e não a expressão solta dentro da view, porque ela vai
-- reger a leitura em mais de um lugar (a view do Ops e a do alerta de mínimo).
-- Regra em dois lugares é regra que diverge.

create or replace function public.carbo_pode_ver_caixa(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- ⚠️ SEM SESSÃO = pode. Parece o oposto do padrão deste projeto ("ausência
    -- fecha"), e é uma exceção deliberada e estreita:
    --
    -- o cron do alerta de estoque baixo roda como service_role, sem auth.uid().
    -- Com a regra fechando aqui, `vendedor_estoque_baixo` devolveria zero
    -- linhas e o alerta diário morreria em silêncio — exatamente o tipo de
    -- falha que este projeto já pagou caro (25 h de sync morto com o pg_cron
    -- marcando `succeeded`).
    --
    -- O que impede isso de ser um furo: `anon` NÃO tem grant nesta view nem na
    -- tabela. Sem sessão só chega aqui quem já é service_role/postgres — que
    -- por definição lê tudo de qualquer jeito.
    auth.uid() is null
    or public.carbo_pode_mexer_estoque()   -- admin, CEO ou flag do Carbo Ops
    or p_owner = auth.uid();               -- o vendedor vê a caixa dele
$$;

comment on function public.carbo_pode_ver_caixa is
  'Pode ver a caixa deste vendedor? Quem tem acesso ao Ops vê todas; o vendedor vê a dele. auth.uid() nulo devolve true de propósito: é o cron do alerta, e `anon` não tem grant na view.';

grant execute on function public.carbo_pode_ver_caixa(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Mesmas colunas, mesma ordem, mesmos tipos — só a regra de visibilidade muda.
-- (Se um dia precisar acrescentar coluna aqui, vá para o FIM: `vendedor_estoque_baixo`
-- depende desta view e um DROP exigiria CASCADE.)

create or replace view public.vendedor_estoque
with (security_invoker = false) as
select
  w.id            as warehouse_id,
  w.code          as warehouse_code,
  w.name          as warehouse_name,
  w.is_active,
  w.owner_id      as vendedor_id,
  -- ⚠️ LEFT JOIN e coalesce. Com SECURITY DEFINER o inner join voltaria a
  -- funcionar, mas continuaria escondendo a caixa de um vendedor cujo perfil
  -- fosse apagado — e sumir com uma caixa QUE TEM SALDO por causa de um
  -- cadastro é perder estoque físico de vista. O nome é enfeite; o saldo não.
  coalesce(p.full_name, 'Vendedor sem cadastro') as vendedor_nome,
  p.avatar_url    as vendedor_avatar,
  pr.id           as product_id,
  pr.product_code,
  pr.name         as product_name,
  pr.stock_unit,
  coalesce(ws.quantity, 0)::numeric as quantidade,
  ws.updated_at   as saldo_em
from public.warehouses w
left join public.profiles p on p.id = w.owner_id
cross join public.mrp_products pr
left join public.warehouse_stock ws
       on ws.warehouse_id = w.id and ws.product_id = pr.id
where w.kind = 'vendedor'
  and pr.is_active
  and pr.category = 'Produto Final'
  and pr.bonificacao_de is null          -- o gêmeo de bonificação não é produto de prateleira
  and public.carbo_pode_ver_caixa(w.owner_id);

comment on view public.vendedor_estoque is
  'Saldo por vendedor e produto. Traz linha ZERADA para produto sem saldo de propósito: é o que falta na caixa. ⚠️ SECURITY DEFINER com gate explícito (carbo_pode_ver_caixa): com security_invoker o inner join em profiles fazia a policy de departamento esconder TODAS as caixas de quem trabalha em Suprimentos — tela vazia, sem erro.';

grant select on public.vendedor_estoque to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A PROVA do problema, e a única forma de vê-lo pelo SQL Editor.
--     O editor roda como superusuário e ignora RLS, então `select * from
--     vendedor_estoque` sempre pareceu certo. Aqui a gente pergunta direto à
--     função da policy: o fulano do Ops consegue ler o perfil do vendedor?
--
--     ⚠️ Troque o UUID pelo de quem reclamou que a tela estava vazia.
--     `false` em todas as linhas é exatamente o que derrubava a tela.
--
-- select p.full_name as vendedor,
--        public.can_access_profile('<UUID_DE_QUEM_RECLAMOU>'::uuid, p.id) as conseguia_ler_o_perfil
-- from public.profiles p
-- where coalesce(p.is_vendedor, false)
-- order by 1;

-- (b) As caixas continuam todas lá (visão de superusuário).
select count(distinct vendedor_id) as vendedores, count(*) as linhas
from public.vendedor_estoque;

-- (c) Quem passa a enxergar tudo. Se o time de Suprimentos NÃO estiver aqui,
--     a tela continua vazia para eles — o conserto é a flag, no Carbo Admin.
select p.full_name, p.allowed_interfaces
from public.profiles p
where p.id in (
  select id from public.profiles
  where 'carbo_ops'     = any (select lower(x) from unnest(coalesce(allowed_interfaces,'{}')) x)
     or 'carbo_ops_app' = any (select lower(x) from unnest(coalesce(allowed_interfaces,'{}')) x)
)
order by p.full_name;

-- (d) O alerta de mínimo continua enxergando? Tem de devolver sem erro — é o
--     caminho que roda sem auth.uid() e que a exceção do BLOCO 1 protege.
select count(*) as linhas_no_alerta from public.vendedor_estoque_baixo;

-- (e) Onde está o saldo hoje. Só 2 linhas com saldo no diagnóstico — confira
--     se é isso mesmo ou se falta abastecer.
select vendedor_nome, product_name, quantidade
from public.vendedor_estoque
where quantidade > 0
order by 1, 2;
