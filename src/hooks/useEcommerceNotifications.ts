import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

const PLATFORM_LABEL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  amazon:       "Amazon",
  tiktok:       "TikTok Shop",
  shopee:       "Shopee",
};

const PLATFORM_EMOJI: Record<string, string> = {
  mercadolivre: "🛒",
  amazon:       "📦",
  tiktok:       "🎵",
  shopee:       "🛍️",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function useEcommerceNotifications() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    channelRef.current = supabase
      .channel("ecommerce-new-sale-global")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "ecommerce_orders" },
        (payload: { new: Record<string, unknown> }) => {
          const order = payload.new;
          const platform = String(order.platform ?? "");
          const label    = PLATFORM_LABEL[platform] ?? platform;
          const emoji    = PLATFORM_EMOJI[platform] ?? "🛒";
          const product  = String(order.product_name ?? order.product_sku ?? "Pedido");
          const total    = Number(order.total ?? 0);
          const qty      = Number(order.quantity ?? 1);
          const status   = String(order.status ?? "pending");

          if (status === "cancelled") return;

          toast.success(`${emoji} Nova venda — ${label}`, {
            description: `${product} · ${qty}x · ${formatCurrency(total)}`,
            duration: 8000,
            action: {
              label: "Ver dashboard",
              onClick: () => {
                window.location.href = `/dashboards/ecommerce/vendas-online`;
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}
