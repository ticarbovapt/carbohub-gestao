import { useNavigate, useLocation } from "react-router-dom";
import {
  Briefcase,
  Users,
  Store,
  ChevronRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { usePDVStatus } from "@/hooks/usePDV";

type AreaKey = "ops" | "licensee" | "pdv";

interface AreaConfig {
  key: AreaKey;
  label: string;
  icon: React.ReactNode;
  path: string;
  gradient: string;
}

const AREAS: AreaConfig[] = [
  {
    key: "ops",
    label: "Carbo Controle",
    icon: <Briefcase className="h-4 w-4" />,
    path: "/dashboard",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    key: "licensee",
    label: "Portal Licenciados",
    icon: <Users className="h-4 w-4" />,
    path: "/licensee/dashboard",
    gradient: "from-carbo-green to-emerald-600",
  },
  {
    key: "pdv",
    label: "Área Produtos",
    icon: <Store className="h-4 w-4" />,
    path: "/pdv/dashboard",
    gradient: "from-amber-500 to-orange-600",
  },
];

interface AreaSwitcherProps {
  variant?: "compact" | "full";
}

export function AreaSwitcher({ variant = "compact" }: AreaSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isManager, isAnyGestor, isCeo, isAnyOperador } = useAuth();
  const { data: licenseeStatus } = useLicenseeStatus();
  const { data: pdvStatus } = usePDVStatus();

  // Determine current area based on route
  const getCurrentArea = (): AreaKey => {
    if (location.pathname.startsWith("/licensee")) return "licensee";
    if (location.pathname.startsWith("/pdv")) return "pdv";
    return "ops";
  };

  const currentArea = getCurrentArea();

  // Check access permissions
  const hasFullAccess = isCeo || isAdmin;
  const canAccessOps = hasFullAccess || isManager || isAnyGestor || isAnyOperador;
  const canAccessLicensee = hasFullAccess || !!licenseeStatus?.licensee;
  const canAccessPDV = hasFullAccess || !!pdvStatus?.pdv;

  // Filter available areas
  const availableAreas = AREAS.filter((area) => {
    if (area.key === "ops") return canAccessOps;
    if (area.key === "licensee") return canAccessLicensee;
    if (area.key === "pdv") return canAccessPDV;
    return false;
  });

  const currentAreaConfig = AREAS.find((a) => a.key === currentArea);

  // Don't show switcher if only one area available
  if (availableAreas.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between gap-2 h-10 px-3 rounded-lg transition-all duration-200",
            "hover:bg-secondary border border-border"
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "h-6 w-6 rounded-md flex items-center justify-center text-white",
                `bg-gradient-to-br ${currentAreaConfig?.gradient}`
              )}
            >
              {currentAreaConfig?.icon}
            </div>
            <span className="text-sm font-medium text-foreground">
              {currentAreaConfig?.label}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableAreas.map((area) => (
          <DropdownMenuItem
            key={area.key}
            onClick={() => navigate(area.path)}
            className={cn(
              "flex items-center gap-3 py-2.5 cursor-pointer",
              currentArea === area.key && "bg-muted"
            )}
          >
            <div
              className={cn(
                "h-7 w-7 rounded-md flex items-center justify-center text-white",
                `bg-gradient-to-br ${area.gradient}`
              )}
            >
              {area.icon}
            </div>
            <span className="flex-1 font-medium text-sm">{area.label}</span>
            {currentArea === area.key && (
              <Check className="h-4 w-4 text-carbo-green" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
