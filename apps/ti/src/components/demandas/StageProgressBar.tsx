import { STAGES, type StageConfig } from "@/lib/demandas";

/**
 * Barra de etapas em "chevrons" encadeados — mesmo componente visual dos
 * pipelines do Sales. A etapa atual fica sólida (cor da etapa); as demais em
 * cinza. Clicar move a demanda (o pai decide o que fazer).
 */
export function StageProgressBar({
  currentStage, onSelect, disabled,
}: {
  currentStage: string;
  onSelect: (stage: StageConfig) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-stretch min-w-max py-1">
        {STAGES.map((stage, i) => {
          const isCurrent = stage.id === currentStage;
          const isFirst = i === 0;
          const isLast = i === STAGES.length - 1;

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
              title={stage.hint}
              className={[
                "relative flex items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors",
                "pl-5 pr-4 py-2 -ml-2 first:ml-0",
                isCurrent ? "text-white" : "text-muted-foreground hover:text-foreground",
                disabled || isCurrent ? "cursor-default" : "cursor-pointer",
              ].join(" ")}
              style={{
                clipPath: clip,
                backgroundColor: isCurrent ? stage.color : "hsl(var(--muted))",
                zIndex: STAGES.length - i,
              }}
            >
              {stage.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
