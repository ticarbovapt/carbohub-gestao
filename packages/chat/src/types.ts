// Tipos do Carbo Chat (compartilhado entre os 4 apps).

export interface ChatUser {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface ChatProfileRef {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export type ChannelType = "group" | "dm";
export type MessageKind = "text" | "image" | "video" | "audio" | "file" | "system";

export interface ChatChannel {
  id: string;
  type: ChannelType;
  name: string | null;
  description: string | null;
  is_private: boolean;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
  is_announcement?: boolean;
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumbnail_path: string | null;
}

export interface ChatReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  reply_to_id: string | null;
  mentions: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: ChatProfileRef | null;
  attachments?: ChatAttachment[];
  reactions?: ChatReaction[];
}

export type ScheduledStatus = "pending" | "sending" | "sent" | "failed" | "canceled";

// Mensagem agendada ("enviar depois").
export interface ScheduledMessage {
  id: string;
  channelId: string;
  kind: MessageKind;
  body: string | null;
  mentions: string[];
  metadata: Record<string, unknown>;
  sendAt: string;
  status: ScheduledStatus;
  attempts: number;
  lastError: string | null;
  attachmentCount: number;
}

// Conversa normalizada para a lista (DM mostra o outro; grupo mostra o nome).
export interface Conversation {
  channel: ChatChannel;
  title: string;
  avatarUrl: string | null;
  otherUserId: string | null; // dm
  unread: number;
  lastAt: string | null;
  lastBody: string | null;
  lastKind: MessageKind | null;
  lastSenderId: string | null;
  lastSenderName: string | null;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  isAnnouncement: boolean;
  needsAck: boolean;
}
