-- ═══════════════════════════════════════════════════════════════════════════
-- Quem APARECE no dropdown do /vender — um interruptor por produto
--
-- Pedido do dono do processo em 29/09/2026: *"tem produto demais aparecendo no
-- dropdown do /vender … tá muito esquisito, o dropdown lotado de coisa, difícil
-- de achar os itens"*.
--
-- Medido no mesmo dia, e o número explica o incômodo: **11 produtos reais e 11
-- gêmeos de bonificação = 22 linhas**, mais as faixas de preço. Metade da lista
-- é gêmeo, e gêmeo é usado em uma venda a cada muitas.
--
-- ⚠️ COLUNA NOVA, NUNCA `is_active`. Esta é a decisão inteira, e reusar
-- `is_active` seria o atalho óbvio e errado: ele governa o sistema TODO —
-- MRP, produção, grade de Suprimentos, caixa de vendedor, mapa de SKU.
-- Desativar um produto para tirá-lo do dropdown o tiraria do ESTOQUE junto, e
-- o saldo que existe na prateleira sumiria da tela sem erro nenhum. Some com
-- estoque físico de vista, que é o defeito que a `20260915` já evitou uma vez
-- ao trocar o inner join de `profiles` por left join.
--
-- ⚠️ E NÃO É `sale_price is null`. Produto sem preço já é recusado pelo
-- /vender, mas "não tem preço" e "não quero na lista" são perguntas
-- diferentes: a primeira é lacuna de configuração, a segunda é decisão. Juntar
-- as duas faria esconder um produto virar apagar o preço dele.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quantas linhas o dropdown tem hoje?                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select
--   count(*) filter (where bonificacao_de is null and preco_de is null) as reais,
--   count(*) filter (where bonificacao_de is not null)                  as gemeos,
--   count(*) filter (where preco_de is not null)                        as faixas,
--   count(*)                                                            as total_no_dropdown
-- from public.mrp_products
-- where is_active and category = 'Produto Final';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `default true`: nasce APARECENDO. O contrário esconderia o catálogo
-- inteiro no instante da migração e o /vender ficaria sem produto nenhum — uma
-- migração que apaga a operação viva sem dar erro. Quem some é quem for
-- marcado, um a um, na tela.

alter table public.mrp_products
  add column if not exists aparece_no_vender boolean not null default true;

comment on column public.mrp_products.aparece_no_vender is
  'Se este produto aparece no dropdown do /vender. NAO e `is_active`: aquele governa MRP, producao e estoque, e desativar para esconder da lista sumiria com saldo fisico da tela. NAO e `sale_price is null`: "sem preco" e lacuna de configuracao, "escondido" e decisao. Nasce true — o contrario esvaziaria o catalogo no instante da migracao.';

create index if not exists idx_mrp_products_aparece_no_vender
  on public.mrp_products (aparece_no_vender) where not aparece_no_vender;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — quem pode mudar                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mesmo molde do `carbo_set_product_price`: RPC gestor-gated, e não uma policy
-- de UPDATE em `mrp_products`. Policy ali abriria a tabela inteira do catálogo
-- para quem só deveria mexer numa coluna.

create or replace function public.carbo_produto_no_vender(p_produto uuid, p_aparece boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  update public.mrp_products
     set aparece_no_vender = coalesce(p_aparece, true)
   where id = p_produto;

  if not found then
    raise exception 'Produto % não existe.', p_produto using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.carbo_produto_no_vender is
  'Liga/desliga a aparicao de um produto no dropdown do /vender. RPC gestor-gated em vez de policy de UPDATE: policy abriria a tabela inteira do catalogo para quem so deveria mexer numa coluna.';

revoke all on function public.carbo_produto_no_vender(uuid, boolean) from public;
grant execute on function public.carbo_produto_no_vender(uuid, boolean) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A coluna nasceu e TUDO continua aparecendo? ESPERADO: escondidos = 0.
--     ⚠️ Zero aqui é o certo no dia da migração: ela entrega o INTERRUPTOR,
--     não a decisão. Esconder é trabalho de quem conhece o catálogo.
-- select
--   count(*) filter (where aparece_no_vender)     as aparecem,
--   count(*) filter (where not aparece_no_vender) as escondidos
-- from public.mrp_products
-- where is_active and category = 'Produto Final';

-- (b) Depois de esconder pela tela: o que sumiu do dropdown, e o que ainda
--     está nele. ⚠️ Produto escondido CONTINUA no estoque, na produção e no
--     MRP — é só a lista de venda que muda.
-- select product_code, name, aparece_no_vender,
--        case when bonificacao_de is not null then 'gêmeo de bonificação'
--             when preco_de is not null       then 'faixa de preço'
--             else 'produto' end as tipo
-- from public.mrp_products
-- where is_active and category = 'Produto Final'
-- order by aparece_no_vender, name;
