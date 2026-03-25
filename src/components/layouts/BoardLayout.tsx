import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings, 
  TrendingUp,
  Users,
  LogOut,
  UserCheck,
  Home,
  ChevronDown,
  Menu,
  UserPlus,
  Calendar,
  AlertTriangle,
  Building2,
  Truck,
  ShoppingCart,
  FileSpreadsheet,
  Shield,
  Wallet,
  Plus,
  Cog,
  ChevronRight,
  Layers,
  Package,
  Factory,
  Database,
  Boxes,
  FlaskConical,
  Link2,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/notifications";
import { PlatformOnboarding } from "@/components/onboarding/PlatformOnboarding";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import logoCarbo from "@/assets/logo-carbo.png";

function QuickActionsMenu({ isAdmin, isCeo }: { isAdmin: boolean; isCeo: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "h-9 w-9 rounded-full border-2 transition-all carbo-gradient-hover",
            open
              ? "carbo-gradient text-white border-transparent"
              : "border-primary/30 text-primary bg-transparent"
          )}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-52 p-1.5 bg-popover border border-border shadow-lg rounded-xl">
        <div className="space-y-0.5">
          <button
            onClick={() => { navigate("/os?action=new"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <ClipboardList className="h-4 w-4 flex-shrink-0 text-primary" />
            + Nova OP
          </button>
          <button
            onClick={() => { navigate("/licensee/new"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <UserPlus className="h-4 w-4 flex-shrink-0" />
            + Novo Licenciado
          </button>
          {(isAdmin || isCeo) && (
            <button
              onClick={() => { navigate("/team?action=add"); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              + Nova Conta
            </button>
          )}
          <button
            onClick={() => { navigate("/financeiro"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Wallet className="h-4 w-4 flex-shrink-0" />
            + Nova RC
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface BoardLayoutProps {
  children: ReactNode;
}

type SidebarTab = "dados" | "operacoes";

const dadosMestresItems = [
  { href: "/mrp/dashboard", label: "Dashboard Estratégico", icon: LayoutDashboard },
  { href: "/mrp/products", label: "Insumos", icon: Package },
  { href: "/mrp/suppliers", label: "Fornecedores", icon: Factory },
  { href: "/skus", label: "SKUs / BOM", icon: Boxes },
  { href: "/lots", label: "Lotes / Qualidade", icon: FlaskConical },
  { href: "/licensees", label: "Licenciados", icon: Building2 },
  { href: "/team", label: "Equipe", icon: Users },
  { href: "/import", label: "Importar Dados", icon: FileSpreadsheet },
];

const operacoesItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/production-orders", label: "Ordens de Produção (OP)", icon: Factory },
  { href: "/os", label: "Ordens de Serviço", icon: ClipboardList },
  { href: "/logistics", label: "Logística", icon: Truck },
  { href: "/scheduling", label: "Agendamentos", icon: Calendar },
  { href: "/orders", label: "Controle de Pedidos", icon: ShoppingCart },
  { href: "/b2b/funnel", label: "Funil B2B", icon: Target },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/suprimentos", label: "Suprimentos", icon: Package },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/admin", label: "Sistema", icon: Settings, adminOnly: true },
];

const globalItems = [
  { href: "/admin/approval", label: "Aprovações", icon: UserCheck, adminOnly: true },
  { href: "/governance", label: "Governança", icon: Shield, adminOnly: true },
  { href: "/integrations/bling", label: "Integração Bling", icon: Link2, adminOnly: false, financeOrMasterOnly: true },
];

/** Derive a human-readable breadcrumb label from a pathname segment */
const ROUTE_LABELS: Record<string, string> = {
  "": "Home",
  dashboard: "Dashboard",
  os: "Ordens de Produção",
  logistics: "Logística",
  financeiro: "Financeiro",
  suprimentos: "Suprimentos",
  purchasing: "Financeiro",
  scheduling: "Agendamentos",
  orders: "Controle de Pedidos",
  licensees: "Licenciados",
  licensee: "Licenciado",
  machines: "Máquinas",
  team: "Equipe",
  analytics: "Analytics",
  import: "Importar Dados",
  admin: "Sistema",
  approval: "Aprovações",
  governance: "Governança",
  new: "Novo",
  checklist: "Checklist",
  mapa: "Mapa Territorial",
  mrp: "Dados Mestres",
  products: "Insumos",
  suppliers: "Fornecedores",
  lots: "Lotes / Qualidade",
  skus: "SKUs",
  integrations: "Integrações",
  bling: "Bling ERP",
  "production-orders": "Ordens de Produção",
  ops: "Inteligência",
  "network-map": "Mapa da Rede",
  "licensee-ranking": "Ranking Licenciados",
  "territory-intelligence": "Inteligência Territorial",
  "territory-expansion": "Expansão Territorial",
};

function Breadcrumb({ area }: { area: string }) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = [
    { label: area, href: "/" },
    ...segments.map((seg, i) => ({
      label: ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
      href: "/" + segments.slice(0, i + 1).join("/"),
    })),
  ];

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />}
          {i < crumbs.length - 1 ? (
            <Link
              to={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[100px]"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[140px]">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function BoardLayout({ children }: BoardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, profile, signOut, passwordMustChange, isCeo, isAnyGestor, carboRoles, isMasterAdmin, isGestorFin } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Determine active tab from route
  const isDadosRoute = location.pathname.startsWith("/mrp") ||
    ["/licensees", "/machines", "/team", "/import", "/skus", "/lots", "/integrations"].some(p => location.pathname.startsWith(p));
  const [activeTab, setActiveTab] = useState<SidebarTab>(isDadosRoute ? "dados" : "operacoes");

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isItemActive = (href: string) => {
    return location.pathname === href || 
      (href !== "/dashboard" && href !== "/mrp/dashboard" && location.pathname.startsWith(href) && href !== "/admin");
  };

  const currentItems = activeTab === "dados" ? dadosMestresItems : operacoesItems;
  const filteredItems = currentItems.filter((item: any) => {
    if (item.adminOnly && !isAdmin && !isCeo) return false;
    return true;
  });
  const filteredGlobalItems = globalItems.filter((item: any) => {
    if (item.financeOrMasterOnly && !isMasterAdmin && !isGestorFin) return false;
    if (item.adminOnly && !isAdmin && !isCeo) return false;
    return true;
  });

  const roleLabel = isMasterAdmin ? "Master Admin" : isCeo ? "CEO" : isAnyGestor ? "Gestor" : isAdmin ? "Admin" : "Operador";
  const areaLabel = activeTab === "dados" ? "Dados Mestres" : "Operações";

  const SidebarContent = () => (
    <>
      {/* Sidebar header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <img src={logoCarbo} alt="Carbo" className="h-6 w-6 object-contain" />
        <div>
          <p className="text-sm font-bold text-foreground leading-none">CARBO CORE</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Plataforma Corporativa</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            onClick={() => setActiveTab("dados")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
              activeTab === "dados"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Database className="h-3.5 w-3.5" />
            Dados Mestres
          </button>
          <button
            onClick={() => setActiveTab("operacoes")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
              activeTab === "operacoes"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Operações
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
          {activeTab === "dados" ? "Dados Mestres" : "Operações"}
        </p>
        {filteredItems.map((item) => {
          const isActive = isItemActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                isActive
                  ? "bg-area-controle-soft text-area-controle font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-controle flex-shrink-0" />}
            </Link>
          );
        })}

        {/* Global items separator */}
        {filteredGlobalItems.length > 0 && (
          <>
            <Separator className="my-2" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
              Gestão
            </p>
            {filteredGlobalItems.map((item) => {
              const isActive = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                    isActive
                      ? "bg-area-controle-soft text-area-controle font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-controle flex-shrink-0" />}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-3 mt-auto">
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard"
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
    <>
      <PlatformOnboarding />
      
      <div className="min-h-screen bg-background">
        {/* ══ TOPBAR ═══════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border))] transition-all duration-200">
          <div className="flex h-14 items-center justify-between px-4 lg:px-6 gap-3">
            {/* LEFT */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link to="/" className="flex items-center gap-2 group">
                <img src={logoCarbo} alt="Grupo Carbo" className="h-7 w-7 object-contain transition-transform duration-200 group-hover:scale-105" />
              </Link>
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 active:scale-95 border",
                      sidebarOpen
                        ? "bg-area-controle text-area-controle-foreground border-area-controle shadow-sm"
                        : "text-area-controle bg-area-controle-soft border-area-controle/30 hover:border-area-controle/60 hover:bg-area-controle/15"
                    )}
                  >
                    <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">{areaLabel}</span>
                    <Menu className="h-3 w-3 sm:hidden flex-shrink-0" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            </div>

            {/* CENTER */}
            <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
              <Breadcrumb area={areaLabel} />
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
              {passwordMustChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/change-password")}
                  className="gap-2 text-warning hover:text-warning hover:bg-warning/10 border border-warning/30 animate-pulse h-9"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-medium">Perfil incompleto</span>
                </Button>
              )}
              <QuickActionsMenu isAdmin={isAdmin} isCeo={isCeo} />
              <NotificationBell />
              <ThemeToggle />
              <Separator orientation="vertical" className="h-5" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl pl-1.5 pr-2.5 py-1.5 text-sm transition-all duration-200 hover:bg-secondary active:scale-95 min-w-0">
                    <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-full carbo-gradient flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-xs font-bold text-white">{getInitials(profile?.full_name)}</span>
                    </div>
                    <div className="hidden md:block text-left min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[90px]">
                        {profile?.full_name?.split(" ")[0] || "Usuário"}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{roleLabel}</p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 hidden md:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 shadow-xl rounded-xl">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-medium truncate">{profile?.full_name || "Usuário"}</p>
                      <p className="text-xs text-muted-foreground font-normal">
                        {isMasterAdmin ? "Master Admin" : isCeo ? "Admin Estratégico (CEO)" : isAnyGestor ? "Gestor" : isAdmin ? "Administrador" : "Membro da Equipe"}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    <Home className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/team")}>
                    <Users className="mr-2 h-4 w-4" />
                    Minha Equipe
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
        <main className="p-4 lg:p-6 xl:p-8 board-fade-in">
          {children}
        </main>
      </div>
    </>
  );
}
