import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOsMessages, OsMessage } from "@/hooks/useOsMessages";
import { useTeamProfiles } from "@/hooks/useTeamProfiles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { AlertCircle, CheckCircle2, Clock, Lightbulb, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentPreview } from "./AttachmentPreview";

type MessageTag = Database["public"]["Enums"]["message_tag"];

interface MessageListProps {
  serviceOrderId: string;
  onScrollToBottom?: () => void;
}

const TAG_CONFIG: Record<MessageTag, { label: string; icon: React.ReactNode; className: string }> = {
  pendency: {
    label: "Pendência",
    icon: <AlertCircle className="h-3 w-3" />,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  resolved: {
    label: "Resolvido",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-success/10 text-success border-success/30",
  },
  waiting: {
    label: "Aguardando",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-warning/10 text-warning border-warning/30",
  },
  suggestion: {
    label: "Sugestão",
    icon: <Lightbulb className="h-3 w-3" />,
    className: "bg-primary/10 text-primary border-primary/30",
  },
};

export function MessageList({ serviceOrderId }: MessageListProps) {
  const { messages, isLoading, updateMessageTag } = useOsMessages(serviceOrderId);
  const { data: profiles = [] } = useTeamProfiles();
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCount) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setLastMessageCount(messages.length);
    }
  }, [messages.length, lastMessageCount]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
        <div>
          <p className="font-medium">Nenhuma mensagem ainda</p>
          <p className="text-xs mt-1">Inicie a conversa sobre esta OP</p>
        </div>
      </div>
    );
  }

  const getMentionedNames = (mentions: string[]) => {
    return mentions
      .map((id) => profiles.find((p) => p.id === id)?.full_name || "Usuário")
      .filter(Boolean);
  };

  // Parse message content and render mentions as styled React elements (XSS-safe)
  const renderContent = (message: OsMessage) => {
    const content = message.content;
    
    if (!message.mentions || message.mentions.length === 0) {
      // No mentions - render as plain text (React escapes automatically)
      return <span>{content}</span>;
    }

    // Build a map of mention patterns to profile names
    const mentionMap = new Map<string, string>();
    message.mentions.forEach((mentionId) => {
      const profile = profiles.find((p) => p.id === mentionId);
      if (profile?.full_name) {
        mentionMap.set(`@${profile.full_name}`, profile.full_name);
      }
    });

    if (mentionMap.size === 0) {
      return <span>{content}</span>;
    }

    // Create a regex pattern to match all mentions
    const mentionNames = Array.from(mentionMap.keys()).map(
      name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const pattern = new RegExp(`(${mentionNames.join('|')})`, 'gi');
    
    // Split content by mentions and render with React elements
    const parts = content.split(pattern);
    
    return (
      <span>
        {parts.map((part, index) => {
          // Check if this part is a mention (case-insensitive)
          const isMention = mentionNames.some(
            mentionPattern => new RegExp(`^${mentionPattern}$`, 'i').test(part)
          );
          
          if (isMention) {
            return (
              <span key={index} className="text-primary font-medium">
                {part}
              </span>
            );
          }
          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        const isOwn = message.user_id === user?.id;
        const tagConfig = message.tag ? TAG_CONFIG[message.tag] : null;

        return (
          <div
            key={message.id}
            className={cn(
              "group flex gap-3",
              tagConfig && "rounded-lg p-3 border",
              tagConfig?.className
            )}
          >
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={message.profile?.avatar_url || undefined} />
              <AvatarFallback className="text-xs">
                {message.profile?.full_name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {message.profile?.full_name || "Usuário"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(message.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
                {tagConfig && (
                  <Badge variant="outline" className={cn("gap-1 text-xs", tagConfig.className)}>
                    {tagConfig.icon}
                    {tagConfig.label}
                  </Badge>
                )}
               </div>

              <p className="text-sm mt-1 break-words">{renderContent(message)}</p>
              
              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <AttachmentPreview attachments={message.attachments} compact />
              )}
            </div>

            {/* Tag menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem
                  onClick={() => updateMessageTag({ messageId: message.id, tag: "pendency" })}
                >
                  <AlertCircle className="h-4 w-4 mr-2 text-destructive" />
                  Marcar como Pendência
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateMessageTag({ messageId: message.id, tag: "resolved" })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
                  Marcar como Resolvido
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateMessageTag({ messageId: message.id, tag: "waiting" })}
                >
                  <Clock className="h-4 w-4 mr-2 text-warning" />
                  Marcar como Aguardando
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateMessageTag({ messageId: message.id, tag: "suggestion" })}
                >
                  <Lightbulb className="h-4 w-4 mr-2 text-primary" />
                  Marcar como Sugestão
                </DropdownMenuItem>
                {message.tag && (
                  <DropdownMenuItem
                    onClick={() => updateMessageTag({ messageId: message.id, tag: null })}
                  >
                    Remover marcação
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
