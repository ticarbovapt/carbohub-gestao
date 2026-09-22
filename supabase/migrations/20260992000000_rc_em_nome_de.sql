-- ─────────────────────────────────────────────────────────────────────────────
-- RC "em nome de": quem SOLICITA deixa de ser obrigatoriamente quem CLICOU.
--
-- Hoje o formulário grava `requested_by = auth.uid()` e a lista de RCs mostra o
-- Solicitante (e filtra por Setor) a partir dessa coluna — então quem registra a
-- RC para um colega aparece como se a tivesse pedido, e a RC cai no SETOR errado
-- do filtro. Era o gargalo relatado.
--
-- ⚠️ A coluna que muda de significado é `requested_by` (passa a ser "de quem é a
-- necessidade"). Quem clicou vai para `created_by`, coluna NOVA — sem ela, trocar
-- o solicitante APAGARIA o autor do registro, que é o oposto de auditoria.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna de quem registrou                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill: no modelo antigo as duas coisas eram a mesma pessoa, e é isso que o
-- histórico diz. Escrever NULL aqui faria toda RC antiga parecer "sem autor".
UPDATE public.purchase_requests
SET created_by = requested_by
WHERE created_by IS NULL;

COMMENT ON COLUMN public.purchase_requests.requested_by IS
  'De QUEM é a necessidade (o solicitante). Pode ser diferente de created_by quando alguém registra a RC em nome de um colega — é esta coluna que a lista mostra como "Solicitante" e a que decide o Setor no filtro.';
COMMENT ON COLUMN public.purchase_requests.created_by IS
  'Quem CLICOU em criar. Igual a requested_by na RC normal; diferente quando a RC foi registrada em nome de outra pessoa. Existe para a troca de solicitante não apagar o autor do registro.';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista de quem pode ser escolhido como solicitante         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ NÃO é carbo_all_profiles(): aquela devolve a tabela `profiles` inteira, e o
-- portal de lojas e o de licenciados usam a MESMA tabela. Sem o filtro, lojista
-- apareceria no dropdown de solicitante da Carbo.
-- A régua de "interno" é carbo_interface_e_interna(), a lista única já existente
-- (20260927) — repetir os nomes das interfaces aqui criaria a segunda cópia, e
-- divergir nela ABRE acesso em vez de fechar.
CREATE OR REPLACE FUNCTION public.carbo_time_interno_lista()
RETURNS TABLE (id uuid, full_name text, username text, department text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.username, p.department::text, p.avatar_url
  FROM public.profiles p
  WHERE public.carbo_interface_e_interna(p.allowed_interfaces)
  ORDER BY p.full_name NULLS LAST;
$$;

COMMENT ON FUNCTION public.carbo_time_interno_lista IS
  'Perfis do TIME INTERNO (quem tem alguma interface interna liberada), para seletores de pessoa. Usa carbo_interface_e_interna — a lista única. Diferente de carbo_all_profiles, que devolve a tabela inteira, lojista e licenciado incluídos.';

GRANT EXECUTE ON FUNCTION public.carbo_time_interno_lista() TO authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência (roda junto, não muda nada)                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ⚠️ Subconsulta escalar, não `from pg_proc where proname=…`: a segunda forma
-- EMUDECE quando a função falta (zero linhas em vez de false).
SELECT
  'coluna created_by existe' AS conferencia,
  ((SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'purchase_requests'
       AND column_name = 'created_by') = 1)::text AS resultado
UNION ALL SELECT
  'rpc carbo_time_interno_lista existe',
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'carbo_time_interno_lista') = 1)::text
UNION ALL SELECT
  'RCs sem created_by (tem de ser 0)',
  (SELECT count(*) FROM public.purchase_requests WHERE created_by IS NULL)::text
UNION ALL SELECT
  'pessoas no dropdown (time interno)',
  (SELECT count(*) FROM public.carbo_time_interno_lista())::text
UNION ALL SELECT
  'perfis TOTAIS (o que carbo_all_profiles devolveria)',
  (SELECT count(*) FROM public.profiles)::text;
