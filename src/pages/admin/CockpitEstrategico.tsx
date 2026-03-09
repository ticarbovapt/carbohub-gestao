import React, { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { IntelligenceHub } from "@/components/intelligence/IntelligenceHub";
import {
  Activity,
  Users,
  Store,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Megaphone,
  Bell,
  Download,
  Shield,
  ShieldCheck,
  Loader2,
  Zap,
  Home,
  ChevronRight,
  Clock,
  Filter,
  ChevronDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Globe,
  FileText,
  Lock,
  Eye,
  Info,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import logoAvatarLight from "@/assets/logo-avatar-light.png";


// ─── server-side verification ─────────────────────────────────────────────────
function useMasterAdminVerification() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["master-admin-verify", user?.id],
    queryFn: async () => {
      if (!user) return { isMasterAdmin: false };
      const [adminCheck, ceoCheck] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_ceo", { _user_id: user.id }),
      ]);
      const isMasterAdmin =
        !adminCheck.error &&
        !ceoCheck.error &&
        adminCheck.data === true &&
        ceoCheck.data === true;
      if (isMasterAdmin) {
        void supabase.rpc("log_governance_action", {
          _action_type: "cockpit_access",
          _resource_type: "cockpit_estrategico",
          _details: { user_id: user.id },
        });
      }
      return { isMasterAdmin };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

// ─── data hook ────────────────────────────────────────────────────────────────
function useCockpitData() {
  return useQuery({
    queryKey: ["cockpit-kpis"],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [licenseesRes, pdvsRes, osRes, machinesRes, profilesRes] =
        await Promise.all([
          supabase.from("licensees").select("id, status, address_state"),
          supabase
            .from("pdvs")
            .select("id, status, address_state, has_stock_alert"),
          supabase
            .from("service_orders")
            .select("id, status, stage_sla_deadline, current_department, created_at")
            .neq("status", "completed")
            .neq("status", "cancelled"),
          supabase
            .from("machines")
            .select("id, status, has_active_alert, location_state"),
          supabase
            .from("profiles")
            .select("id, last_login_at, status")
            .eq("status", "approved"),
        ]);

      const licensees = licenseesRes.data || [];
      const pdvs = pdvsRes.data || [];
      const os = osRes.data || [];
      const machines = machinesRes.data || [];
      const profiles = profilesRes.data || [];

      const activeLicensees = licensees.filter((l) => l.status === "active").length;
      const inactiveLicensees = licensees.filter((l) => l.status !== "active").length;
      const activePDVs = pdvs.filter((p) => p.status === "active").length;
      const inactivePDVs = pdvs.filter((p) => p.status !== "active").length;
      const stockAlerts = pdvs.filter((p) => p.has_stock_alert).length;
      const machineAlerts = machines.filter((m) => m.has_active_alert).length;

      const slaBreaches = os.filter(
        (o) => o.stage_sla_deadline && new Date(o.stage_sla_deadline) < now
      ).length;

      const slaNearBreach = os.filter((o) => {
        if (!o.stage_sla_deadline) return false;
        const deadline = new Date(o.stage_sla_deadline);
        const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
        return hoursLeft > 0 && hoursLeft <= 6;
      }).length;

      const activeUsersLast7 = profiles.filter(
        (p) => p.last_login_at && new Date(p.last_login_at) >= sevenDaysAgo
      ).length;
      const activeUsersPercent =
        profiles.length > 0
          ? Math.round((activeUsersLast7 / profiles.length) * 100)
          : 0;

      const states = new Set([
        ...licensees.map((l) => l.address_state).filter(Boolean),
        ...pdvs.map((p) => p.address_state).filter(Boolean),
        ...machines.map((m) => m.location_state).filter(Boolean),
      ]);

      return {
        activeLicensees,
        inactiveLicensees,
        activePDVs,
        inactivePDVs,
        activeOS: os.length,
        slaBreaches,
        slaNearBreach,
        stockAlerts,
        machineAlerts,
        activeUsersPercent,
        statesCovered: states.size,
        criticalAlerts: slaBreaches + stockAlerts + machineAlerts,
        statesList: Array.from(states).sort() as string[],
        machinesData: machines,
        totalProfiles: profiles.length,
      };
    },
    refetchInterval: 60_000,
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
type TrendDir = "up" | "down" | "neutral";

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  trendLabel,
  trend,
  accentClass,
  delay,
  alert,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trendLabel?: string;
  trend?: TrendDir;
  accentClass: string; // e.g. "text-carbo-blue bg-carbo-blue/10"
  delay: number;
  alert?: boolean;
}) {
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      className={`relative bg-card rounded-2xl border-2 p-5 overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
        alert ? "border-destructive/40" : "border-cockpit-card-border"
      }`}
    >
      {/* Top accent bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl ${
          alert
            ? "bg-destructive"
            : "bg-gradient-to-r from-carbo-blue to-carbo-green"
        }`}
      />

      <div className="flex items-start justify-between mb-4 mt-1">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${accentClass}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {alert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider border border-destructive/20">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse inline-block" />
            Crítico
          </span>
        )}
        {trendLabel && !alert && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trendLabel}
          </div>
        )}
      </div>

      <p className="text-3xl font-black text-foreground tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
type MachineEntry = {
  location_state: string | null;
  status: string;
  has_active_alert: boolean;
};

function StateHeatmap({
  statesList,
  machinesData,
  filterState,
}: {
  statesList: string[];
  machinesData: MachineEntry[];
  filterState: string;
}) {
  const rows = statesList.map((state) => {
    const sm = machinesData.filter((m) => m.location_state === state);
    const active = sm.filter((m) => m.status === "operational").length;
    const alerts = sm.filter((m) => m.has_active_alert).length;
    return { state, total: sm.length, active, alerts };
  });

  const filtered =
    filterState !== "all" ? rows.filter((r) => r.state === filterState) : rows;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <MapPin className="h-8 w-8 opacity-30" />
        <p className="text-sm">Nenhum dado territorial disponível.</p>
      </div>
    );
  }

  const maxTotal = Math.max(...filtered.map((r) => r.total), 1);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {filtered.map(({ state, total, active, alerts }) => {
        const intensity = total / maxTotal;
        const hasAlert = alerts > 0;
        return (
          <motion.div
            key={state}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.18 }}
            className={`rounded-xl border p-3 cursor-default transition-all ${
              hasAlert
                ? "border-destructive/30 bg-destructive/5"
                : intensity > 0.6
                ? "border-carbo-blue/20 bg-carbo-blue/5"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-bold text-foreground uppercase">{state}</p>
              {hasAlert && (
                <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
              )}
            </div>
            <p className="text-xl font-black text-foreground">{total}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {active} oper.
            </p>
            <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  hasAlert ? "bg-destructive" : "bg-gradient-to-r from-carbo-blue to-carbo-green"
                }`}
                style={{ width: `${Math.max(intensity * 100, 6)}%` }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Alert Strip ─────────────────────────────────────────────────────────────
function AlertStrip({
  icon: Icon,
  title,
  count,
  description,
  severity,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  description: string;
  severity: "critical" | "warning" | "low";
}) {
  const styles = {
    critical: {
      wrap: "border-destructive/25 bg-destructive/5",
      iconWrap: "bg-destructive/10",
      iconColor: "text-destructive",
      count: "text-destructive",
    },
    warning: {
      wrap: "border-warning/25 bg-warning/5",
      iconWrap: "bg-warning/10",
      iconColor: "text-warning-foreground",
      count: "text-warning-foreground",
    },
    low: {
      wrap: "border-border bg-muted/20",
      iconWrap: "bg-muted",
      iconColor: "text-muted-foreground",
      count: "text-muted-foreground",
    },
  }[severity];

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition-all hover:shadow-sm ${styles.wrap}`}
    >
      <div
        className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${styles.iconWrap}`}
      >
        <Icon className={`h-5 w-5 ${styles.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={`text-2xl font-black flex-shrink-0 ${styles.count}`}>
        {count}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors flex-shrink-0 whitespace-nowrap hover:border-cockpit-accent/40"
            onClick={() => toast.info("Disparar ação", { description: "Módulo de ações em desenvolvimento." })}
          >
            Disparar ação
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-48 text-center">
          Ação sensível — pode exigir validação e será registrada em auditoria
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────
function ActionBtn({
  icon: Icon,
  label,
  description,
  gradient,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.015, y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.16 }}
      onClick={onClick}
      className={`group w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md ${gradient}`}
    >
      <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:bg-white/30 transition-colors">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm">{label}</p>
        <p className="text-xs text-white/70 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-white/80 group-hover:translate-x-1 transition-all flex-shrink-0" />
    </motion.button>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({
  icon: Icon,
  label,
  number,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  number: number;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-[10px] font-black text-muted-foreground">
        {number}
      </div>
      <Icon className="h-4 w-4 text-carbo-blue" />
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em]">
        {label}
      </h2>
      {badge && (
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive border border-destructive/20">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse inline-block" />
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-muted animate-pulse ${className}`} />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CockpitEstrategico() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: authData, isLoading: verifyLoading } = useMasterAdminVerification();
  const { data: kpis, isLoading: kpisLoading } = useCockpitData();

  const [stateFilter, setStateFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30d");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Loading gate
  if (authLoading || verifyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-carbo-blue to-carbo-green flex items-center justify-center mx-auto shadow-carbo">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-xs uppercase tracking-widest">
            Verificando credenciais
          </p>
        </div>
      </div>
    );
  }

  // Auth gate — server-side verified
  if (!user || !authData?.isMasterAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasCritical = (kpis?.criticalAlerts ?? 0) > 0;

  return (
    <TooltipProvider delayDuration={400}>
    <div className="min-h-screen bg-[hsl(var(--background))] antialiased" data-cockpit="true">


      {/* ═══ COCKPIT HEADER (MasterAdmin premium theme) ══════════════════════ */}
      <header className="sticky top-0 z-40 border-b bg-cockpit-header-bg border-cockpit-header-border backdrop-blur-xl shadow-[0_2px_24px_0_rgba(0,0,0,0.4)]">

        {/* Thin accent line at very top */}
        <div className="h-[2px] bg-gradient-to-r from-cockpit-accent via-cockpit-accent-soft to-transparent" />

        <div className="flex h-16 items-center justify-between px-4 lg:px-8 max-w-screen-2xl mx-auto">

          {/* Left — brand + title + badge restrito */}
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <img src={logoAvatarLight} alt="Carbo" className="h-7 w-7 object-contain opacity-90 hover:opacity-100 transition-opacity" />
            </Link>
            <Separator orientation="vertical" className="h-5 bg-cockpit-header-border" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-cockpit-header-fg leading-none">Cockpit Estratégico</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-cockpit-restricted-bg text-cockpit-restricted-fg border border-cockpit-restricted-border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                  <Lock className="h-2.5 w-2.5" />
                  Restrito
                </span>
              </div>
              <p className="text-[10px] text-cockpit-header-muted leading-none mt-0.5 hidden sm:block">
                Inteligência territorial e operacional
              </p>
            </div>
          </div>

          {/* Center — global filters */}
          <div className="hidden md:flex items-center gap-2">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-8 w-28 text-xs bg-white/5 border-cockpit-header-border text-cockpit-header-fg hover:bg-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" className="text-xs">Últimos 7d</SelectItem>
                <SelectItem value="30d" className="text-xs">Últimos 30d</SelectItem>
                <SelectItem value="90d" className="text-xs">Últimos 90d</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modalityFilter} onValueChange={setModalityFilter}>
              <SelectTrigger className="h-8 w-36 text-xs bg-white/5 border-cockpit-header-border text-cockpit-header-fg hover:bg-white/10">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas modalidades</SelectItem>
                <SelectItem value="vapt" className="text-xs">VAPT</SelectItem>
                <SelectItem value="ze" className="text-xs">CarboZé</SelectItem>
                <SelectItem value="P" className="text-xs">P — Linha Leve</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right — shield + nav */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cockpit-accent/10 border border-cockpit-accent/20 text-cockpit-accent cursor-default">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Sessão MasterAdmin verificada — ações auditadas
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 bg-cockpit-header-border" />

            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 text-xs text-cockpit-header-muted hover:text-cockpit-header-fg transition-colors px-2 py-1.5 rounded-lg hover:bg-white/8"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-cockpit-header-muted hover:text-cockpit-header-fg hover:bg-white/8"
                  onClick={() => toast.info("Exportar", { description: "Relatório estratégico em geração…" })}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Exportar relatório</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* ═══ AUDIT RIBBON ══════════════════════════════════════════════════════ */}
      <div className="border-b border-cockpit-header-border/60 bg-cockpit-audit-bg/10 px-4 lg:px-8">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-2 py-1.5">
          <Eye className="h-3 w-3 text-cockpit-audit-fg flex-shrink-0" />
          <p className="text-[11px] font-medium text-cockpit-audit-fg">
            Área restrita — todas as ações neste painel são registradas automaticamente em auditoria
          </p>
          <span className="ml-auto text-[10px] text-cockpit-header-muted tabular-nums hidden sm:inline">
            {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      </div>


      {/* ═══ CONTENT ══════════════════════════════════════════════════════════ */}
      <main className="px-4 lg:px-8 py-8 max-w-screen-2xl mx-auto space-y-10">

        {/* ── LINHA 1: 6 MACRO KPIs ────────────────────────────────────────── */}
        <section>
          <SectionLabel icon={BarChart3} label="Indicadores Macro" number={1} />

          {kpisLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skel key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <KPICard
                icon={Activity}
                label="Atividade Geral"
                value={`${kpis?.activeUsersPercent ?? 0}%`}
                sub={`${kpis?.totalProfiles ?? 0} usuários ativos`}
                trendLabel="+7d"
                trend="up"
                accentClass="bg-carbo-blue/10 text-carbo-blue"
                delay={0.04}
              />
              <KPICard
                icon={TrendingUp}
                label="Receita Total"
                value="—"
                sub="em integração"
                accentClass="bg-success/10 text-success"
                delay={0.08}
              />
              <KPICard
                icon={Users}
                label="Licenciados Ativos"
                value={kpis?.activeLicensees ?? 0}
                sub={`${kpis?.inactiveLicensees ?? 0} inativos`}
                trendLabel={`${kpis?.activeLicensees ?? 0} total`}
                trend="neutral"
                accentClass="bg-carbo-green/10 text-carbo-green"
                delay={0.12}
              />
              <KPICard
                icon={Store}
                label="PDVs Ativos"
                value={kpis?.activePDVs ?? 0}
                sub={`${kpis?.inactivePDVs ?? 0} inativos`}
                accentClass="bg-warning/10 text-warning-foreground"
                delay={0.16}
              />
              <KPICard
                icon={Globe}
                label="OP em Aberto"
                value={kpis?.activeOS ?? 0}
                sub="ordens ativas"
                accentClass="bg-carbo-blue/10 text-carbo-blue"
                delay={0.2}
              />
              <KPICard
                icon={AlertTriangle}
                label="Alertas Críticos"
                value={kpis?.criticalAlerts ?? 0}
                sub={`${kpis?.slaBreaches ?? 0} SLA em breach`}
                alert={(kpis?.criticalAlerts ?? 0) > 0}
                accentClass="bg-destructive/10 text-destructive"
                delay={0.24}
              />
            </div>
          )}
        </section>

        {/* ── LINHA 2: MAPA TERRITORIAL (full width) ───────────────────────── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <SectionLabel
              icon={MapPin}
              label="Mapa Territorial"
              number={2}
            />
            {/* Collapsible filters */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5 bg-background hover:bg-muted"
              >
                <Filter className="h-3.5 w-3.5" />
                Filtrar estado
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {filtersOpen && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden"
                  >
                    <Select value={stateFilter} onValueChange={setStateFilter}>
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="Todos os estados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">
                          Todos os estados
                        </SelectItem>
                        {(kpis?.statesList ?? []).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-board p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground font-medium">
                Cobertura territorial — {kpis?.statesCovered ?? 0} estado{(kpis?.statesCovered ?? 1) !== 1 ? "s" : ""} mapeado{(kpis?.statesCovered ?? 1) !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-carbo-blue inline-block" />
                  Alta densidade
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                  Alerta ativo
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />
                  Baixa operação
                </span>
              </div>
            </div>

            {kpisLoading ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skel key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <StateHeatmap
                statesList={kpis?.statesList ?? []}
                machinesData={
                  (kpis?.machinesData ?? []) as MachineEntry[]
                }
                filterState={stateFilter}
              />
            )}
          </div>
        </section>

        {/* ── LINHA 3: ALERTAS ESTRATÉGICOS ────────────────────────────────── */}
        <section>
          <SectionLabel
            icon={AlertTriangle}
            label="Alertas Estratégicos"
            number={3}
            badge={hasCritical ? `${kpis?.criticalAlerts} crítico${(kpis?.criticalAlerts ?? 0) > 1 ? "s" : ""}` : undefined}
          />

          {kpisLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skel key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <AlertStrip
                icon={Clock}
                title="SLAs em Breach"
                count={kpis?.slaBreaches ?? 0}
                description="Ordens de produção com prazo já ultrapassado — requerem ação imediata."
                severity={(kpis?.slaBreaches ?? 0) > 0 ? "critical" : "low"}
              />
              <AlertStrip
                icon={AlertTriangle}
                title="SLAs Próximos do Vencimento"
                count={kpis?.slaNearBreach ?? 0}
                description="OP com menos de 6h restantes no prazo atual."
                severity={(kpis?.slaNearBreach ?? 0) > 0 ? "warning" : "low"}
              />
              <AlertStrip
                icon={Store}
                title="Alertas de Estoque"
                count={kpis?.stockAlerts ?? 0}
                description="PDVs abaixo do nível mínimo de estoque configurado."
                severity={(kpis?.stockAlerts ?? 0) > 0 ? "warning" : "low"}
              />
              <AlertStrip
                icon={TrendingUp}
                title="Alertas de Máquinas"
                count={kpis?.machineAlerts ?? 0}
                description="Máquinas com alertas ativos que necessitam de atenção técnica."
                severity={(kpis?.machineAlerts ?? 0) > 0 ? "critical" : "low"}
              />
            </div>
          )}

          {!kpisLoading && (kpis?.criticalAlerts ?? 0) === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-5 py-3 mt-3"
            >
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <p className="text-sm text-success font-medium">
                Sem alertas críticos no momento. Operação estável.
              </p>
            </motion.div>
          )}
        </section>

        {/* ── LINHA 4: AÇÕES ESTRATÉGICAS ──────────────────────────────────── */}
        <section>
          <SectionLabel icon={Zap} label="Ações Executivas" number={4} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ActionBtn
              icon={Megaphone}
              label="Criar Campanha Regional"
              description="Disparo segmentado por região e modalidade de serviço."
              gradient="bg-gradient-to-br from-carbo-blue to-[#1565C0] hover:opacity-95"
              onClick={() =>
                toast.info("Campanha regional", {
                  description: "Módulo de campanhas em desenvolvimento.",
                })
              }
            />
            <ActionBtn
              icon={FileText}
              label="Exportar Relatório Estratégico"
              description="Consolidado de KPIs, SLAs e performance do ecossistema."
              gradient="bg-gradient-to-br from-carbo-green to-[#1B8A4E] hover:opacity-95"
              onClick={() =>
                toast.success("Exportação iniciada", {
                  description: "Relatório estratégico sendo gerado…",
                })
              }
            />
            <ActionBtn
              icon={Globe}
              label="Gerar Lista para Tráfego Pago"
              description="Segmentação de leads por região, modalidade e performance."
              gradient="bg-gradient-to-br from-violet-600 to-violet-800 hover:opacity-95"
              onClick={() =>
                toast.info("Lista gerada", {
                  description: "Módulo de tráfego pago em integração.",
                })
              }
            />
            <ActionBtn
              icon={Bell}
              label="Disparar Alerta Operacional"
              description="Notificação crítica para operadores e gestores em campo."
              gradient="bg-gradient-to-br from-amber-500 to-amber-700 hover:opacity-95"
              onClick={() =>
                toast.warning("Alerta operacional", {
                  description: "Funcionalidade de alerta broadcast em integração.",
                })
              }
            />
          </div>
        </section>

        {/* ── LINHA 5: INTELLIGENCE HUB ────────────────────────────────────── */}
        <section>
          <SectionLabel icon={Brain} label="Radar Estratégico Inteligente" number={5} />
          <div className="rounded-2xl border border-border bg-card shadow-board p-6">
            <IntelligenceHub />
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="pt-6 pb-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            Área restrita · Acessos registrados automaticamente
          </p>
          <Link
            to="/governance"
            className="text-xs text-muted-foreground hover:text-carbo-blue transition-colors flex items-center gap-1"
          >
            Logs de auditoria
            <ChevronRight className="h-3 w-3" />
          </Link>
        </footer>
      </main>
    </div>
    </TooltipProvider>
  );
}

