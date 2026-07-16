# Carbo Chat — Estado atual (as-built)

Chat interno estilo WhatsApp/Slack, **ao vivo nos 4 sistemas** (CRM, Ops, Finanças,
Admin), via pacote compartilhado `packages/chat`. Backend único no Supabase.
Ver também `docs/CARBO-CHAT.md` (plano original).

## Acesso
- Somente **usuários internos** (`is_employee` = tem linha em `public.profiles`).
- Externos (lojas/PDV, licenciados) ficam de fora.
- RLS por participação: você só vê canais/mensagens dos quais é membro.
- Nomes/avatares/diretório resolvidos por **RPCs SECURITY DEFINER** (a RLS de
  `profiles` esconderia gente fora do seu escopo).

## Onde vive
- `packages/chat` (UI + hooks). Integrado em cada app: alias `@carbo/chat`,
  `dedupe` no Vite, `content` do Tailwind, rota `/chat`, item "Carbo Chat" na
  sidebar (com badge) e `<ChatProvider>` no shell/layout.

---

## Funcionalidades

### Conversas e navegação
- **DMs + grupos na mesma lista** (estilo WhatsApp), ordenada por atividade.
- Item mostra **avatar, nome, prévia da última mensagem, horário** (Hoje/Ontem/dd/MM)
  e **badge de não-lidas**. Em grupo: "Fulano: mensagem".
- Filtro **Tudo / Grupos**; busca de conversa.
- **Botão único (+)** com menu "Nova conversa" / "Novo grupo".
- **Abre a conversa direto** ao criar DM/grupo.
- **Persiste a conversa aberta no F5** (URL `?c=<id>` + localStorage).

### Mensagens
- **Balões**: enviadas à direita (coloridas), recebidas à esquerda; nome do
  remetente em grupo; hora no balão; separador de dia.
- **Tempo real** (nova mensagem aparece na hora).
- **Texto**, **imagens/arquivos**, **vídeo** (player), **áudio** (gravador +
  player, estilo WhatsApp).
- **Responder** mensagem específica (citação no balão; no grupo notifica o autor).
- **Reagir com emoji** (👍❤️😂😮😢🙏✅), agregado abaixo do balão, ao vivo.
- **Buscar dentro da conversa** (nas mensagens carregadas).
- Toolbar de reagir/responder **ao lado do balão, só no hover**.

### Compositor
- **Anexar** (imagem/vídeo/arquivo, até 10) com prévia.
- **Emoji picker** (insere no cursor).
- Campo **cresce sozinho** até um máximo (depois rola).
- Botão direito **dinâmico**: **enviar** quando há conteúdo, **microfone** quando vazio.
- **@menção só em grupo** (bloqueada em DM para não notificar por engano).
- **@todos**: menciona todo o grupo e **notifica mesmo silenciado**.

### Menu de ações da conversa (hover / botão direito na lista)
- **Fixar / Desafixar** (fica no topo).
- **Silenciar / Ativar notificações**.
- **Marcar como lida / não lida**.
- **Excluir conversa** (DM) / **Sair do grupo**.

### Painel "Dados do contato / grupo" (clique no cabeçalho)
- Foto, nome; **DM**: departamento · função · e-mail; **grupo**: privacidade + membros.
- Ações rápidas: **Silenciar**, **Fixar**.
- **Grupo (dono/admin)**: renomear, **adicionar/remover membros**.
- **Mídia e arquivos** da conversa (galeria; "Ver todas" em modal).
- **Excluir conversa / Sair do grupo**.

### Notificações e alertas
- **Sininho** (tabela `public.notifications`): DM avisa o destinatário; grupo avisa
  os **@mencionados**; **@todos** avisa todos mesmo silenciados; respeita "mutado";
  nunca notifica o autor. (via trigger `chat_notify_on_message`.)
- **Som + toast global** ao receber mensagem em **qualquer página** (chime Web Audio
  + toast sonner). Suprime som/toast se você já está vendo o canal ou se está mutado.

---

## Modelo de dados (Supabase)
- `chat_channels` (group|dm), `chat_channel_members` (role, last_read_at, muted, pinned),
  `chat_messages` (kind, body, reply_to_id, mentions[], metadata), `chat_attachments`,
  `chat_reactions`.
- Bucket privado **`chat-media`** (URL assinada por membro).
- Realtime: `chat_messages`, `chat_channel_members`, `chat_channels`, `chat_reactions`.

### RPCs (SECURITY DEFINER)
`chat_get_or_create_dm`, `chat_unread_counts`, `chat_mark_read`, `chat_directory`,
`chat_profiles`, `chat_conversations`, `chat_user_info`.
Triggers: `chat_notify_on_message` (notificações).

### Migrations (ordem)
1. `20260716180000_carbo_chat_phase0` — tabelas, RLS, RPCs base, bucket, realtime.
2. `20260716190000_chat_mention_notify` — trigger de notificação.
3. `20260716200000` / `..201000` — `chat_directory` (v1/v2).
4. `20260716202000_chat_profiles`.
5. `20260716203000_chat_conversations`.
6. `20260716204000_chat_user_info`.
7. `20260716205000_chat_pin_and_conversations_v2` — coluna `pinned` + conversas v2 (DROP+CREATE).
8. `20260716206000_chat_reactions_reply_mentionall` — @todos no trigger + realtime de reações.

---

## Arquitetura Realtime (importante)
A atualização em tempo real da lista/badge é feita por **uma única** assinatura no
`<ChatAlerts>` (montado uma vez no provider). `useConversations`/`useUnreadTotal` são
só query — **não** abrem assinatura própria (evita colisão de canal e o crash
"cannot add postgres_changes after subscribe"). `useMessages` tem assinatura única
(uma conversa aberta por vez).

---

## Ainda NÃO feito (ideias)
- Presença online / "digitando…".
- Recibos de leitura (visto por quem).
- Editar / apagar a própria mensagem.
- Arquivar conversa.
- Busca no servidor (hoje busca só nas ~200 msgs carregadas).
- Clicar na notificação do sininho abrir o canal direto.
- Emoji picker com busca/categorias; avatar de grupo.
- Push / notificação desktop.
