import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, UserCircle, Moon, Sun, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import logoCarbo from "@/assets/logo-carbo.png";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { HUB_URL } from "@/lib/sso";
import { BugButton } from "@/components/BugButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─────────────────────────────────────────────────────────────────────────────
// Barra de topo COMPARTILHADA do ecossistema (replicada em cada app: admin/sales).
// Logo → Hub · tema claro/escuro · perfil. (Bugs e Notificações entram aqui nos
// próximos incrementos, com lógica compartilhada via mesmas tabelas do Supabase.)
// ─────────────────────────────────────────────────────────────────────────────
// Papéis (primário/secundário) com labels do banco — ex.: "COLABORADOR OPS".
function useRoleLabels(p: {
  department?: string | null; funcao?: string | null;
  secondary_department?: string | null; secondary_funcao?: string | null;
} | null) {
  const [siglas, setSiglas] = useState<Record<string, string>>({});
  const [fnLabels, setFnLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: deps }, { data: fns }] = await Promise.all([
        supabase.from("carbo_departments").select("key,sigla"),
        supabase.from("carbo_functions").select("department,function_key,label"),
      ]);
      if (!active) return;
      setSiglas(Object.fromEntries((deps ?? []).map((d) => [d.key, d.sigla])));
      setFnLabels(Object.fromEntries((fns ?? []).map((f) => [`${f.department}:${f.function_key}`, f.label])));
    })();
    return () => { active = false; };
  }, []);

  const role = (dep?: string | null, fn?: string | null) => {
    if (!dep && !fn) return null;
    const fl = fn ? (fnLabels[`${dep}:${fn}`] ?? fn) : null;
    const sg = dep ? (siglas[dep] ?? dep) : null;
    return [fl, sg].filter(Boolean).join(" ").toUpperCase();
  };

  return {
    primary: role(p?.department, p?.funcao),
    secondary: role(p?.secondary_department, p?.secondary_funcao),
  };
}

export function TopBar({ appName, onMenu }: { appName: string; onMenu?: () => void }) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { primary, secondary } = useRoleLabels(profile);

  // Foto vem do banco (igual ao Meu Perfil) → imagem real em todos os apps,
  // mesmo onde o AuthContext não carrega avatar_url.
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (active) setPhoto((data as { avatar_url?: string } | null)?.avatar_url ?? null); });
    return () => { active = false; };
  }, [user?.id]);

  const avatar = photo
    || (profile as { avatar_url?: string } | null)?.avatar_url
    || (user?.id ? diceBearUrl(user.id) : "");
  const name = profile?.full_name ?? profile?.username ?? "Usuário";

  return (
    <header className="border-b bg-card sticky top-0 z-30">
      <div className="px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {onMenu && (
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onMenu} title="Abrir/fechar menu">
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <button onClick={() => { window.location.href = `${HUB_URL}/home`; }}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity" title="Ir para o Hub">
            <img src={logoCarbo} alt="Carbo" className="h-7 w-auto object-contain" />
            <span className="font-bold text-sm hidden sm:inline">{appName}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <BugButton />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-full pl-1 pr-2.5 py-1 hover:bg-muted transition-colors">
                <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-border" />
                <span className="hidden sm:flex flex-col items-start leading-tight min-w-0">
                  <span className="text-sm font-medium max-w-[180px] truncate">{name}</span>
                  {primary && <span className="text-[10px] text-muted-foreground max-w-[180px] truncate">{primary}</span>}
                  {secondary && <span className="text-[10px] text-muted-foreground max-w-[180px] truncate">{secondary}</span>}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate">{name}</span>
                {primary && <span className="text-[11px] font-normal text-muted-foreground">{primary}</span>}
                {secondary && <span className="text-[11px] font-normal text-muted-foreground">{secondary}</span>}
              </DropdownMenuLabel>
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
