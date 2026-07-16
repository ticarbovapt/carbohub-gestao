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
}

// Conversa normalizada para a lista (DM mostra o outro; grupo mostra o nome).
export interface Conversation {
  channel: ChatChannel;
  title: string;
  avatarUrl: string | null;
  otherUserId: string | null; // dm
  unread: number;
}
