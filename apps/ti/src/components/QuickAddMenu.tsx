import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão "+" do topo (speed-dial). Ação universal "Nova Venda" → tela /vender
// (idêntica ao Carbo Sales; grava em crm_vendas com o usuário logado como vendedor).
export function QuickAddMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const actions = [
    { key: "venda", icon: ShoppingCart, label: "+ Nova Venda", primary: true, onClick: () => navigate("/vender") },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          className="h-9 w-9 rounded-full bg-carbo-green text-white hover:bg-carbo-green/90 shadow-sm"
          title="Adicionar"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-56 p-1.5 rounded-xl">
        <div className="space-y-0.5">
          {actions.map(({ key, icon: Icon, label, primary, onClick }) => (
            <button
              key={key}
              onClick={() => { onClick(); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all",
                primary
                  ? "font-semibold text-foreground border border-border hover:border-carbo-green/40 hover:bg-carbo-green/5"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", primary && "text-carbo-green")} />
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
