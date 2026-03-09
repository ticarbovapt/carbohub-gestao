-- Create audit_logs table for tracking edge function executions
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  action_name text NOT NULL,
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  error_message text
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert audit logs (via service role key)
-- No INSERT policy needed as service role bypasses RLS

-- Create index for faster queries
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX idx_audit_logs_executed_at ON public.audit_logs(executed_at DESC);
CREATE INDEX idx_audit_logs_executed_by ON public.audit_logs(executed_by);

-- Add temp_password_expires_at column to profiles for password expiration
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS temp_password_expires_at timestamp with time zone;

-- Update existing users with temp passwords to have expiration 24h from creation
UPDATE public.profiles 
SET temp_password_expires_at = created_at + interval '24 hours'
WHERE password_must_change = true 
  AND temp_password_expires_at IS NULL
  AND temp_password_sent_at IS NOT NULL;

-- Comment for documentation
COMMENT ON TABLE public.audit_logs IS 'Tracks all edge function executions and important system actions for security auditing.';
COMMENT ON COLUMN public.profiles.temp_password_expires_at IS 'When the temporary password expires (24h after creation). User cannot login after this until password is reset.';