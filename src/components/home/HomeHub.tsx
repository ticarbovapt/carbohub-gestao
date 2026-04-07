import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  Briefcase,
  Users,
  Store,
  ArrowRight,
  Zap,
  TrendingUp,
  Package,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { usePDVStatus } from "@/hooks/usePDV";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { FloatingParticles } from "@/components/animations/FloatingParticles";
import { EcosystemOverview } from "./EcosystemOverview";
import { OperationalFlowMap } from "./OperationalFlowMap";
import logoAvatar from "@/assets/logo-avatar.png";

interface AreaCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Tailwind classes para o ícone container (bg + texto) usando tokens de área */
  accentBg: string;
  /** Tailwind classes para a borda hover */
  accentBorder: string;
  /** Tailwind classes para o CTA text */
  accentText: string;
  onClick: () => void;
  delay: number;
}

function AreaCard({ 
  title, 
  description, 
  icon, 
  accentBg,
  accentBorder,
  accentText,
  onClick, 
  delay,
}: AreaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, type: "spring", stiffness: 100, damping: 15 }}
      whileHover={{ scale: 1.025, y: -6 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <Card 
        className={`
          relative h-full overflow-hidden cursor-pointer
          border-2 border-border/60 bg-card
          shadow-sm hover:shadow-lg
          transition-all duration-300 rounded-2xl
          hover:border-opacity-100 ${accentBorder}
        `}
        onClick={onClick}
      >
        <CardContent className="p-6 md:p-8 h-full flex flex-col gap-4">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 ${accentBg}`}>
            {icon}
          </div>
          
          {/* Text */}
          <div className="flex-1 flex flex-col gap-1.5">
            <h3 className="text-xl font-bold text-foreground leading-tight">
              {title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          
          {/* CTA */}
          <div className={`flex items-center gap-2 text-sm font-semibold ${accentText} mt-auto pt-2 border-t border-border/40`}>
            <span>Acessar área</span>
            <ArrowRight className="h-4 w-4 ml-auto" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function HomeHub() {
  const navigate = useNavigate();
  const { isAdmin, isManager, isAnyGestor, isCeo, isAnyOperador, isLoading: authLoading } = useAuth();
  const { data: licenseeStatus, isLoading: licenseeLoading } = useLicenseeStatus();
  const { data: pdvStatus, isLoading: pdvLoading } = usePDVStatus();

  // Wait for all status to load
  const isLoading = authLoading || licenseeLoading || pdvLoading;

  // Determinar quais áreas o usuário pode acessar
  const canAccessOps = isAdmin || isManager || isAnyGestor || isCeo || isAnyOperador;
  const canAccessLicensee = !!licenseeStatus?.licensee;
  const canAccessPDV = !!pdvStatus?.pdv;

  // Se só tem acesso a uma área, redirecionar direto
  React.useEffect(() => {
    if (isLoading) return;
    
    const accessCount = [canAccessOps, canAccessLicensee, canAccessPDV].filter(Boolean).length;
    
    if (accessCount === 1) {
      if (canAccessOps) navigate("/dashboard", { replace: true });
      else if (canAccessLicensee) navigate("/licensee/dashboard", { replace: true });
      else if (canAccessPDV) navigate("/pdv/dashboard", { replace: true });
    }
  }, [canAccessOps, canAccessLicensee, canAccessPDV, navigate, isLoading]);

  // Define areas with their specific configurations - only show permitted areas
  const areas = [
    {
      key: "ops",
      title: "Carbo Controle",
      description: "Gestão interna, operação e estratégia",
      icon: <Briefcase className="h-5 w-5 text-white" />,
      accentBg: "bg-area-controle",
      accentBorder: "hover:border-area-controle",
      accentText: "text-area-controle",
      path: "/dashboard",
      visible: canAccessOps,
    },
    {
      key: "licensee",
      title: "Área dos Licenciados",
      description: "Pedidos, consumo, ganhos e crescimento",
      icon: <Users className="h-5 w-5 text-white" />,
      accentBg: "bg-area-licensee",
      accentBorder: "hover:border-area-licensee",
      accentText: "text-area-licensee",
      path: "/licensee/dashboard",
      visible: canAccessLicensee,
    },
    {
      key: "pdv",
      title: "Lojas",
      description: "Estoque, reposição e logística integrada",
      icon: <Store className="h-5 w-5 text-white" />,
      accentBg: "bg-area-products",
      accentBorder: "hover:border-area-products",
      accentText: "text-area-products",
      path: "/pdv/dashboard",
      visible: canAccessPDV,
    },
  ];

  // Filter to only show permitted areas
  const visibleAreas = areas.filter(area => area.visible);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-full h-full rounded-full border-4 border-primary/20 border-t-primary"
            />
          </div>
          <p className="text-muted-foreground">Carregando plataforma...</p>
        </motion.div>
      </div>
    );
  }

  const hasAnyAccess = visibleAreas.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20 dark:from-background dark:via-muted/5 dark:to-background overflow-hidden">
      <FloatingParticles />
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-4 lg:px-12 lg:py-6">
        <div className="flex items-center gap-3 md:gap-4">
          <motion.img 
            src={logoAvatar} 
            alt="Grupo Carbo" 
            className="h-10 md:h-12 w-auto"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          />
          <motion.span 
            className="text-xl md:text-2xl font-bold text-foreground hidden sm:inline"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Grupo Carbo
          </motion.span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 md:px-6 pb-8 relative z-10 max-w-7xl mx-auto w-full">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6 md:mb-8"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
            className="inline-flex items-center gap-3 md:gap-4 mb-4 md:mb-6"
          >
            <span className="inline-flex items-center justify-center h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-gradient-to-br from-carbo-green to-carbo-blue shadow-xl">
              <Zap className="h-6 w-6 md:h-7 md:w-7 text-white" />
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
              CARBO Hub
            </h1>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto"
          >
            Uma plataforma. Três frentes. Um único fluxo.
          </motion.p>
        </motion.div>

        {/* Ecosystem Dashboard (visible to OPS users) */}
        {canAccessOps && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-6 md:mb-8 space-y-6"
          >
            {/* KPIs */}
            <EcosystemOverview 
              canAccessOps={canAccessOps}
              canAccessLicensee={canAccessLicensee}
              canAccessPDV={canAccessPDV}
            />

            {/* Flow Map */}
            <OperationalFlowMap />
          </motion.div>
        )}

        {/* Section Title for Area Cards */}
        {hasAnyAccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-between gap-4 mb-4"
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Acesso Rápido às Áreas
              </h2>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Clique para acessar cada área da plataforma
            </p>
          </motion.div>
        )}

        {/* Area Cards - Only show permitted areas */}
        {hasAnyAccess ? (
          <div className={`grid gap-4 md:gap-6 w-full ${
            visibleAreas.length === 1 
              ? 'max-w-md mx-auto' 
              : visibleAreas.length === 2 
                ? 'md:grid-cols-2 max-w-3xl mx-auto' 
                : 'md:grid-cols-3'
          }`}>
            {visibleAreas.map((area, index) => (
              <AreaCard
                key={area.key}
                title={area.title}
                description={area.description}
                icon={area.icon}
                accentBg={area.accentBg}
                accentBorder={area.accentBorder}
                accentText={area.accentText}
                onClick={() => navigate(area.path)}
                delay={0.5 + index * 0.15}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Package className="h-20 w-20 mx-auto text-muted-foreground/50 mb-6" />
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              Sem acesso disponível
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Entre em contato com um administrador para solicitar acesso ao CARBO Hub.
            </p>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-4 md:p-6 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-xs md:text-sm text-muted-foreground flex items-center justify-center gap-2"
        >
          <TrendingUp className="h-4 w-4" />
          <span>Uma plataforma Grupo Carbo. Juntos pelo crescimento sustentável.</span>
        </motion.p>
      </footer>
    </div>
  );
}
