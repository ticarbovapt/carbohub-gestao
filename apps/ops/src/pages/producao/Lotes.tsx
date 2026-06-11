import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Plus, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LotFormDialog } from "@/components/producao/LotFormDialog";
import { DeleteConfirmDialog } from "@/components/producao/DeleteConfirmDialog";

// ⚠️ PORT VISUAL FIEL ao Controle (/lots → Lots "Gestão de Lotes") — dados MOCK.

type LotStatus = "criado" | "recebido" | "em_quarentena" | "amostrado" | "aprovado" | "bloqueado" | "reprovado" | "encerrado";
const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  criado: "Criado", recebido: "Recebido", em_quarentena: "Em Quarentena", amostrado: "Amostrado",
  aprovado: "Aprovado", bloqueado: "Bloqueado", reprovado: "Reprovado", encerrado: "Encerrado",
};
const LOT_STATUS_COLORS: Record<LotStatus, string> = {
  criado: "bg-gray-500", recebido: "bg-blue-500", em_quarentena: "bg-yellow-500", amostrado: "bg-purple-500",
  aprovado: "bg-green-500", bloqueado: "bg-orange-500", reprovado: "bg-red-500", encerrado: "bg-slate-400",
};

interface Lot {
  id: string; lot_code: string; product_name: string; available_volume_ml: number; initial_volume_ml: number;
  status: LotStatus; collected_samples: number; expected_samples: number; supplier_name: string | null; received_at: string | null;
}
const MOCK: Lot[] = [
  { id: "1", lot_code: "LOT-2042", product_name: "Reagente CarboZé", available_volume_ml: 42000, initial_volume_ml: 50000, status: "aprovado", collected_samples: 3, expected_samples: 3, supplier_name: "QuímicaSul", received_at: "2026-06-02" },
  { id: "2", lot_code: "LOT-2041", product_name: "Reagente CarboPRO", available_volume_ml: 18000, initial_volume_ml: 60000, status: "em_quarentena", collected_samples: 1, expected_samples: 3, supplier_name: "BioReagentes", received_at: "2026-06-08" },
  { id: "3", lot_code: "LOT-2040", product_name: "Aditivo X", available_volume_ml: 5000, initial_volume_ml: 40000, status: "amostrado", collected_samples: 2, expected_samples: 2, supplier_name: "QuímicaSul", received_at: "2026-06-05" },
  { id: "4", lot_code: "LOT-2039", product_name: "Reagente VAPT", available_volume_ml: 0, initial_volume_ml: 30000, status: "reprovado", collected_samples: 3, expected_samples: 3, supplier_name: "InsumosBR", received_at: "2026-05-28" },
  { id: "5", lot_code: "LOT-2038", product_name: "Base concentrada", available_volume_ml: 22000, initial_volume_ml: 25000, status: "recebido", collected_samples: 0, expected_samples: 2, supplier_name: null, received_at: "2026-06-09" },
];

const formatVolume = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toLocaleString("pt-BR")} L` : `${ml} ml`);
const volumePercent = (a: number, i: number) => (i > 0 ? Math.round((a / i) * 100) : 0);

export default function Lotes() {
  const canManage = true;
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editLot, setEditLot] = useState<Lot | null>(null);
  const [deleteLot, setDeleteLot] = useState<Lot | null>(null);

  const stats = useMemo(() => ({
    total: MOCK.length,
    quarentena: MOCK.filter((l) => l.status === "em_quarentena").length,
    aprovados: MOCK.filter((l) => l.status === "aprovado").length,
    bloqueados: MOCK.filter((l) => l.status === "bloqueado" || l.status === "reprovado").length,
  }), []);
  const filtered = useMemo(() => MOCK.filter((lot) => {
    if (statusFilter !== "all" && lot.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!lot.lot_code.toLowerCase().includes(q) && !lot.product_name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [searchQuery, statusFilter]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Gestão de Lotes"
          description="Controle de lotes de reagentes e qualidade"
          icon={FlaskConical}
          actions={
            <div className="flex items-center gap-3">
              <CarboButton variant="outline" size="sm" onClick={() => toast("Atualizar (em breve)")}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar</CarboButton>
              {canManage && <CarboButton size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Novo Lote</CarboButton>}
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI title="Total Lotes" value={stats.total} icon={FlaskConical} iconColor="blue" />
          <CarboKPI title="Em Quarentena" value={stats.quarentena} icon={ShieldAlert} iconColor="warning" />
          <CarboKPI title="Aprovados" value={stats.aprovados} icon={ShieldCheck} iconColor="success" />
          <CarboKPI title="Bloqueados" value={stats.bloqueados} icon={ShieldX} iconColor="destructive" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 max-w-sm"><CarboSearchInput placeholder="Buscar por código ou produto..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(LOT_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <CarboEmptyState title="Nenhum lote encontrado" description="Tente ajustar os filtros de busca." icon={FlaskConical} />
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Volume</TableHead><TableHead>Status</TableHead>
                  <TableHead>Amostras</TableHead><TableHead>Fornecedor</TableHead><TableHead>Recebido</TableHead>
                  {canManage && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lot) => {
                  const pct = volumePercent(lot.available_volume_ml, lot.initial_volume_ml);
                  return (
                    <TableRow key={lot.id}>
                      <TableCell><span className="font-mono text-sm text-green-500 font-medium">{lot.lot_code}</span></TableCell>
                      <TableCell className="font-medium">{lot.product_name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="text-sm">{formatVolume(lot.available_volume_ml)} / {formatVolume(lot.initial_volume_ml)}</span>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={cn("text-white border-0 text-xs", LOT_STATUS_COLORS[lot.status])}>{LOT_STATUS_LABELS[lot.status]}</Badge></TableCell>
                      <TableCell><span className="text-sm">{lot.collected_samples}/{lot.expected_samples}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lot.supplier_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lot.received_at ? new Date(lot.received_at + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditLot(lot)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteLot(lot)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Lotes reais e qualidade entram na fase de lógica.</p>
      </div>

      {/* Dialogs */}
      <LotFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editLot && (
        <LotFormDialog
          key={editLot.id}
          open={!!editLot}
          onOpenChange={(v) => { if (!v) setEditLot(null); }}
          mode="edit"
          initial={{
            initial_volume_ml: editLot.initial_volume_ml,
            expected_samples: editLot.expected_samples,
            received_at: editLot.received_at ?? "",
          }}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteLot}
        onOpenChange={(v) => { if (!v) setDeleteLot(null); }}
        title="Excluir lote?"
        description={`Esta ação não pode ser desfeita. O lote ${deleteLot?.lot_code ?? ""} será excluído permanentemente.`}
      />
    </div>
  );
}
