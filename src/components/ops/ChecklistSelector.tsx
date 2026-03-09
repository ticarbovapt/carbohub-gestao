import { checklistTemplates, getTotalItems } from "@/data/checklistData";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface ChecklistSelectorProps {
  onSelect: (checklistId: string) => void;
}

export function ChecklistSelector({ onSelect }: ChecklistSelectorProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-6">
      <h2 className="text-xl font-bold text-ops-text mb-2 text-center">
        Selecione o Checklist
      </h2>
      <p className="text-ops-muted text-center mb-4">
        Escolha qual etapa você irá realizar
      </p>
      
      {checklistTemplates.map((template) => (
        <Button
          key={template.id}
          variant="ops-outline"
          className="flex items-center justify-between h-auto py-4 px-5 text-left"
          onClick={() => onSelect(template.id)}
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">{template.icon}</span>
            <div className="flex flex-col">
              <span className="font-bold text-ops-text text-lg">
                {template.name}
              </span>
              <span className="text-sm text-ops-muted">
                {getTotalItems(template)} itens
              </span>
            </div>
          </div>
          <ChevronRight className="h-6 w-6 text-ops-muted" />
        </Button>
      ))}
    </div>
  );
}
