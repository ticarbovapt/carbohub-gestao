-- ─────────────────────────────────────────────────────────────────────────────
-- Numeração de vendas À PROVA DE CONCORRÊNCIA.
--
-- Antes: o trigger fazia SELECT max(numero)+1 — sob 2 inserts simultâneos (dois
-- vendedores ao mesmo tempo) ambos liam o mesmo max e geravam o MESMO número
-- (o índice único barrava o 2º com ERRO, em vez de dar o próximo).
--
-- Agora: contador por mês numa tabela (crm_venda_seq) incrementado com
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING — atômico: o lock de linha
-- serializa os concorrentes e cada um recebe um número distinto. Sem duplicado,
-- sem erro. O número é consumido na criação (orçamento já ocupa o número; se não
-- virar pedido, o número fica "gasto" e o próximo segue adiante — gaps são ok).
-- Reinício mensal: o prefixo é V+AAAAMM, então cada mês tem seu próprio contador.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_venda_seq (
  prefixo text primary key,          -- ex.: V202606
  ultimo  integer not null default 0
);

-- Acesso só via trigger (SECURITY DEFINER). Sem políticas = sem acesso direto.
alter table public.crm_venda_seq enable row level security;

-- Backfill: parte do maior sequencial já gravado em cada mês, para não reusar.
insert into public.crm_venda_seq (prefixo, ultimo)
select substring(numero from '^(V\d{6})'),
       max(cast(substring(numero from '^V\d{6}(\d{4})$') as integer))
from public.crm_vendas
where numero ~ '^V\d{6}\d{4}$'
group by 1
on conflict (prefixo) do update set ultimo = greatest(crm_venda_seq.ultimo, excluded.ultimo);

-- Trigger atômico
create or replace function public.crm_vendas_generate_numero()
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

  prefixo := 'V' || to_char(now(), 'YYYYMM');

  insert into public.crm_venda_seq (prefixo, ultimo)
       values (prefixo, 1)
  on conflict (prefixo)
       do update set ultimo = crm_venda_seq.ultimo + 1
  returning ultimo into proximo;

  new.numero := prefixo || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

-- (o trigger BEFORE INSERT e o índice único de crm_vendas.numero continuam valendo
--  da migration 20260611000007 — o índice é a rede de segurança final.)
