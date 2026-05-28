import React, { ReactNode, useState, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useOpsAlertsBadge } from "@/hooks/useOpsAlerts";
import { useCRMStaleBadge } from "@/hooks/useCRMStaleBadge";
import { useEcommerceNotifications } from "@/hooks/useEcommerceNotifications";
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
  UserCircle,
  Calendar,
  AlertTriangle,
  Building2,
  Truck,
  ShoppingCart,
  ShoppingBag,
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
  FileInput,
  Target,
  ArrowLeft,
  BarChart3,
  Star,
  TrendingUp,
  Network,
  Bell,
  Store,
  Zap,
  Plane,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeAdminMenu, useCanSeeFinanceMenu, useRoleDisplayLabel } from "@/hooks/useActionPermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/notifications";
import { BugReportButton } from "@/components/BugReportFAB";
import { PlatformOnboarding } from "@/components/onboarding/PlatformOnboarding";
import { PasswordChangeModal } from "@/components/auth/PasswordChangeModal";
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

function QuickActionsMenu() {
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
            + Nova Descarbonização
          </button>
          <button
            onClick={() => { navigate("/orders/new"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ShoppingCart className="h-4 w-4 flex-shrink-0" />
            + Nova Venda
          </button>
          <button
            onClick={() => { navigate("/licensee/new"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <UserPlus className="h-4 w-4 flex-shrink-0" />
            + Novo Licenciado
          </button>
          <button
            onClick={() => { navigate("/team?action=add"); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Users className="h-4 w-4 flex-shrink-0" />
            + Nova Conta
          </button>
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

interface SectorNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}
interface Sector {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SectorNavItem[];
}

const SECTORS: Sector[] = [
  {
    id: "dashboards",
    label: "Dash",
    icon: BarChart3,
    items: [
      { href: "/dashboard",                          label: "Visão Geral",       icon: LayoutDashboard },
      { href: "/dashboards/producao",                label: "Produção",          icon: Factory },
      { href: "/dashboards/financeiro",              label: "Financeiro",        icon: Wallet },
      { href: "/dashboards/logistica",               label: "Logística",         icon: Truck },
      { href: "/dashboards/comercial",               label: "Comercial",         icon: TrendingUp },
      { href: "/dashboards/estrategico",             label: "Estratégico",       icon: Star },
      { href: "/dashboards/ecommerce/vendas-online", label: "E-commerce",        icon: ShoppingBag },
      { href: "/dashboards/metas/ecommerce",         label: "Meta E-commerce",   icon: Target },
      { href: "/dashboards/metas/vendedores",        label: "Meta Vendedores",   icon: Users },
      { href: "/dashboards/metas/config",            label: "Config Metas",      icon: Settings },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: ShoppingBag,
    items: [
      { href: "/meu-painel",    label: "Meu Painel",        icon: BarChart3 },
      { href: "/vendas",        label: "Vendas",            icon: ShoppingBag },
      { href: "/orders",        label: "Pedidos (RV)",      icon: ShoppingCart },
      { href: "/crm",           label: "CRM",               icon: Target },
      { href: "/sales-targets", label: "Metas de Vendas",   icon: TrendingUp },
      { href: "/licensees",     label: "Licenciados",       icon: Building2 },
    ],
  },
  {
    id: "ops",
    label: "OPS",
    icon: ClipboardList,
    items: [
      { href: "/os",            label: "OS Descarbonização",  icon: ClipboardList },
      { href: "/ops/alerts",    label: "Alertas Operacionais", icon: Bell },
      { href: "/home",          label: "CarboOPS Hub",        icon: Layers },
      { href: "/scheduling",    label: "Agendamentos",        icon: Calendar },
      { href: "/machines",      label: "Máquinas",            icon: Cog },
      { href: "/checklist",     label: "Checklists",          icon: UserCheck },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    icon: Factory,
    items: [
      { href: "/production-orders", label: "Ordens de Produção", icon: Factory },
      { href: "/mrp/products",      label: "Produtos (MRP)",     icon: Package },
      { href: "/skus",              label: "SKUs",               icon: Package },
      { href: "/lots",              label: "Lotes",              icon: Package },
      { href: "/mrp/suppliers",     label: "Fornecedores MRP",   icon: Building2 },
      { href: "/suprimentos",       label: "Suprimentos",        icon: Package },
    ],
  },
  {
    id: "financeiro",
    label: "Finance",
    icon: Wallet,
    items: [
      { href: "/financeiro",        label: "Financeiro",      icon: Wallet },
      { href: "/viagens",           label: "Viagens & PC",    icon: Plane },
      { href: "/logistics",         label: "Logística",       icon: Truck },
      { href: "/purchasing",        label: "Compras",         icon: ShoppingCart },
      { href: "/admin/nfse",        label: "NFS-e",           icon: FileInput },
    ],
  },
  {
    id: "equipe",
    label: "Equipe",
    icon: Users,
    items: [
      { href: "/team",               label: "Equipe",            icon: Users },
      { href: "/org-chart",          label: "Organograma",       icon: Network },
      { href: "/role-matrix",        label: "Matriz de Papéis",  icon: Shield },
      { href: "/responsibility-map", label: "Responsabilidades", icon: UserCheck },
      { href: "/import",             label: "Importar Dados",    icon: FileSpreadsheet },
    ],
  },
  {
    id: "territorial",
    label: "Territorial",
    icon: Network,
    items: [
      { href: "/mapa-territorial",           label: "Mapa Territorial",    icon: Network },
      { href: "/ops/network-map",            label: "Mapa da Rede",        icon: Network },
      { href: "/ops/licensee-ranking",       label: "Ranking Licenciados", icon: Star },
      { href: "/ops/territory-intelligence", label: "Inteligência Terr.",  icon: BarChart3 },
      { href: "/ops/territory-expansion",    label: "Expansão Territorial",icon: TrendingUp },
      { href: "/ops/pdv-network",            label: "Rede PDV",            icon: Store },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Shield,
    items: [
      { href: "/admin",              label: "Administração",       icon: Shield,    adminOnly: true },
      { href: "/admin/cockpit",      label: "Cockpit Estratégico", icon: BarChart3, adminOnly: true },
      { href: "/governance",         label: "Governança",          icon: Shield,    adminOnly: true },
      { href: "/admin/approval",     label: "Aprovações",          icon: UserCheck },
      { href: "/admin/pipeline",     label: "Config Pipeline",     icon: Cog },
      { href: "/admin/webhooks",     label: "Webhooks CRM",        icon: Zap },
      { href: "/integrations/bling", label: "Bling",               icon: Link2 },
      { href: "/bugs",               label: "Bugs",                icon: Bug },
      { href: "/ai-assistant",       label: "Assistente IA",       icon: Star },
    ],
  },
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
  "metas": "Metas",
  "ecommerce": "Ecommerce",
  "vendedores": "Vendedores",
  "org-chart": "Organograma",
  "pdv-network": "Rede PDV",
  "role-matrix": "Matriz de Acesso",
  "viagens": "Viagens & PC",
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
  const { profile, signOut, passwordMustChange, isAnyGestor, carboRoles, isMasterAdmin, isSuporte } = useAuth();
  const canSeeAdminMenu = useCanSeeAdminMenu();
  const canSeeFinanceMenu = useCanSeeFinanceMenu();
  const roleLines = useRoleDisplayLabel();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSector, setActiveSector] = useState<string | null>("dashboards");

  // ── Onboarding → PasswordChange sequencing ─────────────────────────────────
  // PasswordChangeModal only renders AFTER onboarding is dismissed/done,
  // so the onboarding always shows first for new users.
  const [onboardingDone, setOnboardingDone] = useState(false);

  const { data: alertsBadge = 0 } = useOpsAlertsBadge();
  const { data: crmStaleBadge = 0 } = useCRMStaleBadge();
  useEcommerceNotifications();

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

  const areaLabel = activeSector
    ? SECTORS.find(s => s.id === activeSector)?.label ?? "Menu"
    : "Menu";

  const SidebarContent = () => {
    const activeSectorData = SECTORS.find(s => s.id === activeSector);
    const visibleItems = activeSectorData?.items.filter(item =>
      !item.adminOnly || canSeeAdminMenu
    ) ?? [];

    return (
      <div className="flex h-full overflow-hidden">
        {/* ── Left rail: sector icons ── */}
        <div className="w-[72px] border-r border-border flex flex-col items-center py-3 gap-0.5 shrink-0">
          {/* Logo */}
          <div className="mb-3 flex justify-center">
            <img src={logoCarbo} alt="Carbo" className="h-7 w-7 object-contain" />
          </div>

          {SECTORS.map(sector => {
            const isActive = activeSector === sector.id;
            const hasActivePath = sector.items.some(item =>
              item.href !== "/dashboard" && location.pathname.startsWith(item.href)
            );
            return (
              <button
                key={sector.id}
                onClick={() => setActiveSector(isActive ? null : sector.id)}
                className={cn(
                  "flex flex-col items-center gap-1 w-[60px] py-2 px-1 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-carbo-green/10 text-carbo-green"
                    : hasActivePath
                    ? "text-carbo-green/70 hover:bg-muted"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <sector.icon className="h-4 w-4 shrink-0" />
                <span className="text-[9px] font-medium leading-none text-center">{sector.label}</span>
              </button>
            );
          })}

          {/* Bottom: Home + ThemeToggle */}
          <div className="mt-auto flex flex-col items-center gap-1 pt-2 border-t border-border w-full">
            <Link
              to="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all w-[60px]"
            >
              <Home className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">Início</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>

        {/* ── Right panel: sector items ── */}
        {activeSector ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                {activeSectorData?.label}
              </p>
            </div>
            {/* Items */}
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {visibleItems.map(item => {
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
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-area-controle" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <img src={logoCarbo} alt="" className="h-7 w-7 opacity-40 object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">CARBO CORE</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Selecione um setor</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PlatformOnboarding onDismissed={() => setOnboardingDone(true)} />
      {onboardingDone && <PasswordChangeModal />}

      <div className="min-h-screen bg-background">
        {/* ══ TOPBAR ═══════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border))] transition-all duration-200">
          <div className="flex h-14 items-center justify-between px-4 lg:px-6 gap-3">
            {/* LEFT */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {location.pathname !== "/" && location.pathname !== "/dashboard" && (
                <button
                  onClick={() => {
                    if (window.history.state?.idx > 0) {
                      navigate(-1);
                    } else {
                      // sem histórico útil — sobe um nível na URL
                      const parent = location.pathname.split("/").slice(0, -1).join("/") || "/dashboard";
                      navigate(parent);
                    }
                  }}
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
              <QuickActionsMenu />
              <NotificationBell />
              <BugReportButton />
              <ThemeToggle />
              <Separator orientation="vertical" className="h-5" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl pl-1.5 pr-2.5 py-1.5 text-sm transition-all duration-200 hover:bg-secondary active:scale-95 min-w-0">
                    <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-full overflow-hidden flex-shrink-0 shadow-sm">
                      {profile?.avatar_url
                        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full carbo-gradient flex items-center justify-center">
                            <span className="text-xs font-bold text-white">{getInitials(profile?.full_name)}</span>
                          </div>
                      }
                    </div>
                    <div className="hidden md:block text-left min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[110px]">
                        {(() => { const parts = profile?.full_name?.split(" ") ?? []; return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] || "Usuário"; })()}
                      </p>
                      <div className="flex flex-col">
                        {roleLines.map((line, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">{line}</p>
                        ))}
                      </div>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 hidden md:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 shadow-xl rounded-xl">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-medium truncate">{profile?.full_name || "Usuário"}</p>
                      <div className="flex flex-col">
                        {roleLines.map((line, i) => (
                          <p key={i} className="text-xs text-muted-foreground font-normal leading-tight uppercase tracking-wide">{line}</p>
                        ))}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/meu-perfil")}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    Meu Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    <Home className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/team")}>
                    <Users className="mr-2 h-4 w-4" />
                    Minha Equipe
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/bugs")}>
                    <Bug className="mr-2 h-4 w-4" />
                    Bugs encontrados
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
