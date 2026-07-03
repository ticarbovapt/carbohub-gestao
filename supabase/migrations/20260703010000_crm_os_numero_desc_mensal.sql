-- ─────────────────────────────────────────────────────────────────────────────
-- Numeração padronizada da OS de Descarbonização (crm_os.numero).
--
-- Novo formato: DESC + AAAA + MM + XXXX  (ex.: DESC202607 0001 → DESC2026070001)
--   • DESC = item (descarbonização)
--   • AAAA = ano corrente, MM = mês corrente
--   • XXXX = sequência que REINICIA em 0001 a cada novo mês
--   • sequência ÚNICA e global (não separa por tipo B2C/B2B/Frota)
--
-- Compartilhado com o app de Licenciados: como a numeração é um trigger
-- BEFORE INSERT na tabela crm_os, QUALQUER app que insira nessa mesma tabela
-- (Sales ou Licenciados) recebe o próximo número na sequência, sem colisão
-- (pg_advisory_xact_lock serializa a geração). Basta o Licenciados inserir em
-- public.crm_os para a numeração seguir junto.
--
-- Formatos antigos (DESC_B2C_00001…) continuam válidos e são ignorados pela
-- nova contagem — a sequência mensal nova começa limpa em 0001.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_os_generate_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ym      text;
  proximo integer;
begin
  if new.numero is not null and new.numero <> '' then
    return new;                                    -- respeita número já informado
  end if;

  ym := to_char(now(), 'YYYYMM');                  -- ex.: 202607

  -- Serializa a geração do número deste mês (evita dois inserts pegarem o mesmo).
  perform pg_advisory_xact_lock(hashtext('crm_os_numero:' || ym));

  select coalesce(max(
           cast(substring(numero from '^DESC' || ym || '(\d{4})$') as integer)
         ), 0) + 1
    into proximo
    from public.crm_os
   where numero like 'DESC' || ym || '%';

  new.numero := 'DESC' || ym || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

-- O trigger (BEFORE INSERT WHEN numero vazio) já existe — só troca a função.
