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
import { MachineDialog, type MachineDialogValues } from "@/components/campo/MachineDialog";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";

// TODO: ligar em <tabela de máquinas> (Supabase) na fase de lógica.

type MachineStatus = "operational" | "maintenance" | "offline" | "retired";
const STATUS_LABELS: Record<MachineStatus, string> = { operational: "Operacional", maintenance: "Manutenção", offline: "Offline", retired: "Aposentada" };
const STATUS_VARIANT: Record<MachineStatus, "success" | "warning" | "secondary" | "destructive"> = { operational: "success", maintenance: "warning", offline: "secondary", retired: "destructive" };

interface Machine { id: string; codigo: string; modelo: string; licenciado: string; status: MachineStatus; ultimaManut: string | null; proximaManut: string | null; creditos: number; }
const MACHINES: Machine[] = [];

const dt = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function Maquinas() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MachineStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editValues, setEditValues] = useState<MachineDialogValues | null>(null);

  const stats = useMemo(() => ({
    total: MACHINES.length,
    operational: MACHINES.filter((m) => m.status === "operational").length,
    maintenance: MACHINES.filter((m) => m.status === "maintenance").length,
    lowStock: MACHINES.filter((m) => m.creditos < 100).length,
    creditos: MACHINES.reduce((s, m) => s + m.creditos, 0),
  }), []);
  const filtered = MACHINES.filter((m) => {
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
          actions={<CarboButton onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Máquina</CarboButton>}
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
                  <CarboTableCell><button onClick={() => setEditValues({ modelo: m.modelo, serie: m.codigo, licenciado: m.licenciado, instalacao: m.ultimaManut ?? "", status: m.status })} className="p-1.5 hover:bg-muted rounded-md"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button></CarboTableCell>
                </CarboTableRow>
              ))}
              {filtered.length === 0 && (
                <CarboTableRow>
                  <CarboTableCell colSpan={8}>
                    <CarboEmptyState icon={Cog} title="Nenhuma máquina" description="Nenhuma máquina cadastrada." />
                  </CarboTableCell>
                </CarboTableRow>
              )}
            </CarboTableBody>
          </CarboTable>
        </div>
      </div>

      <MachineDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      <MachineDialog
        mode="edit"
        open={editValues !== null}
        onOpenChange={(o) => { if (!o) setEditValues(null); }}
        initial={editValues ?? undefined}
      />
    </div>
  );
}
