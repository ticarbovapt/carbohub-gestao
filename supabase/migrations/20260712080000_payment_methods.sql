-- Cadastro de Cartões / formas de pagamento (compartilhado: usado na compra da
-- OC e, no futuro, nas assinaturas). Por segurança/PCI NÃO guardamos número
-- completo: só os 4 últimos dígitos + bandeira. O suficiente pra identificar
-- em qual cartão cai a cobrança, sem risco de vazar dado sensível.
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apelido text NOT NULL,                              -- ex: "Nubank TI", "Inter PJ"
  tipo text NOT NULL DEFAULT 'credito',              -- credito | debito | pix | boleto | manual
  bandeira text,                                     -- visa | mastercard | elo | amex | outro (só cartão)
  ultimos4 text,                                     -- 4 dígitos (só cartão)
  titular text,                                      -- opcional
  departamento text,                                 -- setor dono (opcional)
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_methods_ultimos4_chk CHECK (ultimos4 IS NULL OR ultimos4 ~ '^[0-9]{4}$')
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_all ON public.payment_methods;
CREATE POLICY payment_methods_all ON public.payment_methods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
