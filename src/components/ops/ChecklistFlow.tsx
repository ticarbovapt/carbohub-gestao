import { useState, useMemo } from "react";
import { ChecklistItemCard } from "./ChecklistItemCard";
import { ChecklistComplete } from "./ChecklistComplete";
import { SectionSignature, SignatureData } from "./SectionSignature";
import { checklistTemplates, getAllItems, getTotalItems } from "@/data/checklistData";

interface ChecklistResult {
  itemId: string;
  passed: boolean;
  nsa?: boolean;
  quantity?: string;
  observation?: string;
  timestamp: Date;
}

interface ChecklistFlowProps {
  checklistId: string;
  locationName: string;
  onComplete: (results: ChecklistResult[], flaggedCount: number, signature: SignatureData) => void;
  onRestart: () => void;
}

export function ChecklistFlow({ 
  checklistId, 
  locationName, 
  onComplete, 
  onRestart 
}: ChecklistFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ChecklistResult[]>([]);
  const [showSignature, setShowSignature] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);

  const template = useMemo(() => 
    checklistTemplates.find(t => t.id === checklistId),
    [checklistId]
  );

  const allItems = useMemo(() => 
    template ? getAllItems(template) : [],
    [template]
  );

  const totalItems = template ? getTotalItems(template) : 0;

  // Get current section title for the current item
  const getCurrentSectionTitle = (): string => {
    if (!template) return "";
    let itemCount = 0;
    for (const section of template.sections) {
      if (currentIndex < itemCount + section.items.length) {
        return section.title;
      }
      itemCount += section.items.length;
    }
    return "";
  };

  const handleItemComplete = (result: { 
    passed: boolean; 
    nsa?: boolean; 
    quantity?: string; 
    observation?: string;
  }) => {
    const currentItem = allItems[currentIndex];
    
    const newResult: ChecklistResult = {
      itemId: currentItem.id,
      passed: result.passed,
      nsa: result.nsa,
      quantity: result.quantity,
      observation: result.observation,
      timestamp: new Date(),
    };

    const updatedResults = [...results, newResult];
    setResults(updatedResults);

    if (currentIndex < allItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Show signature screen
      setShowSignature(true);
    }
  };

  const handleSignatureComplete = (signature: SignatureData) => {
    setSignatureData(signature);
    // Calculate flagged items (non-passed and non-NSA)
    const flaggedCount = results.filter(r => !r.passed && !r.nsa).length;
    setIsComplete(true);
    onComplete(results, flaggedCount, signature);
  };

  if (!template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-ops-muted">Checklist não encontrado</p>
      </div>
    );
  }

  if (isComplete) {
    const flaggedCount = results.filter(r => !r.passed && !r.nsa).length;
    const nsaCount = results.filter(r => r.nsa).length;
    
    return (
      <ChecklistComplete
        checklistName={`${locationName} - ${template.name}`}
        completionTime={signatureData?.hora || new Date().toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit" 
        })}
        stepsCompleted={totalItems}
        flaggedSteps={flaggedCount}
        nsaSteps={nsaCount}
        onRestart={onRestart}
      />
    );
  }

  if (showSignature) {
    return (
      <SectionSignature
        sectionName={template.name}
        responsavelLabel={template.responsavelLabel}
        onComplete={handleSignatureComplete}
      />
    );
  }

  const currentItem = allItems[currentIndex];

  return (
    <ChecklistItemCard
      key={currentItem.id}
      item={currentItem}
      stepNumber={currentIndex + 1}
      totalSteps={totalItems}
      sectionTitle={getCurrentSectionTitle()}
      onComplete={handleItemComplete}
    />
  );
}
