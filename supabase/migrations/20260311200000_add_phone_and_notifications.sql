-- ============================================================================
-- Migration: Add phone number and notification preferences to profiles
-- Date: 2026-03-11
-- Purpose: Enable WhatsApp/Telegram alerts for critical operational events
-- ============================================================================

-- 1. Create notification channel enum
CREATE TYPE public.notification_channel AS ENUM (
  'whatsapp',
  'telegram',
  'both',
  'none'
);

-- 2. Add phone and notification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_country_code text DEFAULT '+55',
  ADD COLUMN IF NOT EXISTS notification_channel public.notification_channel DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- 3. Add comment for documentation
COMMENT ON COLUMN public.profiles.phone IS 'Phone number without country code (e.g. 11999998888)';
COMMENT ON COLUMN public.profiles.phone_country_code IS 'Country code with + prefix (default: +55 for Brazil)';
COMMENT ON COLUMN public.profiles.notification_channel IS 'Preferred channel for operational alerts';
COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Telegram chat ID for bot messaging (auto-populated on Telegram bot activation)';

-- 4. Create notification_log table to track sent notifications
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel public.notification_channel NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. Create index for notification lookups
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON public.notification_log(status) WHERE status = 'pending';

-- 6. Create notification_preferences table for granular control
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  alert_os_risk boolean DEFAULT true,
  alert_os_overdue boolean DEFAULT true,
  alert_stock_rupture boolean DEFAULT true,
  alert_purchase_pending boolean DEFAULT true,
  alert_shipment_delayed boolean DEFAULT true,
  alert_new_licensee_order boolean DEFAULT true,
  alert_member_approval boolean DEFAULT true,
  quiet_hours_start time DEFAULT '22:00',
  quiet_hours_end time DEFAULT '07:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. RLS Policies for notification_log
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
  ON public.notification_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update notifications"
  ON public.notification_log FOR UPDATE
  USING (true);

-- 8. RLS Policies for notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 9. Auto-create notification preferences when profile is created
CREATE OR REPLACE FUNCTION public.create_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_add_notification_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_preferences();

-- 10. Function to get users who should be notified for a given event
CREATE OR REPLACE FUNCTION public.get_notification_targets(p_event_type text)
RETURNS TABLE (
  user_id uuid,
  phone text,
  phone_country_code text,
  notification_channel public.notification_channel,
  telegram_chat_id text,
  full_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.phone,
    p.phone_country_code,
    p.notification_channel,
    p.telegram_chat_id,
    p.full_name
  FROM public.profiles p
  LEFT JOIN public.notification_preferences np ON np.user_id = p.id
  WHERE p.notification_channel != 'none'
    AND p.phone IS NOT NULL
    AND (
      (p_event_type = 'os_risk' AND COALESCE(np.alert_os_risk, true))
      OR (p_event_type = 'os_overdue' AND COALESCE(np.alert_os_overdue, true))
      OR (p_event_type = 'stock_rupture' AND COALESCE(np.alert_stock_rupture, true))
      OR (p_event_type = 'purchase_pending' AND COALESCE(np.alert_purchase_pending, true))
      OR (p_event_type = 'shipment_delayed' AND COALESCE(np.alert_shipment_delayed, true))
      OR (p_event_type = 'new_licensee_order' AND COALESCE(np.alert_new_licensee_order, true))
      OR (p_event_type = 'member_approval' AND COALESCE(np.alert_member_approval, true))
    )
    AND (
      -- Respect quiet hours
      np.quiet_hours_start IS NULL
      OR np.quiet_hours_end IS NULL
      OR NOT (
        CURRENT_TIME >= np.quiet_hours_start
        AND CURRENT_TIME <= np.quiet_hours_end
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
