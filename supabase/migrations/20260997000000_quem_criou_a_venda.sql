-- ═══════════════════════════════════════════════════════════════════════════
-- Quem CRIOU a venda é outra pessoa que quem VENDE — e o sistema não guardava
--
-- Pedido do dono do processo em 22/09/2026: "algumas vezes quem cria a venda é
-- uma pessoa e atribui a venda para o vendedor que vai receber a comissão".
-- A tela `/vendas` mostra `vendedor_id` (de quem é a venda, e a comissão);
-- faltava quem DIGITOU.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ A COLUNA JÁ EXISTIA E ESTAVA VAZIA — esse é o ponto
--
-- `carboze_orders.created_by` nasceu em 20260203190753. Mas quem a preenche é
-- só o `/orders/new` da RAIZ (`src/hooks/useCarbozeOrders.ts`). O `/vender` dos
-- SETE apps — que é onde essas vendas são feitas hoje — nunca a escreveu:
-- `buildOrderFields()` (em `hooks/useVendas.ts`) monta 30 campos e nenhum deles
-- é `created_by`.
--
-- Ou seja: acrescentar a coluna na tela SEM isto aqui daria uma coluna de
-- travessões. É a doença conhecida deste repo — a `20260941` importou endereço
-- em 70 PDVs e a tela não sabia que o campo existia; aqui seria o inverso, a
-- tela sabendo de um campo que ninguém grava.
--
-- ⚠️ E o passado NÃO é recuperável. Venda criada pelo CRM antes desta migração
-- tem `created_by` nulo e não há de onde tirar: `order_status_history` só
-- registra MUDANÇA de status, e o INSERT não gera linha. A tela mostra "—", e
-- isso é honesto. Inferir o criador do `vendedor_id` seria pior — apagaria
-- exatamente a distinção que o dono do processo pediu para ver.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE NO BANCO, E NÃO NO `buildOrderFields`
--
-- Mesma razão da dedução de estoque da pronta entrega: o `/vender` existe em
-- SETE apps. Na tela seriam sete cópias para divergir, e divergir aqui não dá
-- erro — dá um app que grava o criador e outro que não, sem ninguém notar.
-- O gatilho é o único lugar que os sete atravessam.
--
-- ⚠️ BEFORE **INSERT**, nunca UPDATE. Orçamento é editado depois (às vezes por
-- outra pessoa, que é justamente o caso descrito); reescrever no UPDATE faria a
-- coluna significar "quem mexeu por último" com nome de "quem criou".
--
-- ⚠️ `coalesce(new.created_by, auth.uid())` — o valor explícito VENCE. É o que
-- deixa a raiz continuar gravando o que já grava, e o que permite uma carga
-- futura informar o autor real em vez do de quem rodou a carga.
--
-- ⚠️ `auth.uid()` é NULO em service role: ponte do Bling, sync do e-commerce e
-- migrações continuam com criador nulo. Certo — máquina não é pessoa, e
-- carimbar "sistema" como gente tornaria a coluna inútil para a pergunta que
-- ela responde.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a FOTO DO ANTES (leitura pura)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As duas colunas existem? `created_by_name` deve vir AUSENTE (é o que o
--     BLOCO 1 cria); `created_by` deve vir presente, uuid.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'carboze_orders'
  and column_name in ('created_by', 'created_by_name', 'vendedor_id', 'vendedor_name')
order by column_name;

-- (b) ⭐ O TAMANHO DO BURACO. Quantos pedidos têm criador gravado, por ano-mês.
--     ESPERADO: `com_criador` alto no passado antigo (a raiz gravava) e ZERO ou
--     quase zero nos meses recentes, em que a venda passou a ser feita no CRM.
--     Se vier diferente disso, PARE e me diga — significa que existe um caminho
--     de escrita que eu não encontrei no código.
select to_char(created_at, 'YYYY-MM') as mes,
       count(*) as pedidos,
       count(created_by) as com_criador,
       count(*) - count(created_by) as sem_criador
from public.carboze_orders
group by 1 order by 1 desc limit 18;

-- (c) Onde criador e vendedor DIVERGEM — o caso que o dono do processo
--     descreveu. Só enxerga o passado que tem criador gravado, então pode vir
--     vazio; isso não desmente nada, só confirma o (b).
select o.order_number, o.created_at::date as dia, o.total,
       o.created_by, o.vendedor_name,
       (o.created_by is distinct from o.vendedor_id) as criador_diferente
from public.carboze_orders o
where o.created_by is not null
order by o.created_at desc limit 25;

