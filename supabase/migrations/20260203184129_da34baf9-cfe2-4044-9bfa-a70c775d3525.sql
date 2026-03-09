-- =====================================================
-- 1. SCHEDULING TABLE AND SECURITY
-- =====================================================

-- Create scheduling table for OS-related events
CREATE TABLE public.scheduled_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  all_day BOOLEAN DEFAULT false,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'general' CHECK (event_type IN ('os_creation', 'os_delivery', 'meeting', 'deadline', 'general')),
  created_by UUID NOT NULL,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  color TEXT DEFAULT '#3B82F6',
  reminder_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_events
CREATE POLICY "Events viewable by authenticated users"
ON public.scheduled_events FOR SELECT
USING (true);

CREATE POLICY "Managers can create events"
ON public.scheduled_events FOR INSERT
WITH CHECK (is_manager_or_admin(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Managers can update events"
ON public.scheduled_events FOR UPDATE
USING (is_manager_or_admin(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Managers can delete events"
ON public.scheduled_events FOR DELETE
USING (is_manager_or_admin(auth.uid()) OR created_by = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_scheduled_events_updated_at
BEFORE UPDATE ON public.scheduled_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. STORAGE SECURITY - Make chat-attachments private
-- =====================================================

-- Update the bucket to be private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Add SELECT policy for authenticated users
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments' 
  AND auth.role() = 'authenticated'
);

-- =====================================================
-- 3. FIX NOTIFICATION POLICY - More restrictive
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Create more restrictive notification creation policy
-- Only allow creating notifications if:
-- 1. User is creating a notification for an action they assigned, OR
-- 2. User is creating a notification for a message mention they authored
CREATE POLICY "Users can create notifications for their actions"
ON public.notifications FOR INSERT
WITH CHECK (
  -- Always require auth
  auth.uid() IS NOT NULL
  AND (
    -- Allow managers/admins to create any notification
    is_manager_or_admin(auth.uid())
    OR
    -- For os_action notifications, check if user assigned the action
    (reference_type = 'os_action' AND EXISTS (
      SELECT 1 FROM os_actions 
      WHERE id = reference_id 
      AND assigned_by = auth.uid()
    ))
    OR
    -- For os_message notifications (mentions), check if user authored the message
    (reference_type = 'os_message' AND EXISTS (
      SELECT 1 FROM os_messages 
      WHERE id = reference_id 
      AND user_id = auth.uid()
    ))
  )
);

-- Enable realtime for scheduled_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_events;