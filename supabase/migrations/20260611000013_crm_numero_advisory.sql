-- ─────────────────────────────────────────────────────────────────────────────
-- Numeração de vendas à prova de concorrência — versão robusta (advisory lock).
--
-- Substitui a abordagem da migration 12 (tabela crm_venda_seq), que podia falhar
-- dependendo do estado em que foi aplicada. Aqui não há tabela auxiliar:
--   • pg_advisory_xact_lock serializa apenas os inserts do MESMO mês até o commit
--     (meses diferentes não disputam o lock);
--   • dentro do lock, calcula max(sequencial)+1 com segurança — o 2º vendedor
--     espera o 1º commitar e pega o próximo número. Sem duplicado, sem erro.
-- O índice único de crm_vendas.numero continua como rede de segurança final.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- trava transacional por mês (liberada no commit/rollback)
  perform pg_advisory_xact_lock(hashtext('crm_venda_numero:' || prefixo));

  select coalesce(max(cast(substring(numero from '^' || prefixo || '(\d{4})$') as integer)), 0) + 1
    into proximo
    from public.crm_vendas
   where numero like prefixo || '%';

  new.numero := prefixo || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

-- Remove a tabela auxiliar da abordagem anterior (já não é referenciada).
drop table if exists public.crm_venda_seq;

-- Garante que o PostgREST recarregue o schema (caso a coluna numero estivesse
-- fora do cache para selects explícitos).
notify pgrst, 'reload schema';
