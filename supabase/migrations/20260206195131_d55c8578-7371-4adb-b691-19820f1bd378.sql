
-- 1. Create shipment_status enum
CREATE TYPE public.shipment_status AS ENUM (
  'separacao_pendente',
  'separando',
  'separado',
  'em_transporte',
  'entregue',
  'cancelado'
);

-- 2. Create os_shipments table
CREATE TABLE public.os_shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  status public.shipment_status NOT NULL DEFAULT 'separacao_pendente',
  
  -- Separação
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  separated_by UUID,
  separated_at TIMESTAMPTZ,
  destination TEXT,
  
  -- Envio
  transport_mode TEXT,
  carrier_name TEXT,
  shipped_at TIMESTAMPTZ,
  shipped_by UUID,
  tracking_code TEXT,
  tracking_url TEXT,
  estimated_delivery TIMESTAMPTZ,
  
  -- Entrega
  delivered_at TIMESTAMPTZ,
  delivered_by UUID,
  delivery_evidence JSONB DEFAULT '[]'::jsonb,
  delivery_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- 3. Enable RLS
ALTER TABLE public.os_shipments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Shipments viewable by governance and OS access"
ON public.os_shipments
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR 
    is_gestor(auth.uid()) OR 
    can_access_os(auth.uid(), service_order_id)
  )
);

CREATE POLICY "Shipments created by governance and executors"
ON public.os_shipments
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR 
    is_gestor(auth.uid()) OR 
    can_execute_os_stage(auth.uid(), service_order_id)
  )
);

CREATE POLICY "Shipments updated by governance and executors"
ON public.os_shipments
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR 
    is_gestor(auth.uid()) OR 
    can_execute_os_stage(auth.uid(), service_order_id)
  )
);

CREATE POLICY "Shipments deleted by admin only"
ON public.os_shipments
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Updated_at trigger
CREATE TRIGGER update_os_shipments_updated_at
BEFORE UPDATE ON public.os_shipments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_shipments;

-- 7. Update checklist_stage_config for logistica stage
UPDATE public.checklist_stage_config
SET 
  is_optional = false,
  default_items = '[
    {"id": "items_separated", "label": "Itens separados e conferidos", "type": "checkbox", "required": true},
    {"id": "quantity_lot_checked", "label": "Quantidade e lote conferidos", "type": "checkbox", "required": true},
    {"id": "destination_confirmed", "label": "Destino confirmado", "type": "text", "required": true},
    {"id": "separation_responsible", "label": "Responsável pela separação", "type": "text", "required": true},
    {"id": "transport_mode", "label": "Modal de transporte", "type": "select", "options": ["proprio", "transportadora", "correios", "motoboy"], "required": true},
    {"id": "carrier_name", "label": "Transportadora", "type": "text", "required": false},
    {"id": "ship_date", "label": "Data de envio", "type": "date", "required": true},
    {"id": "tracking_code", "label": "Código de rastreio", "type": "text", "required": false},
    {"id": "delivery_confirmed", "label": "Confirmação de entrega", "type": "checkbox", "required": true},
    {"id": "delivery_evidence", "label": "Evidência de entrega (foto/assinatura)", "type": "file", "required": true},
    {"id": "final_notes", "label": "Observações finais", "type": "textarea", "required": false}
  ]'::jsonb,
  updated_at = now()
WHERE stage = 'logistica';
