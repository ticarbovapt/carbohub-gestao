import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, LogOut, UserCircle, Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { HUB_URL } from "@/lib/sso";

// ─────────────────────────────────────────────────────────────────────────────
// Barra de topo COMPARTILHADA do ecossistema (replicada em cada app: admin/sales).
// Logo → Hub · tema claro/escuro · perfil. (Bugs e Notificações entram aqui nos
// próximos incrementos, com lógica compartilhada via mesmas tabelas do Supabase.)
// ─────────────────────────────────────────────────────────────────────────────
export function TopBar({ appName, left }: { appName: string; left?: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const avatar = (profile as { avatar_url?: string } | null)?.avatar_url
    || (user?.id ? diceBearUrl(user.id) : "");
  const name = profile?.full_name ?? profile?.username ?? "Usuário";

  return (
    <header className="border-b bg-card sticky top-0 z-30">
      <div className="px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {left}
          <button onClick={() => { window.location.href = HUB_URL; }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity" title="Ir para o Hub">
            <Boxes className="h-5 w-5 text-carbo-green" />
            <span className="font-bold">{appName}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-muted transition-colors">
                <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-border" />
                <span className="text-sm font-medium hidden sm:inline max-w-[140px] truncate">{name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/perfil")}>
                <UserCircle className="h-4 w-4 mr-2" /> Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
