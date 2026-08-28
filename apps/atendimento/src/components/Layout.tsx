import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MessagesSquare, LayoutDashboard, MessageCircle } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { Sidebar, type ShellNavSection } from "@carbo/shell";
import logoCarbo from "@/assets/logo-carbo.png";
import { HUB_URL } from "@/lib/sso";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEcommerceNotifications } from "@/hooks/useEcommerceNotifications";

export function Layout() {
  // Venda online avisa em qualquer app que a pessoa esteja usando.
  useEcommerceNotifications();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => { try { return localStorage.getItem("carbo:sidebar:collapsed") === "1"; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem("carbo:sidebar:collapsed", n ? "1" : "0"); } catch {} return n; });
  useAccessPing("carbo_atendimento");
  useLiveNotifications();
  const { user, profile } = useAuth();
  const chatUser = useMemo(
    () => ({ id: user?.id ?? "", full_name: profile?.full_name ?? null, avatar_url: (profile as { avatar_url?: string | null })?.avatar_url ?? null }),
    [user?.id, profile?.full_name, profile],
  );

  const navigate = useNavigate();

  // Mobile: abre a gaveta. Desktop: recolhe/expande a sidebar (rail).
  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else toggleCollapsed();
  };

  // Navegação padronizada: topo = item principal + Carbo Chat; depois seções por
  // domínio. As telas de atendimento entram aqui quando existirem — o app nasce
  // com a casca, sem inventar tela vazia.
  //
  // ⚠️ "Vender" e "Bugs e sugestões" NÃO entram aqui. Os dois já têm um botão
  // próprio no TopBar — o "+" abre o Vender, a baratinha abre os bugs — e são os
  // MESMOS botões em todos os apps do hub. Repetir na sidebar cria dois caminhos
  // para a mesma ação: quem aprende por um lugar não reconhece o outro, e o dia
  // em que um deles mudar de comportamento a divergência não dá erro nenhum.
  // As ROTAS continuam existindo (`/vender`, `/bugs`) — o que sai é o atalho
  // duplicado.
  const sections: ShellNavSection[] = [
    { items: [
        { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
    { label: "Cliente", items: [
        // A tela de Conversas do WhatsApp, portada do admin/ops em 28/08/2026.
        // ⚠️ Ela e o UNICO lugar onde essas mensagens existem: o numero da Cloud
        // API nao aparece na Caixa de Entrada do Meta Business Suite e a API nao
        // tem endpoint de historico. O que o webhook nao gravar so existe no
        // celular do cliente.
        { to: "/conversas", label: "Conversas", icon: MessageCircle },
    ] },
  ];

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Atendimento" appKey="atendimento" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Atendimento", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
