
-- Inserir departamentos organizacionais na tabela departments
INSERT INTO public.departments (type, name, description, icon, color, display_order, macro_flow, is_active)
VALUES
  ('b2b', 'Carbo B2B', 'Desenvolvimento de negócios corporativos', '🏢', '#6366F1', 10, 'comercial', true),
  ('command', 'Carbo Command', 'CEO e direção estratégica', '👑', '#8B5CF6', 20, NULL, true),
  ('expansao', 'Carbo Expansão', 'Expansão nacional do varejo', '🚀', '#10B981', 30, 'comercial', true),
  ('finance', 'Carbo Finance', 'Administrativo, RH e Financeiro', '💰', '#F59E0B', 40, 'adm_financeiro', true),
  ('growth', 'Carbo Growth', 'Marketing, marca e crescimento', '📈', '#EC4899', 50, 'comercial', true),
  ('ops', 'Carbo OPS', 'Operações, logística e produção', '⚙️', '#3B82F6', 60, 'operacional', true)
ON CONFLICT DO NOTHING;
