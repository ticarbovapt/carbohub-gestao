-- Enable realtime for os_messages and os_actions tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_actions;

-- Add attachments column to os_messages for file uploads
ALTER TABLE public.os_messages ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Storage policies for chat attachments
CREATE POLICY "Authenticated users can view chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own chat attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);