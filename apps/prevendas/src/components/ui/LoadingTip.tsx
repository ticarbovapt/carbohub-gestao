import { Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

const TIPS = [
  "Encontrou algo estranho? Clique no ícone de bug no cabeçalho para reportar sem sair da tela atual.",
  "O sino de notificações avisa quando uma ação é atribuída a você ou quando um novo bug é cadastrado.",
  "Mantenha o estoque de segurança atualizado nos produtos MRP para evitar alertas de baixo estoque.",
  "O assistente de IA (ícone ✨) responde dúvidas sobre pedidos, produtos e processos do sistema.",
  "Use os filtros e a busca em qualquer listagem para encontrar pedidos, produtos e fornecedores rapidamente.",
];

export function LoadingTip() {
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-xs text-center mx-auto mt-5 px-2"
    >
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide">Dica</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
    </motion.div>
  );
}
