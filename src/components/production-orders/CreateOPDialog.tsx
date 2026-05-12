import { useForm } from "react-hook-form";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEMAND_SOURCE_LABELS, PRIORITY_LABELS } from "@/hooks/useProductionOrders";

const schema = z.object({
  sku_id: z.string().min(1, "Selecione um produto"),
  planned_quantity: z.coerce.number().int().positive("Quantidade deve ser positiva"),
  demand_source: z.enum(["venda", "recorrencia", "safety_stock", "pcp_manual"]).optional(),
  need_date: z.string().optional(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  deviation_notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Retorna o período AAAÁMM atual */
function currentPeriod(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}`;
}

export function CreateOPDialog({ open, onOpenChange }: CreateOPDialogProps) {
  const qc = useQueryClient();

  const { data: skus = [], isLoading: skusLoading } = useQuery({
    queryKey: ["skus_active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sku")
        .select("id, code, name")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data as { id: string; code: string; name: string }[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 3,
      planned_quantity: 100,
    },
  });

  const createOP = useMutation({
    mutationFn: async (data: FormData) => {
      const sku = skus.find((s) => s.id === data.sku_id);
      if (!sku) throw new Error("Produto não encontrado.");

      const payload = {
        sku_id: data.sku_id,
        planned_quantity: data.planned_quantity,
        op_status: "planejada",
        demand_source: data.demand_source || "pcp_manual",
        need_date: data.need_date || null,
        priority: data.priority || 3,
        deviation_notes: data.deviation_notes || null,
        op_number: "",
        // campos legados obrigatórios pelo schema original
        product_code: sku.code,
        quantity: data.planned_quantity,
        status: "pending",
      };

      const { data: result, error } = await (supabase as any)
        .from("production_orders")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders_op"] });
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      toast.success("Ordem de Produção criada com sucesso!");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Erro ao criar OP: " + e.message),
  });

  const isSubmitting = createOP.isPending;
  const selectedSkuId = watch("sku_id");
  const selectedSku = skus.find((s) => s.id === selectedSkuId);

  // Preview do número de OP — formato real gerado pelo trigger do banco
  const opPreview = selectedSku
    ? `OP-${selectedSku.code}-${currentPeriod()}-XXXX`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => createOP.mutate(data))} className="space-y-4">
          {/* Produto — primeiro campo para disparar auto-fill */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select
              onValueChange={(v) => setValue("sku_id", v)}
              value={watch("sku_id")}
              disabled={skusLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={skusLoading ? "Carregando..." : "Selecione o produto"} />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.sku_id && (
              <p className="text-xs text-destructive">{errors.sku_id.message}</p>
            )}
          </div>

          {/* Preview do número de OP — aparece após seleção do produto */}
          {opPreview && (
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Número da OP (gerado)</Label>
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-mono text-muted-foreground">
                {opPreview}
              </div>
            </div>
          )}

          {/* Quantidade Planejada */}
          <div className="space-y-2">
            <Label>Quantidade Planejada *</Label>
            <Input type="number" {...register("planned_quantity")} />
            {errors.planned_quantity && (
              <p className="text-xs text-destructive">{errors.planned_quantity.message}</p>
            )}
          </div>

          {/* Prioridade + Fonte de Demanda */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select
                onValueChange={(v) => setValue("priority", Number(v))}
                value={String(watch("priority"))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fonte de Demanda</Label>
              <Select
                onValueChange={(v) => setValue("demand_source", v as any)}
                value={watch("demand_source")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEMAND_SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data de Necessidade */}
          <div className="space-y-2">
            <Label>Data de Necessidade</Label>
            <DatePickerInput
              value={watch("need_date") ?? ""}
              onChange={v => setValue("need_date", v)}
              placeholder="Selecionar data"
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea {...register("deviation_notes")} placeholder="Observações sobre a OP..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar OP
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
