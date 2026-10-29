import { useMemo, useState, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Globe, Target,
  Store, Building2, LineChart, Trophy, BarChart3, BadgePercent, Tags, MessagesSquare,
  Boxes, Truck, Map as MapIcon, Megaphone, BookOpen,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { Sidebar, type ShellNavSection, StatusTarja, usePaginaAtual } from "@carbo/shell";
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
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
    { label: "Comercial", items: [
        { to: "/painel-comercial", label: "Dashboard Comercial", icon: LineChart },
        { to: "/dados-comerciais", label: "Dados Comerciais (fonte)", icon: Store },
        { to: "/aprovacoes", label: "Aprovações", icon: BadgePercent },
        { to: "/tabela-de-precos", label: "Tabela de preços", icon: Tags },
    ] },
    { label: "Dashboards", items: [
        { to: "/mapa-da-conquista", label: "Mapa da Conquista", icon: MapIcon },
        { to: "/portal-de-vendas", label: "Portal de Vendas", icon: Store },
        { to: "/licenciados", label: "Licenciados", icon: Building2 },
        { to: "/placar-de-metas", label: "Metas (Placar)", icon: Trophy },
        { to: "/suprimentos", label: "Suprimentos", icon: Boxes },
    ] },
    { label: "E-commerce", items: [
        { to: "/ecommerce/vendas-online", label: "Vendas Online", icon: Globe },
        { to: "/ecommerce/esteira", label: "Esteira do On-line", icon: Truck },
        { to: "/ecommerce/metas", label: "Acompanhamento de Metas", icon: Target },
        { to: "/ecommerce/anuncios", label: "Anúncios da Meta", icon: Megaphone },
    ] },
    { label: "Configurações", items: [
        { to: "/configurar-metas", label: "Configurar Metas", icon: Target },
    ] },
    { label: "Ajuda", items: [
        { to: "/documentacao", label: "Documentação", icon: BookOpen },
    ] },
  ];

  // Título da guia por tela e rolagem ao topo a cada troca de página.
  const mainRef = useRef<HTMLElement>(null);
  usePaginaAtual({ appName: "Carbo Admin", sections, mainRef });

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Admin" appKey="admin" onMenu={handleMenu} />
      {/* ⚠️ ABAIXO do TopBar, em FLUXO — nunca `fixed`. O Layout é
          `h-screen flex flex-col`, entao ela ocupa a propria altura e o corpo
          encolhe sozinho. A primeira versao era sobreposta e cobria o cabecalho. */}
      <StatusTarja supabase={supabase} app="admin" statusUrl="https://carbohub.com.br/status" />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Admin", logoSrc: logoCarbo, href: `${HUB_URL}/home` }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
