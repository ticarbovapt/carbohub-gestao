// Notificação de venda online — os SETE apps compartilham este arquivo.
//
// Fonte da verdade deste arquivo: a raiz (src/hooks/useEcommerceNotifications.ts).
// Editou aqui? Copie para os seis apps. A única diferença lá é o import do
// `toast` (sonner direto) e a ausência do link "Ver dashboard", que aponta para
// uma rota que só a raiz tem.
//
// ⚠️ ESTE HOOK ESCUTA `notifications`, NÃO `ecommerce_orders`.
//
// A versão anterior escutava a tabela de pedidos e decidia sozinha o que era
// "venda nova". Não tinha como acertar: o Realtime não entrega o registro
// ANTERIOR (depende de REPLICA IDENTITY FULL), então a tela não distinguia
// "pedido virou pago" de "o sync de 15 min regravou a linha". Resultado: três
// toasts de venda logo depois de um F5, para pedidos de dias atrás, enquanto o
// sininho — corretamente — não mostrava nada.
//
// Quem sabe o que é venda nova é o gatilho `trg_ecommerce_sale_notify`: ele tem
// OLD.status e a janela de 12h. Agora a tela só reage ao que ele decidiu, e uma
// regra só governa som, toast e sininho. Eles não têm mais como discordar.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { avisarVendaOnline } from "@/lib/sfxVenda";

export function useEcommerceNotifications() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!user?.id) return;

    channelRef.current = supabase
      .channel("venda-online-" + user.id)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const n = payload.new;
          if (String(n.type ?? "") !== "ecommerce_sale") return;

          // O dedupe vive no avisarVendaOnline porque o mesmo aviso também passa
          // pelo useLiveNotifications/useFinanceRealtime (que cuidam do sininho).
          // Quem chegar primeiro toca e mostra o toast; o outro sai calado.
          if (!avisarVendaOnline(String(n.reference_id ?? n.id ?? ""))) return;

          // Título e corpo já vêm prontos do gatilho, com plataforma, valor,
          // quantidade e produto. Montar de novo aqui era só mais uma cópia da
          // mesma regra para divergir depois.
          toast.success(String(n.title ?? "🛒 Nova venda"), {
            description: (n.body as string | null) ?? undefined,
            duration: 8000,
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
  }, [user?.id]);
}
