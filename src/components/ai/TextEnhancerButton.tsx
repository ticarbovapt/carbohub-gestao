import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TextEnhancerButtonProps {
  text: string;
  contextType: "op_description" | "purchase_justification" | "purchase_order" | "closing_report";
  onEnhanced: (newText: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TextEnhancerButton({ text, contextType, onEnhanced, disabled, className }: TextEnhancerButtonProps) {
  const [loading, setLoading] = useState(false);

  const enhance = async () => {
    if (!text.trim()) {
      toast.warning("Digite algo antes de melhorar o texto.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("text-enhancer", {
        body: { text, context_type: contextType },
      });

      if (error) throw error;

      if (data?.enhanced_text) {
        onEnhanced(data.enhanced_text);
        toast.success("Texto aprimorado com IA!");
      }
    } catch (err: any) {
      console.error("Text enhancer error:", err);
      if (err?.message?.includes("429") || err?.status === 429) {
        toast.error("Limite de requisições excedido. Tente novamente em breve.");
      } else if (err?.message?.includes("402") || err?.status === 402) {
        toast.error("Créditos de IA insuficientes.");
      } else {
        toast.error("Erro ao melhorar texto.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={enhance}
      disabled={loading || disabled || !text.trim()}
      className={className}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      Melhorar texto
    </Button>
  );
}
