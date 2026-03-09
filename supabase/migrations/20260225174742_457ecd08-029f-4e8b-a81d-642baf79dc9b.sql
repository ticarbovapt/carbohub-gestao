
-- Tabela de Centros de Distribuição
CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text,
  state text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouses viewable by authenticated" ON public.warehouses
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Warehouses manageable by admin" ON public.warehouses
  FOR ALL USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

-- Estoque por CD x Produto
CREATE TABLE public.warehouse_stock (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, product_id)
);

ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock viewable by authenticated" ON public.warehouse_stock
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Stock manageable by gestor+" ON public.warehouse_stock
  FOR ALL USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR is_admin(auth.uid()));

-- Adicionar warehouse_id em stock_movements
ALTER TABLE public.stock_movements ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- Inserir os dois CDs
INSERT INTO public.warehouses (code, name, city, state)
VALUES
  ('HUB-RN', 'Hub RN', 'Natal', 'RN'),
  ('HUB-SP', 'Hub SP', 'São Paulo', 'SP');

-- Criar estoque zerado para todos os produtos ativos em ambos CDs
INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
SELECT w.id, p.id, 0
FROM public.warehouses w
CROSS JOIN public.mrp_products p
WHERE p.is_active = true;
