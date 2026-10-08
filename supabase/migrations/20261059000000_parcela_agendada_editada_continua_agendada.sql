-- ═══════════════════════════════════════════════════════════════════════════
-- Parcela de recorrência EDITADA continua agendada
--
-- Medido em 08/10/2026 (order_audit_logs): editar uma parcela agendada pelo
-- /vender grava status = 'pending' (useUpdateVendaFull, nos oito apps) e não
-- mexe em fulfillment_stage. O card fica na coluna "Agendado" com status
-- 'pending', e a carboze_ativar_parcelas_devidas() — que procura
-- status = 'agendado' — nunca mais o enxerga.
--
--   V2026090022 · 0026   editadas 15/09, NÃO andaram em 01/10, movidas à mão 08/10
--   V2026090023 · 0027   nov/26  editadas 15/09  ← iam travar em 01/11
--   V2026090028 · 0024   dez/26  editadas 15/09 e 08/10  ← iam travar em 01/12
--
-- A regra mora no BANCO, não nos oito useVendas.ts: é o único lugar por onde
-- todo caminho de escrita passa (mesma razão do trg_carboze_orders_no_downgrade).
--
-- ⚠️ O gatilho só segura a transição EXATA da edição: agendado → pending com o
-- card ainda na coluna "agendado". Ficam livres, de propósito:
--   · a ATIVAÇÃO (status pending + etapa nova_venda no mesmo update)
--   · o CANCELAMENTO (status cancelled)
-- Se segurasse "qualquer saída de agendado", cancelar uma parcela futura
-- voltaria a agendá-la, calado.
--
-- ⚠️ O que já foi movido à mão (0022, 0026 — hoje em separacao_pendente) NÃO é
-- tocado: o destravamento exige fulfillment_stage = 'agendado' e mês FUTURO.
--
-- ⚠️ RODE EM BLOCOS, na ordem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — medir (só leitura)                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Esperado: 4 linhas — V2026090023, 0024, 0027, 0028 (M CONSTRUÇÕES).

select order_number, customer_name, status, fulfillment_stage, scheduled_month,
       recurrence_index || '/' || recurrence_total as parcela
from public.carboze_orders
where status::text = 'pending'
  and fulfillment_stage = 'agendado'
order by scheduled_month, order_number;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a regra e o destravamento                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_parcela_agendada_continua_agendada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Editar a parcela muda o pedido, não o calendário: quem tira do "agendado"
  -- é a carboze_ativar_parcelas_devidas() quando o mês chega.
  new.status := 'agendado';
  return new;
end;
$$;

comment on function public.carbo_parcela_agendada_continua_agendada() is
  'Editar uma parcela agendada (agendado → pending com a etapa ainda em '
  '"agendado") mantém status = agendado. Sem isso a ativação mensal, que procura '
  'status = agendado, nunca mais via a parcela. Ativação e cancelamento passam.';

drop trigger if exists trg_parcela_agendada_continua_agendada on public.carboze_orders;

create trigger trg_parcela_agendada_continua_agendada
  before update on public.carboze_orders
  for each row
  when (old.status::text = 'agendado'
        and new.status::text = 'pending'
        and new.fulfillment_stage = 'agendado')
  execute function public.carbo_parcela_agendada_continua_agendada();

-- Destrava as que já estão presas. ABORTA se não forem exatamente as 4 medidas.
do $$
declare
  v_alvo text[];
  v_n int;
begin
  select array_agg(order_number order by order_number) into v_alvo
  from public.carboze_orders
  where status::text = 'pending'
    and fulfillment_stage = 'agendado'
    and scheduled_month > date_trunc('month', current_date)::date;

  if coalesce(array_length(v_alvo, 1), 0) <> 4
     or v_alvo <> array['V2026090023','V2026090024','V2026090027','V2026090028'] then
    raise exception 'Esperava V2026090023, 0024, 0027 e 0028; encontrei %. Nada foi alterado.',
      coalesce(v_alvo::text, 'nenhuma');
  end if;

  update public.carboze_orders
     set status = 'agendado'
   where order_number = any (v_alvo)
     and status::text = 'pending'
     and fulfillment_stage = 'agendado';
  get diagnostics v_n = row_count;

  raise notice 'Parcelas de volta ao agendado: %', v_n;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Esperado: as 6 parcelas da M Construções.
--   0023, 0027 (nov) e 0024, 0028 (dez)  status = agendado, etapa = agendado
--   0022, 0026 (out, movidas à mão)       status = pending,  etapa = separacao_pendente (ou adiante)

select order_number, status, fulfillment_stage, scheduled_month,
       recurrence_index || '/' || recurrence_total as parcela
from public.carboze_orders
where order_number in ('V2026090022','V2026090023','V2026090024',
                       'V2026090026','V2026090027','V2026090028')
order by scheduled_month, order_number;
