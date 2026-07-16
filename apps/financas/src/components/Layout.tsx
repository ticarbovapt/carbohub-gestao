import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { useFinanceRealtime } from "@/hooks/useFinanceRealtime";
import { FIN_NAV } from "@/lib/financasNav";
import { ChatProvider, ChatBadge } from "@carbo/chat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-carbo-green/10 text-carbo-green font-semibold"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 p-2 space-y-1">
      <NavLink to="/chat" className={navCls} onClick={onNavigate}>
        <MessagesSquare className="h-4 w-4" />
        <span className="flex-1">Carbo Chat</span>
        <ChatBadge />
      </NavLink>
      {FIN_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          className={navCls}
          onClick={onNavigate}
        >
          <item.icon className="h-4 w-4" /> {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(true);
  useAccessPing("carbo_financas");
  useFinanceRealtime();
  const { user, profile } = useAuth();
  const chatUser = useMemo(
    () => ({ id: user?.id ?? "", full_name: profile?.full_name ?? null, avatar_url: (profile as { avatar_url?: string | null })?.avatar_url ?? null }),
    [user?.id, profile?.full_name, profile],
  );

  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else setDeskOpen((o) => !o);
  };

  return (
    <ChatProvider supabase={supabase} currentUser={chatUser}>
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Finanças" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        {/* Desktop: sidebar fixa (rola por dentro se for maior que a tela) */}
        {deskOpen && (
          <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card overflow-y-auto">
            <Nav />
          </aside>
        )}

        {/* Mobile: gaveta sobreposta */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[260px] p-0">
            <Nav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Padding padrão do conteúdo (única fonte) — evita encostar na borda. */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </ChatProvider>
  );
}
