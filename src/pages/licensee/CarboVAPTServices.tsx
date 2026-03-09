import { useNavigate } from "react-router-dom";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Car, Truck, Cog, Zap } from "lucide-react";
import { motion } from "framer-motion";

// ─── Modality definitions ──────────────────────────────────────────────────

const MODALITIES = [
  {
    key: "P",
    title: "Linha Leve",
    subtitle: "Leves + SUVs compactos",
    fuel: "Gasolina / Etanol / Flex",
    Icon: Car,
  },
  {
    key: "M",
    title: "Linha Intermediária",
    subtitle: "Pickups + SUVs tradicionais",
    fuel: "Todos os combustíveis",
    Icon: Truck,
  },
  {
    key: "G",
    title: "Linha Pesada",
    subtitle: "Caminhões, carretas, máquinas, geradores",
    fuel: "Diesel / Biodiesel",
    Icon: Truck,
  },
  {
    key: "G+",
    title: "Linha Pesada Superior",
    subtitle: "Barcos, colheitadeiras, mineração, guindastes, gruas",
    fuel: "Diesel / Fluidos especiais",
    Icon: Cog,
  },
];

// ─── Card component ────────────────────────────────────────────────────────

function VaptCard({
  modality,
  index,
  onSelect,
}: {
  modality: typeof MODALITIES[0];
  index: number;
  onSelect: () => void;
}) {
  const { Icon } = modality;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07, ease: "easeOut" }}
      whileHover={{ scale: 1.02, y: -3, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <CarboCard
        variant="interactive"
        padding="none"
        className="h-full flex flex-col overflow-hidden"
      >
        {/* Accent strip — azul petróleo → verde institucional */}
        <div className="h-1.5 bg-gradient-to-r from-carbo-blue via-carbo-blue to-carbo-green shrink-0" />

        <CarboCardContent className="p-6 flex flex-col gap-4 flex-1">
          {/* Icon + badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-carbo-blue/10 to-carbo-green/10 flex items-center justify-center shrink-0">
              <Icon className="h-7 w-7 text-carbo-blue" />
            </div>
            <CarboBadge variant="info" size="lg" className="shrink-0 font-bold tracking-wide">
              {modality.key}
            </CarboBadge>
          </div>

          {/* Title + description */}
          <div className="flex-1 space-y-1">
            <h3 className="text-base font-bold text-foreground leading-tight">
              {modality.title}
            </h3>
            <p className="text-sm text-muted-foreground">{modality.subtitle}</p>
          </div>

          {/* Fuel info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
            <Zap className="h-3.5 w-3.5 shrink-0 text-carbo-green" />
            <span>{modality.fuel}</span>
          </div>

          {/* CTA */}
          <CarboButton
            variant="default"
            size="default"
            className="w-full mt-1"
            onClick={onSelect}
          >
            Selecionar
          </CarboButton>
        </CarboCardContent>
      </CarboCard>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CarboVAPTServices() {
  const navigate = useNavigate();

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-carbo-blue to-carbo-green flex items-center justify-center shadow-carbo">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">CarboVAPT</h1>
              <p className="text-xs text-muted-foreground">Serviço de descarbonização veicular</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            Selecione a modalidade adequada para sua operação.
          </p>
        </motion.div>

        {/* Cards grid — mobile-first */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {MODALITIES.map((m, i) => (
            <VaptCard
              key={m.key}
              modality={m}
              index={i}
              onSelect={() =>
                navigate("/licenciado/carboVAPT/checkout", {
                  state: { modality: m.key, modalityTitle: `${m.key} — ${m.title}` },
                })
              }
            />
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xs text-muted-foreground text-center"
        >
          Dúvidas? Entre em contato com seu gerente de conta Carbo.
        </motion.p>
      </div>
    </LicenseeLayout>
  );
}
