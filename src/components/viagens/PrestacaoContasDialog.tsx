import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useViagemDespesas,
  useLancarDespesa,
  useDeleteDespesa,
  usePrestacaoContas,
  useCreatePC,
  useSubmitPC,
  useAprovarPC,
  useReprovarPC,
  useReopenPC,
  CATEGORIA_LABEL,
  MOTIVO_REPROVA_OPTIONS,
  PC_STATUS_COLOR,
  PC_STATUS_LABEL,
  POLITICA_TIPS,
  type DespesaCategoria,
  type LancarDespesaInput,
  type ViagemDespesa,
  type ViagemPC,
  type ViagemSolicitacao,
} from "@/hooks/useViagens";

// ─── InfoTip ────────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex items-center cursor-help text-blue-400 hover:text-blue-600 transition-colors"
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

// ─── ComprovanteThumbnail ────────────────────────────────────────────────────

function ComprovanteThumbnail({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.storage
      .from("viagem-comprovantes")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (mounted) setUrl(data?.signedUrl ?? null);
      });
    return () => { mounted = false; };
  }, [path]);

  if (!url) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Paperclip className="h-3 w-3" /> comprovante
    </span>
  );

  const isPdf = path.endsWith(".pdf");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      {isPdf ? (
        <><FileText className="h-3.5 w-3.5" /> PDF</>
      ) : (
        <img src={url} alt="Comprovante" className="h-10 w-10 rounded object-cover border" />
      )}
    </a>
  );
}

// ─── DespesaCard ────────────────────────────────────────────────────────────

function DespesaCard({
  despesa,
  canEdit,
}: {
  despesa: ViagemDespesa;
  canEdit: boolean;
}) {
  const deleteDespesa = useDeleteDespesa();

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm",
        despesa.is_devolucao
          ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800"
          : "bg-background"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-xs bg-muted px-1.5 py-0.5 rounded">
            {despesa.is_devolucao ? "↩ Devolução" : CATEGORIA_LABEL[despesa.categoria]}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(despesa.data_despesa).toLocaleDateString("pt-BR")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-foreground">{despesa.descricao}</p>
        {despesa.cliente_identificado && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Cliente: {despesa.cliente_identificado}
          </p>
        )}
        {despesa.comprovante_url && (
          <div className="mt-1">
            <ComprovanteThumbnail path={despesa.comprovante_url} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            "font-semibold tabular-nums",
            despesa.is_devolucao ? "text-emerald-600" : "text-foreground"
          )}
        >
          {despesa.is_devolucao ? "−" : "+"}
          R${" "}
          {despesa.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() =>
              deleteDespesa.mutate({ id: despesa.id, solicitacaoId: despesa.solicitacao_id })
            }
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
            title="Remover despesa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AddDespesaForm ──────────────────────────────────────────────────────────

function AddDespesaForm({
  solicitacaoId,
  onAdded,
}: {
  solicitacaoId: string;
  onAdded: () => void;
}) {
  const lancar = useLancarDespesa();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<LancarDespesaInput>>({
    categoria: undefined,
    descricao: "",
    valor: 0,
    data_despesa: new Date().toISOString().slice(0, 10),
    is_devolucao: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const tip = form.categoria ? POLITICA_TIPS[form.categoria] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoria || !form.descricao || !form.valor || !form.data_despesa) {
      toast.error("Preencha categoria, descrição, valor e data.");
      return;
    }
    if (
      (form.categoria === "representacao" || form.categoria === "alimentacao_representacao") &&
      !form.cliente_identificado
    ) {
      toast.error("Informe o cliente/parceiro para despesas de representação.");
      return;
    }

    setUploading(true);
    try {
      const created = await lancar.mutateAsync({
        ...(form as LancarDespesaInput),
        solicitacao_id: solicitacaoId,
      });

      // Upload comprovante if selected
      if (file && created) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${solicitacaoId}/${created.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("viagem-comprovantes")
          .upload(path, file, { upsert: true });

        if (!uploadError) {
          await (supabase as any)
            .from("viagem_despesas")
            .update({ comprovante_url: path })
            .eq("id", created.id);
        }
      }

      setForm({
        categoria: undefined,
        descricao: "",
        valor: 0,
        data_despesa: new Date().toISOString().slice(0, 10),
        is_devolucao: false,
        cliente_identificado: "",
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onAdded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Nova despesa
      </p>

      {/* Tipo: despesa ou devolução */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_devolucao: false }))}
          className={cn(
            "flex-1 py-1.5 text-sm rounded border transition-colors",
            !form.is_devolucao
              ? "bg-primary text-primary-foreground border-primary"
              : "border-input hover:bg-muted"
          )}
        >
          Despesa
        </button>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_devolucao: true, categoria: "outros" }))}
          className={cn(
            "flex-1 py-1.5 text-sm rounded border transition-colors",
            form.is_devolucao
              ? "bg-emerald-600 text-white border-emerald-600"
              : "border-input hover:bg-muted"
          )}
        >
          ↩ Devolução
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!form.is_devolucao && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">
              Categoria *
              {tip && <InfoTip text={tip} />}
            </Label>
            <Select
              value={form.categoria || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as DespesaCategoria }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={cn("space-y-1", form.is_devolucao ? "col-span-2" : "col-span-2")}>
          <Label className="text-xs">Descrição *</Label>
          <Input
            className="h-8 text-sm"
            placeholder={form.is_devolucao ? "Ex: Devolução do adiantamento em espécie" : "Descreva a despesa"}
            value={form.descricao || ""}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            required
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Valor (R$) *</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            className="h-8 text-sm"
            value={form.valor || ""}
            onChange={(e) => setForm((f) => ({ ...f, valor: parseFloat(e.target.value) || 0 }))}
            required
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Data *</Label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={form.data_despesa || ""}
            onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))}
            required
          />
        </div>

        {(form.categoria === "representacao" || form.categoria === "alimentacao_representacao") && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Cliente / Parceiro identificado *</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Nome do cliente ou parceiro"
              value={form.cliente_identificado || ""}
              onChange={(e) => setForm((f) => ({ ...f, cliente_identificado: e.target.value }))}
              required
            />
          </div>
        )}

        {!form.is_devolucao && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Comprovante (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground cursor-pointer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={lancar.isPending || uploading}
        className="w-full"
      >
        {lancar.isPending || uploading ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando...</>
        ) : (
          <><Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar</>
        )}
      </Button>
    </form>
  );
}

