
-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  document_number TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  address TEXT,
  category TEXT DEFAULT 'geral',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view suppliers"
ON public.suppliers FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert suppliers"
ON public.suppliers FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

CREATE POLICY "Managers can update suppliers"
ON public.suppliers FOR UPDATE
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

CREATE POLICY "Admins can delete suppliers"
ON public.suppliers FOR DELETE
USING (auth.uid() IS NOT NULL AND is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
