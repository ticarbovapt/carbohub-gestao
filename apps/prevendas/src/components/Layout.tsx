import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MessagesSquare, LayoutDashboard, KanbanSquare, ShoppingBag, BarChart3 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { Sidebar, type ShellNavSection, StatusTarja } from "@carbo/shell";
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
  useAccessPing("carbo_prevendas");
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
  // domínio. As telas de pré-vendas entram aqui quando existirem — o app nasce
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
        { to: "/crm/pipelines", label: "Pipeline", icon: KanbanSquare },
        { to: "/vendas", label: "Vendas", icon: ShoppingBag },
        { to: "/resultados", label: "Resultados", icon: BarChart3 },
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
  ];

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser} navigate={navigate}
      loadCallEngine={() => import("@carbo/call").then((m) => m.loadCall())}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Pré-Vendas" appKey="prevendas" onMenu={handleMenu} />
      {/* ⚠️ ABAIXO do TopBar, em FLUXO — nunca `fixed`. O Layout é
          `h-screen flex flex-col`, entao ela ocupa a propria altura e o corpo
          encolhe sozinho. A primeira versao era sobreposta e cobria o cabecalho. */}
      <StatusTarja supabase={supabase} app="prevendas" statusUrl="https://carbohub.com.br/status" />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Pré-Vendas", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
          sections={sections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        {/* ⚠️ `min-h-0` não é enfeite: num flex column a altura mínima de um
            filho é a do CONTEÚDO, então sem ele o `main` cresce junto com a
            página e o `overflow-y-auto` nunca chega a valer. É também o que
            dá a este `main` uma altura DEFINIDA — sem ela, tela que quer
            ocupar "o que sobrou" (o /conversas) volta a precisar de uma conta
            sobre a altura do cabeçalho, e toda conta dessas erra no dia em que
            a tarja de status aparece. */}
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