// ─── ResumoPanel ─────────────────────────────────────────────────────────────

function ResumoPanel({
  pc,
  despesas,
}: {
  pc: ViagemPC;
  despesas: ViagemDespesa[];
}) {
  const totalNormal = despesas
    .filter((d) => !d.is_devolucao)
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalDevolucao = despesas
    .filter((d) => d.is_devolucao)
    .reduce((s, d) => s + Number(d.valor), 0);
  const adiantamento = Number(pc.adiantamento_recebido);
  const saldo = adiantamento - totalNormal + totalDevolucao;

  const fmt = (n: number) =>
    `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-lg bg-muted/40 border text-sm">
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Adiantamento</p>
        <p className="font-semibold">{fmt(adiantamento)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Total despesas</p>
        <p className="font-semibold text-red-600">{fmt(totalNormal)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Devoluções</p>
        <p className="font-semibold text-emerald-600">{fmt(totalDevolucao)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground font-medium">Saldo</p>
        <p
          className={cn(
            "font-bold text-base",
            saldo > 0 ? "text-orange-600" : saldo < 0 ? "text-blue-600" : "text-emerald-600"
          )}
        >
          {saldo > 0 ? `Devolver ${fmt(saldo)}` : saldo < 0 ? `Receber ${fmt(Math.abs(saldo))}` : "Quitado ✓"}
        </p>
      </div>
    </div>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────

interface PrestacaoContasDialogProps {
  viagem: ViagemSolicitacao | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PrestacaoContasDialog({
  viagem,
  open,
  onOpenChange,
}: PrestacaoContasDialogProps) {
  const { user, isAnyGestor, isAdmin, isCeo, isMasterAdmin } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [reprovarMode, setReprovarMode] = useState(false);
  const [reprovarCategoria, setReprovarCategoria] = useState("");
  const [reprovarDetalhe, setReprovarDetalhe] = useState("");

  const { data: pc, isLoading: pcLoading } = usePrestacaoContas(viagem?.id ?? null);
  const { data: despesas = [], isLoading: despLoading } = useViagemDespesas(viagem?.id ?? null);

  const createPC = useCreatePC();
  const submitPC = useSubmitPC();
  const aprovarPC = useAprovarPC();
  const reprovarPC = useReprovarPC();
  const reopenPC = useReopenPC();

  const isApprover = isAnyGestor || isAdmin || isCeo || isMasterAdmin;
  const isOwner = viagem?.solicitante_id === user?.id;
  const canEdit =
    !!(pc && (pc.status === "aberta" || pc.status === "reprovada")) &&
    isOwner;

  // Auto-create PC when dialog opens if none exists
  useEffect(() => {
    if (open && viagem && !pcLoading && !pc && !createPC.isPending) {
      createPC.mutate({
        solicitacaoId: viagem.id,
        adiantamento: viagem.adiantamento_solicitado || 0,
      });
    }
  }, [open, viagem, pcLoading, pc]);

  // Reset form states when dialog closes
  useEffect(() => {
    if (!open) {
      setShowAddForm(false);
      setReprovarMode(false);
      setReprovarCategoria("");
      setReprovarDetalhe("");
    }
  }, [open]);

  const totalNormal = despesas
    .filter((d) => !d.is_devolucao)
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalDevolucao = despesas
    .filter((d) => d.is_devolucao)
    .reduce((s, d) => s + Number(d.valor), 0);

  const handleSubmit = () => {
    if (!pc) return;
    if (despesas.length === 0) {
      toast.error("Adicione ao menos uma despesa antes de enviar.");
      return;
    }
    const totalDespesas = totalNormal - totalDevolucao;
    submitPC.mutate({ pcId: pc.id, totalDespesas });
  };

  const handleAprovar = () => {
    if (!pc) return;
    aprovarPC.mutate(pc.id);
  };

  const handleReprovar = () => {
    if (!pc) return;
    if (!reprovarCategoria) {
      toast.error("Selecione o motivo da reprovação.");
      return;
    }
    if (!reprovarDetalhe.trim()) {
      toast.error("Descreva o motivo em detalhes.");
      return;
    }
    reprovarPC.mutate({ pcId: pc.id, categoria: reprovarCategoria, detalhe: reprovarDetalhe });
    setReprovarMode(false);
  };

  if (!viagem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Prestação de Contas
          </DialogTitle>

          {/* Trip info */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {viagem.destino}
            </span>
            <span>
              {new Date(viagem.data_ida).toLocaleDateString("pt-BR")} →{" "}
              {new Date(viagem.data_volta).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </DialogHeader>

        {/* PC status bar */}
        {pc && (
          <div className="flex items-center justify-between px-1 shrink-0">
            <span
              className={cn(
                "text-xs font-semibold px-2.5 py-1 rounded-full",
                PC_STATUS_COLOR[pc.status]
              )}
            >
              {PC_STATUS_LABEL[pc.status]}
            </span>
            {pc.submetido_em && (
              <span className="text-xs text-muted-foreground">
                Enviada em {new Date(pc.submetido_em).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        )}

        {/* Rejection notice */}
        {pc?.status === "reprovada" && pc.motivo_reprova_detalhe && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-sm shrink-0">
            <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">
                Reprovada:{" "}
                {MOTIVO_REPROVA_OPTIONS.find((o) => o.value === pc.motivo_reprova_categoria)
                  ?.label ?? pc.motivo_reprova_categoria}
              </p>
              <p className="text-red-600 dark:text-red-300 mt-0.5">{pc.motivo_reprova_detalhe}</p>
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => pc && reopenPC.mutate(pc.id)}
                  disabled={reopenPC.isPending}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Corrigir e reenviar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {pcLoading || despLoading ? (
            <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : (
            <>
              {/* Expense list */}
              <div className="space-y-2">
                {despesas.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nenhuma despesa lançada ainda.
                  </p>
                ) : (
                  despesas.map((d) => (
                    <DespesaCard key={d.id} despesa={d} canEdit={canEdit} />
                  ))
                )}
              </div>

              {/* Add form toggle */}
              {canEdit && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {showAddForm ? (
                      <><ChevronUp className="h-4 w-4" /> Fechar formulário</>
                    ) : (
                      <><ChevronDown className="h-4 w-4" /> Adicionar despesa / devolução</>
                    )}
                  </button>
                  {showAddForm && pc && (
                    <div className="mt-2">
                      <AddDespesaForm
                        solicitacaoId={viagem.id}
                        onAdded={() => setShowAddForm(false)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              {pc && <ResumoPanel pc={pc} despesas={despesas} />}

              {/* Approver reprovação form */}
              {reprovarMode && (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm font-semibold text-destructive">Reprovar prestação de contas</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Motivo *</Label>
                    <Select value={reprovarCategoria} onValueChange={setReprovarCategoria}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione o motivo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVO_REPROVA_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Detalhes *</Label>
                    <Textarea
                      className="text-sm"
                      rows={2}
                      placeholder="Explique o que precisa ser corrigido..."
                      value={reprovarDetalhe}
                      onChange={(e) => setReprovarDetalhe(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReprovarMode(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleReprovar}
                      disabled={reprovarPC.isPending}
                      className="flex-1"
                    >
                      {reprovarPC.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><XCircle className="h-3.5 w-3.5 mr-1" /> Confirmar reprovação</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {pc && !pcLoading && (
          <div className="shrink-0 border-t pt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>

            <div className="flex gap-2">
              {/* Collaborator: submit */}
              {isOwner && pc.status === "aberta" && (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitPC.isPending || despesas.length === 0}
                  className="carbo-gradient text-white"
                >
                  {submitPC.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><Send className="h-3.5 w-3.5 mr-1.5" /> Enviar para aprovação</>
                  )}
                </Button>
              )}

              {/* Collaborator: resubmit after reopen */}
              {isOwner && pc.status === "reprovada" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reopenPC.mutate(pc.id)}
                  disabled={reopenPC.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reabrir para edição
                </Button>
              )}

              {/* Approver actions */}
              {isApprover && pc.status === "enviada" && !reprovarMode && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => setReprovarMode(true)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Reprovar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleAprovar}
                    disabled={aprovarPC.isPending}
                  >
                    {aprovarPC.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Aprovar PC</>
                    )}
                  </Button>
                </>
              )}

              {/* Approved confirmation */}
              {pc.status === "aprovada" && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Aprovada
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
