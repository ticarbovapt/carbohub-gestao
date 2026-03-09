import { useState, useMemo } from "react";
import { OpsLayout } from "@/components/layouts/OpsLayout";
import { SalesPipeline, PipelineStage } from "@/components/ops/SalesPipeline";
import { StageOverview } from "@/components/ops/StageOverview";
import { StageDetailsPanel } from "@/components/ops/StageDetailsPanel";
import { ChecklistHeader, HeaderData } from "@/components/ops/ChecklistHeader";
import { ChecklistFlow } from "@/components/ops/ChecklistFlow";
import { Button } from "@/components/ui/button";
import { QrCode, ClipboardList } from "lucide-react";
import { QRScanner } from "@/components/ops/QRScanner";
import { checklistTemplates } from "@/data/checklistData";
import { useDepartment } from "@/contexts/DepartmentContext";
import { DepartmentSelector } from "@/components/DepartmentSelector";
import { QRScanResult } from "@/types/station";

type ViewState = "menu" | "scanning" | "header" | "pipeline" | "checklist";

interface StageStatus {
  stageId: string;
  completed: boolean;
  itemsCompleted: number;
  totalItems: number;
  flaggedItems: number;
  completedAt?: string;
}

const Checklist = () => {
  const [view, setView] = useState<ViewState>("menu");
  const [headerData, setHeaderData] = useState<HeaderData | null>(null);
  const [selectedChecklistId, setSelectedChecklistId] = useState("");
  const [stageStatuses, setStageStatuses] = useState<Record<string, StageStatus>>({});
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [selectedStageForDetails, setSelectedStageForDetails] = useState<string | null>(null);

  // Calculate pipeline stages
  const pipelineStages: PipelineStage[] = useMemo(() => {
    return checklistTemplates.map((template, index) => {
      const status = stageStatuses[template.id];
      const isCompleted = status?.completed || false;
      const previousCompleted = index === 0 || stageStatuses[checklistTemplates[index - 1].id]?.completed;
      
      let stageStatus: "completed" | "current" | "pending";
      if (isCompleted) {
        stageStatus = "completed";
      } else if (previousCompleted || index === 0) {
        stageStatus = "current";
      } else {
        stageStatus = "pending";
      }

      return {
        id: template.id,
        name: template.name,
        shortName: template.name.replace(/^\d+\.\s*/, "").split(" ")[0],
        icon: template.icon,
        status: stageStatus,
      };
    });
  }, [stageStatuses]);

  // Get current stage
  const currentStage = pipelineStages.find(s => s.status === "current") || pipelineStages[0];

  const handleQRScan = (data: QRScanResult) => {
    // Pre-fill header data with scanned location
    setHeaderData(prev => ({
      ...prev,
      licenciado: data.stationName,
      local: data.location,
    } as HeaderData));
    
    // Go to header form for any additional data
    setTimeout(() => {
      setView("header");
    }, 500);
  };

  const handleHeaderComplete = (data: HeaderData) => {
    setHeaderData(data);
    setView("pipeline");
  };

  const handleStartStage = (stageId: string) => {
    setSelectedChecklistId(stageId);
    setDetailsPanelOpen(false);
    setView("checklist");
  };

  const handleStageClick = (stageId: string) => {
    setSelectedStageForDetails(stageId);
    setDetailsPanelOpen(true);
  };

  const handleMarkCurrentComplete = () => {
    if (currentStage) {
      handleStartStage(currentStage.id);
    }
  };
  const handleStageComplete = (stageId: string, results: any[], flaggedCount: number) => {
    const template = checklistTemplates.find(t => t.id === stageId);
    if (!template) return;

    setStageStatuses(prev => ({
      ...prev,
      [stageId]: {
        stageId,
        completed: true,
        itemsCompleted: results.length,
        totalItems: results.length,
        flaggedItems: flaggedCount,
        completedAt: new Date().toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit" 
        }),
      }
    }));
    setView("pipeline");
  };

  const handleRestart = () => {
    setView("menu");
    setHeaderData(null);
    setSelectedChecklistId("");
    setStageStatuses({});
  };

  const handleBack = () => {
    switch (view) {
      case "scanning":
        setView("menu");
        break;
      case "header":
        setView("menu");
        break;
      case "pipeline":
        setView("header");
        break;
      case "checklist":
        setView("pipeline");
        break;
      default:
        setView("menu");
    }
  };

  // Menu screen
  if (view === "menu") {
    return (
      <OpsLayout title="Carbo Check">
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-8">
          <div className="mb-8 text-center ops-bounce-in">
            <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-ops-yellow shadow-ops text-5xl">
              👋
            </div>
            <h1 className="mb-2 text-3xl font-extrabold text-ops-text">
              Abertura de Licenciado
            </h1>
            <p className="text-lg text-ops-muted">
              Processo completo em 5 etapas
            </p>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-4 ops-slide-up">
            <Button
              variant="ops"
              size="ops-full"
              onClick={() => setView("scanning")}
            >
              <QrCode className="h-6 w-6" />
              Escanear QR Code
            </Button>

            <Button
              variant="ops-outline"
              size="ops-full"
              onClick={() => setView("header")}
            >
              <ClipboardList className="h-6 w-6" />
              Iniciar Manualmente
            </Button>
          </div>

          {/* Pipeline preview */}
          <div className="mt-10 w-full max-w-sm">
            <p className="text-center text-sm text-ops-muted mb-4">
              Etapas do processo:
            </p>
            <div className="flex justify-between text-center">
              {checklistTemplates.map((t, i) => (
                <div key={t.id} className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl mb-1">
                    {t.icon}
                  </div>
                  <span className="text-[10px] text-ops-muted max-w-[50px]">
                    {t.name.replace(/^\d+\.\s*/, "").split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </OpsLayout>
    );
  }

  // Scanning screen
  if (view === "scanning") {
    return (
      <OpsLayout title="Escanear" showBack onBack={handleBack}>
        <QRScanner onScan={handleQRScan} />
      </OpsLayout>
    );
  }

  // Header screen
  if (view === "header") {
    return (
      <OpsLayout title="Dados do Licenciado" showBack onBack={handleBack}>
        <ChecklistHeader onComplete={handleHeaderComplete} />
      </OpsLayout>
    );
  }

  // Pipeline/stages screen
  if (view === "pipeline") {
    const allCompleted = pipelineStages.every(s => s.status === "completed");
    const selectedTemplateForPanel = selectedStageForDetails 
      ? checklistTemplates.find(t => t.id === selectedStageForDetails) || null
      : null;
    const selectedStatusForPanel = selectedStageForDetails 
      ? stageStatuses[selectedStageForDetails] || null
      : null;
    
    return (
      <OpsLayout 
        title={headerData?.licenciado || "Processo"} 
        showBack 
        onBack={handleBack}
      >
        {/* Pipeline header */}
        <SalesPipeline 
          stages={pipelineStages} 
          onStageClick={handleStageClick}
          onMarkComplete={handleMarkCurrentComplete}
          currentStageName={currentStage?.name}
        />
        
        <div className="px-4 py-6 space-y-4">
          {/* Status summary */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ops-muted">Progresso Geral</p>
                <p className="text-2xl font-bold text-ops-text">
                  {pipelineStages.filter(s => s.status === "completed").length} de {pipelineStages.length} etapas
                </p>
              </div>
              <div className="text-4xl">
                {allCompleted ? "🎉" : currentStage?.icon}
              </div>
            </div>
            {!allCompleted && currentStage && (
              <p className="text-sm text-ops-muted mt-2">
                Etapa atual: <span className="font-semibold text-ops-text">{currentStage.name}</span>
              </p>
            )}
          </div>

          {/* All completed message */}
          {allCompleted && (
            <div className="bg-ops-green/10 rounded-2xl p-6 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-ops-green mb-2">
                Processo Concluído!
              </h2>
              <p className="text-ops-muted mb-4">
                Todas as 5 etapas foram finalizadas com sucesso.
              </p>
              <Button variant="ops" onClick={handleRestart}>
                Iniciar Novo Processo
              </Button>
            </div>
          )}

          {/* Stage cards */}
          {checklistTemplates.map((template, index) => {
            const stage = pipelineStages[index];
            const status = stageStatuses[template.id] || {
              stageId: template.id,
              completed: false,
              itemsCompleted: 0,
              totalItems: 0,
              flaggedItems: 0,
            };
            const previousCompleted = index === 0 || stageStatuses[checklistTemplates[index - 1].id]?.completed;
            
            return (
              <StageOverview
                key={template.id}
                template={template}
                status={status}
                isCurrent={stage.status === "current"}
                isLocked={!previousCompleted && index > 0}
                onStart={() => handleStartStage(template.id)}
                onContinue={() => handleStartStage(template.id)}
                onView={() => handleStageClick(template.id)}
              />
            );
          })}
        </div>

        {/* Details Panel */}
        <StageDetailsPanel
          template={selectedTemplateForPanel}
          status={selectedStatusForPanel}
          headerData={headerData}
          isOpen={detailsPanelOpen}
          onClose={() => setDetailsPanelOpen(false)}
          onStartStage={selectedStageForDetails ? () => handleStartStage(selectedStageForDetails) : undefined}
        />
      </OpsLayout>
    );
  }

  // Checklist execution screen
  const selectedTemplate = checklistTemplates.find(t => t.id === selectedChecklistId);
  
  return (
    <OpsLayout 
      title={selectedTemplate?.name || "Checklist"} 
      showBack 
      onBack={handleBack}
    >
      <ChecklistFlow
        checklistId={selectedChecklistId}
        locationName={headerData?.licenciado || ""}
        onComplete={(results, flaggedCount) => {
          handleStageComplete(selectedChecklistId, results, flaggedCount);
        }}
        onRestart={() => setView("pipeline")}
      />
    </OpsLayout>
  );
};

export default Checklist;
