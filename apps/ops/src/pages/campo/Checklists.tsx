import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { UserCheck, CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/checklist → Checklist "Carbo Check") — dados MOCK.

const DEPARTAMENTOS = [
  { key: "preparacao", label: "Preparação" },
  { key: "operacao", label: "Operação" },
  { key: "expedicao", label: "Expedição" },
  { key: "pos_venda", label: "Pós-Venda" },
];

interface Etapa { nome: string; concluida: boolean; }
interface Checklist { id: string; nome: string; departamento: string; etapas: Etapa[]; }
const MOCK: Checklist[] = [
  { id: "1", nome: "Preparação de lote", departamento: "preparacao", etapas: [{ nome: "Conferir reagente", concluida: true }, { nome: "Higienizar tanque", concluida: true }, { nome: "Registrar lote", concluida: false }] },
  { id: "2", nome: "Envase 1L", departamento: "operacao", etapas: [{ nome: "Calibrar envasadora", concluida: true }, { nome: "Teste de vazão", concluida: false }, { nome: "Amostragem", concluida: false }] },
  { id: "3", nome: "Expedição pedido", departamento: "expedicao", etapas: [{ nome: "Conferir itens", concluida: true }, { nome: "Embalar", concluida: true }, { nome: "Etiquetar", concluida: true }, { nome: "Liberar transporte", concluida: true }] },
  { id: "4", nome: "Acompanhamento cliente", departamento: "pos_venda", etapas: [{ nome: "Ligar pós-entrega", concluida: false }, { nome: "Registrar feedback", concluida: false }] },
];

export default function Checklists() {
  const [dep, setDep] = useState("preparacao");
  const lists = MOCK.filter((c) => c.departamento === dep);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1200px] mx-auto">
        <CarboPageHeader title="Checklists" description="Carbo Check — checklists operacionais por departamento" icon={UserCheck} />

        {/* Seletor de departamento */}
        <div className="flex gap-1.5 flex-wrap">
          {DEPARTAMENTOS.map((d) => (
            <button key={d.key} onClick={() => setDep(d.key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${dep === d.key ? "bg-carbo-green text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}>{d.label}</button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {lists.map((c) => {
            const done = c.etapas.filter((e) => e.concluida).length;
            const pct = Math.round((done / c.etapas.length) * 100);
            const completo = done === c.etapas.length;
            return (
              <CarboCard key={c.id}>
                <CarboCardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{c.nome}</h3>
                    <CarboBadge variant={completo ? "success" : "warning"} size="sm">{done}/{c.etapas.length}</CarboBadge>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                    <div className={cn("h-full rounded-full transition-all", completo ? "bg-success" : "bg-carbo-green")} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-1.5">
                    {c.etapas.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {e.concluida ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                        <span className={cn(e.concluida && "text-muted-foreground line-through")}>{e.nome}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => toast(`Abrir checklist ${c.nome} (em breve)`)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Abrir checklist <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </CarboCardContent>
              </CarboCard>
            );
          })}
          {lists.length === 0 && <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><UserCheck className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Nenhum checklist neste departamento</p></CarboCardContent></CarboCard>}
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Fluxo de execução (Carbo Check) entra na fase de lógica.</p>
      </div>
    </div>
  );
}
