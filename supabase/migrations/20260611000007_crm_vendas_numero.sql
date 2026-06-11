-- ─────────────────────────────────────────────────────────────────────────────
-- Número padronizado das vendas do Carbo Sales.
-- Formato: V{AAAAMM}{NNNN}  →  ex.: V2026060001
--   • "V" de Venda
--   • AAAAMM = ano+mês de criação
--   • NNNN  = sequencial de 4 dígitos, REINICIA em 0001 a cada novo mês
-- Estável: o número é atribuído na criação e NÃO muda quando o orçamento vira
-- pedido (importante p/ futuro cruzamento NF ↔ pedido, como no Controle).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) coluna (única)
alter table public.crm_vendas
  add column if not exists numero text;

create unique index if not exists crm_vendas_numero_key
  on public.crm_vendas (numero);

-- 2) função geradora (espelha generate_order_number do Controle, com reset mensal)
create or replace function public.crm_vendas_generate_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefixo  text;
  proximo  integer;
begin
  -- prefixo do mês corrente: V + AAAAMM
  prefixo := 'V' || to_char(now(), 'YYYYMM');

  -- maior sequencial já usado neste mês (+1); se não houver, começa em 1
  select coalesce(max(
           cast(substring(numero from '^' || prefixo || '(\d{4})$') as integer)
         ), 0) + 1
    into proximo
    from public.crm_vendas
   where numero like prefixo || '%';

  new.numero := prefixo || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

-- 3) trigger (só quando numero vier vazio)
drop trigger if exists crm_vendas_generate_numero_trigger on public.crm_vendas;
create trigger crm_vendas_generate_numero_trigger
  before insert on public.crm_vendas
  for each row
  when (new.numero is null or new.numero = '')
  execute function public.crm_vendas_generate_numero();

-- 4) backfill das vendas já existentes (sem número), respeitando mês de criação
--    e a ordem cronológica para manter o sequencial coerente.
do $$
declare
  r           record;
  prefixo_at  text := '';
  contador    integer := 0;
begin
  for r in
    select id, created_at
      from public.crm_vendas
     where numero is null or numero = ''
     order by created_at asc, id asc
  loop
    if to_char(r.created_at, '"V"YYYYMM') <> prefixo_at then
      prefixo_at := to_char(r.created_at, '"V"YYYYMM');
      -- retoma o maior sequencial já gravado naquele mês (caso haja)
      select coalesce(max(
               cast(substring(numero from '^' || prefixo_at || '(\d{4})$') as integer)
             ), 0)
        into contador
        from public.crm_vendas
       where numero like prefixo_at || '%';
    end if;
    contador := contador + 1;
    update public.crm_vendas
       set numero = prefixo_at || lpad(contador::text, 4, '0')
     where id = r.id;
  end loop;
end $$;
