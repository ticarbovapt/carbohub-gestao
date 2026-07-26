import type { StageConfig } from "@/types/crm";
import { isWonStage, isLostStage, isHandoffStage } from "@/types/crm";

type StageGroup = "win" | "loss" | "handoff" | "progress";

// As listas que ficavam aqui viraram fonte única em types/crm.ts.
export function getStageGroup(stageId: string): StageGroup {
  if (isLostStage(stageId)) return "loss";
  if (isWonStage(stageId)) return "win";
  if (isHandoffStage(stageId)) return "handoff";
  return "progress";
}

const GROUP_COLOR: Record<StageGroup, string> = {
  win: "#22C55E",
  loss: "#EF4444",
  // Repasse ao closer é fim de linha no funil do SDR, mas não é venda — por isso
  // não usa o verde de ganho. Roxo é a cor do próprio "Passado ao Closer".
  handoff: "#8B5CF6",
  progress: "#3B82F6",
};

interface StageProgressBarProps {
  stages: StageConfig[];
  currentStage: string;
  onSelect: (stage: StageConfig) => void;
  disabled?: boolean;
}

/**
 * Barra de etapas em "chevrons" encadeados. A etapa atual fica sólida (cor do grupo);
 * as demais em cinza. Clicar move o lead — o tratamento (avançar vs abrir "Perdido")
 * é responsabilidade do onSelect no componente pai.
 */
export function StageProgressBar({ stages, currentStage, onSelect, disabled }: StageProgressBarProps) {
  const currentIdx = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-stretch min-w-max py-1">
        {stages.map((stage, i) => {
          const isCurrent = stage.id === currentStage;
          const isFirst = i === 0;
          const isLast = i === stages.length - 1;
          const group = getStageGroup(stage.id);
          const color = GROUP_COLOR[group];

          // clip-path: seta à direita (menos no último) + entalhe à esquerda (menos no primeiro)
          const rightArrow = isLast ? "100% 0, 100% 100%" : "calc(100% - 11px) 0, 100% 50%, calc(100% - 11px) 100%";
          const leftNotch = isFirst ? "0 100%, 0 0" : "0 100%, 11px 50%, 0 0";
          const clip = `polygon(0 0, ${rightArrow}, ${leftNotch})`;

          return (
            <button
              key={stage.id}
              type="button"
              disabled={disabled}
              onClick={() => { if (!isCurrent && !disabled) onSelect(stage); }}
              title={stage.label}
              className={[
                "relative flex items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors",
                "pl-5 pr-4 py-2 -ml-2 first:ml-0",
                isCurrent ? "text-white" : "text-muted-foreground hover:text-foreground",
                disabled ? "cursor-default" : isCurrent ? "cursor-default" : "cursor-pointer",
              ].join(" ")}
              style={{
                clipPath: clip,
                backgroundColor: isCurrent ? color : "hsl(var(--muted))",
                zIndex: stages.length - i,
              }}
            >
              <span>{stage.icon}</span>
              <span>{stage.label}</span>
            </button>
          );
        })}
      </div>
      {currentIdx === -1 && (
        <p className="text-[11px] text-muted-foreground mt-1">Etapa "{currentStage}" fora do funil atual.</p>
      )}
    </div>
  );
}
