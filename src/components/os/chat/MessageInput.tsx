import React, { useState, useRef } from "react";
import { useOsMessages, MessageAttachment } from "@/hooks/useOsMessages";
import { useTeamProfiles } from "@/hooks/useTeamProfiles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Send, Wrench, AtSign, Smile } from "lucide-react";
import { FileUploadButton } from "./FileUploadButton";
import { AttachmentPreview } from "./AttachmentPreview";

interface MessageInputProps {
  serviceOrderId: string;
  onAddAction: () => void;
}

const EMOJI_OPTIONS = ["👍", "👎", "✅", "❌", "⚠️", "🔥", "💡", "🎯", "📌", "🚀"];

export function MessageInput({ serviceOrderId, onAddAction }: MessageInputProps) {
  const { sendMessage, isSending } = useOsMessages(serviceOrderId);
  const { data: profiles = [] } = useTeamProfiles();
  
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter profiles for mentions
  const filteredProfiles = profiles.filter((p) =>
    p.full_name?.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const handleSend = () => {
    if (!content.trim() && attachments.length === 0) return;

    sendMessage({
      content: content.trim(),
      mentions: selectedMentions,
      attachments,
    });

    setContent("");
    setSelectedMentions([]);
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    // Handle @ for mentions
    if (e.key === "@" || (e.key === "2" && e.shiftKey)) {
      setShowMentions(true);
      setMentionSearch("");
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    // Check for mention trigger
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1 && lastAtIndex === value.length - 1) {
      setShowMentions(true);
      setMentionSearch("");
    } else if (showMentions) {
      const textAfterAt = value.slice(value.lastIndexOf("@") + 1);
      if (!textAfterAt.includes(" ")) {
        setMentionSearch(textAfterAt);
      } else {
        setShowMentions(false);
      }
    }
  };

  const insertMention = (profile: { id: string; full_name: string | null }) => {
    const name = profile.full_name || "Usuário";
    const lastAtIndex = content.lastIndexOf("@");
    const newContent = content.slice(0, lastAtIndex) + `@${name} `;
    setContent(newContent);
    setSelectedMentions([...selectedMentions, profile.id]);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const insertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleFilesUploaded = (newAttachments: MessageAttachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t bg-background p-4">
      {/* Attachment preview */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={handleRemoveAttachment}
      />

      {/* Mention suggestions */}
      {showMentions && filteredProfiles.length > 0 && (
        <div className="mb-2 border rounded-lg bg-popover p-1 max-h-40 overflow-y-auto">
          {filteredProfiles.slice(0, 5).map((profile) => (
            <button
              key={profile.id}
              onClick={() => insertMention(profile)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
            >
              {profile.full_name || "Usuário"}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Escreva algo ou atribua uma ação..."
          rows={2}
          className="resize-none"
          disabled={isSending}
        />

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {/* File upload button */}
            <FileUploadButton
              onFilesUploaded={handleFilesUploaded}
              disabled={isSending}
            />

            {/* Mention button */}
            <Popover open={showMentions} onOpenChange={setShowMentions}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setContent((prev) => prev + "@");
                    setShowMentions(true);
                    textareaRef.current?.focus();
                  }}
                >
                  <AtSign className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1 bg-popover" align="start">
                {profiles.slice(0, 8).map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => insertMention(profile)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                  >
                    {profile.full_name || "Usuário"}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Emoji picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 bg-popover" align="start">
                <div className="flex gap-1 flex-wrap max-w-48">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => insertEmoji(emoji)}
                      className="p-1.5 hover:bg-accent rounded text-lg transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Add action button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onAddAction}
            >
              <Wrench className="h-3.5 w-3.5" />
              Adicionar ação
            </Button>
          </div>

          <Button
            onClick={handleSend}
            disabled={(!content.trim() && attachments.length === 0) || isSending}
            size="sm"
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
