import React, { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useOpsAlertsBadge } from "@/hooks/useOpsAlerts";
import { useCRMStaleBadge } from "@/hooks/useCRMStaleBadge";
import {
  LayoutDashboard,
  ClipboardList,
  Settings,
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
  Link2,
  Target,
  ArrowLeft,
  BarChart3,
  Star,
  TrendingUp,
  Network,
  Bell,
  Store,
  Zap,
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

type SidebarTab = "controle" | "operacoes" | "dashboards";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  sectionLabel?: string;
}

const controleItems: NavItem[] = [
  { href: "/mrp/products", label: "Catálogo (Insumos/SKUs)", icon: Package },
  { href: "/mrp/suppliers", label: "Fornecedores", icon: Factory },
  { href: "/licensees", label: "Licenciados", icon: Building2 },
  { href: "/team", label: "Equipe", icon: Users },
  { href: "/import", label: "Importar Dados", icon: FileSpreadsheet },
];

const dashboardsItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/dashboards/producao", label: "Produção", icon: Factory },
  { href: "/dashboards/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/dashboards/logistica", label: "Logística", icon: Truck },
  { href: "/dashboards/comercial", label: "Comercial", icon: TrendingUp },
  { href: "/dashboards/estrategico", label: "Estratégico", icon: Star },
];

const operacoesItems: NavItem[] = [
  { href: "/production-orders", label: "Ordens de Produção (OP)", icon: Factory,       sectionLabel: "Produção" },
  { href: "/os",                label: "Ordens de Serviço (OS)",  icon: ClipboardList, sectionLabel: "Descarbonização" },
  { href: "/ops/alerts",        label: "Central de Alertas",      icon: Bell,          sectionLabel: "CarboOPS" },
  { href: "/ops/pdv-network",   label: "Rede PDV",                icon: Store,         sectionLabel: undefined },
  { href: "/crm",               label: "CRM — Funis de Venda",    icon: Target,        sectionLabel: "Comercial" },
  { href: "/meu-painel",        label: "Meu Painel",              icon: BarChart3 },
  { href: "/orders",            label: "Pedidos (RV)",            icon: ShoppingCart },
  { href: "/sales-targets",     label: "Metas de Vendas",         icon: TrendingUp },
  { href: "/financeiro",        label: "Financeiro",              icon: Wallet,        sectionLabel: "Financeiro & Supply" },
  { href: "/suprimentos",       label: "Suprimentos",             icon: Package },
  { href: "/integrations/bling", label: "Integrações Bling",     icon: Link2 },
  { href: "/admin/webhooks",     label: "Webhooks CRM",            icon: Zap,   adminOnly: true, sectionLabel: "Admin" },
  { href: "/admin/pipeline",     label: "Config. Pipeline CRM",   icon: Cog,   adminOnly: true },
  { href: "/logistics",         label: "Logística",               icon: Truck },
];

