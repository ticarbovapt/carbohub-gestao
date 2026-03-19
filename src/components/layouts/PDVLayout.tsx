import React, { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  History,
  LogOut,
  Home,
  Store,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/contexts/AuthContext";
import { usePDVStatus, usePDVData } from "@/hooks/usePDV";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/notifications";
import { cn } from "@/lib/utils";
import logoCarbo from "@/assets/logo-carbo.png";

const navItems = [
  { path: "/pdv/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/pdv/stock", label: "Estoque", icon: Package },
  { path: "/pdv/history", label: "Histórico", icon: History },
];

const ROUTE_LABELS: Record<string, string> = {
  pdv: "Insumos",
  dashboard: "Dashboard",
  stock: "Estoque",
  history: "Histórico",
};

function Breadcrumb({ pdvName }: { pdvName?: string }) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = [
    { label: "Insumos", href: "/pdv/dashboard" },
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

export function PDVLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { data: pdvStatus } = usePDVStatus();
  const { data: pdv } = usePDVData(pdvStatus?.pdv?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isItemActive = (path: string) => location.pathname === path;

  const SidebarContent = () => (
    <>
      {/* Sidebar header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <img src={logoCarbo} alt="Carbo" className="h-6 w-6 object-contain" />
        <div>
          <p className="text-sm font-bold text-foreground leading-none">Insumos</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{pdv?.name || "PDV"}</p>
        </div>
      </div>

      {/* Stock Alert */}
      {pdv?.hasStockAlert && (
        <div className="mx-3 mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Estoque baixo!</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {pdv.currentStock} unidades restantes
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto pt-4">
        {navItems.map((item) => {
          const isActive = isItemActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                isActive
                  ? "bg-area-products-soft text-area-products font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-area-products flex-shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 mt-auto">
        <div className="flex items-center justify-between">
          <Link
            to="/pdv/dashboard"
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

            {/* Insumos pill — sidebar trigger */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 active:scale-95 border",
                    sidebarOpen
                      ? "bg-area-products text-area-products-foreground border-area-products shadow-sm"
                      : "text-area-products bg-area-products-soft border-area-products/30 hover:border-area-products/60 hover:bg-area-products/15"
                  )}
                >
                  <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Insumos</span>
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>

          {/* CENTER — breadcrumb */}
          <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
            <Breadcrumb pdvName={pdv?.name} />
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
                      PDV {pdv?.name || ""}
                    </p>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 shadow-xl rounded-xl">
                <DropdownMenuLabel>
                  <p className="font-medium truncate">{profile?.full_name || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground font-normal">PDV {pdv?.name || ""}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/pdv/dashboard")}>
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
        <Outlet />
      </main>
    </div>
  );
}
