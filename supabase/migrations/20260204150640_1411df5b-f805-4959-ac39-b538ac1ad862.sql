-- Corrigir política de INSERT muito permissiva na tabela governance_audit_log
-- A política "System can insert logs" usa WITH CHECK (true) que é permissiva demais
-- Vamos substituir por uma política que só permite inserção de logs para o próprio usuário

DROP POLICY IF EXISTS "System can insert logs" ON public.governance_audit_log;

-- Nova política: apenas usuários autenticados podem inserir logs para si mesmos
CREATE POLICY "Authenticated users can insert own logs" ON public.governance_audit_log
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL 
    AND (user_id = auth.uid() OR user_id IS NULL)
  );