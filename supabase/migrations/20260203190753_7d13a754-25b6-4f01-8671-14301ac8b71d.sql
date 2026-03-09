-- ========================================
-- CARBO OPS 2.0 - NOVOS MÓDULOS
-- ========================================

-- ----------------------------------------
-- 1. LICENCIADOS (Franchisees/Partners)
-- ----------------------------------------

-- Enum for licensee status
CREATE TYPE public.licensee_status AS ENUM ('active', 'inactive', 'pending', 'suspended');

-- Licenciados table
CREATE TABLE public.licensees (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL, -- e.g., LIC-001
    name TEXT NOT NULL,
    legal_name TEXT,
    document_number TEXT, -- CNPJ
    email TEXT,
    phone TEXT,
    
    -- Address
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    
    -- Coverage area
    coverage_cities TEXT[] DEFAULT '{}',
    coverage_states TEXT[] DEFAULT '{}',
    
    -- Business hours
    business_hours JSONB DEFAULT '{}', -- {"monday": {"open": "08:00", "close": "18:00"}, ...}
    
    -- Status and performance
    status public.licensee_status NOT NULL DEFAULT 'pending',
    performance_score NUMERIC(5,2) DEFAULT 0,
    total_machines INTEGER DEFAULT 0,
    total_revenue NUMERIC(12,2) DEFAULT 0,
    
    -- Dates
    contract_start_date DATE,
    contract_end_date DATE,
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licensees ENABLE ROW LEVEL SECURITY;

-- Policies for licensees
CREATE POLICY "Authenticated users can view licensees"
ON public.licensees FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage licensees"
ON public.licensees FOR ALL
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- ----------------------------------------
-- 2. MÁQUINAS (Machines)
-- ----------------------------------------

CREATE TYPE public.machine_status AS ENUM ('operational', 'maintenance', 'offline', 'retired');

CREATE TABLE public.machines (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id TEXT UNIQUE NOT NULL, -- e.g., MCH-00001
    model TEXT NOT NULL,
    serial_number TEXT,
    
    -- Location
    licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL,
    location_address TEXT,
    location_city TEXT,
    location_state TEXT,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    
    -- Status
    status public.machine_status NOT NULL DEFAULT 'operational',
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    installation_date DATE,
    
    -- Consumption tracking
    total_units_dispensed INTEGER DEFAULT 0,
    units_since_last_refill INTEGER DEFAULT 0,
    capacity INTEGER DEFAULT 100,
    low_stock_threshold INTEGER DEFAULT 20,
    
    -- Credits/Revenue
    total_credits_generated NUMERIC(12,2) DEFAULT 0,
    current_price_per_unit NUMERIC(8,2) DEFAULT 0,
    
    -- Alerts
    has_active_alert BOOLEAN DEFAULT false,
    last_alert_message TEXT,
    last_alert_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- Policies for machines
CREATE POLICY "Authenticated users can view machines"
ON public.machines FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage machines"
ON public.machines FOR ALL
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- ----------------------------------------
-- 3. MACHINE CONSUMPTION HISTORY
-- ----------------------------------------

CREATE TABLE public.machine_consumption_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    
    date DATE NOT NULL,
    units_dispensed INTEGER DEFAULT 0,
    credits_generated NUMERIC(10,2) DEFAULT 0,
    refill_units INTEGER DEFAULT 0, -- If refill happened
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.machine_consumption_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view consumption"
ON public.machine_consumption_history FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage consumption"
ON public.machine_consumption_history FOR ALL
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- ----------------------------------------
-- 4. PEDIDOS CARBOZÉ (Orders)
-- ----------------------------------------

CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'invoiced', 'shipped', 'delivered', 'cancelled');

CREATE TABLE public.carboze_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL, -- e.g., PED-2026-00001
    
    -- Customer info (can be licensee or external)
    licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    
    -- Delivery address
    delivery_address TEXT,
    delivery_city TEXT,
    delivery_state TEXT,
    delivery_zip TEXT,
    
    -- Order details
    items JSONB NOT NULL DEFAULT '[]', -- [{product_id, name, quantity, unit_price, total}]
    subtotal NUMERIC(12,2) DEFAULT 0,
    shipping_cost NUMERIC(10,2) DEFAULT 0,
    discount NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    
    -- Status tracking
    status public.order_status NOT NULL DEFAULT 'pending',
    confirmed_at TIMESTAMP WITH TIME ZONE,
    invoiced_at TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    shipped_at TIMESTAMP WITH TIME ZONE,
    tracking_code TEXT,
    tracking_url TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    
    -- Commission (for applicable orders)
    has_commission BOOLEAN DEFAULT false,
    commission_rate NUMERIC(5,2) DEFAULT 0,
    commission_amount NUMERIC(10,2) DEFAULT 0,
    commission_paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.carboze_orders ENABLE ROW LEVEL SECURITY;

-- Policies for orders
CREATE POLICY "Authenticated users can view orders"
ON public.carboze_orders FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage orders"
ON public.carboze_orders FOR ALL
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- ----------------------------------------
-- 5. ORDER STATUS HISTORY
-- ----------------------------------------

CREATE TABLE public.order_status_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.carboze_orders(id) ON DELETE CASCADE,
    
    status public.order_status NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view order history"
ON public.order_status_history FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage order history"
ON public.order_status_history FOR ALL
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- ----------------------------------------
-- 6. TRIGGERS FOR AUTO-UPDATES
-- ----------------------------------------

-- Update timestamp trigger for new tables
CREATE TRIGGER update_licensees_updated_at
BEFORE UPDATE ON public.licensees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_machines_updated_at
BEFORE UPDATE ON public.machines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carboze_orders_updated_at
BEFORE UPDATE ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------
-- 7. FUNCTIONS FOR AUTO-GENERATED CODES
-- ----------------------------------------

-- Generate licensee code
CREATE OR REPLACE FUNCTION public.generate_licensee_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(code FROM 'LIC-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.licensees;
    
    NEW.code := 'LIC-' || LPAD(next_seq::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_licensee_code_trigger
BEFORE INSERT ON public.licensees
FOR EACH ROW
WHEN (NEW.code IS NULL OR NEW.code = '')
EXECUTE FUNCTION public.generate_licensee_code();

-- Generate machine ID
CREATE OR REPLACE FUNCTION public.generate_machine_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(machine_id FROM 'MCH-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.machines;
    
    NEW.machine_id := 'MCH-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_machine_id_trigger
BEFORE INSERT ON public.machines
FOR EACH ROW
WHEN (NEW.machine_id IS NULL OR NEW.machine_id = '')
EXECUTE FUNCTION public.generate_machine_id();

-- Generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    year_prefix := to_char(now(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(order_number FROM 'PED-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.carboze_orders
    WHERE order_number LIKE 'PED-' || year_prefix || '-%';
    
    NEW.order_number := 'PED-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_order_number_trigger
BEFORE INSERT ON public.carboze_orders
FOR EACH ROW
WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
EXECUTE FUNCTION public.generate_order_number();

-- ----------------------------------------
-- 8. ENABLE REALTIME
-- ----------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.licensees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carboze_orders;