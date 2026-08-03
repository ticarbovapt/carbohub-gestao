-- ═══════════════════════════════════════════════════════════════════════════
-- Dados de faturamento no card do CRM
--
-- Hoje o vendedor digita CNPJ, endereço e IE na hora de gerar o orçamento, e
-- esse dado morre no pedido: o card do lead nunca fica sabendo. Na próxima
-- venda para o mesmo cliente, digita tudo de novo.
--
-- A tabela já tinha `cnpj`, `legal_name`, `trade_name`, `city`, `state`,
-- `address` e `bairro` — desde a criação, em 20260406. Só que nada disso
-- chegava a formulário nenhum, e o `AcaoPosMove` (que leva o lead para a tela
-- de venda) mandava `address: ""` e `bairro: ""` fixos no código. O cano
-- existia; faltava a fonte.
--
-- Aqui completam-se os três que faltavam para um endereço fiscal fechar:
-- número, CEP e Inscrição Estadual.
--
-- ⚠️ DUAS TABELAS. `crm_sales_leads` foi criada com
-- `like public.crm_leads including all` — isso é CÓPIA da estrutura, não
-- herança: coluna nova em crm_leads NÃO aparece lá. O Carbo Sales lê e escreve
-- em `crm_sales_leads`; a `crm_leads` é a original, ainda usada por outras
-- telas. As duas recebem as colunas, senão elas divergem em silêncio — que é
-- exatamente o modo de falha desta dupla.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.crm_sales_leads
  add column if not exists numero      text,
  add column if not exists cep         text,
  add column if not exists customer_ie text;

alter table public.crm_leads
  add column if not exists numero      text,
  add column if not exists cep         text,
  add column if not exists customer_ie text;

comment on column public.crm_sales_leads.numero      is 'Número do endereço. Complementa address/bairro, que já existiam.';
comment on column public.crm_sales_leads.cep         is 'CEP, só dígitos. A máscara é da tela, não do dado.';
comment on column public.crm_sales_leads.customer_ie is 'Inscrição Estadual (ou "Isento"). Necessária para emitir NF de contribuinte.';

-- ── Volta do pedido para o lead ───────────────────────────────────────────
--
-- O caminho de ida (lead → orçamento) é a tela. Este é o de VOLTA: o que o
-- vendedor preencheu no orçamento aparece no card.
--
-- ⚠️ REGRA: só preenche campo VAZIO no lead. Nunca sobrescreve.
-- O lead é a verdade do relacionamento e pode ter sido corrigido à mão; o
-- pedido é um retrato de um momento e pode ter sido preenchido às pressas.
-- Deixar o pedido mandar apagaria correção feita no CRM sem ninguém ver.
create or replace function public.crm_lead_absorve_faturamento(p_lead_id uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare o public.carboze_orders;
begin
  select * into o from public.carboze_orders where id = p_order_id;
  if not found then return; end if;

  update public.crm_sales_leads l
  set cnpj        = coalesce(nullif(btrim(l.cnpj), ''),        nullif(btrim(o.cnpj), '')),
      legal_name  = coalesce(nullif(btrim(l.legal_name), ''),  nullif(btrim(o.customer_name), '')),
      customer_ie = coalesce(nullif(btrim(l.customer_ie), ''), nullif(btrim(o.customer_ie), '')),
      address     = coalesce(nullif(btrim(l.address), ''),     nullif(btrim(o.delivery_address), '')),
      bairro      = coalesce(nullif(btrim(l.bairro), ''),      nullif(btrim(o.delivery_neighborhood), '')),
      city        = coalesce(nullif(btrim(l.city), ''),        nullif(btrim(o.delivery_city), '')),
      state       = coalesce(nullif(btrim(l.state), ''),       nullif(btrim(o.delivery_state), '')),
      cep         = coalesce(nullif(btrim(l.cep), ''),         nullif(btrim(o.delivery_zip), '')),
      contact_email = coalesce(nullif(btrim(l.contact_email), ''), nullif(btrim(o.customer_email), '')),
      contact_phone = coalesce(nullif(btrim(l.contact_phone), ''), nullif(btrim(o.customer_phone), '')),
      updated_at  = now()
  where l.id = p_lead_id;
end $$;

comment on function public.crm_lead_absorve_faturamento is
  'Copia os dados de faturamento de um pedido para o lead que o originou. Só preenche campo vazio — nunca sobrescreve o que o CRM já sabe.';

-- Dispara quando o pedido é AMARRADO ao lead (primeira geração do orçamento).
create or replace function public.crm_lead_orders_absorve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.crm_lead_absorve_faturamento(NEW.lead_id, NEW.order_id);
  return NEW;
exception when others then
  -- Nunca derrubar o vínculo por causa do preenchimento. O elo lead↔pedido é
  -- o que importa; o dado copiado é conveniência.
  return NEW;
end $$;

drop trigger if exists trg_crm_lead_orders_absorve on public.crm_lead_orders;
create trigger trg_crm_lead_orders_absorve
  after insert on public.crm_lead_orders
  for each row execute function public.crm_lead_orders_absorve();

-- Dispara quando o pedido JÁ AMARRADO é editado (reabrir o orçamento e
-- completar o cadastro é o caso comum — sem isto só a primeira gravação
-- chegaria ao card).
create or replace function public.carboze_orders_absorve_no_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.crm_lead_orders where order_id = NEW.id limit 1;
  if v_lead is not null then
    perform public.crm_lead_absorve_faturamento(v_lead, NEW.id);
  end if;
  return NEW;
exception when others then
  return NEW;
end $$;

-- ⚠️ `carboze_orders` é escrita pelo cron do Bling a cada hora, e criar trigger
-- pede AccessExclusiveLock. Já deadlocamos duas vezes fazendo isso sem cuidado.
--   • sem `drop`: se o trigger já existe, não recria (evita o lock à toa)
--   • com `lock_timeout`: falha limpa em 5s em vez de esperar e virar deadlock
-- Se der "canceling statement due to lock timeout", é só rodar de novo.
set lock_timeout = '5s';
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_carboze_orders_absorve_no_lead'
      and tgrelid = 'public.carboze_orders'::regclass
      and not tgisinternal
  ) then
    create trigger trg_carboze_orders_absorve_no_lead
      after update of cnpj, customer_name, customer_ie, customer_email, customer_phone,
                      delivery_address, delivery_neighborhood, delivery_city,
                      delivery_state, delivery_zip
      on public.carboze_orders
      for each row execute function public.carboze_orders_absorve_no_lead();
  end if;
end $$;
reset lock_timeout;

-- ── Passivo: leads que já geraram orçamento e ficaram sem os dados ────────
-- Roda a absorção uma vez para os vínculos que já existem.
do $$
declare r record;
begin
  for r in select lead_id, order_id from public.crm_lead_orders loop
    perform public.crm_lead_absorve_faturamento(r.lead_id, r.order_id);
  end loop;
end $$;

-- ── Conferência ───────────────────────────────────────────────────────────
select count(*) filter (where nullif(btrim(cnpj), '') is not null)    as com_cnpj,
       count(*) filter (where nullif(btrim(address), '') is not null) as com_endereco,
       count(*) filter (where nullif(btrim(cep), '') is not null)     as com_cep,
       count(*)                                                       as leads
from public.crm_sales_leads
where deleted_at is null;
