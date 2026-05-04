import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings2,
  Users,
  Store,
  ArrowRight,
  Globe,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { FloatingParticles } from "@/components/animations/FloatingParticles";
import logoAvatar from "@/assets/logo-avatar.png";

type AreaType = "ops" | "licensee" | "pdv";

interface AreaConfig {
  id: AreaType;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  shadowColor: string;
  accentClass: string;
  route: string;
}

const areas: AreaConfig[] = [
  {
    id: "ops",
    title: "Carbo Controle",
    subtitle: "Gestão Interna",
    description: "Gestão estratégica, operação e inteligência do ecossistema.",
    icon: <Settings2 className="h-8 w-8" />,
    gradient: "from-blue-500 to-blue-700",
    shadowColor: "shadow-blue-500/30",
    accentClass: "group-hover:shadow-blue-500/40",
    route: "https://controle.carbohub.com.br",
  },
  {
    id: "licensee",
    title: "Área Licenciados",
    subtitle: "Portal do Licenciado",
    description: "Pedidos, consumo, performance e crescimento.",
    icon: <Users className="h-8 w-8" />,
    gradient: "from-carbo-green to-emerald-600",
    shadowColor: "shadow-carbo-green/30",
    accentClass: "group-hover:shadow-carbo-green/40",
    route: "https://licenciados.carbohub.com.br",
  },
  {
    id: "pdv",
    title: "Lojas",
    subtitle: "Portal das Lojas",
    description: "Gestão de estoque, reposição e logística integrada para lojas.",
    icon: <Store className="h-8 w-8" />,
    gradient: "from-amber-500 to-orange-600",
    shadowColor: "shadow-amber-500/30",
    accentClass: "group-hover:shadow-amber-500/40",
    route: "https://produtos.carbohub.com.br",
  },
];

// ── Count-up hook ──────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, delay = 0) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let rafId: number;
    let delayId: ReturnType<typeof setTimeout>;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };

    delayId = setTimeout(() => {
      rafId = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(rafId);
    };
  }, [target, duration, delay]);

  return value;
}

// ── Ripple hook ────────────────────────────────────────────────────────────────
interface RippleItem {
  id: number;
  x: number;
  y: number;
}

function useRipple() {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const nextId = useRef(0);

  const trigger = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      let x: number, y: number;

      if ("touches" in e) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
      } else {
        x = (e as React.MouseEvent<HTMLElement>).clientX - rect.left;
        y = (e as React.MouseEvent<HTMLElement>).clientY - rect.top;
      }

      const id = nextId.current++;
      setRipples((prev) => [...prev, { id, x, y }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    },
    []
  );

  return { ripples, trigger };
}

