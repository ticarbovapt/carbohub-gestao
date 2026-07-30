-- ═══════════════════════════════════════════════════════════════════════════
-- Canal automático, parte 2: cliente recorrente herda o próprio histórico
--
-- O trigger de julho só sabia uma coisa: CNPJ cadastrado em `pdvs` → revenda.
-- Isso resolve a revenda e deixa de fora todo cliente recorrente que NÃO é
-- ponto de venda — o M & D Comercio Servicos e Locacoes, por exemplo, compra
-- de forma recorrente para consumo próprio. Cada pedido dele nascia sem canal
-- e alguém tinha que etiquetar à mão, de novo, todo mês.
--
-- A regra nova: se o CNPJ já comprou antes e TODO o histórico dele tem o
-- mesmo canal, o pedido novo herda esse canal.
--
-- ── Por que exigir histórico UNÂNIME ──────────────────────────────────────
-- Cliente com histórico misto (comprou como consumo e como revenda) é
-- justamente aquele em que adivinhar erra. Nesse caso o pedido nasce sem
-- canal e vai para a fila de classificação manual — que é o comportamento
-- de hoje, e é o certo. Melhor não classificar do que classificar errado:
-- canal errado entra silenciosamente na quebra por canal da diretoria, e
-- ninguém audita um número que "parece preenchido".
--
-- ── Ordem das regras ─────────────────────────────────────────────────────
-- PDV cadastrado ganha do histórico. Cadastrar o CNPJ em `pdvs` é um ato
-- explícito de alguém; o histórico é inferência.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_set_segmento_pdv()
returns trigger
language plpgsql
security definer   -- pdvs e carboze_orders têm RLS; sem isto o trigger vê
set search_path = public  -- zero linhas para o vendedor comum e vira no-op.
as $$
declare
  v_doc  text;
  v_hist text;
begin
  -- Já classificado (por gente ou por outro processo) → não encosta.
  if NEW.segmento is not null then
    return NEW;
  end if;

  -- Comparação por DÍGITOS dos dois lados: carboze_orders.cnpj guarda o que
  -- foi digitado e a bridge do Bling grava o formato dela.
  v_doc := regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g');
  if length(v_doc) not in (11, 14) then
    return NEW;
  end if;

  -- ── Regra 1: PDV cadastrado → revenda ───────────────────────────────────
  -- PDV pausado/inativo TAMBÉM classifica: se comprou enquanto era PDV, foi
  -- revenda. Status serve para gestão, não para reescrever o passado.
  if exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = v_doc
  ) then
    NEW.segmento := 'revenda';
    return NEW;
  end if;

  -- ── Regra 2: histórico unânime do próprio CNPJ ──────────────────────────
  -- `count(distinct ...) = 1` é o coração disto: com dois canais diferentes
  -- no histórico, min() devolveria um deles e a guarda derruba para NULL.
  -- Orçamento e cancelado ficam de fora: não são compra e não definem canal.
  select case when count(distinct o.segmento) = 1 then min(o.segmento) end
    into v_hist
  from public.carboze_orders o
  where regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = v_doc
    and o.segmento is not null
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false;

  if v_hist is not null then
    NEW.segmento := v_hist;
  end if;

  return NEW;
exception when others then
  -- NUNCA derrubar o INSERT. A bridge do Bling engole exceção como
  -- `totalFailed++` num log — o pedido sumiria sem ninguém saber.
  -- Classificar é conveniência; perder pedido, não.
  return NEW;
end $$;

comment on function public.carbo_set_segmento_pdv is
  'BEFORE INSERT em carboze_orders. Canal vazio: (1) CNPJ em pdvs → revenda; (2) senão, herda o canal se TODO o histórico do CNPJ for unânime. Nunca sobrescreve classificação existente.';

-- O trigger já existe e aponta para esta função; o create or replace acima
-- basta. Recriado por segurança caso a migração anterior não tenha rodado.
drop trigger if exists trg_carbo_set_segmento_pdv on public.carboze_orders;
create trigger trg_carbo_set_segmento_pdv
  before insert on public.carboze_orders
  for each row
  execute function public.carbo_set_segmento_pdv();

-- ── O M & D é consumo ─────────────────────────────────────────────────────
-- Locadora comprando de forma recorrente para a frota própria. Confirmado
-- pelo comercial. Este é o último pedido sem canal do sistema — e é ele que
-- passa a servir de histórico para os próximos pedidos deste CNPJ.
update public.carboze_orders
set segmento = 'consumo'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '13681768000110'
  and segmento is null
  and status not in ('quote', 'cancelled');

-- ── Backfill: quem dá para deduzir com segurança ───────────────────────────
-- Pedido sem canal cujo CNPJ tem histórico unânime. `segmento is null` é
-- obrigatório: sem ele isto atropelaria classificação manual.
update public.carboze_orders o
set segmento = h.canal
from (
  select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as doc,
         min(segmento) as canal
  from public.carboze_orders
  where segmento is not null
    and status not in ('quote', 'cancelled')
    and coalesce(excluir_metricas, false) = false
    and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) in (11, 14)
  group by 1
  having count(distinct segmento) = 1
) h
where o.segmento is null
  and o.status not in ('quote', 'cancelled')
  and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = h.doc;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Esperado: nenhum "(não classificado)".
select coalesce(segmento, '(não classificado)') as canal,
       count(*) as pedidos, round(sum(total), 2) as valor
from public.carboze_orders
where status not in ('quote', 'cancelled')
  and coalesce(excluir_metricas, false) = false
group by 1
order by 3 desc nulls last;

-- Clientes com histórico MISTO: são os que o trigger nunca vai adivinhar,
-- e é aqui que vale conferir se algum foi classificado errado no passado.
select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as doc,
       min(customer_name) as cliente,
       string_agg(distinct segmento, ', ') as canais,
       count(*) as pedidos
from public.carboze_orders
where segmento is not null
  and status not in ('quote', 'cancelled')
  and coalesce(excluir_metricas, false) = false
  and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) in (11, 14)
group by 1
having count(distinct segmento) > 1
order by 4 desc;
