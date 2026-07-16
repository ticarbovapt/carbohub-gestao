# Carbo Chat — Mapa de arquitetura e construção

Chat interno da empresa, **ao vivo nos 4 sistemas** (CRM, Ops, Finanças, Admin),
estilo Slack. Objetivo: trazer a comunicação interna pra dentro do ecossistema
(no lugar do WhatsApp) — DMs, grupos, imagens, arquivos, **áudio**, @menções.

> Decisões travadas com o dono (2026-07-16):
> - **Compartilhamento de código:** pacote compartilhado `packages/chat`.
> - **MVP:** DMs + grupos + texto, imagens/arquivos, **áudio**, **@menções + notificação**.
> - **UX:** tela cheia `/chat` (layout próprio de 3 colunas) + badge de não-lidas na TopBar.
> - **Acesso:** somente usuários internos (`is_employee`). Externos (lojas/PDV, licenciados) ficam de fora.

---

## 1. Princípio central: o backend já é cross-system

Os 4 apps usam **o mesmo Supabase** (mesmo Postgres/Auth/Storage/Realtime). Logo o
chat vive **uma vez** no banco e aparece automaticamente em todos os sistemas. Não
há ponte entre apps — o que muda por app é só a camada visual (o pacote `packages/chat`).

---

## 2. Modelo de dados (Postgres)

```sql
-- Canal = grupo OU dm (conversa 1:1). DM não tem name; identidade = os 2 membros.
chat_channels
  id            uuid pk
  type          text  check (type in ('group','dm'))
  name          text                     -- null em dm
  description   text
  is_private    boolean default true     -- grupo privado (só convidados) vs aberto
  avatar_url    text
  created_by    uuid  -> profiles.id
  created_at    timestamptz default now()
  archived_at   timestamptz

-- Participação + controle de não-lidas (last_read_at é a chave do "badge").
chat_channel_members
  channel_id    uuid -> chat_channels.id on delete cascade
  user_id       uuid -> profiles.id
  role          text check (role in ('owner','admin','member')) default 'member'
  joined_at     timestamptz default now()
  last_read_at  timestamptz default now()
  muted         boolean default false
  primary key (channel_id, user_id)

chat_messages
  id            uuid pk
  channel_id    uuid -> chat_channels.id on delete cascade
  sender_id     uuid -> profiles.id
  kind          text check (kind in ('text','image','video','audio','file','system')) default 'text'
  body          text                     -- texto ou legenda
  reply_to_id   uuid -> chat_messages.id -- responder/citar (v2 usa, MVP pode ignorar)
  mentions      uuid[] default '{}'      -- ids mencionados (@) para notificação
  metadata      jsonb default '{}'
  created_at    timestamptz default now()
  edited_at     timestamptz
  deleted_at    timestamptz              -- soft delete

chat_attachments               -- 1 mensagem pode ter N anexos
  id            uuid pk
  message_id    uuid -> chat_messages.id on delete cascade
  storage_path  text            -- chat-media/{channel_id}/{message_id}/arquivo
  mime_type     text
  size_bytes    bigint
  width         int
  height        int
  duration_ms   int             -- áudio/vídeo
  thumbnail_path text

chat_reactions                 -- V2
  message_id, user_id, emoji, created_at   (pk message_id+user_id+emoji)
```

### Não-lidas
RPC `chat_unread_counts()` → por canal `count(*) where created_at > member.last_read_at`
+ total geral. Alimenta o badge da sidebar/TopBar. Marca lido = `update member set last_read_at = now()`.

### Presença / "digitando…"
**Realtime Presence + Broadcast** (efêmero, sem gravar no banco). Um canal Realtime
por conversa aberta; presença global leve para status online.

---

## 3. RLS (resumo)

Funções já existentes: `is_employee(uid)`, `is_gestor(uid)`.

- **Elegibilidade:** todas as tabelas exigem `is_employee(auth.uid())` (bloqueia externos).
- **chat_channels SELECT:** é membro do canal (`exists em chat_channel_members`) OU canal público não-arquivado.
- **chat_channels INSERT:** `created_by = auth.uid()` e interno.
- **chat_channel_members:** vê linhas dos canais em que participa; owner/admin adiciona/remove.
- **chat_messages SELECT/INSERT:** só em canais dos quais é membro; `sender_id = auth.uid()` no insert.
- **chat_messages UPDATE/DELETE:** só o autor (edição/soft-delete); gestor pode moderar.
- Helper `chat_is_member(channel_id, uid)` (SECURITY DEFINER) pra evitar recursão de RLS.