// Governance/admin tools moved to /team page — accessible via Controle > Equipe
const globalItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; financeOrMasterOnly?: boolean }[] = [];

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
  crm: "CRM",
  licensees: "Licenciados",
  licensee: "Licenciado",
  machines: "Máquinas",
  team: "Equipe",
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
  ops: "CarboOPS",
  "alerts": "Central de Alertas",
  bling: "Bling ERP",
  "production-orders": "Ordens de Produção",
  "inteligencia": "Inteligência",
  "network-map": "Mapa da Rede",
  "licensee-ranking": "Ranking Licenciados",
  "territory-intelligence": "Inteligência Territorial",
  "territory-expansion": "Expansão Territorial",
  "sales-targets": "Metas de Vendas",
  "org-chart": "Organograma",
  "pdv-network": "Rede PDV",
  "role-matrix": "Matriz de Acesso",
  "responsibility-map": "Mapa de Responsabilidades",
  "b2b": "B2B Leads",
  "funnel": "Funil",
  "vapt": "CarboVAPT",
  "ze": "CarboZÉ",
  "pedidos": "Meus Pedidos",
  "creditos": "Créditos",
  "comissoes": "Comissões",
  "atendimentos": "Atendimentos",
  "clientes": "Clientes",
  "reagentes": "Reagentes",
  "produtos": "Produtos",
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
  const { data: alertsBadge = 0 } = useOpsAlertsBadge();
  const { data: crmStaleBadge = 0 } = useCRMStaleBadge();

  // Determine active tab from route
  const isDashboardRoute = location.pathname.startsWith("/dashboards") ||
    location.pathname === "/dashboard";
  const isControleRoute = !isDashboardRoute && (location.pathname.startsWith("/mrp") ||
    ["/licensees", "/machines", "/team", "/import", "/skus", "/lots", "/integrations"].some(p => location.pathname.startsWith(p)));
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    isDashboardRoute ? "dashboards" : isControleRoute ? "controle" : "operacoes"
  );

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isItemActive = (href: string) => {
    if (location.pathname === href) return true;
    if (href === "/dashboard" || href === "/mrp/dashboard") return false;
    if (href === "/admin") return false;
    return location.pathname.startsWith(href);
  };

  const currentItems = activeTab === "controle" ? controleItems : activeTab === "dashboards" ? dashboardsItems : operacoesItems;
  const filteredItems = (currentItems as NavItem[]).filter((item) => {
    if (item.adminOnly && !isAdmin && !isCeo) return false;
    return true;
  });
  const filteredGlobalItems = globalItems.filter((item: any) => {
    if (item.financeOrMasterOnly && !isMasterAdmin && !isGestorFin) return false;
    if (item.adminOnly && !isAdmin && !isCeo) return false;
    return true;
  });

  const roleLabel = isMasterAdmin ? "Master Admin" : isCeo ? "CEO" : isAnyGestor ? "Gestor" : isAdmin ? "Admin" : "Operador";
  const areaLabel = activeTab === "controle" ? "Controle" : activeTab === "dashboards" ? "Dashboards" : "Operações";

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

      {/* Tab Switcher — order: Dash → Operações → Controle */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            onClick={() => setActiveTab("dashboards")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all",
              activeTab === "dashboards"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="h-3 w-3 flex-shrink-0" />
            Dash
          </button>
          <button
            onClick={() => setActiveTab("operacoes")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all",
              activeTab === "operacoes"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3 w-3 flex-shrink-0" />
            Ops
          </button>
          <button
            onClick={() => setActiveTab("controle")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all",
              activeTab === "controle"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Cog className="h-3 w-3 flex-shrink-0" />
            Controle
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
          {activeTab === "controle" ? "Controle" : activeTab === "dashboards" ? "Dashboards" : "Operações"}
        </p>
        {filteredItems.map((item) => {
          const isActive = isItemActive(item.href);
          return (
            <React.Fragment key={item.href}>
              {(item as NavItem).sectionLabel && (
                <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mt-3 mb-0.5">
                  {(item as NavItem).sectionLabel}
                </p>
              )}
              <Link
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
                {item.href === "/ops/alerts" && alertsBadge > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white flex-shrink-0">
                    {alertsBadge > 99 ? "99+" : alertsBadge}
                  </span>
                )}
                {item.href === "/crm" && crmStaleBadge > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white flex-shrink-0">
                    {crmStaleBadge > 99 ? "99+" : crmStaleBadge}
                  </span>
                )}
                {isActive && alertsBadge === 0 && crmStaleBadge === 0 && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-controle flex-shrink-0" />}
                {isActive && (alertsBadge > 0 || crmStaleBadge > 0) && item.href !== "/ops/alerts" && item.href !== "/crm" && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-controle flex-shrink-0" />}
              </Link>
            </React.Fragment>
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
              {location.pathname !== "/" && location.pathname !== "/dashboard" && (
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
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
