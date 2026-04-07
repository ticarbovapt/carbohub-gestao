import { useState } from "react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { NovoAtendimentoModal } from "@/components/licensee/NovoAtendimentoModal";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { MODALITY_INFO, type Modality } from "@/hooks/useDescarbSales";
import { cn } from "@/lib/utils";
import { Zap, ArrowRight } from "lucide-react";

interface ModalityCard {
  modality: Modality;
  image: string;
  gradient: string;
  color: string;
}

const CARDS: ModalityCard[] = [
  {
    modality: "P",
    image: "/images/modalities/vapt-p.jpg",
    gradient: "from-green-950 via-green-900 to-green-800",
    color: "#22c55e",
  },
  {
    modality: "M",
    image: "/images/modalities/vapt-m.jpg",
    gradient: "from-blue-950 via-blue-900 to-blue-800",
    color: "#3b82f6",
  },
  {
    modality: "G",
    image: "/images/modalities/vapt-g.jpg",
    gradient: "from-amber-950 via-amber-900 to-amber-800",
    color: "#f59e0b",
  },
  {
    modality: "G+",
    image: "/images/modalities/vapt-gplus.jpg",
    gradient: "from-red-950 via-red-900 to-red-800",
    color: "#ef4444",
  },
];

export default function LicenseeVapt() {
  const { data: licenseeStatus } = useLicenseeStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModality, setSelectedModality] = useState<Modality>("P");
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  function openModal(modality: Modality) {
    setSelectedModality(modality);
    setModalOpen(true);
  }

  return (
    <LicenseeLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Zap className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">CarboVAPT</h1>
            <p className="text-sm text-muted-foreground">Selecione a modalidade e registre o atendimento</p>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {CARDS.map((card) => {
            const info = MODALITY_INFO[card.modality];
            const hasImageError = imgErrors[card.modality];

            return (
              <button
                key={card.modality}
                onClick={() => openModal(card.modality)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-white/10",
                  "min-h-[220px] sm:min-h-[260px]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "transition-transform duration-200 active:scale-[0.98] hover:scale-[1.01]",
                  "cursor-pointer text-left"
                )}
                style={{ focusRingColor: card.color } as React.CSSProperties}
              >
                {/* Background: real image or gradient fallback */}
                {!hasImageError ? (
                  <img
                    src={card.image}
                    alt={info.label}
                    onError={() => setImgErrors(e => ({ ...e, [card.modality]: true }))}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className={cn("absolute inset-0 bg-gradient-to-br", card.gradient)} />
                )}

                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 group-hover:from-black/70 transition-all duration-300" />

                {/* Content */}
                <div className="relative flex h-full min-h-[220px] sm:min-h-[260px] flex-col justify-between p-5">
                  {/* Modality letter badge */}
                  <div
                    className="self-start rounded-xl px-3 py-1 text-3xl font-black tracking-tight text-white shadow-lg backdrop-blur-sm"
                    style={{ backgroundColor: `${card.color}CC`, border: `2px solid ${card.color}` }}
                  >
                    {card.modality}
                  </div>

                  {/* Bottom info + CTA */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                        Descarbonização para
                      </p>
                      <p className="text-xl font-bold text-white leading-tight">
                        {info.label.toUpperCase()}
                      </p>
                      <p className="text-xs text-white/70 mt-0.5">{info.desc}</p>
                    </div>

                    <div
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-4 py-3",
                        "text-sm font-semibold text-white",
                        "transition-all duration-200",
                        "group-hover:brightness-110"
                      )}
                      style={{ backgroundColor: card.color }}
                    >
                      <span>Registrar Atendimento</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Atendimento Modal */}
      {licenseeStatus?.licensee_id && (
        <NovoAtendimentoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          licenseeId={licenseeStatus.licensee_id}
          defaultModality={selectedModality}
        />
      )}
    </LicenseeLayout>
  );
}
