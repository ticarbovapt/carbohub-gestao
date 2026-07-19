import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  KanbanSquare, ClipboardList, TrendingUp, Target, BarChart3, LayoutDashboard,
  Wind, CalendarDays, MapPinned, Map, Share2, ShoppingCart, ShoppingBag, MessagesSquare,
} from "lucide-react";
import { ChatBadge, ChatProvider } from "@carbo/chat";
import { Sidebar, type ShellNavSection } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { TopBar } from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { useAuth } from "@/contexts/AuthContext";
import logoCarbo from "@/assets/logo-carbo.png";
import { HUB_URL } from "@/lib/sso";

// CRM é uma seção com sub-itens (Funis de Venda = dashboard, Pipelines = kanban).
const CRM_SUB = [
  { to: "/funis", end: true, label: "Funis de Venda", icon: LayoutDashboard },
  { to: "/crm/pipelines", label: "Pipelines", icon: KanbanSquare },
];
const NAV = [
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/pos-venda", label: "Pós-venda (meus pedidos)", icon: ShoppingBag },
  { to: "/compras", label: "Requisição de Compra", icon: ShoppingCart },
  { to: "/vendas", label: "Vendas", icon: TrendingUp },
  { to: "/metas", label: "Metas de Vendedores", icon: Target },
  { to: "/comercial", label: "Dashboard Comercial", icon: BarChart3 },
];
// Descarbonização — acompanhamento (pra onde o "+ Nova Descarbonização" leva).
const DESC_SUB = [
  { to: "/descarbonizacao/os", label: "Ordens de Serviço", icon: ClipboardList },
  { to: "/descarbonizacao/agendamentos", label: "Agendamentos", icon: CalendarDays },
];
// Território — bases/licenciados (dados reais do CORE) pra mostrar durante a venda.
const TERR_SUB = [
  { to: "/territorio/mapa", label: "Mapa Territorial", icon: Map },
  { to: "/territorio/rede", label: "Mapa da Rede", icon: Share2 },
  { to: "/territorio/expansao", label: "Expansão", icon: TrendingUp },
];

export function SalesShell() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("carbo:sidebar:collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem("carbo:sidebar:collapsed", n ? "1" : "0"); } catch {} return n; });
  useAccessPing("carbo_crm");
  useLiveNotifications();
  const { user, profile, isGestor } = useAuth();
  const chatUser = useMemo(
    () => ({ id: user?.id ?? "", full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null }),
    [user?.id, profile?.full_name, profile?.avatar_url],
  );

  const navigate = useNavigate();

  const sections: ShellNavSection[] = [
    { label: "CRM", items: CRM_SUB.map((n) => ({ to: n.to, label: n.label, icon: n.icon, end: (n as any).end })) },
    { items: [
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
        ...NAV.map((n) => ({ to: n.to, label: n.label, icon: n.icon })),
    ] },
    { label: "Descarbonização", icon: Wind, items: DESC_SUB.map((n) => ({ to: n.to, label: n.label, icon: n.icon })) },
    ...(isGestor ? [{ label: "Território", icon: MapPinned, items: TERR_SUB.map((n) => ({ to: n.to, label: n.label, icon: n.icon })) }] : []),
  ];

  const { pathname } = useLocation();
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
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <TopBar appName="Carbo Sales" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Sales", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          immersive={immersive}
        />

        <main className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
