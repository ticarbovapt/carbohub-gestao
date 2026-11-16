-- CRM Universal Leads Table — supports all 8 funnels
-- F1: B2C CarboZé/CarboPRO | F2: Licenciados CarboVapt | F3: Frotistas diretos
-- F4: PDVs CarboZé | F5: PDVs CarboPRO | F6: Frotistas via Licenciado
-- F7: Empresas com motores | F8: Empresas com estoque combustível

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Funnel identification
  funnel_type TEXT NOT NULL CHECK (funnel_type IN ('f1','f2','f3','f4','f5','f6','f7','f8')),
  stage TEXT NOT NULL DEFAULT 'a_contatar',

  -- Universal contact fields
  contact_name TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  contact_email TEXT,
  source TEXT DEFAULT 'prospeccao_ativa',

  -- Company data (B2B)
  cnpj TEXT,
  legal_name TEXT,
  trade_name TEXT,
  ramo TEXT,

  -- Location
  city TEXT,
  state TEXT,
  address TEXT,
  bairro TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Segmentation
  segment TEXT CHECK (segment IN ('A','B','C','D')),
  credit_amount NUMERIC(12,2) DEFAULT 0,
  estimated_revenue NUMERIC(12,2) DEFAULT 0,
  temperature TEXT DEFAULT 'frio' CHECK (temperature IN ('frio','morno','quente')),
  wave TEXT CHECK (wave IN ('ONDA 1','ONDA 2','ONDA 3')),

  -- F2 Licensee specific
  score NUMERIC(6,1),
  vehicles_per_day INTEGER,
  instagram TEXT,
  google_presence BOOLEAN DEFAULT false,
  service_focus TEXT CHECK (service_focus IN ('preventivo','corretivo','ambos','n/a')),

  -- F3/F6 Fleet specific
  fleet_size INTEGER,
  fuel_type TEXT,
  monthly_consumption NUMERIC(12,2),

  -- F7/F8 Enterprise specific
  poc_done BOOLEAN DEFAULT false,
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  next_steps TEXT,
  equipment_type TEXT,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  assigned_team TEXT,
  territory TEXT,

  -- Tracking
  lost_reason TEXT,
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  contact_attempts INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  custom_fields JSONB DEFAULT '{}'::JSONB,

  -- Onboarding (F2 specific)
  onboarding_phase INTEGER DEFAULT 0 CHECK (onboarding_phase >= 0 AND onboarding_phase <= 5),
  onboarding_checklist JSONB DEFAULT '[]'::JSONB,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_crm_leads_funnel ON crm_leads(funnel_type);
CREATE INDEX idx_crm_leads_stage ON crm_leads(funnel_type, stage);
CREATE INDEX idx_crm_leads_assigned ON crm_leads(assigned_to);
CREATE INDEX idx_crm_leads_city ON crm_leads(city);
CREATE INDEX idx_crm_leads_created ON crm_leads(created_at DESC);
CREATE INDEX idx_crm_leads_follow_up ON crm_leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_crm_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_leads_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_crm_leads_updated_at();

-- RLS
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all leads"
  ON crm_leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert leads"
  ON crm_leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update leads"
  ON crm_leads FOR UPDATE
  USING (auth.role() = 'authenticated');