// ── Animated gradient CTA button ──────────────────────────────────────────────
function CTAButton({ gradient }: { gradient: string }) {
  return (
    <div className="mt-4 relative overflow-hidden rounded-full">
      <motion.div
        className={`
          absolute inset-0 bg-gradient-to-r ${gradient}
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
        `}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        style={{ backgroundSize: "200% 200%" }}
      />
      <div className="relative flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-primary opacity-0 group-hover:opacity-100 transition-all duration-180 group-hover:text-white">
        Acessar
        <motion.span
          animate={{ x: [0, 3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowRight className="h-4 w-4" />
        </motion.span>
      </div>
    </div>
  );
}

// ── Area Card ─────────────────────────────────────────────────────────────────
function AreaCard({
  area,
  index,
  onClick,
}: {
  area: AreaConfig;
  index: number;
  onClick: () => void;
}) {
  const { ripples, trigger } = useRipple();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    trigger(e);
    // slight delay so ripple is visible before navigation
    setTimeout(onClick, 160);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.55 + index * 0.1,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <motion.div
        whileHover={{ scale: 1.02, y: -3 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
        className="h-full"
      >
        <Card
          onClick={handleClick}
          className={`
            group cursor-pointer h-full relative overflow-hidden
            border-2 border-border/50 hover:border-transparent
            bg-card/80 backdrop-blur-sm
            transition-shadow duration-200 ease-in-out
            hover:shadow-2xl ${area.shadowColor} ${area.accentClass}
            rounded-2xl select-none
          `}
        >
          {/* Ripple layer */}
          {ripples.map((r) => (
            <span
              key={r.id}
              className="pointer-events-none absolute rounded-full bg-white/20 animate-ping"
              style={{
                left: r.x - 40,
                top: r.y - 40,
                width: 80,
                height: 80,
              }}
            />
          ))}

          <CardContent className="p-6 md:p-8 flex flex-col items-center text-center h-full">
            {/* Icon with micro fade + slide-in */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + index * 0.1, duration: 0.35 }}
              className={`
                w-16 h-16 rounded-2xl flex items-center justify-center mb-5
                bg-gradient-to-br ${area.gradient} text-white
                shadow-lg ${area.shadowColor}
                group-hover:scale-110 group-hover:rotate-3
                transition-transform duration-200 ease-in-out
              `}
            >
              {area.icon}
            </motion.div>

            {/* Text */}
            <h2 className="text-xl font-extrabold text-foreground mb-1 group-hover:text-primary transition-colors duration-180 tracking-tight">
              {area.title}
            </h2>
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">
              {area.subtitle}
            </p>
            <p className="text-sm text-foreground/60 flex-1 leading-relaxed">
              {area.description}
            </p>

            {/* Animated CTA */}
            <CTAButton gradient={area.gradient} />
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ── Stats ticker (count-up) ───────────────────────────────────────────────────
function StatTicker({
  value,
  label,
  delay,
}: {
  value: number;
  label: string;
  delay: number;
}) {
  const count = useCountUp(value, 1000, delay);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000 + 0.8, duration: 0.35 }}
      className="text-center"
    >
      <span className="text-lg font-black text-foreground tabular-nums">
        {count}+
      </span>
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mt-0.5">
        {label}
      </p>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const AreaSelector = () => {
  const handleAreaSelect = (area: AreaConfig) => {
    window.location.href = area.route;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20 dark:from-background dark:via-muted/5 dark:to-background overflow-hidden">
      {/* Particles */}
      <FloatingParticles />

      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">

        {/* Header / Branding */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-10"
        >
          {/* Logo */}
          <motion.img
            src={logoAvatar}
            alt="Grupo Carbo"
            className="h-28 md:h-36 w-auto mx-auto mb-6 drop-shadow-2xl"
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.55, type: "spring", stiffness: 160, damping: 14 }}
          />

          {/* Title */}
          <motion.h1
            className="text-3xl md:text-4xl font-bold text-foreground font-plex tracking-tight flex items-center justify-center gap-3 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            CARBO Hub
            <motion.span
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-carbo-green to-carbo-blue shadow-lg shadow-carbo-green/30"
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 220, damping: 12 }}
            >
              <Zap className="h-5 w-5 text-white" />
            </motion.span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-sm font-medium text-muted-foreground/80 tracking-widest uppercase mb-4"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 }}
          >
            Um hub único para operar, vender e escalar.
          </motion.p>

          <motion.p
            className="text-base text-muted-foreground max-w-md mx-auto mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.44 }}
          >
            Escolha o ambiente que deseja acessar
          </motion.p>

          {/* Count-up stats strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="inline-flex items-center gap-6 px-6 py-3 rounded-full border border-border/40 bg-card/40 backdrop-blur"
          >
            <StatTicker value={3} label="Áreas" delay={600} />
            <span className="h-5 w-px bg-border/50" />
            <StatTicker value={12} label="Módulos" delay={700} />
            <span className="h-5 w-px bg-border/50" />
            <StatTicker value={99} label="Uptime %" delay={800} />
          </motion.div>
        </motion.div>

        {/* Area Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          {areas.map((area, index) => (
            <AreaCard
              key={area.id}
              area={area}
              index={index}
              onClick={() => handleAreaSelect(area)}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.5 }}
        className="py-6 text-center relative z-10"
      >
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Globe className="h-4 w-4 text-carbo-green/70" />
          Ecossistema Grupo Carbo. Gestão integrada. Crescimento sustentável.
        </p>
      </motion.footer>
    </div>
  );
};

export default AreaSelector;
