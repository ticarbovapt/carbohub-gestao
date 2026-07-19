import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Users as UsersIcon, ListTree, Globe, Target, Activity,
  Store, Building2, TrendingUp, LineChart, Trophy, BarChart3, BadgePercent, Tags, ShieldCheck, MessagesSquare,
  Gauge,
} from "lucide-react";
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

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => { try { return localStorage.getItem("carbo:sidebar:collapsed") === "1"; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem("carbo:sidebar:collapsed", n ? "1" : "0"); } catch {} return n; });
  useAccessPing("carbo_admin");
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

  // Navegação padronizada: topo = item principal + Carbo Chat; depois seções por domínio.
  const sections: ShellNavSection[] = [
    { items: [
        { to: "/", label: "Usuários", icon: UsersIcon, end: true },
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
    { label: "Dashboards", items: [
        { to: "/dashboards/comercial", label: "Visão Geral", icon: TrendingUp },
        { to: "/dashboards/estrategico", label: "Estratégico", icon: LineChart },
        { to: "/dashboards/lojas", label: "Portal de Vendas", icon: Store },
        { to: "/dashboards/franqueados", label: "Licenciados", icon: Building2 },
        { to: "/dashboards/metas", label: "Metas (Placar)", icon: Trophy },
    ] },
    { label: "Comercial", items: [
        { to: "/comercial/dashboard", label: "Dashboard Comercial", icon: LineChart },
        { to: "/comercial/vendas", label: "Análise de Vendas", icon: BarChart3 },
        { to: "/comercial/dados", label: "Dados Comerciais (fonte)", icon: Store },
        { to: "/comercial/descontos", label: "Aprovações", icon: BadgePercent },
        { to: "/comercial/precos", label: "Tabela de preços", icon: Tags },
    ] },
    { label: "E-commerce", items: [
        { to: "/ecommerce/vendas-online", label: "Vendas Online", icon: Globe },
        { to: "/ecommerce/metas", label: "Acompanhamento de Metas", icon: Target },
    ] },
    { label: "Configurações", items: [
        { to: "/estrutura", label: "Departamentos e funções", icon: ListTree },
        { to: "/metas/configurar", label: "Configurar Metas", icon: Target },
    ] },
    { label: "Auditoria", items: [
        { to: "/auditoria", label: "Central de Auditoria", icon: ShieldCheck },
        { to: "/ultimo-acesso", label: "Último acesso", icon: Activity },
        { to: "/chat/adocao", label: "Adoção do Carbo Chat", icon: Gauge },
    ] },
  ];

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Admin" appKey="admin" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Admin", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
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
