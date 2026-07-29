-- ═══════════════════════════════════════════════════════════════════════════
-- CANAL AUTOMÁTICO — venda para CNPJ de PDV nasce como "revenda"
--
-- Hoje NÃO existe classificação automática nenhuma: toda venda nasce com
-- `segmento = NULL`, tanto pelo /vender quanto pela bridge do Bling. Alguém
-- etiqueta à mão depois — e é isso que enche o "Não classificado".
--
-- ── Por que TRIGGER e não código no front ────────────────────────────────
-- Existem pelo menos 3 portas de entrada de pedido: o /vender (replicado em
-- 5 apps), a bridge do Bling (roda com service_role) e as edge functions de
-- recorrência/e-commerce. Resolver no front deixaria de fora justamente a
-- bridge do Bling, que traz muito pedido de revenda.
--
-- ── Por que BEFORE INSERT e nunca UPDATE ─────────────────────────────────
-- TODA edição manual de canal é UPDATE (/comercial/dados linha a linha e em
-- massa, /orders, edição em massa). Um trigger que não escuta UPDATE é
-- fisicamente incapaz de atropelar o que uma pessoa classificou. A guarda
-- `segmento is null` protege o outro lado: classificação explícita no INSERT
-- também ganha do automático.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_set_segmento_pdv()
returns trigger
language plpgsql
security definer   -- pdvs tem RLS; sem isto o trigger vê zero linhas para o
set search_path = public  -- vendedor comum e vira no-op para quem mais vende.
as $$
declare
  v_doc text;
begin
  -- Já classificado (por gente ou por outro processo) → não encosta.
  if NEW.segmento is not null then
    return NEW;
  end if;

  -- Comparação por DÍGITOS dos dois lados. carboze_orders.cnpj guarda o que
  -- foi digitado e a bridge grava o formato do Bling — comparar texto cru
  -- simplesmente não casaria nada, e em silêncio.
  v_doc := regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g');
  if length(v_doc) not in (11, 14) then
    return NEW;
  end if;

  -- PDV inativo/pausado TAMBÉM classifica: se comprou enquanto era PDV, foi
  -- revenda. O status serve para gestão, não para reescrever o passado.
  if exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = v_doc
  ) then
    NEW.segmento := 'revenda';
  end if;

  return NEW;
exception when others then
  -- NUNCA derrubar o INSERT. A bridge do Bling engole exceção como
  -- `totalFailed++` num log — o pedido sumiria sem ninguém saber. Classificar
  -- é conveniência; perder pedido, não.
  return NEW;
end $$;

comment on function public.carbo_set_segmento_pdv is
  'BEFORE INSERT em carboze_orders: se o CNPJ do pedido está cadastrado em pdvs e o canal veio vazio, marca revenda. Nunca sobrescreve classificação existente.';

drop trigger if exists trg_carbo_set_segmento_pdv on public.carboze_orders;
create trigger trg_carbo_set_segmento_pdv
  before insert on public.carboze_orders
  for each row
  execute function public.carbo_set_segmento_pdv();

-- ── BACKFILL do histórico ─────────────────────────────────────────────────
-- `where segmento is null` é OBRIGATÓRIO: sem isso o backfill atropelaria
-- toda classificação manual já feita.
update public.carboze_orders o
set segmento = 'revenda'
where o.segmento is null
  and coalesce(o.cnpj, '') <> ''
  and exists (
    select 1 from public.pdvs p
    where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g')
        = regexp_replace(o.cnpj, '\D', '', 'g')
  );

-- ── Conferência ───────────────────────────────────────────────────────────
select coalesce(segmento, '(não classificado)') as canal,
       count(*) as pedidos, round(sum(total), 2) as valor
from public.carboze_orders
where status not in ('quote', 'cancelled')
group by 1
order by 3 desc nulls last;
