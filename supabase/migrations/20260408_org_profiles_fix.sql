-- =============================================================
-- Migration: Fix org chart profiles — remove auth FK, seed all 30 members
-- Estratégia segura:
--   1. Para membros JÁ existentes (por nome): atualiza dados do org chart
--   2. Para membros INEXISTENTES: insere com UUID fixo (sem auth account)
-- =============================================================

-- 1. Remover FK constraint — permite membros sem auth account
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Coluna org_only para distinguir membros sem auth account
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_only boolean NOT NULL DEFAULT false;

-- 3. RLS: admin pode ler todos os perfis
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm', 'gestor_ops', 'gestor_fin', 'gestor_compras')
    )
  );

-- 4. RLS: admin pode atualizar qualquer perfil
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm')
    )
  );

-- 5. Seed org chart — função auxiliar para upsert seguro por nome
CREATE OR REPLACE FUNCTION _seed_org_member(
  p_fixed_id    uuid,
  p_name        text,
  p_level       int,
  p_department  text,
  p_job_title   text,
  p_job_cat     text,
  p_carbo_role  text,
  p_reports_to  uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Se já existe por nome: atualiza dados do org chart, mantém UUID real
  IF EXISTS (SELECT 1 FROM profiles WHERE lower(trim(full_name)) = lower(trim(p_name))) THEN
    UPDATE profiles SET
      hierarchy_level = p_level,
      department      = p_department,
      job_title       = p_job_title,
      job_category    = p_job_cat,
      carbo_role      = p_carbo_role,
      reports_to      = p_reports_to,
      status          = 'approved'
    WHERE lower(trim(full_name)) = lower(trim(p_name));
  ELSE
    -- Não existe: insere com UUID fixo, marcado como org_only
    INSERT INTO profiles (id, full_name, hierarchy_level, department, job_title, job_category, carbo_role, reports_to, status, org_only)
    VALUES (p_fixed_id, p_name, p_level, p_department, p_job_title, p_job_cat, p_carbo_role, p_reports_to, 'approved', true)
    ON CONFLICT (id) DO UPDATE SET
      full_name       = EXCLUDED.full_name,
      hierarchy_level = EXCLUDED.hierarchy_level,
      department      = EXCLUDED.department,
      job_title       = EXCLUDED.job_title,
      job_category    = EXCLUDED.job_category,
      carbo_role      = EXCLUDED.carbo_role,
      reports_to      = EXCLUDED.reports_to,
      status          = 'approved',
      org_only        = true;
  END IF;
END;
$$;

-- 6. Executar seeds — IDs fixos usados só se o membro não existe ainda
DO $$
DECLARE
  id_thelis     uuid := 'a1000000-0000-0000-0000-000000000001';
  id_emmily     uuid := 'a1000000-0000-0000-0000-000000000002';
  id_priscilla  uuid := 'a1000000-0000-0000-0000-000000000003';
  id_sueilha    uuid := 'a1000000-0000-0000-0000-000000000004';
  id_jayane     uuid := 'a1000000-0000-0000-0000-000000000005';
  id_ana        uuid := 'a1000000-0000-0000-0000-000000000006';
  id_ligia      uuid := 'a1000000-0000-0000-0000-000000000007';
  id_marina     uuid := 'a1000000-0000-0000-0000-000000000008';
  id_dyanne     uuid := 'a1000000-0000-0000-0000-000000000009';
  id_mirian     uuid := 'a1000000-0000-0000-0000-000000000010';
  id_dyane      uuid := 'a1000000-0000-0000-0000-000000000011';
  id_remo       uuid := 'a1000000-0000-0000-0000-000000000012';
  id_arthur     uuid := 'a1000000-0000-0000-0000-000000000013';
  id_rodrigo    uuid := 'a1000000-0000-0000-0000-000000000014';
  id_marcius    uuid := 'a1000000-0000-0000-0000-000000000015';
  id_peterson   uuid := 'a1000000-0000-0000-0000-000000000016';
  id_jeane      uuid := 'a1000000-0000-0000-0000-000000000017';
  id_david      uuid := 'a1000000-0000-0000-0000-000000000018';
  id_reinaldo   uuid := 'a1000000-0000-0000-0000-000000000019';
  id_luiscarlos uuid := 'a1000000-0000-0000-0000-000000000020';
  id_ronaldo    uuid := 'a1000000-0000-0000-0000-000000000021';
  id_iury       uuid := 'a1000000-0000-0000-0000-000000000022';
  id_erick      uuid := 'a1000000-0000-0000-0000-000000000023';
  id_lorran     uuid := 'a1000000-0000-0000-0000-000000000024';
  id_thiago     uuid := 'a1000000-0000-0000-0000-000000000025';
  id_marcio     uuid := 'a1000000-0000-0000-0000-000000000026';
  id_weider     uuid := 'a1000000-0000-0000-0000-000000000027';
  id_ricardo    uuid := 'a1000000-0000-0000-0000-000000000028';
  id_jonathas   uuid := 'a1000000-0000-0000-0000-000000000029';
  id_ivo        uuid := 'a1000000-0000-0000-0000-000000000030';
BEGIN
  -- Level 1
  PERFORM _seed_org_member(id_thelis,    'Thelis Botelho',       1, 'Command',      'CEO / Liderança Comercial',                    'Liderança Estratégica', 'ceo',            NULL);
  -- Level 2
  PERFORM _seed_org_member(id_priscilla, 'Priscilla',            2, 'Finance',      'Sócia-Adm / Financeiro',                       'Financeiro',            'gestor_fin',     id_thelis);
  PERFORM _seed_org_member(id_marina,    'Marina O. Rodrigues',  2, 'Growth & B2B', 'Head — Estratégia, Marca e Crescimento',       'Liderança Estratégica', 'gestor_adm',     id_thelis);
  PERFORM _seed_org_member(id_erick,     'Erick Almeida',        2, 'Expansão',     'Diretor de Expansão Nacional do Varejo',       'Liderança Estratégica', 'gestor_adm',     id_thelis);
  -- Level 3
  PERFORM _seed_org_member(id_peterson,  'Peterson Oliveira',    3, 'OPS',          'Gerente de Operações e Logística',             'Operações',             'gestor_adm',     id_thelis);
  -- Level 4
  PERFORM _seed_org_member(id_emmily,    'Emmily Moreira',       4, 'Command',      'Assistente Executiva',                         'Administrativo',        'operador',       id_thelis);
  PERFORM _seed_org_member(id_jayane,    'Jayane',               4, 'Finance',      'Coordenadora Administrativa',                  'Administrativo',        'gestor_adm',     id_priscilla);
  PERFORM _seed_org_member(id_rodrigo,   'Rodrigo Torquato',     4, 'B2B',          'Consultor de Vendas Corporativas – Nordeste',  'Comercial B2B',         'operador',       id_marina);
  -- Finance staff
  PERFORM _seed_org_member(id_sueilha,   'Sueilha',              6, 'Finance',      'Financeiro',                                   'Financeiro',            'operador_fiscal', id_priscilla);
  PERFORM _seed_org_member(id_ana,       'Ana',                  6, 'Finance',      'Fiscal',                                       'Fiscal',                'operador_fiscal', id_jayane);
  PERFORM _seed_org_member(id_ligia,     'Légia',                6, 'Finance',      'Marketing / Kits',                             'Marketing',             'operador',       id_jayane);
  -- Growth staff
  PERFORM _seed_org_member(id_dyanne,    'Dyanne',               6, 'Growth',       'Marketing / Operacional',                      'Marketing',             'operador',       id_marina);
  PERFORM _seed_org_member(id_mirian,    'Mirian',               6, 'Growth',       'Social Media / Analista Mkt',                  'Marketing',             'operador',       id_marina);
  PERFORM _seed_org_member(id_dyane,     'Dyane',                6, 'Growth',       'Assistente de Marketing',                      'Marketing',             'operador',       id_marina);
  PERFORM _seed_org_member(id_remo,      'Remo',                 6, 'Growth',       'Editor de Vídeos',                             'Marketing',             'operador',       id_marina);
  PERFORM _seed_org_member(id_arthur,    'Arthur',               6, 'Growth',       'Designer e Editor de Vídeos',                  'Marketing',             'operador',       id_marina);
  -- B2B staff
  PERFORM _seed_org_member(id_marcius,   'Marcius D''Ávilla',    6, 'B2B',          'PRV e Consultor B2B – Sudeste',                'Comercial B2B',         'operador',       id_marina);
  -- OPS staff
  PERFORM _seed_org_member(id_jeane,     'Jeane',                6, 'OPS',          'Compras / Envios',                             'Compras',               'gestor_compras', id_peterson);
  PERFORM _seed_org_member(id_david,     'David',                6, 'OPS',          'Operacional',                                  'Operações',             'operador',       id_peterson);
  PERFORM _seed_org_member(id_reinaldo,  'Reinaldo',             6, 'OPS',          'Operacional / Suporte Técnico',                'Operações',             'operador',       id_peterson);
  PERFORM _seed_org_member(id_luiscarlos,'Luis Carlos',          6, 'OPS',          'Operacional / Envase',                         'Operações',             'operador',       id_peterson);
  PERFORM _seed_org_member(id_ronaldo,   'Ronaldo',              6, 'OPS',          'Operacional',                                  'Operações',             'operador',       id_peterson);
  PERFORM _seed_org_member(id_iury,      'Iury',                 6, 'OPS',          'Desenvolvedor Back-end',                       'Tecnologia',            'operador',       id_peterson);
  -- Expansão staff
  PERFORM _seed_org_member(id_lorran,    'Lorran Barba',         6, 'Expansão',     'Sucesso do Licenciado (Base)',                  'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_thiago,    'Thiago Damasceno',     6, 'Expansão',     'Ativador de Licenciados – BA',                 'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_marcio,    'Márcio',               6, 'Expansão',     'Técnico Operacional – Nordeste',               'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_weider,    'Weider Moura',         6, 'Expansão',     'Consultor Comercial – CarboZé e Pro',          'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_ricardo,   'Ricardo',              6, 'Expansão',     'Técnico Operacional – Baixada Santista',       'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_jonathas,  'Jonathas',             6, 'Expansão',     'Técnico Operacional – Sudeste',               'Expansão',              'operador',       id_erick);
  PERFORM _seed_org_member(id_ivo,       'Ivo Scarpin',          6, 'Expansão',     'PAP e Técnico – Sul',                          'Expansão',              'operador',       id_erick);
END $$;

-- 7. Limpar função auxiliar temporária
DROP FUNCTION IF EXISTS _seed_org_member(uuid, text, int, text, text, text, text, uuid);
