import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cog, Plus, Wrench, Power, PowerOff, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/machines → Machines "Gestão de Máquinas") — dados MOCK.

type MachineStatus = "operational" | "maintenance" | "offline" | "retired";
const STATUS_LABELS: Record<MachineStatus, string> = { operational: "Operacional", maintenance: "Manutenção", offline: "Offline", retired: "Aposentada" };
const STATUS_VARIANT: Record<MachineStatus, "success" | "warning" | "secondary" | "destructive"> = { operational: "success", maintenance: "warning", offline: "secondary", retired: "destructive" };

interface Machine { id: string; codigo: string; modelo: string; licenciado: string; status: MachineStatus; ultimaManut: string | null; proximaManut: string | null; creditos: number; }
const MOCK: Machine[] = [
  { id: "1", codigo: "MAQ-014", modelo: "CarboVAPT Pro", licenciado: "Licenciado Natal", status: "operational", ultimaManut: "2026-05-10", proximaManut: "2026-08-10", creditos: 1200 },
  { id: "2", codigo: "MAQ-013", modelo: "CarboVAPT Pro", licenciado: "Licenciado Recife", status: "maintenance", ultimaManut: "2026-06-01", proximaManut: "2026-06-15", creditos: 80 },
  { id: "3", codigo: "MAQ-012", modelo: "CarboVAPT Lite", licenciado: "Licenciado Fortaleza", status: "operational", ultimaManut: "2026-04-20", proximaManut: "2026-07-20", creditos: 640 },
  { id: "4", codigo: "MAQ-011", modelo: "CarboVAPT Lite", licenciado: "Licenciado SP", status: "offline", ultimaManut: "2026-03-15", proximaManut: null, creditos: 0 },
];

const dt = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function Maquinas() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MachineStatus | "all">("all");

  const stats = useMemo(() => ({
    total: MOCK.length,
    operational: MOCK.filter((m) => m.status === "operational").length,
    maintenance: MOCK.filter((m) => m.status === "maintenance").length,
    lowStock: MOCK.filter((m) => m.creditos < 100).length,
    creditos: MOCK.reduce((s, m) => s + m.creditos, 0),
  }), []);
  const filtered = MOCK.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return m.codigo.toLowerCase().includes(q) || m.modelo.toLowerCase().includes(q) || m.licenciado.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Gestão de Máquinas"
          description="Equipamentos, consumo, alertas e manutenção"
          icon={Cog}
          actions={<CarboButton onClick={() => toast("Nova Máquina (em breve)")}><Plus className="h-4 w-4 mr-1" /> Nova Máquina</CarboButton>}
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <CarboKPI title="Total" value={stats.total} icon={Cog} iconColor="blue" />
          <CarboKPI title="Operacionais" value={stats.operational} icon={Power} iconColor="success" />
          <CarboKPI title="Manutenção" value={stats.maintenance} icon={Wrench} iconColor="warning" />
          <CarboKPI title="Estoque Baixo" value={stats.lowStock} icon={AlertTriangle} iconColor="destructive" />
          <CarboKPI title="Créditos Total" value={stats.creditos.toLocaleString("pt-BR")} icon={PowerOff} iconColor="muted" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 max-w-sm"><CarboSearchInput placeholder="Buscar por código, modelo ou licenciado..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MachineStatus | "all")}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <CarboTable>
            <CarboTableHeader><CarboTableRow>
              <CarboTableHead>Código</CarboTableHead><CarboTableHead>Modelo</CarboTableHead><CarboTableHead>Licenciado</CarboTableHead>
              <CarboTableHead>Status</CarboTableHead><CarboTableHead>Última Manut.</CarboTableHead><CarboTableHead>Próxima Manut.</CarboTableHead>
              <CarboTableHead className="text-right">Créditos</CarboTableHead><CarboTableHead className="w-10" />
            </CarboTableRow></CarboTableHeader>
            <CarboTableBody>
              {filtered.map((m) => (
                <CarboTableRow key={m.id}>
                  <CarboTableCell><span className="font-mono text-sm font-medium text-carbo-green">{m.codigo}</span></CarboTableCell>
                  <CarboTableCell className="font-medium">{m.modelo}</CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">{m.licenciado}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={STATUS_VARIANT[m.status]} dot>{STATUS_LABELS[m.status]}</CarboBadge></CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">{dt(m.ultimaManut)}</CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">{dt(m.proximaManut)}</CarboTableCell>
                  <CarboTableCell className={`text-right font-semibold tabular-nums ${m.creditos < 100 ? "text-destructive" : ""}`}>{m.creditos.toLocaleString("pt-BR")}</CarboTableCell>
                  <CarboTableCell><button onClick={() => toast("Editar máquina (em breve)")} className="p-1.5 hover:bg-muted rounded-md"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button></CarboTableCell>
                </CarboTableRow>
              ))}
            </CarboTableBody>
          </CarboTable>
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Consumo, alertas e manutenção entram na fase de lógica.</p>
      </div>
    </div>
  );
}
