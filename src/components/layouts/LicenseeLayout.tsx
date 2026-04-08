import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLicenseeStatus, useLicenseeWallet, useLicenseeSubscription } from "@/hooks/useLicenseePortal";
import {
  Home,
  ShoppingCart,
  Wallet,
  LogOut,
  ChevronDown,
  ChevronRight,
  Zap,
  Truck,
  DollarSign,
  LayoutDashboard,
  Users,
  Layers,
  ClipboardList,
  FlaskConical,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/notifications";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoCarbo from "@/assets/logo-carbo.png";

interface LicenseeLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  section?: string; // section header before this item
}

const NAV_ITEMS: NavItem[] = [
  { href: "/licensee/dashboard", icon: Home, label: "Dashboard", end: true },
  // — Operações —
  { href: "/licensee/atendimentos", icon: ClipboardList, label: "Atendimentos", section: "Operações" },
  { href: "/licensee/clientes", icon: Users, label: "Clientes" },
  { href: "/licensee/reagentes", icon: FlaskConical, label: "Reagentes" },
  // — Produtos & Pedidos —
  { href: "/licensee/vapt", icon: Zap, label: "CarboVAPT", section: "Produtos & Pedidos" },
  { href: "/licensee/produtos", icon: Package, label: "Produtos" },
  { href: "/licensee/pedidos", icon: ShoppingCart, label: "Meus Pedidos" },
  // — Financeiro —
  { href: "/licensee/creditos", icon: Wallet, label: "Créditos", section: "Financeiro" },
  { href: "/licensee/comissoes", icon: DollarSign, label: "Comissões" },
];

const ROUTE_LABELS: Record<string, string> = {
  licensee: "Área Licenciados",
  dashboard: "Dashboard",
  atendimentos: "Atendimentos",
  clientes: "Clientes",
  reagentes: "Reagentes",
  vapt: "CarboVAPT",
  ze: "Produtos",
  produtos: "Produtos",
  pedidos: "Meus Pedidos",
  creditos: "Créditos",
  comissoes: "Comissões",
  checkout: "Checkout",
  confirmation: "Confirmação",
  payment: "Pagamento",
  services: "Serviços",
};

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = [
    { label: "Área Licenciados", href: "/licensee/dashboard" },
    ...segments.slice(1).map((seg, i) => ({
      label: ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
      href: "/" + segments.slice(0, i + 2).join("/"),
    })),
  ];

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />}
          {i < crumbs.length - 1 ? (
            <Link to={crumb.href} className="hover:text-foreground transition-colors truncate max-w-[100px]">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[140px]">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function LicenseeLayout({ children }: LicenseeLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { data: licenseeStatus } = useLicenseeStatus();

  const licensee = licenseeStatus?.licensee;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isItemActive = (href: string, end?: boolean) => {
    return end ? location.pathname === href : location.pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <>
      {/* Sidebar header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <img src={logoCarbo} alt="Carbo" className="h-6 w-6 object-contain" />
        <div>
          <p className="text-sm font-bold text-foreground leading-none">Área Licenciados</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{licensee?.name || "Portal do Licenciado"}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto pt-4">
        {NAV_ITEMS.map((item) => {
          const isActive = isItemActive(item.href, item.end);
          return (
            <div key={item.href}>
              {item.section && (
                <p className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {item.section}
                </p>
              )}
              <Link
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  isActive
                    ? "bg-area-licensee-soft text-area-licensee font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-licensee flex-shrink-0" />}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 mt-auto">
        <div className="flex items-center justify-between">
          <Link
            to="/licensee/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Início</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ══ TOPBAR ═══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border))] transition-all duration-200">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6 gap-3">

          {/* LEFT — Logo + area pill */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link to="/" className="flex items-center group">
              <img
                src={logoCarbo}
                alt="Grupo Carbo"
                className="h-7 w-7 object-contain transition-transform duration-200 group-hover:scale-105"
              />
            </Link>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            {/* Área pill — sidebar trigger */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 active:scale-95 border",
                    sidebarOpen
                      ? "bg-area-licensee text-area-licensee-foreground border-area-licensee shadow-sm"
                      : "text-area-licensee bg-area-licensee-soft border-area-licensee/30 hover:border-area-licensee/60 hover:bg-area-licensee/15"
                  )}
                >
                  <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Área Licenciados</span>
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>

          {/* CENTER — breadcrumb */}
          <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
            <Breadcrumb />
          </div>

          {/* RIGHT — actions */}
          <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
            <NotificationBell />
            <ThemeToggle />
            <Separator orientation="vertical" className="h-5" />

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl pl-1.5 pr-2.5 py-1.5 text-sm transition-all duration-200 hover:bg-secondary active:scale-95 min-w-0">
                  <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-full carbo-gradient flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-xs font-bold text-white">
                      {getInitials(profile?.full_name)}
                    </span>
                  </div>
                  <div className="hidden md:block text-left min-w-0">
                    <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[90px]">
                      {profile?.full_name?.split(" ")[0] || "Usuário"}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[90px]">
                      {licensee?.name || "Licenciado"}
                    </p>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 shadow-xl rounded-xl">
                <DropdownMenuLabel>
                  <p className="font-medium truncate">{profile?.full_name || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground font-normal">{licensee?.name || "Licenciado"}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/licensee/dashboard")}>
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="p-4 lg:p-6 xl:p-8">
        {children}
      </main>
    </div>
  );
}
