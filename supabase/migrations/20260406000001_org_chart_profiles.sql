-- ============================================================
-- Migration: Org Chart Profiles — Grupo Carbo (30 colaboradores)
-- Fonte: Mapa_Responsabilidades_CarboVapt, aba Resumo (06/04/2026)
-- ============================================================
-- INSTRUÇÕES: Executar diretamente no Supabase SQL Editor
--   1. Acesse https://supabase.com/dashboard → projeto → SQL Editor
--   2. Cole este script inteiro e clique em "Run"
--   3. Verifique: SELECT count(*) FROM profiles WHERE hierarchy_level IS NOT NULL;
-- ============================================================

-- Garante que as colunas existam
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hierarchy_level  integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reports_to       uuid REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department       text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title        text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_category     text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS carbo_role       text;

-- ── UUIDs fixos para referências estáveis ──────────────────────────────────
DO $$
DECLARE
  id_thelis   uuid := 'a1000000-0000-0000-0000-000000000001';
  id_emmily   uuid := 'a1000000-0000-0000-0000-000000000002';
  id_priscilla uuid := 'a1000000-0000-0000-0000-000000000003';
  id_sueilha  uuid := 'a1000000-0000-0000-0000-000000000004';
  id_jayane   uuid := 'a1000000-0000-0000-0000-000000000005';
  id_ana      uuid := 'a1000000-0000-0000-0000-000000000006';
  id_ligia    uuid := 'a1000000-0000-0000-0000-000000000007';
  id_marina   uuid := 'a1000000-0000-0000-0000-000000000008';
  id_dyanne   uuid := 'a1000000-0000-0000-0000-000000000009';
  id_mirian   uuid := 'a1000000-0000-0000-0000-000000000010';
  id_dyane    uuid := 'a1000000-0000-0000-0000-000000000011';
  id_remo     uuid := 'a1000000-0000-0000-0000-000000000012';
  id_arthur   uuid := 'a1000000-0000-0000-0000-000000000013';
  id_rodrigo  uuid := 'a1000000-0000-0000-0000-000000000014';
  id_marcius  uuid := 'a1000000-0000-0000-0000-000000000015';
  id_peterson uuid := 'a1000000-0000-0000-0000-000000000016';
  id_jeane    uuid := 'a1000000-0000-0000-0000-000000000017';
  id_david    uuid := 'a1000000-0000-0000-0000-000000000018';
  id_reinaldo uuid := 'a1000000-0000-0000-0000-000000000019';
  id_luiscarlos uuid := 'a1000000-0000-0000-0000-000000000020';
  id_ronaldo  uuid := 'a1000000-0000-0000-0000-000000000021';
  id_iury     uuid := 'a1000000-0000-0000-0000-000000000022';
  id_erick    uuid := 'a1000000-0000-0000-0000-000000000023';
  id_lorran   uuid := 'a1000000-0000-0000-0000-000000000024';
  id_thiago   uuid := 'a1000000-0000-0000-0000-000000000025';
  id_marcio   uuid := 'a1000000-0000-0000-0000-000000000026';
  id_weider   uuid := 'a1000000-0000-0000-0000-000000000027';
  id_ricardo  uuid := 'a1000000-0000-0000-0000-000000000028';
  id_jonathas uuid := 'a1000000-0000-0000-0000-000000000029';
  id_ivo      uuid := 'a1000000-0000-0000-0000-000000000030';
