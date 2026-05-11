/**
 * ReembolsoDialog — Prestação de Contas / Reembolso independente
 *
 * Fluxo: colaborador lança suas despesas + justificativa e envia para aprovação
 * sem precisar ter uma solicitação de adiantamento prévia.
 *
 * Internamente cria uma viagem_solicitacoes com status="em_andamento" (sem
 * adiantamento), insere as despesas e submete a prestação de contas direto
 * para aprovação financeira.
 */

import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CATEGORIA_LABEL, POLITICA_TIPS, type DespesaCategoria } from "@/hooks/useViagens";

// ─── Local types ─────────────────────────────────────────────────────────────

interface DespesaLocal {
  id: string; // temp id for list key
  categoria: DespesaCategoria;
  descricao: string;
  valor: number;
  data_despesa: string;
  cliente_identificado?: string;
  file?: File;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

function ExpenseRow({
  despesa,
  onRemove,
}: {
  despesa: DespesaLocal;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border bg-background text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-xs bg-muted px-1.5 py-0.5 rounded">
            {CATEGORIA_LABEL[despesa.categoria]}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(despesa.data_despesa + "T12:00:00").toLocaleDateString("pt-BR")}
          </span>
          {despesa.file && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {despesa.file.name}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-foreground">{despesa.descricao}</p>
        {despesa.cliente_identificado && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Cliente: {despesa.cliente_identificado}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold tabular-nums">R$ {formatBRL(despesa.valor)}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── AddExpenseForm ────────────────────────────────────────────────────────────

interface AddExpenseFormProps {
  onAdd: (d: DespesaLocal) => void;
}

function AddExpenseForm({ onAdd }: AddExpenseFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<DespesaLocal>>({
    data_despesa: today(),
    valor: 0,
  });
  const [file, setFile] = useState<File | null>(null);

  const tip = form.categoria ? POLITICA_TIPS[form.categoria] : null;
  const isRepresentacao =
    form.categoria === "representacao" || form.categoria === "alimentacao_representacao";

  const handleAdd = () => {
    if (!form.categoria || !form.descricao || !form.valor || !form.data_despesa) {
      toast.error("Preencha categoria, descrição, valor e data.");
      return;
    }
    if (isRepresentacao && !form.cliente_identificado) {
      toast.error("Informe o cliente/parceiro para despesas de representação.");
      return;
    }
    if (form.valor <= 0) {
      toast.error("Valor deve ser maior que zero.");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      categoria: form.categoria as DespesaCategoria,
      descricao: form.descricao,
      valor: form.valor,
      data_despesa: form.data_despesa,
      cliente_identificado: form.cliente_identificado,
      file: file ?? undefined,
    });
    setForm({ data_despesa: today(), valor: 0 });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Adicionar despesa
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Categoria */}
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">
            Categoria *
            {tip && (
              <span title={tip} className="ml-1 text-blue-400 cursor-help text-xs">ⓘ</span>
            )}
          </Label>
          <Select
            value={form.categoria ?? ""}
            onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as DespesaCategoria }))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIA_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k} className="text-sm">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Descrição */}
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Descrição *</Label>
          <Input
            className="h-8 text-sm"
            placeholder="Descreva a despesa"
            value={form.descricao ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
          />
        </div>

        {/* Valor */}
        <div className="space-y-1">
          <Label className="text-xs">Valor (R$) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            className="h-8 text-sm"
            value={form.valor ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, valor: parseFloat(e.target.value) || 0 }))}
          />
        </div>

        {/* Data */}
        <div className="space-y-1">
          <Label className="text-xs">Data *</Label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={form.data_despesa ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))}
          />
        </div>

        {/* Cliente (representação) */}
        {isRepresentacao && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Cliente / Parceiro *</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Nome do cliente ou parceiro"
              value={form.cliente_identificado ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, cliente_identificado: e.target.value }))
              }
            />
          </div>
        )}

        {/* Comprovante */}
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Comprovante (opcional)</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 transition-colors"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {file ? file.name : "Selecionar arquivo"}
            </button>
            {file && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remover
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-full h-8 gap-1.5"
        onClick={handleAdd}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar despesa
      </Button>
    </div>
  );
}

