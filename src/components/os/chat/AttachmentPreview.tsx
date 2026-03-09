import React from "react";
import { MessageAttachment } from "@/hooks/useOsMessages";
import { X, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AttachmentPreviewProps {
  attachments: MessageAttachment[];
  onRemove?: (index: number) => void;
  compact?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

export function AttachmentPreview({ attachments, onRemove, compact }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex gap-2 flex-wrap", compact ? "mt-2" : "mb-2 p-2 border rounded-lg bg-muted/50")}>
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className={cn(
            "relative group rounded-lg overflow-hidden border bg-background",
            compact ? "w-16 h-16" : "w-20 h-20"
          )}
        >
          {isImage(attachment.type) ? (
            <a href={attachment.url} target="_blank" rel="noopener noreferrer">
              <img
                src={attachment.url}
                alt={attachment.name}
                className="w-full h-full object-cover hover:opacity-80 transition-opacity"
              />
            </a>
          ) : (
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center w-full h-full p-2 hover:bg-accent transition-colors"
            >
              <FileText className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {attachment.name.length > 10
                  ? `${attachment.name.substring(0, 7)}...`
                  : attachment.name}
              </span>
            </a>
          )}
          
          {onRemove && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onRemove(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}

          {!compact && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 py-0.5 truncate">
              {formatFileSize(attachment.size)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
