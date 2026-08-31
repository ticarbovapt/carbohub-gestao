-- ═══════════════════════════════════════════════════════════════════════════
-- Uma lista só do que é VENDA — e ela já existia
--
-- ── A divergência ────────────────────────────────────────────────────────
--
-- `public.ecommerce_status_e_venda(text)` é a lista branca do sistema:
--
--     lower(coalesce(p_status,'')) in ('paid','shipped','delivered')
--
-- Ela governa o aviso de venda no sininho e o resumo mensal. Mas a dedução de
-- estoque escreveu a SUA própria cópia, na `carbo_estoque_ensaio`:
--
--     where o.status in ('paid','shipped','delivered')
--
-- Mesmos valores, sem `lower()` e sem o `coalesce`. Um status que chegasse
-- `Paid` contaria como venda no painel e **não** baixaria estoque — sem erro em
-- lugar nenhum, e a diferença só apareceria como saldo alto demais meses depois.
--
-- Duas listas para a mesma pergunta é o defeito que este repositório mais
-- pagou: a lista de interfaces internas em três lugares, o `interfaces.ts`
-- divergente, o `ALLOWED_ORIGINS` copiado nas três funções do WhatsApp. Aqui a
-- lista canônica JÁ EXISTIA e eu escrevi outra ao lado.
--
-- ── As três garantias que esta migração torna verificáveis ───────────────
--
--   1. Só venda DE VERDADE deduz     — uma lista branca, compartilhada
--   2. Cancelada DEVOLVE ao estoque  — o estorno usa a mesma lista
--   3. Pendente NÃO deduz            — `pending` não está na lista, nunca esteve
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a divergência existe hoje? (medir antes)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) Todos os status que já apareceram, e o que cada lista diz sobre eles.
--       Qualquer linha com `discordam = true` é venda contada de um jeito no
--       painel e de outro no estoque.
select o.status,
       count(*)                                                   as linhas,
       public.ecommerce_status_e_venda(o.status)                  as e_venda_canonico,
       (o.status in ('paid','shipped','delivered'))               as e_venda_no_ensaio,
       public.ecommerce_status_e_venda(o.status)
         is distinct from (o.status in ('paid','shipped','delivered')) as discordam
from public.ecommerce_orders o
group by 1 order by 2 desc;

-- (0.b) ⭐ Alguma coisa PENDENTE ou CANCELADA já foi deduzida?
--       Tem de vir ZERO nas duas colunas.
select count(*) filter (where not public.ecommerce_status_e_venda(o.status)) as deduzido_sem_ser_venda,
       count(*) filter (where lower(o.status) = 'pending')                   as pendente_deduzido,
       count(*) filter (where lower(o.status) = 'cancelled')                 as cancelado_ainda_deduzido
from public.carbo_estoque_consumo k
join public.ecommerce_orders o
  on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o ensaio passa a usar a lista canônica                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `security_invoker = true` repetido: `create or replace view` sem a cláusula
-- APAGA as reloptions, e foi assim que a `bling2_esteira` passou a rodar com os
-- privilégios do dono e RLS ignorada.
--
-- ⚠️ Mesmas colunas, MESMA ORDEM — o `create or replace` só acrescenta no fim.

create or replace view public.carbo_estoque_ensaio
with (security_invoker = true) as
select
  o.platform,
  o.order_id,
  o.platform_order_number,
  o.product_sku,
  o.product_name,
  o.quantity                                          as qtd_vendida,
  o.units_real,
  o.status,
  o.ordered_at,
  r.unidades_por_venda                                as fator,
  (o.quantity * r.unidades_por_venda)::numeric        as unidades_a_deduzir,
  coalesce(pr.bonificacao_de, r.product_id)           as product_id_alvo,
  coalesce(pai.product_code, pr.product_code)         as produto_alvo,
  coalesce(pai.name, pr.name)                         as nome_alvo,
  c.warehouse_code,
  c.ativo                                             as canal_deduz,
  case
    when r.product_id is null           then '⚠️ SKU SEM MAPEAMENTO — não deduziria nada'
    when c.platform is null             then '⚠️ canal sem configuração de galpão'
    when not c.ativo                    then 'canal desligado — não deduz'
    when pr.bonificacao_de is not null  then 'gêmeo de bonificação — baixa do produto pai'
    else                                     'deduziria'
  end                                                 as veredito