---

## 4. Storage (mídia)

- Bucket **privado `chat-media`** (reaproveitar `chat-attachments` órfão ou criar novo).
- Caminho: `chat-media/{channel_id}/{message_id}/{arquivo}`.
- Policies: só membro do canal lê/escreve (via path → channel_id).
- **Áudio:** `MediaRecorder` no navegador → `.webm/opus`, com `duration_ms` + waveform simples.
- **Imagem/vídeo:** miniatura gerada no cliente; limite de tamanho e compressão.
- Acesso por **URL assinada** (expira).

---

## 5. Frontend — `packages/chat`

Pacote compartilhado consumido pelos 4 apps. Cada app já tem seu build/Vite; adicionamos
alias `@carbo/chat` (tsconfig paths + vite resolve.alias) sem tocar no lockfile da raiz.

```
packages/chat/
  src/
    index.ts                 -- API pública (ChatApp, ChatBadge, provider)
    supabaseTypes.ts         -- tipos das tabelas chat_*
    hooks/
      useChannels.ts         -- lista canais/DMs do usuário + não-lidas
      useMessages.ts         -- mensagens do canal + realtime + paginação
      useSendMessage.ts      -- texto + anexos (upload) + otimista
      useUnread.ts           -- chat_unread_counts (badge)
      usePresence.ts         -- online + digitando
      useChatDirectory.ts    -- diretório de internos (profiles) p/ iniciar DM/convidar
    components/
      ChatApp.tsx            -- layout 3 colunas (tela /chat)
      ChatSidebar.tsx        -- col.1 navegação (Canais/DMs/favoritos)
      ConversationList.tsx   -- col.2 lista de conversas
      Conversation.tsx       -- col.3 thread aberta
      MessageList.tsx / MessageItem.tsx
      Composer.tsx           -- caixa: texto, @menção, anexo, gravar áudio
      AudioRecorder.tsx / AudioPlayer.tsx
      Attachment.tsx         -- render imagem/vídeo/arquivo
      NewChannelDialog.tsx / NewDmDialog.tsx
      ChatBadge.tsx          -- badge de não-lidas (TopBar)
```

**Requisito do pacote:** recebe o `supabase` client e o usuário atual via provider
(`<ChatProvider supabase={...} currentUser={...}>`), porque cada app tem seu próprio
client/auth. Nada de import cruzado de app.

### Integração por app (×4: crm, ops, financas, admin)
1. `vite.config` + `tsconfig`: alias `@carbo/chat` → `../../packages/chat/src`.
2. Rota `/chat` → `<ChatApp/>` dentro do layout do app.
3. Item **"Carbo Chat"** na sidebar (com `<ChatBadge/>`).
4. `<ChatBadge/>` também na TopBar (não-lidas global, visível sem abrir).

---

## 6. Notificações
Reaproveita `notification_log` + `useLiveNotifications` + `NotificationBell` já existentes:
- @menção e nova DM geram notificação → sininho pisca em qualquer app.
- V2: notificação desktop/push.

---

## 7. Fases

### Fase 0 — Backend (base de tudo)
- Migrations: tabelas `chat_*`, RLS, helper `chat_is_member`, RPC `chat_unread_counts`.
- Bucket `chat-media` + policies.
- Habilitar Realtime nas tabelas `chat_messages`/`chat_channel_members`.

### Fase 1 — Pacote + MVP texto
- `packages/chat` com provider, hooks base, layout 3 colunas.
- DMs + grupos + texto + não-lidas + realtime + presença.
- Wiring nos 4 apps (rota + sidebar + badge).

### Fase 2 — Mídia
- Upload imagem/arquivo + render; **gravação e player de áudio**.

### Fase 3 — @menções + notificação
- Autocomplete de @menção no Composer + disparo de notificação.

### V2 (depois do MVP)
- Vídeo, reações, threads/responder, busca, recibos de leitura, painel deslizante, push.

---

## 8. Riscos / pontos de atenção
- **Primeiro `packages/` do monorepo:** wiring de alias em 4 builds. Contido — não toca
  o `package.json`/deploy da raiz (controle). Validar build de cada app após o alias.
- **RLS recursiva** (membros ↔ canais): usar helper SECURITY DEFINER.
- **Custo de Realtime:** assinar só o canal aberto + presença leve; não abrir N assinaturas.
- **Mídia pesada:** limite de tamanho, compressão no cliente, URL assinada.
- **Externos:** garantir `is_employee` em toda policy (não vazar pra lojas/licenciados).
```
