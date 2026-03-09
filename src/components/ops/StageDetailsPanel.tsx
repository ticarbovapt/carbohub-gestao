import { X, Clock, CheckCircle2, AlertTriangle, FileText, User, ChevronDown, ChevronUp, MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChecklistTemplate, getTotalItems } from "@/data/checklistData";
import { HeaderData } from "@/components/ops/ChecklistHeader";
import { useState } from "react";

interface StageStatus {
  stageId: string;
  completed: boolean;
  itemsCompleted: number;
  totalItems: number;
  flaggedItems: number;
  completedAt?: string;
}

interface StageDetailsPanelProps {
  template: ChecklistTemplate | null;
  status: StageStatus | null;
  headerData: HeaderData | null;
  isOpen: boolean;
  onClose: () => void;
  onStartStage?: () => void;
}

export function StageDetailsPanel({ 
  template, 
  status, 
  headerData, 
  isOpen, 
  onClose,
  onStartStage 
}: StageDetailsPanelProps) {
  const [sectionsExpanded, setSectionsExpanded] = useState(false);

  if (!isOpen || !template) return null;

  const totalItems = getTotalItems(template);
  const completionPercent = status?.completed 
    ? 100 
    : status 
    ? Math.round((status.itemsCompleted / status.totalItems) * 100) 
    : 0;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900 text-sm">Detalhes da Etapa</h3>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Stage Info */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-xl">
              {template.icon}
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{template.name}</h4>
              <p className="text-xs text-gray-500">{template.description}</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            status?.completed 
              ? "bg-green-100 text-green-700" 
              : "bg-amber-100 text-amber-700"
          )}>
            {status?.completed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluída
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                {status?.itemsCompleted ? "Em Progresso" : "Pendente"}
              </>
            )}
          </div>
        </div>

        {/* Account Details Section */}
        {headerData && (
          <div className="p-4 border-b border-gray-100">
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Dados do Licenciado
            </h5>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Licenciado</p>
                  <p className="text-sm font-medium text-gray-900">{headerData.licenciado}</p>
                </div>
              </div>
              {headerData.local && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Local</p>
                    <p className="text-sm font-medium text-gray-900">
                      {headerData.local}{headerData.cidadeUF ? ` - ${headerData.cidadeUF}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {headerData.tecnicoCarboVapt && (
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Técnico CarboVapt</p>
                    <p className="text-sm font-medium text-gray-900">{headerData.tecnicoCarboVapt}</p>
                  </div>
                </div>
              )}
              {headerData.dataPrevistaAbertura && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Data Prevista</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(headerData.dataPrevistaAbertura).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Section */}
        <div className="p-4 border-b border-gray-100">
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Progresso
          </h5>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Itens concluídos</span>
              <span className="font-semibold text-gray-900">
                {status?.itemsCompleted || 0} / {totalItems}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  status?.completed ? "bg-green-500" : "bg-blue-500"
                )}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            {status?.flaggedItems && status.flaggedItems > 0 && (
              <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                {status.flaggedItems} item(s) com observação
              </div>
            )}
            {status?.completedAt && (
              <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluída às {status.completedAt}
              </div>
            )}
          </div>
        </div>

        {/* Sections List */}
        <div className="p-4">
          <button 
            onClick={() => setSectionsExpanded(!sectionsExpanded)}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
          >
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Seções ({template.sections.length})
            </span>
            {sectionsExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          
          {sectionsExpanded && (
            <div className="space-y-2">
              {template.sections.map((section, index) => (
                <div 
                  key={section.id}
                  className="p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {section.title}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {section.items.length} itens
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Action */}
      {onStartStage && !status?.completed && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onStartStage}
            className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {status?.itemsCompleted ? "Continuar Etapa" : "Iniciar Etapa"}
          </button>
        </div>
      )}
    </div>
  );
}
