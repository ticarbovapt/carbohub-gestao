-- ═══════════════════════════════════════════════════════════════════════════
-- O código do BLING não é o código do nosso catálogo — e isso partia o produto
--
-- Medido em 24/09/2026, no censo dos itens das vendas da equipe:
--
--   CARBOZÉ ESTABILIZADOR E OTIMIZADOR 100ML …   sku_code 035   6.813 un.
--   CarboZé 100ml                                CZ100         10.598 un.
--   CarboZé 100ml                                (sem código)     402 un.
--
-- São o MESMO produto, em três cards diferentes no painel. A causa é que o
-- Bling tem catálogo próprio, com numeração própria (034, 035, 072, 084, 120),
-- e o item importado guarda o código DELE — nunca o `product_id` daqui.
--
-- ⚠️ Isto é CADASTRO, não código. Mesma razão do `sku_product_mappings` do
-- e-commerce: produto novo no Bling entra com um INSERT, sem deploy. Uma lista
-- escrita no TypeScript seria mais uma cópia de cadastro para divergir — e
-- divergir aqui não dá erro, dá produto partido em dois cards.
--
-- ⚠️ E o alias resolve para `mrp_products`, NUNCA para a tabela `sku`: aquela
-- tem id próprio e é outra coisa. O que o painel, o estoque e a bonificação
-- entendem é `mrp_products.id`.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_produto_alias (
  -- O código como ele chega no item. Guardado em MAIÚSCULA e sem espaço, e a
  -- leitura normaliza igual: '035' e ' 035 ' são o mesmo cadastro, e deixar os
  -- dois entrarem criaria duas linhas que dizem a mesma coisa.
  codigo      text primary key,
  product_id  uuid not null references public.mrp_products(id),
  -- De onde vem esse código. Não é decoração: o dia em que uma segunda conta
  -- Bling (ou outro ERP) trouxer o código '035' apontando para outro produto,
  -- é esta coluna que mostra que a chave precisa virar (fonte, codigo).
  fonte       text not null default 'bling1',
  observacao  text,
  created_at  timestamptz not null default now()
);

comment on table public.carbo_produto_alias is
  'Código de catálogo EXTERNO (Bling) -> produto do nosso catálogo. Cadastro: '
  'produto novo entra com INSERT, sem deploy. Ver 20261008000000.';

alter table public.carbo_produto_alias enable row level security;

-- Leitura para o time interno, pelo motivo de sempre: o portal de lojas e o de
-- licenciados usam a MESMA tabela `profiles`. Escrita não tem policy — quem
-- grava é a service role ou o SQL Editor, que passam por cima da RLS.
drop policy if exists carbo_produto_alias_leitura on public.carbo_produto_alias;
create policy carbo_produto_alias_leitura on public.carbo_produto_alias
  for select to authenticated
  using (public.carbo_e_time_interno());

-- ── A carga inicial ────────────────────────────────────────────────────────
-- ⚠️ Casa por `product_code` do NOSSO catálogo, não por uuid escrito à mão:
-- uuid colado numa migração é um valor que só vale neste banco, e a migração
-- passaria calada noutro. Se o código não existir, a linha simplesmente não
-- entra — e a conferência abaixo mostra isso.
insert into public.carbo_produto_alias (codigo, product_id, fonte, observacao)
select v.codigo, p.id, 'bling1', v.obs
from (values
  ('034', 'CZ1L',               'CARBOZÉ ESTABILIZADOR E OTIMIZADOR 1 L'),
  ('035', 'CZ100',              'CARBOZÉ ESTABILIZADOR E OTIMIZADOR 100ML'),
  ('072', 'CP100',              'CARBOPRO ESTABILIZADOR E OTIMIZADOR 100ML'),
  ('084', 'CARB-SACH-10ML',     'CARBOZÉ SACHÊ 10ML (avulso)'),
  ('120', 'KIT-CARB-SACH-10ML', 'KIT CARBOZÉ 10 SACHÊS 10 ML')
) as v(codigo, product_code, obs)
join public.mrp_products p on p.product_code = v.product_code
on conflict (codigo) do nothing;

-- ⚠️ `do nothing`, nunca `do update`: rodar de novo não pode desfazer uma
-- correção manual feita depois. Migração idempotente que anda para trás é pior
-- que migração que falha.

-- ── Acréscimo de 24/09/2026: o código 020 ─────────────────────────────────
-- Confirmado pela equipe comercial contra o histórico de preço: as nove linhas
-- do 020 são CarboZé 100 ml. Sete delas vêm com a quantidade deslocada em duas
-- casas (7500 × R$ 0,116 = R$ 870, que são 75 un. a R$ 11,60) e a leitura
-- corrige isso pelo par preço/quantidade — ver `corrigirEscala` no
-- `useUnidadesVendidas.ts`. Aqui só o produto.
insert into public.carbo_produto_alias (codigo, product_id, fonte, observacao)
select '020', p.id, 'bling1', 'CARBOZÉ - ESTABILIZADOR E OTIMIZADOR DE COMBUSTIVEIS (cadastro antigo)'
from public.mrp_products p
where p.product_code = 'CZ100'
on conflict (codigo) do nothing;
