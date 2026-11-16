-- ============================================================
-- Migration: Add org chart fields to profiles
-- Date: 2026-03-25
-- Description: Adds hierarchy_level, reports_to, department,
--              job_title fields for the org chart feature
-- ============================================================

-- Add new columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hierarchy_level smallint DEFAULT 6;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_category text;

-- Index for fast tree queries
CREATE INDEX IF NOT EXISTS idx_profiles_reports_to ON profiles(reports_to);
CREATE INDEX IF NOT EXISTS idx_profiles_hierarchy_level ON profiles(hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department);

-- Comment on hierarchy_level values:
-- 1 = CEO
-- 2 = Diretor(a)
-- 3 = Gerente
-- 4 = Coordenador(a)
-- 5 = Supervisor(a)
-- 6 = Staff / Operacional

COMMENT ON COLUMN profiles.hierarchy_level IS '1=CEO, 2=Diretor, 3=Gerente, 4=Coordenador, 5=Supervisor, 6=Staff';
COMMENT ON COLUMN profiles.reports_to IS 'FK to profiles.id — direct manager';
COMMENT ON COLUMN profiles.department IS 'Department: Command, OPS, Growth, Finance, Expansão, B2B';
COMMENT ON COLUMN profiles.job_title IS 'Job title as displayed in org chart';
COMMENT ON COLUMN profiles.job_category IS 'Category: Estratégico, Operacional, Administrativo, Marketing, etc.';

-- ============================================================
-- Seed org chart data (update by name match)
-- Run this AFTER the ALTER to populate existing team
-- ============================================================

-- Helper: update by full_name match
-- NOTE: Adjust full_name values to match your profiles table

-- Thelis Botelho — CEO (Level 1)
UPDATE profiles SET
  hierarchy_level = 1,
  reports_to = NULL,
  department = 'Command',
  job_title = 'CEO / Liderança Comercial',
  job_category = 'Estratégico'
WHERE full_name ILIKE '%Thelis%';

-- Marina O. Rodrigues — Diretora (Level 2)
UPDATE profiles SET
  hierarchy_level = 2,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'Growth',
  job_title = 'Diretora de Estratégia, Marca e Crescimento',
  job_category = 'Estratégico'
WHERE full_name ILIKE '%Marina%Rodrigues%' OR full_name ILIKE '%Marina O%';

-- Erick Almeida — Diretor (Level 2)
UPDATE profiles SET
  hierarchy_level = 2,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Diretor de Expansão Nacional do Varejo',
  job_category = 'Estratégico'
WHERE full_name ILIKE '%Erick%Almeida%';

-- Vinicius Constantino — Diretor (Level 2)
UPDATE profiles SET
  hierarchy_level = 2,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'B2B',
  job_title = 'Diretor de Desenvolvimento de Negócios Corporativos (B2B)',
  job_category = 'Estratégico'
WHERE full_name ILIKE '%Vinicius%Constantino%';

-- Priscilla — Sócia-Adm/Financeiro (Level 2)
UPDATE profiles SET
  hierarchy_level = 2,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'Finance',
  job_title = 'Sócia-Adm / Financeiro',
  job_category = 'Financeiro'
WHERE full_name ILIKE '%Priscilla%';

-- Peterson Oliveira — Gerente (Level 3)
UPDATE profiles SET
  hierarchy_level = 3,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'OPS',
  job_title = 'Gerente de Operações e Logística',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Peterson%Oliveira%';

-- Jayane — Coordenadora (Level 4), reporta direto ao CEO
UPDATE profiles SET
  hierarchy_level = 4,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'Finance',
  job_title = 'Coordenadora Administrativo',
  job_category = 'Administrativo'
WHERE full_name ILIKE '%Jayane%';

-- Emmily Moreira — Staff (Level 6), reporta direto ao CEO
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Thelis%' LIMIT 1),
  department = 'Command',
  job_title = 'Assistente Executiva',
  job_category = 'Administrativo'
WHERE full_name ILIKE '%Emmily%';

-- ── OPS Team (reports to Peterson) ──────────────────────────
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Compras / Envios',
  job_category = 'Compras / Envios'