-- (d) Já existe gatilho mexendo em `created_by`? ESPERADO: nenhum.
--     ⚠️ Procurar CHECK não é procurar restrição, e procurar coluna não é
--     procurar gatilho — a lição da `validate_stock_movement`, que abortou a
--     dedução por três dias.
select t.tgname, pg_get_functiondef(p.oid) ilike '%created_by%' as mexe_em_created_by
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and c.relname = 'carboze_orders' and not t.tgisinternal
order by t.tgname;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna do NOME e o gatilho                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O NOME é desnormalizado, como `vendedor_name` já é — e pelo mesmo motivo:
-- `public.profiles` tem RLS com restrição por departamento, então a tela do
-- vendedor não consegue resolver o uuid de quem não é do time dele. Guardar só
-- o id daria uma coluna que aparece preenchida para o gestor e vazia para o
-- vendedor — dois valores para o mesmo dado, conforme quem olha, que é o furo
-- descrito na `20260981`.
--
-- O uuid FICA (`created_by`): o nome é rótulo e muda quando a pessoa casa; o id
-- é a identidade.

alter table public.carboze_orders
  add column if not exists created_by_name text;

comment on column public.carboze_orders.created_by_name is
  'Nome de quem CRIOU o pedido, no instante da criação. Desnormalizado como '
  'vendedor_name porque profiles tem RLS por departamento. Nulo = criado antes '
  'de 22/09/2026 (o CRM não gravava) ou por service role (ponte/sync).';

create or replace function public.carboze_orders_marca_criador()
returns trigger
language plpgsql
-- SECURITY DEFINER para conseguir LER `profiles`: a RLS por departamento faria
-- o nome vir nulo justamente quando criador e vendedor são de times diferentes
-- — que é o caso inteiro desta migração.
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  -- Explícito vence. A raiz (`/orders/new`) já manda o valor; preservá-lo é o
  -- que faz esta migração não mudar nada para ela.
  v_uid := coalesce(new.created_by, auth.uid());
  new.created_by := v_uid;

  if v_uid is not null and coalesce(new.created_by_name, '') = '' then
    select p.full_name into new.created_by_name
    from public.profiles p where p.id = v_uid;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_carboze_orders_marca_criador on public.carboze_orders;
create trigger trg_carboze_orders_marca_criador
  before insert on public.carboze_orders
  for each row execute function public.carboze_orders_marca_criador();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o nome do que JÁ tem criador                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Só preenche o NOME de quem já tem o id. ⚠️ Não inventa criador para quem está
-- nulo: não há de onde tirar, e preencher com o vendedor apagaria a distinção
-- que a coluna existe para mostrar.

update public.carboze_orders o
   set created_by_name = p.full_name
from public.profiles p
where p.id = o.created_by
  and o.created_by is not null
  and coalesce(o.created_by_name, '') = '';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ O gatilho existe e está ATIVO (`tgenabled = 'O'`). ESPERADO: 1 linha.
select t.tgname, t.tgenabled,
       (t.tgtype & 4) > 0 as no_insert,
       (t.tgtype & 16) > 0 as no_update
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'carboze_orders' and t.tgname = 'trg_carboze_orders_marca_criador';
-- ⚠️ `no_update` tem de vir FALSE. True significaria que editar um orçamento
-- reescreve o criador — a coluna passaria a dizer "quem mexeu por último".

-- (b) Quantos nomes o BLOCO 2 preencheu, e quantos seguem sem criador.
--     O segundo número é o passado irrecuperável, e ele NÃO vai a zero.
select count(*) filter (where created_by is not null and created_by_name is not null) as com_nome,
       count(*) filter (where created_by is not null and created_by_name is null)     as id_sem_nome,
       count(*) filter (where created_by is null)                                     as sem_criador,
       count(*) as total
from public.carboze_orders;
-- ⚠️ `id_sem_nome` > 0 significa uuid que não tem linha em `profiles` (usuário
-- apagado). Não é defeito desta migração — mas vale saber quantos são.

-- (c) ⭐ O TESTE DE VERDADE, e ele só passa depois de uma venda NOVA.
--     Crie um orçamento qualquer no `/vender` e rode:
select order_number, created_at, created_by, created_by_name, vendedor_name,
       (created_by is distinct from vendedor_id) as criador_diferente_do_vendedor
from public.carboze_orders
order by created_at desc limit 5;
-- ESPERADO na linha mais nova: `created_by` e `created_by_name` PREENCHIDOS.
-- Vindo nulos, o gatilho não pegou — e aí a tela vai mostrar "—" para sempre,
-- caladamente, que é o modo de falhar mais caro deste repo.
