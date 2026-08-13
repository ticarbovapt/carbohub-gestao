-- ═══════════════════════════════════════════════════════════════════════════
-- Bonificação — o gêmeo carrega o preço do pai
--
-- ⚠️ Correção da 20260900, que gravou `sale_price = 0` nos gêmeos.
--
-- Zero funciona (a linha soma zero), mas apaga a informação que dá sentido
-- comercial à bonificação: quanto o cliente GANHOU. Com preço zero o orçamento
-- imprime "R$ 0,00 × 10 = R$ 0,00", e o brinde vira uma linha sem valor.
--
-- Com o preço do pai + 100% de desconto, imprime "R$ 133,68 × 10 · desconto
-- 100% · R$ 0,00" — o cliente vê o tamanho do presente, que é justamente o
-- argumento de quem deu.
--
-- Quem aplica os 100% é a TELA (Vender.tsx), travado: linha de gêmeo não tem
-- desconto editável. Aqui só garantimos que o preço exista para ser descontado.
--
-- ⚠️ E o preço precisa acompanhar o pai para sempre. Preço de tabela muda; se o
-- gêmeo congelasse no valor de hoje, seis meses depois o orçamento mostraria
-- uma bonificação com preço velho — e ninguém confere o valor de uma linha que
-- termina em zero.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — alinhar os gêmeos que já existem                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

update public.mrp_products b
   set sale_price = p.sale_price
  from public.mrp_products p
 where b.bonificacao_de = p.id
   and b.sale_price is distinct from p.sale_price;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — e continuar acompanhando                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O preço é definido em Admin › Tabela de preços (RPC carbo_set_product_price),
-- que faz UPDATE em mrp_products. O gatilho pega qualquer caminho — inclusive
-- um UPDATE manual no SQL Editor.

create or replace function public.carbo_bonificacao_espelha_preco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mrp_products
     set sale_price = new.sale_price
   where bonificacao_de = new.id
     and sale_price is distinct from new.sale_price;
  return new;
end;
$$;

set lock_timeout = '5s';

drop trigger if exists trg_bonificacao_espelha_preco on public.mrp_products;
create trigger trg_bonificacao_espelha_preco
  after update of sale_price on public.mrp_products
  for each row
  -- Só o PAI dispara. Sem esta guarda o UPDATE do gatilho dispararia o gatilho
  -- de novo — recursão infinita no primeiro ajuste de preço.
  when (new.bonificacao_de is null)
  execute function public.carbo_bonificacao_espelha_preco();

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o gêmeo nasce já com o preço certo                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Substitui a versão da 20260900 que gravava zero.

create or replace function public.carbo_bonificacao_gemeo(p_produto uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  p record;
begin
  select id into v_id from public.mrp_products where bonificacao_de = p_produto;
  if v_id is not null then
    return v_id;
  end if;

  select * into p from public.mrp_products where id = p_produto;
  if not found then
    raise exception 'Produto % não existe.', p_produto using errcode = 'no_data_found';
  end if;

  if p.bonificacao_de is not null then
    return p.id;
  end if;

  insert into public.mrp_products
    (product_code, name, category, stock_unit, sale_price, is_active, bonificacao_de)
  values
    (p.product_code || '-BON', p.name || ' - bonificação', p.category, p.stock_unit,
     p.sale_price, p.is_active, p.id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.carbo_bonificacao_gemeo is
  'Cria (ou devolve) o produto de bonificação. O preço ESPELHA o do pai: é ele que o orçamento mostra sendo descontado a 100%, e é assim que o cliente enxerga o tamanho do brinde. Quem trava os 100% é a tela.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Tem de vir VAZIO: nenhum gêmeo com preço diferente do pai.
select b.product_code, b.sale_price as preco_gemeo, p.sale_price as preco_pai
from public.mrp_products b
join public.mrp_products p on p.id = b.bonificacao_de
where b.sale_price is distinct from p.sale_price;