from public.ecommerce_orders o
left join lateral public.carbo_ecommerce_sku_resolve(o.platform, o.product_sku) r on true
left join public.mrp_products pr  on pr.id = r.product_id
left join public.mrp_products pai on pai.id = pr.bonificacao_de
left join public.carbo_canal_estoque c on c.platform = o.platform
-- ⭐ A lista branca do SISTEMA, não uma cópia. `pending` não está nela e nunca
--    esteve; status desconhecido também não é venda.
where public.ecommerce_status_e_venda(o.status);

comment on view public.carbo_estoque_ensaio is
  'O que a dedução de estoque FARIA, pedido a pedido, sem fazer nada. ⚠️ O que conta como venda vem de `ecommerce_status_e_venda` — a MESMA lista do sininho e do resumo mensal. Tinha uma cópia aqui sem `lower()`, e um status `Paid` contaria como venda no painel sem baixar estoque. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_estoque_ensaio to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o estorno usa a mesma lista                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Ele já devolvia ao estoque quando o pedido deixava de ser venda. O que muda é
-- QUEM decide o que é venda: passa a ser a mesma função. Sem isso, um `Paid`
-- maiúsculo faria o estorno devolver um pedido que continua pago.

create or replace function public.carbo_ecommerce_estornar_estoque(
  p_ensaio boolean default true
)
returns table (
  acao text, platform text, order_id text, produto text, unidades integer
)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select k.id, k.warehouse_id, k.product_id, k.unidades, k.platform,
           k.origem_chave, p.product_code
    from public.carbo_estoque_consumo k
    join public.mrp_products p on p.id = k.product_id
    where k.origem_tipo = 'ecommerce'
      -- Nenhuma linha do pedido continua sendo venda. ⭐ Mesma lista branca do
      -- ensaio e do resto do sistema.
      and not exists (
        select 1 from public.ecommerce_orders o
        where o.platform || ':' || o.order_id = k.origem_chave
          and public.ecommerce_status_e_venda(o.status)
      )
  loop
    acao     := case when p_ensaio then 'ENSAIO' else 'ESTORNADO' end;
    platform := r.platform;
    order_id := r.origem_chave;
    produto  := r.product_code;
    unidades := r.unidades;

    if not p_ensaio then
      update public.warehouse_stock
         set quantity = quantity + r.unidades, updated_at = now()
       where warehouse_id = r.warehouse_id and product_id = r.product_id;

      insert into public.stock_movements
        (product_id, warehouse_id, tipo, quantidade, origem, observacoes,
         ref_externa, executor)
      values
        (r.product_id, r.warehouse_id, 'entrada', r.unidades, 'ecommerce',
         'Estorno · pedido deixou de ser venda (cancelado ou devolvido)',
         r.origem_chave, 'cron:ecommerce');

      -- A linha SAI. É ela que representa "esta saída está contabilizada";
      -- sem ela o pedido volta a ser elegível se voltar a ficar pago.
      delete from public.carbo_estoque_consumo where id = r.id;
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.carbo_ecommerce_estornar_estoque is
  'Devolve ao estoque o que foi deduzido de pedido que deixou de ser venda. ⭐ O que é venda vem de `ecommerce_status_e_venda`, a mesma lista do ensaio e do sininho. ⚠️ APAGA a linha de carbo_estoque_consumo em vez de marcá-la: é a linha que significa "já contabilizado", então removê-la é o que deixa o pedido elegível de novo se voltar a ficar pago.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — as três garantias, provadas no dado real                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) ⭐ GARANTIA 1 e 3 — só venda deduz; pendente não.
--       Todo status que aparece no ensaio tem de ser venda pela lista canônica.
select status, count(*) as linhas,
       public.ecommerce_status_e_venda(status) as e_venda
from public.carbo_estoque_ensaio
group by 1, 3 order by 2 desc;

-- (3.b) ⭐ GARANTIA 2 — cancelada devolve. O ensaio do estorno mostra o que
--       SERIA devolvido agora. O cron roda isso de verdade a cada 10 min,
--       ANTES da dedução.
select * from public.carbo_ecommerce_estornar_estoque();

-- (3.c) O par completo: o que sairia e o que voltaria na próxima rodada.
select 'deduziria' as acao, count(*) as linhas
from public.carbo_ecommerce_deduzir_estoque()
union all
select 'estornaria', count(*) from public.carbo_ecommerce_estornar_estoque();

-- (3.d) ⚠️ A conferência que vale para sempre: nada fora da lista branca pode
--       ter linha no ledger. Tem de vir ZERO.
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);
