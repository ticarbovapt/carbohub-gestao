import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { toast } from "sonner";

// Hook for real-time licensee notifications
export function useLicenseeRealtimeNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: licenseeStatus } = useLicenseeStatus();
  const licenseeId = licenseeStatus?.licensee_id;

  useEffect(() => {
    if (!user || !licenseeId) return;

    // Subscribe to notifications for this user
    const notificationChannel = supabase
      .channel(`licensee-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("New notification:", payload);
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          
          // Show toast for new notification
          const notification = payload.new as { title: string; body?: string; type: string };
          toast.info(notification.title, {
            description: notification.body,
          });
        }
      )
      .subscribe();

    // Subscribe to request status changes
    const requestChannel = supabase
      .channel(`licensee-requests-${licenseeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "licensee_requests",
          filter: `licensee_id=eq.${licenseeId}`,
        },
        (payload) => {
          console.log("Request updated:", payload);
          queryClient.invalidateQueries({ queryKey: ["licensee-requests", licenseeId] });
          
          // Show status change toast
          const request = payload.new as { request_number: string; status: string };
          const statusLabels: Record<string, string> = {
            pending: "Pendente",
            confirmed: "Confirmada",
            scheduled: "Agendada",
            in_progress: "Em Andamento",
            completed: "Concluída",
            cancelled: "Cancelada",
          };
          toast.info(`Solicitação ${request.request_number}`, {
            description: `Status atualizado para: ${statusLabels[request.status] || request.status}`,
          });
        }
      )
      .subscribe();

    // Subscribe to wallet changes
    const walletChannel = supabase
      .channel(`licensee-wallet-${licenseeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "licensee_wallets",
          filter: `licensee_id=eq.${licenseeId}`,
        },
        (payload) => {
          console.log("Wallet updated:", payload);
          queryClient.invalidateQueries({ queryKey: ["licensee-wallet", licenseeId] });
        }
      )
      .subscribe();

    // Subscribe to service orders linked to this licensee
    const osChannel = supabase
      .channel(`licensee-os-${licenseeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_orders",
        },
        (payload) => {
          // Check if this OS is related to the licensee via metadata
          const metadata = payload.new?.metadata as Record<string, unknown> | undefined;
          if (metadata?.licensee_id === licenseeId) {
            console.log("Related OS updated:", payload);
            queryClient.invalidateQueries({ queryKey: ["licensee-requests", licenseeId] });
            
            // Show OS status update toast
            const os = payload.new as { os_number: string; status: string; current_department: string };
            const departmentLabels: Record<string, string> = {
              venda: "Comercial",
              preparacao: "Preparação",
              expedicao: "Expedição",
              operacao: "Operação",
              pos_venda: "Pós-Venda",
            };
            toast.info(`OS ${os.os_number}`, {
              description: `Etapa: ${departmentLabels[os.current_department] || os.current_department}`,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to CarboZe orders for this licensee
    const ordersChannel = supabase
      .channel(`licensee-orders-${licenseeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "carboze_orders",
          filter: `licensee_id=eq.${licenseeId}`,
        },
        (payload) => {
          console.log("Order updated:", payload);
          queryClient.invalidateQueries({ queryKey: ["licensee-requests", licenseeId] });
          
          if (payload.eventType === "UPDATE") {
            const order = payload.new as { order_number: string; status: string };
            const statusLabels: Record<string, string> = {
              pending: "Pendente",
              confirmed: "Confirmado",
              invoiced: "Faturado",
              shipped: "Enviado",
              delivered: "Entregue",
              cancelled: "Cancelado",
            };
            toast.info(`Pedido ${order.order_number}`, {
              description: `Status: ${statusLabels[order.status] || order.status}`,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to commission updates
    const commissionChannel = supabase
      .channel(`licensee-commissions-${licenseeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "licensee_commissions",
          filter: `licensee_id=eq.${licenseeId}`,
        },
        (payload) => {
          console.log("Commission updated:", payload);
          queryClient.invalidateQueries({ queryKey: ["licensee-commissions", licenseeId] });
          
          if (payload.eventType === "UPDATE") {
            const commission = payload.new as { status: string; total_amount: number };
            if (commission.status === "paid") {
              toast.success("Comissão Paga! 🎉", {
                description: `R$ ${commission.total_amount?.toFixed(2)} foram creditados.`,
              });
            } else if (commission.status === "approved") {
              toast.info("Comissão Aprovada", {
                description: `Valor de R$ ${commission.total_amount?.toFixed(2)} aprovado para pagamento.`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(requestChannel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(osChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(commissionChannel);
    };
  }, [user, licenseeId, queryClient]);
}
