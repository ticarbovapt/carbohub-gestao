import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useFinanceRealtime } from "@/hooks/useFinanceRealtime";
import { FIN_NAV } from "@/lib/financasNav";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { Sidebar, type ShellNavSection } from "@carbo/shell";
import logoCarbo from "@/assets/logo-carbo.png";
import { HUB_URL } from "@/lib/sso";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("carbo:sidebar:collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem("carbo:sidebar:collapsed", n ? "1" : "0");
      } catch {}
      return n;
    });
  useAccessPing("carbo_financas");
  useFinanceRealtime();
  const { user, profile } = useAuth();
  const chatUser = useMemo(
    () => ({ id: user?.id ?? "", full_name: profile?.full_name ?? null, avatar_url: (profile as { avatar_url?: string | null })?.avatar_url ?? null }),
    [user?.id, profile?.full_name, profile],
  );

  const navigate = useNavigate();

  // Navegação padronizada: topo = Início + Carbo Chat; depois seções por domínio.
  // Reusa os ícones/labels do FIN_NAV, referenciando por caminho (nada renomeado).
  const byPath = Object.fromEntries(FIN_NAV.map((i) => [i.path, i]));
  const item = (path: string) => {
    const i = byPath[path];
    return { to: i.path, label: i.label, icon: i.icon, end: i.path === "/" };
  };
  const sections: ShellNavSection[] = [
    { items: [
        item("/"),
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
    { label: "Financeiro", items: [item("/faturamento"), item("/comissionamento"), item("/pedidos")] },
    { label: "Suprimentos", items: [item("/suprimentos"), item("/compras")] },
    { label: "Configurações", items: [item("/funcionarios"), item("/integracoes/bling")] },
  ];

  // Mobile: abre a gaveta. Desktop: recolhe/expande a sidebar (rail).
  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else toggleCollapsed();
  };

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Finanças" appKey="financas" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Finanças", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        {/* Padding padrão do conteúdo (única fonte) — evita encostar na borda. */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
