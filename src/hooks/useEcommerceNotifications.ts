import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { avisarVendaOnline } from "@/lib/sfxVenda";

const PLATFORM_LABEL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  amazon:       "Amazon",
  nuvemshop:    "Nuvemshop",
  tiktok:       "TikTok Shop",
  shopee:       "Shopee",
};

const PLATFORM_EMOJI: Record<string, string> = {
  mercadolivre: "🛒",
  amazon:       "📦",
  nuvemshop:    "🏪",
  tiktok:       "🎵",
  shopee:       "🛍️",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function useEcommerceNotifications() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Cada pedido avisa UMA vez — o controle está no avisarVendaOnline (sfxVenda),
  // fora do hook, porque a mesma venda também chega pelo canal de
  // `notifications`. Sem isso, a venda tocaria de novo a cada passo do ciclo
  // (paid → shipped → delivered), já que os três estão na lista branca. O
  // Realtime nem sempre entrega o registro ANTERIOR (depende de REPLICA
  // IDENTITY FULL), então comparar old/new não é confiável — guardar o que já
  // avisamos é.

  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    channelRef.current = supabase
      .channel("ecommerce-new-sale-global")
      // INSERT **e** UPDATE, de propósito.
      //
      // Só INSERT não serve: pedido de PIX nasce `pending` e vira `paid` num
      // UPDATE depois. Escutando só a criação, a venda que mais importa — a que
      // acabou de ser paga — nunca avisaria. É o mesmo motivo de o gatilho do
      // banco ter as duas versões (trg_ecommerce_sale_notify e _upd).
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "ecommerce_orders" },
        (payload: { new: Record<string, unknown> }) => {
          const order = payload.new;
          const platform = String(order.platform ?? "");
          const label    = PLATFORM_LABEL[platform] ?? platform;
          const emoji    = PLATFORM_EMOJI[platform] ?? "🛒";
          const product  = String(order.product_name ?? order.product_sku ?? "Pedido");
          const total    = Number(order.total ?? 0);
          const qty      = Number(order.quantity ?? 1);
          const status   = String(order.status ?? "pending");

          // Lista BRANCA, espelhando public.ecommerce_status_e_venda() e o
          // gatilho trg_ecommerce_sale_notify. Antes era lista negra
          // (`!== "cancelled"`): carrinho de PIX ainda não pago já disparava
          // "Nova venda" com som e tudo. O gatilho do banco foi corrigido, mas
          // esta escuta em tempo real continuava avisando cedo demais.
          if (!["paid", "shipped", "delivered"].includes(status.toLowerCase())) return;

          // Som primeiro: o toast fica 8s na tela, mas o som é o que faz alguém
          // olhar. Falha de áudio não derruba a notificação (ver sfxVenda).
          // O dedupe agora vive no avisarVendaOnline, porque a mesma venda
          // também chega pelo canal de `notifications` — o que responder
          // primeiro toca, o outro sai calado.
          if (!avisarVendaOnline(String(order.id ?? ""))) return;

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
