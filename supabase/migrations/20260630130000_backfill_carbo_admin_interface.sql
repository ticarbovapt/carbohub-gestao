-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill da flag `carbo_admin` em profiles.allowed_interfaces.
--
-- A partir de agora a ENTRADA no Carbo Admin é gateada pela flag carbo_admin
-- (igual aos outros sistemas) — não mais pelo perfil command/head/TI direto.
-- Este backfill garante que TODO mundo que hoje opera o Admin (command, head
-- de qualquer departamento, ou ti_suporte) já nasça com a flag, evitando lockout.
--
-- ⚠️ RODE ESTE SQL ANTES (ou imediatamente junto) do deploy do frontend do Admin.
--    Caso contrário, quem só tinha acesso por perfil fica bloqueado até ser flegado.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.profiles
SET allowed_interfaces = array_append(COALESCE(allowed_interfaces, '{}'), 'carbo_admin')
WHERE NOT (COALESCE(allowed_interfaces, '{}') @> ARRAY['carbo_admin'])
  AND (
        department          IN ('command', 'ti_suporte')
     OR secondary_department IN ('command', 'ti_suporte')
     OR funcao              IN ('head', 'ceo', 'command')
     OR secondary_funcao     IN ('head', 'ceo', 'command')
  );

-- Conferência (rode separadamente se quiser ver quem ficou com a flag):
-- SELECT id, full_name, department, funcao, allowed_interfaces
-- FROM public.profiles
-- WHERE allowed_interfaces @> ARRAY['carbo_admin']
-- ORDER BY full_name;
