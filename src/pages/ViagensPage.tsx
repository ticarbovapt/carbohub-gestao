import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
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
import {
  Plane,
  Plus,
  Calendar,
  MapPin,
  Loader2,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  FileText,
  Users,
} from "lucide-react";
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

function CreateViagemDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createViagem = useCreateViagem();
  const [form, setForm] = useState<Partial<CreateViagemInput>>({
    necessita_hotel: false,
    adiantamento_solicitado: 0,
    estimativa_total: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.destino ||
      !form.objetivo ||
      !form.data_ida ||
      !form.data_volta ||
      !form.meio_transporte
    ) {
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

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            {/* Destino */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="viagem-destino">Destino *</Label>
              <Input
                id="viagem-destino"
                placeholder="ex: São Paulo, SP"
                value={form.destino || ""}
                onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
                disabled={createViagem.isPending}
                required
              />
            </div>

            {/* Objetivo */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="viagem-objetivo">Objetivo da viagem *</Label>
              <Textarea
                id="viagem-objetivo"
                placeholder="Descreva o motivo / objetivo da viagem..."
                value={form.objetivo || ""}
                onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))}
                rows={2}
                disabled={createViagem.isPending}
                required
              />
            </div>

            {/* Datas */}
            <div className="space-y-1.5">
              <Label htmlFor="viagem-data-ida">Data de ida *</Label>
              <Input
                id="viagem-data-ida"
                type="date"
                value={form.data_ida || ""}
                onChange={(e) => setForm((f) => ({ ...f, data_ida: e.target.value }))}
                disabled={createViagem.isPending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="viagem-data-volta">Data de volta *</Label>
              <Input
                id="viagem-data-volta"
                type="date"
                value={form.data_volta || ""}
                onChange={(e) => setForm((f) => ({ ...f, data_volta: e.target.value }))}
                disabled={createViagem.isPending}
                required
              />
            </div>

            {/* Meio de transporte */}
            <div className="space-y-1.5">
              <Label htmlFor="viagem-transporte">Meio de transporte *</Label>
              <Select
                value={form.meio_transporte || ""}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, meio_transporte: v as MeioTransporte }))
                }
                disabled={createViagem.isPending}
              >
                <SelectTrigger id="viagem-transporte">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSPORTE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hospedagem */}
            <div className="space-y-1.5">
              <Label htmlFor="viagem-hotel">Precisa de hospedagem?</Label>
              <Select
                value={form.necessita_hotel ? "sim" : "nao"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, necessita_hotel: v === "sim" }))
                }
                disabled={createViagem.isPending}
              >
                <SelectTrigger id="viagem-hotel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Adiantamento */}
            <div className="space-y-1.5">
              <Label htmlFor="viagem-adiantamento">Adiantamento solicitado (R$)</Label>
              <Input
                id="viagem-adiantamento"
                type="number"
                min={0}
                step={0.01}
                value={form.adiantamento_solicitado ?? 0}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    adiantamento_solicitado: parseFloat(e.target.value) || 0,
                  }))
                }
                disabled={createViagem.isPending}
              />
            </div>

            {/* Estimativa total */}
            <div className="space-y-1.5">
              <Label htmlFor="viagem-estimativa">Estimativa total (R$)</Label>
              <Input
                id="viagem-estimativa"
                type="number"
                min={0}
                step={0.01}
                value={form.estimativa_total ?? 0}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    estimativa_total: parseFloat(e.target.value) || 0,
                  }))
                }
                disabled={createViagem.isPending}
              />
            </div>

            {/* Observações */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="viagem-obs">Observações</Label>
              <Textarea
                id="viagem-obs"
                placeholder="Informações adicionais..."
                value={form.observacoes || ""}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={2}
                disabled={createViagem.isPending}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createViagem.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createViagem.isPending}
              className="carbo-gradient text-white"
            >
              {createViagem.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Solicitação
                </>
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destino</TableHead>
            <TableHead>Solicitante</TableHead>
            <TableHead>Datas</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Estimativa</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((v) => (
            <TableRow key={v.id} className="hover:bg-muted/20">
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{v.destino}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                  {v.objetivo}
                </p>
              </TableCell>
              <TableCell>
                <span className="text-sm">{v.solicitante?.full_name || "—"}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {new Date(v.data_ida).toLocaleDateString("pt-BR")} →{" "}
                  {new Date(v.data_volta).toLocaleDateString("pt-BR")}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{v.duracao_dias}d</span>
              </TableCell>
              <TableCell>
                {v.estimativa_total > 0 ? (
                  <span className="text-sm font-medium">
                    R${" "}
                    {v.estimativa_total.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={v.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {PC_ELIGIBLE_STATUSES.includes(v.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => onOpenPC(v)}
                      aria-label={`Abrir prestação de contas — ${v.destino}`}
                    >
                      <FileText className="h-3 w-3" />
                      PC
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const PENDING_STATUSES: ViagemStatus[] = [
  "pendente_gestor",
  "pendente_financeiro",
  "pendente_ceo",
];

export default function ViagensPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [pcViagem, setPcViagem] = useState<ViagemSolicitacao | null>(null);

  // "Minhas Viagens" — filtrado por solicitante_id do usuário atual
  const { data: minhas, isLoading: loadingMinhas } = useViagens(
    user ? { solicitanteId: user.id } : undefined
  );

  // "Todas" — sem filtro, para gestores/admin
  const { data: todas, isLoading: loadingTodas } = useViagens();

  // Pendentes de aprovação (todas com status pendente_*)
  const pendentes = (todas || []).filter((v) =>
    PENDING_STATUSES.includes(v.status)
  );

  // Em andamento
  const emAndamento = (todas || []).filter((v) => v.status === "em_andamento");

  // KPI: Saldo a acertar = soma de adiantamento_solicitado das viagens pendentes
  const saldoAcertar = pendentes.reduce(
    (acc, v) => acc + (v.adiantamento_solicitado || 0),
    0
  );

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <CarboPageHeader
            title="Viagens & Prestação de Contas"
            description="Solicite, aprove e preste contas de viagens corporativas"
            icon={Plane}
          />
          <Button
            onClick={() => setCreateOpen(true)}
            className="carbo-gradient text-white shrink-0 sm:mt-1 self-start"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Solicitação
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                <Plane className="h-4 w-4" />
                <span className="text-xs font-medium">Total de viagens</span>
              </div>
              <p className="text-2xl font-bold">
                {loadingTodas ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  todas?.length ?? 0
                )}
              </p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-amber-600">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Aguardando aprovação</span>
              </div>
              <p className="text-2xl font-bold">
                {loadingTodas ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  pendentes.length
                )}
              </p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-blue-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Em andamento</span>
              </div>
              <p className="text-2xl font-bold">
                {loadingTodas ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  emAndamento.length
                )}
              </p>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-1 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Saldo a acertar</span>
              </div>
              <p className="text-xl font-bold leading-tight">
                {loadingTodas ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  `R$ ${saldoAcertar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                )}
              </p>
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Tabs + Table */}
        <CarboCard padding="none">
          <Tabs defaultValue="minhas">
            <div className="p-4 border-b overflow-x-auto">
              <TabsList>
                {/* Tab 1: Minhas Viagens */}
                <TabsTrigger value="minhas" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Minhas Viagens
                  {!loadingMinhas && minhas && (
                    <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                      {minhas.length}
                    </span>
                  )}
                </TabsTrigger>

                {/* Tab 2: Pendentes Aprovação */}
                <TabsTrigger value="pendentes" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Pendentes Aprovação
                  {!loadingTodas && pendentes.length > 0 && (
                    <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full">
                      {pendentes.length}
                    </span>
                  )}
                </TabsTrigger>

                {/* Tab 3: Todas */}
                <TabsTrigger value="todas" className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Todas
                  {!loadingTodas && todas && (
                    <span className="ml-1 bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                      {todas.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="minhas" className="m-0">
              <ViagensTable
                data={minhas}
                loading={loadingMinhas}
                onOpenPC={setPcViagem}
              />
            </TabsContent>
            <TabsContent value="pendentes" className="m-0">
              <ViagensTable
                data={pendentes}
                loading={loadingTodas}
                onOpenPC={setPcViagem}
              />
            </TabsContent>
            <TabsContent value="todas" className="m-0">
              <ViagensTable
                data={todas}
                loading={loadingTodas}
                onOpenPC={setPcViagem}
              />
            </TabsContent>
          </Tabs>
        </CarboCard>
      </div>

      <CreateViagemDialog open={createOpen} onOpenChange={setCreateOpen} />

      <PrestacaoContasDialog
        viagem={pcViagem}
        open={!!pcViagem}
        onOpenChange={(v) => {
          if (!v) setPcViagem(null);
        }}
      />
    </BoardLayout>
  );
}
