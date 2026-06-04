import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useFunctionAccess, ENFORCEMENT_ACTIVE } from "@/hooks/useFunctionAccess";
import { useRoleDisplayLabel } from "@/hooks/useActionPermissions";
import { SCREEN_GROUPS } from "@/constants/functionAccessConfig";
import {
  ArrowRight, LayoutGrid, BarChart3, ShoppingCart, Factory, Wallet,
  Users, Map, Settings2, Boxes, Sparkles,
} from "lucide-react";

// Ícone por área (palavra-chave no rótulo do grupo) — fallback genérico.
function groupIcon(label: string) {
  const l = label.toLowerCase();
  if (/dash|paine|indicador/.test(l)) return BarChart3;
  if (/comerc|venda|pedido|crm/.test(l)) return ShoppingCart;
  if (/produ|fabrica|op\b/.test(l)) return Factory;
  if (/financ|fatur|compra|custo/.test(l)) return Wallet;
  if (/equipe|usu[aá]rio|acesso|time/.test(l)) return Users;
  if (/territ|mapa|geo|expan/.test(l)) return Map;
  if (/admin|config|governan/.test(l)) return Settings2;
  if (/suprim|estoque|log[ií]stic|opera/.test(l)) return Boxes;
  return LayoutGrid;
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function InicioContent() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { allowedScreenIds, isConfigured } = useFunctionAccess();
  const roleLines = useRoleDisplayLabel();

  const isTiHead =
    (profile?.department === "ti_suporte" && profile?.funcao === "head") ||
    (profile?.secondary_department === "ti_suporte" && profile?.secondary_funcao === "head");
  const canSee = (id: string) => {
    if (!ENFORCEMENT_ACTIVE) return true;
    if (isTiHead) return true;
    if (!isConfigured) return true;
    return allowedScreenIds.includes(id);
  };

  // Saudação por horário + nome capitalizado
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = cap((profile?.full_name?.trim().split(/\s+/)[0] || "").toLowerCase()) || "Bem-vindo";

  // Grupos com pelo menos uma tela liberada
  const visibleGroups = SCREEN_GROUPS
    .map((g) => ({ ...g, screens: g.screens.filter((s) => canSee(s.id)) }))
    .filter((g) => g.screens.length > 0);

  const totalScreens = visibleGroups.reduce((n, g) => n + g.screens.length, 0);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Cabeçalho */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-carbo-green/10 via-card to-card p-6 md:p-8"
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-carbo-green/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-carbo-green/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-carbo-green" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {greet}, {firstName}! 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {roleLines.join(" · ")}
              {totalScreens > 0 && (
                <span className="text-muted-foreground/70"> · {totalScreens} tela{totalScreens > 1 ? "s" : ""} liberada{totalScreens > 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Áreas */}
      {visibleGroups.length === 0 ? (
        <div className="text-center py-16">
          <LayoutGrid className="h-14 w-14 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-medium">Nenhuma tela liberada ainda</p>
          <p className="text-sm text-muted-foreground mt-1">
            Solicite ao administrador a liberação dos seus acessos no Role Matrix.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {visibleGroups.map((group, gi) => {
            const Icon = groupIcon(group.label);
            return (
              <motion.section
                key={group.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * gi, duration: 0.35 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-carbo-green" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h2>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.screens.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => navigate(s.path)}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-carbo-green/50 hover:bg-carbo-green/5 hover:shadow-sm"
                    >
                      <span className="h-8 w-8 rounded-lg bg-muted/60 group-hover:bg-carbo-green/15 flex items-center justify-center transition-colors shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-carbo-green transition-colors" />
                      </span>
                      <span className="text-sm font-medium flex-1 truncate">{s.label}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-carbo-green group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Inicio() {
  return (
    <BoardLayout>
      <InicioContent />
    </BoardLayout>
  );
}