BEGIN

  INSERT INTO profiles (id, full_name, hierarchy_level, department, job_title, job_category, carbo_role, reports_to)
  VALUES
    -- Level 1: CEO
    (id_thelis,    'Thelis Botelho',         1, 'Command',      'CEO / Liderança Comercial',                          'Liderança Estratégica', 'ceo',          NULL),

    -- Level 2: Diretores / Heads
    (id_priscilla, 'Priscilla',              2, 'Finance',      'Sócia-Adm / Financeiro',                            'Financeiro',            'gestor_fin',   id_thelis),
    (id_marina,    'Marina O. Rodrigues',    2, 'Growth & B2B', 'Head — Estratégia, Marca e Crescimento',            'Liderança Estratégica', 'gestor_adm',   id_thelis),
    (id_erick,     'Erick Almeida',          2, 'Expansão',     'Diretor de Expansão Nacional do Varejo',            'Liderança Estratégica', 'gestor_adm',   id_thelis),

    -- Level 3: Gerentes
    (id_peterson,  'Peterson Oliveira',      3, 'OPS',          'Gerente de Operações e Logística',                  'Operações',             'gestor_adm',   id_thelis),

    -- Level 4: Coordenadores / Especialistas
    (id_emmily,    'Emmily Moreira',         4, 'Command',      'Assistente Executiva',                              'Administrativo',        'operador',     id_thelis),
    (id_jayane,    'Jayane',                 4, 'Finance',      'Coordenadora Administrativa',                       'Administrativo',        'gestor_adm',   id_thelis),
    (id_rodrigo,   'Rodrigo Torquato',       4, 'B2B',          'Consultor de Vendas Corporativas – Nordeste',       'Comercial B2B',         'operador',     id_marina),

    -- Level 6: Staff
    (id_sueilha,   'Sueilha',                6, 'Finance',      'Financeiro',                                        'Financeiro',            'operador_fiscal', id_priscilla),
    (id_ana,       'Ana',                    6, 'Finance',      'Fiscal',                                            'Fiscal',                'operador_fiscal', id_jayane),
    (id_ligia,     'Légia',                  6, 'Finance',      'Marketing / Kits',                                  'Marketing',             'operador',     id_jayane),
    (id_dyanne,    'Dyanne',                 6, 'Growth',       'Marketing / Operacional',                           'Marketing',             'operador',     id_marina),
    (id_mirian,    'Mirian',                 6, 'Growth',       'Social Media / Analista Mkt',                       'Marketing',             'operador',     id_marina),
    (id_dyane,     'Dyane',                  6, 'Growth',       'Assistente de Marketing',                           'Marketing',             'operador',     id_marina),
    (id_remo,      'Remo',                   6, 'Growth',       'Editor de Vídeos',                                  'Marketing',             'operador',     id_marina),
    (id_arthur,    'Arthur',                 6, 'Growth',       'Designer e Editor de Vídeos',                       'Marketing',             'operador',     id_marina),
    (id_marcius,   'Marcius D''Ávilla',      6, 'B2B',          'PRV e Consultor B2B – Sudeste',                     'Comercial B2B',         'operador',     id_marina),
    (id_jeane,     'Jeane',                  6, 'OPS',          'Compras / Envios',                                  'Compras',               'gestor_compras', id_peterson),
    (id_david,     'David',                  6, 'OPS',          'Operacional',                                       'Operações',             'operador',     id_peterson),
    (id_reinaldo,  'Reinaldo',               6, 'OPS',          'Operacional / Suporte Técnico',                     'Operações',             'operador',     id_peterson),
    (id_luiscarlos,'Luis Carlos',            6, 'OPS',          'Operacional / Envase',                              'Operações',             'operador',     id_peterson),
    (id_ronaldo,   'Ronaldo',                6, 'OPS',          'Operacional',                                       'Operações',             'operador',     id_peterson),
    (id_iury,      'Iury',                   6, 'OPS',          'Desenvolvedor Back-end',                            'Tecnologia',            'operador',     id_peterson),
    (id_lorran,    'Lorran Barba',           6, 'Expansão',     'Sucesso do Licenciado (Base)',                       'Expansão',              'operador',     id_erick),
    (id_thiago,    'Thiago Damasceno',       6, 'Expansão',     'Ativador de Licenciados – BA',                      'Expansão',              'operador',     id_erick),
    (id_marcio,    'Márcio',                 6, 'Expansão',     'Técnico Operacional – Nordeste',                    'Expansão',              'operador',     id_erick),
    (id_weider,    'Weider Moura',           6, 'Expansão',     'Consultor Comercial – CarboZé e Pro',               'Expansão',              'operador',     id_erick),
    (id_ricardo,   'Ricardo',                6, 'Expansão',     'Técnico Operacional – Baixada Santista',            'Expansão',              'operador',     id_erick),
    (id_jonathas,  'Jonathas',               6, 'Expansão',     'Técnico Operacional – Sudeste',                     'Expansão',              'operador',     id_erick),
    (id_ivo,       'Ivo Scarpin',            6, 'Expansão',     'PAP e Técnico – Sul',                               'Expansão',              'operador',     id_erick)

  ON CONFLICT (id) DO UPDATE SET
    full_name       = EXCLUDED.full_name,
    hierarchy_level = EXCLUDED.hierarchy_level,
    department      = EXCLUDED.department,
    job_title       = EXCLUDED.job_title,
    job_category    = EXCLUDED.job_category,
    carbo_role      = EXCLUDED.carbo_role,
    reports_to      = EXCLUDED.reports_to;

END $$;

-- Verify
SELECT id, full_name, hierarchy_level, department, job_title
FROM profiles
WHERE hierarchy_level IS NOT NULL
ORDER BY hierarchy_level, full_name;
