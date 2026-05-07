import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plane, Plus, Calendar, MapPin, Loader2, Clock, CheckCircle, AlertTriangle, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  useViagens,
  useCreateViagem,
  STATUS_LABEL,
  STATUS_COLOR,
  TRANSPORTE_LABEL,
  type CreateViagemInput,
  type MeioTransporte,
  type ViagemStatus,
  type ViagemSolicitacao,
} from "@/hooks/useViagens";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { PrestacaoContasDialog } from "@/components/viagens/PrestacaoContasDialog";

// ─── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ViagemStatus }) {
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_COLOR[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Create Dialog ─────────────────────────────────────────────────────────

function CreateViagemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createViagem = useCreateViagem();
  const [form, setForm] = useState<Partial<CreateViagemInput>>({
    necessita_hotel: false,
    adiantamento_solicitado: 0,
    estimativa_total: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.destino || !form.objetivo || !form.data_ida || !form.data_volta || !form.meio_transporte) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (form.data_volta! < form.data_ida!) {
      toast.error("Data de volta deve ser após a data de ida");
      return;
    }
    await createViagem.mutateAsync(form as CreateViagemInput);
    onOpenChange(false);
    setForm({ necessita_hotel: false, adiantamento_solicitado: 0, estimativa_total: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-blue-500" />
            Nova Solicitação de Viagem
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da viagem. A solicitação será encaminhada para aprovação.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Destino *</Label>
              <Input
                placeholder="ex: São Paulo, SP"
                value={form.destino || ""}
                onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
                required
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Objetivo da viagem *</Label>
              <Textarea
                placeholder="Descreva o motivo / objetivo da viagem..."
                value={form.objetivo || ""}
                onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))}
                rows={2}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data de ida *</Label>
              <Input
                type="date"
                value={form.data_ida || ""}
                onChange={(e) => setForm((f) => ({ ...f, data_ida: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data de volta *</Label>
              <Input
                type="date"
                value={form.data_volta || ""}
                onChange={(e) => setForm((f) => ({ ...f, data_volta: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Meio de transporte *</Label>
              <Select
                value={form.meio_transporte || ""}
                onValueChange={(v) => setForm((f) => ({ ...f, meio_transporte: v as MeioTransporte }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSPORTE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Precisa de hospedagem?</Label>
              <Select
                value={form.necessita_hotel ? "sim" : "nao"}
                onValueChange={(v) => setForm((f) => ({ ...f, necessita_hotel: v === "sim" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Adiantamento solicitado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.adiantamento_solicitado || 0}
                onChange={(e) => setForm((f) => ({ ...f, adiantamento_solicitado: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Estimativa total (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.estimativa_total || 0}
                onChange={(e) => setForm((f) => ({ ...f, estimativa_total: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Informações adicionais..."
                value={form.observacoes || ""}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createViagem.isPending} className="carbo-gradient text-white">
              {createViagem.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Criar Solicitação</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Viagens Table ─────────────────────────────────────────────────────────

const PC_ELIGIBLE_STATUSES: ViagemStatus[] = ["aprovado", "em_andamento", "concluido"];

function ViagensTable({
  data,
  loading,
  onOpenPC,
}: {
  data: ReturnType<typeof useViagens>["data"];
  loading: boolean;
  onOpenPC: (v: ViagemSolicitacao) => void;
}) {
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        Carregando viagens...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        <Plane className="h-8 w-8 mx-auto mb-3 opacity-30" />
        Nenhuma solicitação encontrada.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Destino</TableHead>
          <TableHead>Solicitante</TableHead>
          <TableHead>Datas</TableHead>
          <TableHead>Duração</TableHead>
          <TableHead>Estimativa</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((v) => (
          <TableRow key={v.id} className="hover:bg-muted/20">
            <TableCell>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{v.destino}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{v.objetivo}</p>
            </TableCell>
            <TableCell>
              <span className="text-sm">{v.solicitante?.full_name || "—"}</span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(v.data_ida).toLocaleDateString("pt-BR")} →{" "}
                {new Date(v.data_volta).toLocaleDateString("pt-BR")}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm">{v.duracao_dias}d</span>
            </TableCell>
            <TableCell>
              {v.estimativa_total > 0
                ? <span className="text-sm font-medium">R$ {v.estimativa_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                : <span className="text-xs text-muted-foreground">—</span>
              }
            </TableCell>
            <TableCell>
              <StatusBadge status={v.status} />
            </TableCell>
            <TableCell>
              {PC_ELIGIBLE_STATUSES.includes(v.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => onOpenPC(v)}
                >
                  <FileText className="h-3 w-3" />
                  PC
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ViagensPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [pcViagem, setPcViagem] = useState<ViagemSolicitacao | null>(null);

  const { data: todas,      isLoading: loadingTodas }      = useViagens();
  const { data: pendentes,  isLoading: loadingPendentes }  = useViagens({ status: "pendente_gestor" });
  const { data: emAndamento,isLoading: loadingAndamento }  = useViagens({ status: "em_andamento" });

  const aguardando = (todas || []).filter((v) =>
    ["pendente_gestor", "pendente_financeiro", "pendente_ceo"].includes(v.status)
  );
  const saldoAberto = (todas || [])
    .filter((v) => ["aprovado", "em_andamento"].includes(v.status))
    .reduce((acc, v) => acc + (v.adiantamento_solicitado || 0), 0);

  return (
    <BoardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <CarboPageHeader
            title="Viagens & Prestação de Contas"
            description="Solicite, aprove e preste contas de viagens corporativas"
            icon={Plane}
          />
          <Button
            onClick={() => setCreateOpen(true)}
            className="carbo-gradient text-white shrink-0 mt-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Solicitação
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                <Plane className="h-4 w-4" />
                <span className="text-xs font-medium">Total de viagens</span>
              </div>
              <p className="text-2xl font-bold">{todas?.length ?? "—"}</p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-amber-600">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Aguardando aprovação</span>
              </div>
              <p className="text-2xl font-bold">{aguardando.length}</p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-blue-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Em andamento</span>
              </div>
              <p className="text-2xl font-bold">{emAndamento?.length ?? 0}</p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Adiantamentos abertos</span>
              </div>
              <p className="text-xl font-bold">
                R$ {saldoAberto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Table with tabs */}
        <CarboCard padding="none">
          <Tabs defaultValue="todas">
            <div className="p-4 border-b">
              <TabsList>
                <TabsTrigger value="todas" className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5" />
                  Todas
                  {todas && (
                    <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                      {todas.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pendentes" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Pendentes
                  {aguardando.length > 0 && (
                    <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full">
                      {aguardando.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="andamento" className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Em andamento
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="todas" className="m-0">
              <ViagensTable data={todas} loading={loadingTodas} onOpenPC={setPcViagem} />
            </TabsContent>
            <TabsContent value="pendentes" className="m-0">
              <ViagensTable data={aguardando} loading={loadingPendentes} onOpenPC={setPcViagem} />
            </TabsContent>
            <TabsContent value="andamento" className="m-0">
              <ViagensTable data={emAndamento} loading={loadingAndamento} onOpenPC={setPcViagem} />
            </TabsContent>
          </Tabs>
        </CarboCard>
      </div>

      <CreateViagemDialog open={createOpen} onOpenChange={setCreateOpen} />

      <PrestacaoContasDialog
        viagem={pcViagem}
        open={!!pcViagem}
        onOpenChange={(v) => { if (!v) setPcViagem(null); }}
      />
    </BoardLayout>
  );
}
