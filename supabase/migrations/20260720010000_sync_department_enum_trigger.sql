-- ─────────────────────────────────────────────────────────────────────────────
-- Sincroniza o enum `department_type` com a tabela `carbo_departments`.
--
-- PROBLEMA: departamentos novos são criados em `carbo_departments` (texto livre),
-- mas `profiles.department` / `profiles.secondary_department` são do tipo enum
-- `department_type` (lista fixa). Resultado: dá pra CRIAR um departamento, mas
-- não dá pra ATRIBUÍ-lo a alguém — o enum rejeita a key nova (erro 500), e só o
-- TI resolvia rodando ALTER TYPE na mão.
--
-- SOLUÇÃO: um trigger em `carbo_departments` adiciona a key ao enum sozinho,
-- na criação (ou quando a key muda). Assim o gestor cria o departamento no Admin
-- e ele já fica utilizável — sem TI.
--
-- NOTA sobre `ALTER TYPE ... ADD VALUE`:
--  * PG12+ permite rodá-lo dentro de transação; o valor novo só fica USÁVEL após
--    o COMMIT. Como o INSERT em carbo_departments NÃO usa o enum, e a atribuição
--    a um profile acontece em OUTRA requisição, funciona.
--  * `IF NOT EXISTS` torna idempotente.
--  * A migration em si NÃO roda nenhum ALTER TYPE (só cria função + trigger) —
--    então aplicar esta migration é seguro; o ALTER só dispara ao criar um
--    departamento (é aí que testamos).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.sync_department_enum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if new.key is null or btrim(new.key) = '' then
    return new;
  end if;

  -- A key já é um valor válido do enum? Então não faz nada (idempotente).
  select exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'department_type'
      and e.enumlabel = new.key
  ) into v_exists;

  if not v_exists then
    execute format('alter type public.department_type add value if not exists %L', new.key);
  end if;

  return new;
end;
$$;

comment on function public.sync_department_enum() is
  'Adiciona a key de um departamento novo ao enum department_type (mantém carbo_departments e o enum em sincronia). Ver migration 20260720010000.';

drop trigger if exists trg_sync_department_enum on public.carbo_departments;
create trigger trg_sync_department_enum
after insert or update of key on public.carbo_departments
for each row
execute function public.sync_department_enum();