// ─── ReembolsoDialog ──────────────────────────────────────────────────────────

export interface ReembolsoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ReembolsoDialog({ open, onOpenChange }: ReembolsoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [justificativa, setJustificativa] = useState("");
  const [despesas, setDespesas] = useState<DespesaLocal[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const total = despesas.reduce((sum, d) => sum + d.valor, 0);

  const handleClose = () => {
    if (submitting) return;
    setJustificativa("");
    setDespesas([]);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!justificativa.trim()) {
      toast.error("Informe a justificativa / motivo do reembolso.");
      return;
    }
    if (despesas.length === 0) {
      toast.error("Adicione ao menos uma despesa antes de enviar.");
      return;
    }

    setSubmitting(true);
    try {
      const dataHoje = today();

      // 1. Criar solicitação de viagem como "reembolso" (sem adiantamento)
      const { data: viagem, error: viagemError } = await (supabase as any)
        .from("viagem_solicitacoes")
        .insert({
          solicitante_id: user.id,
          destino: "Reembolso de Despesas",
          objetivo: justificativa.trim(),
          data_ida: dataHoje,
          data_volta: dataHoje,
          meio_transporte: "outro",
          necessita_hotel: false,
          adiantamento_solicitado: 0,
          estimativa_total: total,
          status: "em_andamento", // sem etapa de aprovação de adiantamento
        })
        .select()
        .single();

      if (viagemError) throw viagemError;
      const solicitacaoId: string = viagem.id;

      // 2. Inserir todas as despesas
      for (const d of despesas) {
        const { data: despesaCriada, error: dErr } = await (supabase as any)
          .from("viagem_despesas")
          .insert({
            solicitacao_id: solicitacaoId,
            categoria: d.categoria,
            descricao: d.descricao,
            valor: d.valor,
            data_despesa: d.data_despesa,
            cliente_identificado: d.cliente_identificado ?? null,
            lancado_por: user.id,
            is_devolucao: false,
          })
          .select()
          .single();

        if (dErr) throw dErr;

        // Upload comprovante se houver
        if (d.file && despesaCriada) {
          const ext = d.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
          const path = `${solicitacaoId}/${despesaCriada.id}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("viagem-comprovantes")
            .upload(path, d.file, { upsert: true });
          if (!uploadErr) {
            await (supabase as any)
              .from("viagem_despesas")
              .update({ comprovante_url: path })
              .eq("id", despesaCriada.id);
          }
        }
      }

      // 3. Criar prestação de contas e submeter direto para aprovação
      const { data: pc, error: pcErr } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .insert({
          solicitacao_id: solicitacaoId,
          adiantamento_recebido: 0,
          total_despesas: total,
          status: "enviada",
          submetido_em: new Date().toISOString(),
        })
        .select()
        .single();

      if (pcErr) throw pcErr;

      queryClient.invalidateQueries({ queryKey: ["viagens"] });
      toast.success("Solicitação de reembolso enviada para aprovação!");
      handleClose();
    } catch (err: any) {
      toast.error("Erro ao enviar reembolso: " + (err?.message ?? "Erro desconhecido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-500" />
            Prestação de Contas / Reembolso
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Justificativa */}
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-justificativa">Justificativa / Motivo *</Label>
            <Textarea
              id="reembolso-justificativa"
              placeholder="Descreva o motivo das despesas e o que foi realizado..."
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {/* Lista de despesas adicionadas */}
          {despesas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Despesas ({despesas.length})
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {despesas.map((d) => (
                  <ExpenseRow
                    key={d.id}
                    despesa={d}
                    onRemove={() => setDespesas((prev) => prev.filter((x) => x.id !== d.id))}
                  />
                ))}
              </div>
              {/* Total */}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span className="text-muted-foreground">Total a reembolsar</span>
                <span className="text-foreground">R$ {formatBRL(total)}</span>
              </div>
            </div>
          )}

          {/* Form para adicionar despesa */}
          <AddExpenseForm onAdd={(d) => setDespesas((prev) => [...prev, d])} />

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || despesas.length === 0}
              className="carbo-gradient text-white gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Enviar para aprovação
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
