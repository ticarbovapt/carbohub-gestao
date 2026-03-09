import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface StageCompletionSuggestionProps {
  onCompleteStage: () => void;
  stageName?: string;
}

export function StageCompletionSuggestion({ 
  onCompleteStage,
  stageName = "esta etapa"
}: StageCompletionSuggestionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-4 mb-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-medium">Todas as ações concluídas!</span>
          </div>
          
          <p className="text-xs text-muted-foreground mb-3">
            Tudo pronto para fechar {stageName}? Você pode avançar para a próxima etapa da OP.
          </p>
          
          <Button
            size="sm"
            className="gap-2"
            onClick={onCompleteStage}
          >
            Concluir etapa
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
