import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AtSign, Bell, Bug, Check, CheckCheck, Clock, ListTodo,
  MessageCircle, Trash2, WifiOff, FileText, Package, ShoppingCart,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; label: string; color: string; bg: string }> = {
  mention:                { Icon: AtSign,        label: "Menção",         color: "text-primary",     bg: "bg-primary/10" },
  action_assigned:        { Icon: ListTodo,      label: "Ação atribuída", color: "text-amber-600",   bg: "bg-amber-500/10" },
  action_completed:       { Icon: Check,         label: "Ação concluída", color: "text-emerald-600", bg: "bg-emerald-500/10" },
  message:                { Icon: MessageCircle, label: "Mensagem",       color: "text-blue-500",    bg: "bg-blue-500/10" },
  bug_report:             { Icon: Bug,           label: "Bug reportado",  color: "text-destructive", bg: "bg-destructive/10" },
  bug_resolved:           { Icon: CheckCheck,    label: "Bug corrigido",  color: "text-emerald-600", bg: "bg-emerald-500/10" },
  ecommerce_disconnected: { Icon: WifiOff,       label: "E-commerce caído", color: "text-destructive", bg: "bg-destructive/10" },
  finance_rc_pendente:    { Icon: FileText,      label: "Requisição",     color: "text-amber-600",   bg: "bg-amber-500/10" },
  finance_oc_nova:        { Icon: Package,       label: "Ordem de compra", color: "text-blue-500",   bg: "bg-blue-500/10" },
  ecommerce_sale:         { Icon: ShoppingCart,  label: "Nova venda",     color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

function NotificationItem({
  notification, onRead, onDelete,
}: { notification: Notification; onRead: (id: string) => void; onDelete: (id: string) => void; onOpen: (n: Notification) => void }) {
  const cfg = TYPE_CONFIG[notification.type] || TYPE_CONFIG.message;
  const isUnread = !notification.is_read;

  return (
    <div
      onClick={() => { if (isUnread) onRead(notification.id); onOpen(notification); }}
      className={cn(
        "group relative flex gap-3 px-4 py-3 hover:bg-accent/40 cursor-pointer transition-colors border-b last:border-0",
        isUnread && "bg-primary/[0.04]"
      )}
    >
      {isUnread && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r-full" />}
      <div className={cn("flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5", cfg.bg, cfg.color)}>
        <cfg.Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("text-sm truncate", isUnread ? "font-semibold" : "font-medium")}>{notification.title}</span>
          {isUnread && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
        </div>
        {notification.body && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{notification.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", cfg.bg, cfg.color)}>{cfg.label}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      </div>
      <Button
        variant="ghost" size="icon"
        className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive mt-0.5"
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Bell className="h-6 w-6 opacity-40" />
      </div>
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">Tudo em dia por aqui.</p>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Clique numa notificação de chat → abre a conversa certa (?c=).
  const handleOpen = (n: Notification) => {
    if (n.reference_type === "chat" && n.reference_id) {
      setOpen(false);
      navigate(`/chat?c=${n.reference_id}`);
      // Se já estiver no /chat, avisa o ChatApp montado pra trocar sem reload.
      try { window.dispatchEvent(new CustomEvent("carbo-chat:open", { detail: { channelId: n.reference_id } })); } catch { /* noop */ }
    }
  };
  const {
    notifications, unreadNotifications, unreadCount,
    markAsRead, markAllAsRead, deleteNotification,
  } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors" title="Notificações">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex flex-col max-h-[520px]">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Notificações</h3>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold">{unreadCount}</Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 text-muted-foreground hover:text-foreground" onClick={() => markAllAsRead()}>
                <CheckCheck className="h-3 w-3" /> Marcar lidas
              </Button>
            )}
          </div>

          <Tabs defaultValue="unread" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-3 my-2 grid grid-cols-2 h-8">
              <TabsTrigger value="unread" className="gap-1.5 text-xs h-7">
                <Clock className="h-3 w-3" /> Não lidas
                {unreadCount > 0 && (
                  <span className="h-4 min-w-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">{unreadCount}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5 text-xs h-7">
                <Bell className="h-3 w-3" /> Todas ({notifications.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="unread" className="flex-1 m-0">
              <ScrollArea className="h-[380px]">
                {unreadNotifications.length === 0 ? (
                  <EmptyState message="Nenhuma notificação nova" />
                ) : (
                  unreadNotifications.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={markAsRead} onDelete={deleteNotification} onOpen={handleOpen} />
                  ))
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="all" className="flex-1 m-0">
              <ScrollArea className="h-[380px]">
                {notifications.length === 0 ? (
                  <EmptyState message="Nenhuma notificação ainda" />
                ) : (
                  notifications.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={markAsRead} onDelete={deleteNotification} onOpen={handleOpen} />
                  ))
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  );
}
