import React from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AtSign,
  Bell,
  Bug,
  Check,
  CheckCheck,
  Clock,
  ListTodo,
  MessageCircle,
  Trash2,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface NotificationPanelProps {
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; label: string; color: string; bg: string }> = {
  mention:          { Icon: AtSign,         label: "Menção",        color: "text-primary",          bg: "bg-primary/10" },
  action_assigned:  { Icon: ListTodo,       label: "Ação atribuída",color: "text-amber-600",        bg: "bg-amber-500/10" },
  action_completed: { Icon: Check,          label: "Ação concluída",color: "text-emerald-600",      bg: "bg-emerald-500/10" },
  message:          { Icon: MessageCircle,  label: "Mensagem",      color: "text-blue-500",         bg: "bg-blue-500/10" },
  bug_report:       { Icon: Bug,            label: "Bug reportado", color: "text-destructive",      bg: "bg-destructive/10" },
};

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadNotifications,
    readNotifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate based on reference type
    if (notification.reference_type === "bug_report") {
      navigate("/bugs");
      onClose();
    } else if (notification.reference_type === "os_message" || notification.reference_type === "os_action") {
      onClose();
    }
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const typeConfig = TYPE_CONFIG[notification.type] || TYPE_CONFIG.message;
    const isUnread = !notification.is_read;

    return (
      <div
        onClick={() => handleNotificationClick(notification)}
        className={cn(
          "group relative flex gap-3 px-4 py-3 hover:bg-accent/40 cursor-pointer transition-colors border-b last:border-0",
          isUnread && "bg-primary/[0.04]"
        )}
      >
        {/* Barra lateral colorida para não-lidas */}
        {isUnread && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r-full" />
        )}

        {/* Ícone com fundo colorido */}
        <div className={cn(
          "flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5",
          typeConfig.bg, typeConfig.color
        )}>
          <typeConfig.Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("text-sm truncate", isUnread ? "font-semibold" : "font-medium")}>
              {notification.title}
            </span>
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          {notification.body && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {notification.body}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", typeConfig.bg, typeConfig.color)}>
              {typeConfig.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        </div>

        {/* Botão deletar — visível só no hover */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive mt-0.5"
          onClick={(e) => {
            e.stopPropagation();
            deleteNotification(notification.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Bell className="h-6 w-6 opacity-40" />
      </div>
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">Tudo em dia por aqui.</p>
    </div>
  );

  return (
    <div className="flex flex-col max-h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">Notificações</h3>
          {unreadNotifications.length > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold">
              {unreadNotifications.length}
            </Badge>
          )}
        </div>

        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1 h-7 text-muted-foreground hover:text-foreground"
            onClick={() => markAllAsRead()}
          >
            <CheckCheck className="h-3 w-3" />
            Marcar lidas
          </Button>
        )}
      </div>

      {/* Content */}
      <Tabs defaultValue="unread" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 my-2 grid grid-cols-2 h-8">
          <TabsTrigger value="unread" className="gap-1.5 text-xs h-7">
            <Clock className="h-3 w-3" />
            Não lidas
            {unreadNotifications.length > 0 && (
              <span className="h-4 min-w-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                {unreadNotifications.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5 text-xs h-7">
            <Bell className="h-3 w-3" />
            Todas ({notifications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unread" className="flex-1 m-0">
          <ScrollArea className="h-[380px]">
            {unreadNotifications.length === 0 ? (
              <EmptyState message="Nenhuma notificação nova" />
            ) : (
              <div>
                {unreadNotifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="all" className="flex-1 m-0">
          <ScrollArea className="h-[380px]">
            {notifications.length === 0 ? (
              <EmptyState message="Nenhuma notificação ainda" />
            ) : (
              <div>
                {notifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
