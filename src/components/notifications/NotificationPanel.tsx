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

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; label: string; color: string }> = {
  mention:          { Icon: AtSign,         label: "Menção",        color: "text-primary" },
  action_assigned:  { Icon: ListTodo,       label: "Ação atribuída",color: "text-warning" },
  action_completed: { Icon: Check,          label: "Ação concluída",color: "text-success" },
  message:          { Icon: MessageCircle,  label: "Mensagem",      color: "text-muted-foreground" },
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
    if (notification.reference_type === "os_message" || notification.reference_type === "os_action") {
      // Extract OS ID from reference and navigate
      // For now, close the panel
      onClose();
    }
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const typeConfig = TYPE_CONFIG[notification.type] || TYPE_CONFIG.message;

    return (
      <div
        onClick={() => handleNotificationClick(notification)}
        className={cn(
          "flex gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0",
          !notification.is_read && "bg-primary/5"
        )}
      >
        <div className={cn("flex-shrink-0 mt-0.5", typeConfig.color)}>
          <typeConfig.Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm truncate">{notification.title}</span>
            {!notification.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          {notification.body && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {notification.body}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            deleteNotification(notification.id);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
      <Bell className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <div className="flex flex-col max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Notificações</h3>
          {unreadNotifications.length > 0 && (
            <Badge variant="secondary" className="h-5 text-xs">
              {unreadNotifications.length} novas
            </Badge>
          )}
        </div>

        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={() => markAllAsRead()}
          >
            <CheckCheck className="h-3 w-3" />
            Marcar todas
          </Button>
        )}
      </div>

      {/* Content */}
      <Tabs defaultValue="unread" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2 grid grid-cols-2">
          <TabsTrigger value="unread" className="gap-1.5 text-xs">
            <Clock className="h-3 w-3" />
            Não lidas
            {unreadNotifications.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {unreadNotifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5 text-xs">
            <Bell className="h-3 w-3" />
            Todas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unread" className="flex-1 m-0 mt-2">
          <ScrollArea className="h-[350px]">
            {unreadNotifications.length === 0 ? (
              <EmptyState message="Nenhuma notificação nova" />
            ) : (
              <div className="group">
                {unreadNotifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="all" className="flex-1 m-0 mt-2">
          <ScrollArea className="h-[350px]">
            {notifications.length === 0 ? (
              <EmptyState message="Nenhuma notificação" />
            ) : (
              <div className="group">
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
