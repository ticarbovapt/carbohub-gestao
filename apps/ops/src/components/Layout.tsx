import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sidebar, type ShellNavSection } from "@carbo/shell";
import logoCarbo from "@/assets/logo-carbo.png";
import { HUB_URL } from "@/lib/sso";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { OPS_HOME, OPS_GROUPS } from "@/lib/opsNav";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("carbo:sidebar:collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    const n = !c;
    try { localStorage.setItem("carbo:sidebar:collapsed", n ? "1" : "0"); } catch {}
    return n;
  });
  useAccessPing("carbo_ops_app");
  useLiveNotifications();
  const { user, profile } = useAuth();
  const chatUser = useMemo(
    () => ({ id: user?.id ?? "", full_name: profile?.full_name ?? null, avatar_url: (profile as { avatar_url?: string | null })?.avatar_url ?? null }),
    [user?.id, profile?.full_name, profile],
  );

  const navigate = useNavigate();

  const { pathname } = useLocation();
  const activeGroup = OPS_GROUPS.find((g) => g.items.some((i) => i.path !== "/" && pathname.startsWith(i.path)))?.label;

  const sections: ShellNavSection[] = [
    {
      items: [
        { to: OPS_HOME.path, label: OPS_HOME.label, icon: OPS_HOME.icon, end: true },
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
      ],
    },
    ...OPS_GROUPS.map((g) => ({
      label: g.label,
      collapsible: true,
      defaultOpen: !g.locked && g.label === activeGroup,
      locked: g.locked,
      lockedHint: g.locked ? "Domínio migrado para o Carbo Finanças" : undefined,
      items: g.items.map((i) => ({
        to: i.path, label: i.label, icon: i.icon, end: i.end,
        locked: i.locked,
        lockedHint: i.locked ? "Tela movida para o Carbo Finanças" : undefined,
      })),
    })),
  ];

  // Carbo Chat = tela cheia: a sidebar não ocupa espaço em nenhuma largura;
  // o menu vira gaveta sobreposta (abre pelo botão do topo).
  const immersive = pathname.startsWith("/chat");

  const handleMenu = () => {
    if (immersive || isMobile) setMobileOpen(true);
    else toggleCollapsed();
  };

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Ops" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Ops", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          immersive={immersive}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
