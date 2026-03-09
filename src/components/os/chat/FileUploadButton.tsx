import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MessageAttachment } from "@/hooks/useOsMessages";

interface FileUploadButtonProps {
  onFilesUploaded: (attachments: MessageAttachment[]) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function FileUploadButton({ onFilesUploaded, disabled }: FileUploadButtonProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    const uploadedAttachments: MessageAttachment[] = [];

    try {
      for (const file of Array.from(files)) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} é muito grande. Máximo: 10MB`);
          continue;
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name} não é um tipo de arquivo permitido`);
          continue;
        }

        // Generate unique path
        const timestamp = Date.now();
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(path, file);

        if (uploadError) {
          toast.error(`Erro ao enviar ${file.name}`);
          console.error("Upload error:", uploadError);
          continue;
        }

        // Get signed URL (1 hour expiry) for private bucket
        const { data: urlData, error: urlError } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(path, 3600); // 1 hour expiry

        if (urlError || !urlData?.signedUrl) {
          toast.error(`Erro ao gerar URL para ${file.name}`);
          console.error("URL generation error:", urlError);
          continue;
        }

        uploadedAttachments.push({
          name: file.name,
          url: urlData.signedUrl,
          type: file.type,
          size: file.size,
        });
      }

      if (uploadedAttachments.length > 0) {
        onFilesUploaded(uploadedAttachments);
        toast.success(`${uploadedAttachments.length} arquivo(s) anexado(s)`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao fazer upload dos arquivos");
    } finally {
      setIsUploading(false);
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleClick}
        disabled={disabled || isUploading}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