WHERE full_name ILIKE '%Jeane%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Operacional',
  job_category = 'Operacional'
WHERE full_name ILIKE '%David%' AND (department IS NULL OR department = 'OPS');

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Operacional',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Reinaldo%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Operacional',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Luis Carlos%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Operacional',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Ronaldo%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Peterson%Oliveira%' LIMIT 1),
  department = 'OPS',
  job_title = 'Desenvolvedor Back-end',
  job_category = 'Tecnologia'
WHERE full_name ILIKE '%Iury%';

-- ── Growth Team (reports to Marina) ─────────────────────────
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Marina%' AND full_name ILIKE '%Rodrigues%' LIMIT 1),
  department = 'Growth',
  job_title = 'Marketing',
  job_category = 'Marketing / Operacional'
WHERE full_name ILIKE '%Dyanne%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Marina%' AND full_name ILIKE '%Rodrigues%' LIMIT 1),
  department = 'Growth',
  job_title = 'Social Media / Analista Mkt',
  job_category = 'Marketing'
WHERE full_name ILIKE '%Mirian%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Marina%' AND full_name ILIKE '%Rodrigues%' LIMIT 1),
  department = 'Growth',
  job_title = 'Assistente de Marketing',
  job_category = 'Marketing'
WHERE full_name ILIKE '%Dyane%' AND full_name NOT ILIKE '%Dyanne%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Marina%' AND full_name ILIKE '%Rodrigues%' LIMIT 1),
  department = 'Growth',
  job_title = 'Editor de Vídeos',
  job_category = 'Marketing'
WHERE full_name ILIKE '%Remo%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Marina%' AND full_name ILIKE '%Rodrigues%' LIMIT 1),
  department = 'Growth',
  job_title = 'Designer e Editor de Vídeos',
  job_category = 'Marketing'
WHERE full_name ILIKE '%Arthur%';

-- ── Finance Team ────────────────────────────────────────────
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Jayane%' LIMIT 1),
  department = 'Finance',
  job_title = 'Fiscal',
  job_category = 'Fiscal'
WHERE full_name ILIKE '%Ana%' AND (department IS NULL OR department = 'Finance');

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Priscilla%' LIMIT 1),
  department = 'Finance',
  job_title = 'Financeiro',
  job_category = 'Financeiro'
WHERE full_name ILIKE '%Sueilha%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Jayane%' LIMIT 1),
  department = 'Finance',
  job_title = 'Marketing (Kits)',
  job_category = 'Marketing / Operacional'
WHERE full_name ILIKE '%L%gia%' OR full_name ILIKE '%Ligia%';

-- ── Expansão Team (reports to Erick) ────────────────────────
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Sucesso do Licenciado (Base)',
  job_category = 'Expansão'
WHERE full_name ILIKE '%Lorran%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Ativador de Licenciados — BA',
  job_category = 'Expansão'
WHERE full_name ILIKE '%Thiago%Damasceno%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Ativador de Licenciados e Técnico — Sul',
  job_category = 'Expansão'
WHERE full_name ILIKE '%Edson%Fran%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Técnico Operacional — Baixada Santista',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Ricardo%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'Técnico Operacional — Sudeste',
  job_category = 'Operacional'
WHERE full_name ILIKE '%Jonathas%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Erick%Almeida%' LIMIT 1),
  department = 'Expansão',
  job_title = 'PAP e Técnico — Sul',
  job_category = 'Expansão'
WHERE full_name ILIKE '%Ivo%Scarpin%';

-- ── B2B Team (reports to Vinicius) ──────────────────────────
UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Vinicius%Constantino%' LIMIT 1),
  department = 'B2B',
  job_title = 'Consultor de Vendas Corporativas — Nordeste',
  job_category = 'Comercial B2B'
WHERE full_name ILIKE '%Rodrigo%Torquato%';

UPDATE profiles SET
  hierarchy_level = 6,
  reports_to = (SELECT id FROM profiles WHERE full_name ILIKE '%Vinicius%Constantino%' LIMIT 1),
  department = 'B2B',
  job_title = 'PRV e Consultor B2B — Sudeste',
  job_category = 'Comercial B2B'
WHERE full_name ILIKE '%Marcius%';
