-- ─────────────────────────────────────────────────────────────────────────────
-- Gestor = SÓ a flag do Admin (carbo_functions.access_level). SEM hardcode.
--
-- Antes, carbo_is_gestor tinha `is_carbo_command(uid) OR access_level='gestor'`
-- (command/TI entravam por regra fixa). Agora gestor vem EXCLUSIVAMENTE do
-- access_level='gestor' que o Admin controla na tela Estrutura.
--
-- Para não tirar acesso de ninguém na virada, primeiro marcamos como gestor as
-- funções que hoje "mandavam" por hardcode (command / ti_suporte / head / ceo).
-- Daqui pra frente, quem é gestor é quem o Admin marcar — inclusive esses.
--
-- OBS: is_carbo_command CONTINUA existindo (é usada em policies de config, tipo
-- quem edita carbo_functions/departamentos). Só saiu de dentro do carbo_is_gestor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Backfill: as funções que mandavam por regra fixa viram gestor pela flag.
UPDATE public.carbo_functions
SET access_level = 'gestor'
WHERE access_level <> 'gestor'
  AND (
        department  IN ('command', 'ti_suporte')
     OR function_key IN ('head', 'ceo', 'command')
  );

-- 2) carbo_is_gestor: agora é PURO access_level='gestor' (primário ou secundário).
CREATE OR REPLACE FUNCTION public.carbo_is_gestor(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.carbo_functions f
      ON f.is_active
     AND f.access_level = 'gestor'
     AND (
          (f.department = p.department::text           AND f.function_key = p.funcao::text)
       OR (f.department = p.secondary_department::text AND f.function_key = p.secondary_funcao::text)
     )
    WHERE p.id = _uid
  );
$$;

-- Conferência (rode separado pra ver quem ficou gestor):
-- SELECT p.full_name, p.department, p.funcao
-- FROM public.profiles p
-- WHERE public.carbo_is_gestor(p.id)
-- ORDER BY p.full_name;
