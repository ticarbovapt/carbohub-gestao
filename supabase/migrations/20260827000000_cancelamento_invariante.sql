-- ═══════════════════════════════════════════════════════════════════════════
-- Cancelamento vira INVARIANTE do banco
--
-- O problema, na raiz: `carboze_orders` guarda o cancelamento em DOIS lugares.
--   • `status = 'cancelled'`          → é o que TODA conta de dinheiro lê
--   • `fulfillment_stage = 'cancelado'` → é o que TODA tela de etapa mostra
--
-- Nada garantia que os dois andassem juntos. Bastava um caminho de código
-- escrever só um deles e a venda ficava esquizofrênica: etiqueta vermelha
-- "Cancelado" no Carbo Sales e R$ 19.468 somando no Total Faturado da mesma
-- tela. Foi exatamente o que aconteceu com o V2026070049.
--
-- Já corrigimos isso três vezes em três lugares diferentes — no usePosVenda,
-- na RPC de cancelar, no trigger de NF cancelada. Corrigir no quarto lugar
-- seria remendo: o problema não é o caminho, é que a regra não existia.
--
-- Aqui a regra passa a viver no banco, num lugar só, e vale para qualquer
-- escrita — dos cinco apps, do sync do Bling, do SQL Editor, de um script
-- futuro que ninguém escreveu ainda.
--
--   cancelou a etapa  → cancela o status
--   cancelou o status → cancela a etapa
--   reabriu um dos dois → reabre o outro
--
-- A regra só age no campo que NÃO mudou nesta escrita. Isso importa: quem
-- reabre um pedido arrastando o card manda etapa nova + status novo na mesma
-- linha, e o trigger tem de deixar passar sem "corrigir" nada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_sincroniza_cancelamento()
returns trigger
language plpgsql
as $$
declare
  v_stage_mudou  boolean;
  v_status_mudou boolean;
begin
  if TG_OP = 'INSERT' then
    -- Na inserção não há "antes": quem estiver cancelado manda no outro.
    if NEW.fulfillment_stage = 'cancelado' and NEW.status is distinct from 'cancelled' then
      NEW.status := 'cancelled';
    elsif NEW.status = 'cancelled' and NEW.fulfillment_stage is distinct from 'cancelado' then
      NEW.fulfillment_stage := 'cancelado';
    end if;
    return NEW;
  end if;

  v_stage_mudou  := NEW.fulfillment_stage is distinct from OLD.fulfillment_stage;
  v_status_mudou := NEW.status            is distinct from OLD.status;

  -- Nada relacionado a cancelamento mudou → sai fora. Sem esta saída
  -- antecipada, todo UPDATE de qualquer coluna passaria pelas regras abaixo.
  if not v_stage_mudou and not v_status_mudou then
    return NEW;
  end if;

  -- ── Cancelou ────────────────────────────────────────────────────────────
  if v_stage_mudou and NEW.fulfillment_stage = 'cancelado' and not v_status_mudou then
    NEW.status := 'cancelled';
  end if;
  if v_status_mudou and NEW.status = 'cancelled' and not v_stage_mudou then
    NEW.fulfillment_stage := 'cancelado';
  end if;

  -- ── Reabriu ─────────────────────────────────────────────────────────────
  -- Tirar o pedido de "Cancelado" sem tocar no status deixava a venda fora do
  -- faturamento com o card de volta na fila — o espelho do bug de cima.
  if v_stage_mudou and OLD.fulfillment_stage = 'cancelado'
     and NEW.fulfillment_stage <> 'cancelado'
     and not v_status_mudou and NEW.status = 'cancelled' then
    NEW.status := 'pending';
  end if;
  -- Descancelar pelo status sem dizer para onde vai a etapa: volta ao início
  -- da fila. É o único destino seguro — qualquer outro seria adivinhação
  -- sobre trabalho físico (separou? faturou?) que o banco não tem como saber.
  if v_status_mudou and OLD.status = 'cancelled'
     and NEW.status <> 'cancelled'
     and not v_stage_mudou and NEW.fulfillment_stage = 'cancelado' then
    NEW.fulfillment_stage := 'nova_venda';
  end if;

  return NEW;
end $$;

comment on function public.carbo_sincroniza_cancelamento is
  'Mantém carboze_orders.status = cancelled e fulfillment_stage = cancelado sempre juntos, nos dois sentidos, inclusive ao reabrir. Só age no campo que a escrita NÃO tocou, para não desfazer reabertura explícita.';

drop trigger if exists trg_carbo_sincroniza_cancelamento on public.carboze_orders;
create trigger trg_carbo_sincroniza_cancelamento
  before insert or update on public.carboze_orders
  for each row
  execute function public.carbo_sincroniza_cancelamento();

-- ── Passivo: as linhas que já estão divergentes ───────────────────────────

-- (a) Etapa cancelada, status vivo → aparece "Cancelado" e SOMA no faturamento.
--     Este é o bug que você viu.
select order_number, customer_name, total, status, fulfillment_stage,
       coalesce(sale_date, created_at::date) as data
from public.carboze_orders
where fulfillment_stage = 'cancelado' and status is distinct from 'cancelled'
order by total desc;

-- (b) Status cancelado, etapa viva → some do faturamento e o card fica na fila.
select order_number, customer_name, total, status, fulfillment_stage,
       coalesce(sale_date, created_at::date) as data
from public.carboze_orders
where status = 'cancelled' and fulfillment_stage is distinct from 'cancelado'
order by total desc;

-- ── Correção do passivo ───────────────────────────────────────────────────
-- Manda quem foi cancelado. Em (a) a intenção registrada é o cancelamento da
-- etapa; em (b), a do status. Nos dois casos alguém cancelou de propósito e o
-- outro campo é que ficou para trás.
update public.carboze_orders
set status = 'cancelled', updated_at = now()
where fulfillment_stage = 'cancelado' and status is distinct from 'cancelled';

update public.carboze_orders
set fulfillment_stage = 'cancelado', updated_at = now()
where status = 'cancelled' and fulfillment_stage is distinct from 'cancelado';

-- ── Depois: tem que voltar 0 ──────────────────────────────────────────────
select count(*) as ainda_divergentes
from public.carboze_orders
where (fulfillment_stage = 'cancelado') <> (status = 'cancelled');
