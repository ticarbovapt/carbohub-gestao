-- ─────────────────────────────────────────────────────────────────────────────
-- Descarbonização (crm_os): campos novos + número próprio da OS.
--  • telefone / responsavel  → contato (essencial p/ agendar serviço presencial)
--  • qtd_veiculos            → Frota (vários veículos, não 1 placa)
--  • recorrencia             → Frota (unica | semanal | mensal)
--  • numero                  → identificação própria DESC_{TIPO}_{NNNNN}, atômica
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.crm_os
  add column if not exists numero        text,
  add column if not exists telefone      text,
  add column if not exists responsavel   text,
  add column if not exists qtd_veiculos  integer,
  add column if not exists recorrencia   text;

create unique index if not exists crm_os_numero_key on public.crm_os (numero);

-- Numeração atômica por tipo (DESC_B2C_/DESC_B2B_/DESC_FRT_) — sem colisão.
create or replace function public.crm_os_generate_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefixo text;
  proximo integer;
begin
  if new.numero is not null and new.numero <> '' then
    return new;
  end if;
  prefixo := 'DESC_' || case new.tipo
               when 'b2c' then 'B2C' when 'b2b' then 'B2B' when 'frota' then 'FRT'
               else upper(new.tipo) end || '_';
  perform pg_advisory_xact_lock(hashtext('crm_os_numero:' || prefixo));
  select coalesce(max(cast(substring(numero from '^' || prefixo || '(\d+)$') as integer)), 0) + 1
    into proximo
    from public.crm_os
   where numero like prefixo || '%';
  new.numero := prefixo || lpad(proximo::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists crm_os_generate_numero_trigger on public.crm_os;
create trigger crm_os_generate_numero_trigger
  before insert on public.crm_os
  for each row
  when (new.numero is null or new.numero = '')
  execute function public.crm_os_generate_numero();
