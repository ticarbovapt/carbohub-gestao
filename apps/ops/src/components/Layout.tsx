import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sidebar, type ShellNavSection } from "@carbo/shell";
import logoCarbo from "@/assets/logo-carbo.png";
import { HUB_URL } from "@/lib/sso";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { OPS_HOME, OPS_ALL_ITEMS } from "@/lib/opsNav";
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

  // Navegação padronizada (seções estáticas, mesma ordem-espírito dos outros apps;
  // travados no fim). Reusa ícones/labels/flags do opsNav via lookup por caminho.
  const byPath = Object.fromEntries([OPS_HOME, ...OPS_ALL_ITEMS].map((i) => [i.path, i]));
  const it = (path: string) => {
    const i = byPath[path];
    return {
      to: i.path, label: i.label, icon: i.icon, end: i.end,
      locked: i.locked,
      lockedHint: i.locked ? "Tela movida para o Carbo Finanças" : undefined,
    };
  };
  const sections: ShellNavSection[] = [
    { items: [
        { to: OPS_HOME.path, label: OPS_HOME.label, icon: OPS_HOME.icon, end: true },
        { to: "/chat", label: "Carbo Chat", icon: MessagesSquare, badge: <ChatBadge /> },
    ] },
    { label: "Produção", items: ["/producao/dashboard", "/producao/ordens", "/producao/produtos", "/producao/skus", "/producao/lotes", "/producao/fornecedores"].map(it) },
    { label: "Estoque", items: ["/estoque", "/estoque/caderno", "/estoque/hub-natal", "/estoque/cd-sp-loghouse", "/estoque/cd-sp-vendas", "/estoque/cd-bling"].map(it) },
    { label: "Suprimentos", items: ["/suprimentos", "/compras"].map(it) },
    { label: "Logística", items: ["/logistica/dashboard", "/logistica", "/logistica/pos-venda", "/logistica/viagens"].map(it) },
    { label: "Operação de Campo", items: ["/campo/os", "/campo/agendamentos", "/campo/maquinas", "/campo/checklists", "/campo/alertas"].map(it) },
    { label: "Acompanhamento", items: ["/acompanhamento/comercial", "/acompanhamento/metas"].map(it) },
    { label: "Financeiro", locked: true, lockedHint: "Domínio migrado para o Carbo Finanças",
      items: ["/financeiro/dashboard", "/financeiro", "/financeiro/faturamento", "/financeiro/notas-fiscais", "/financeiro/nfse"].map(it) },
    { label: "Integrações", locked: true, lockedHint: "Domínio migrado para o Carbo Finanças",
      items: ["/integracoes/bling"].map(it) },
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
      <TopBar appName="Carbo Ops" appKey="ops" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          brand={{ appName: "Carbo Ops", logoSrc: logoCarbo, onLogoClick: () => { window.location.href = `${HUB_URL}/home`; } }}
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
