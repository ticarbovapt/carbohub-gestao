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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { DEMAND_SOURCE_LABELS, PRIORITY_LABELS } from "@/hooks/useProductionOrders";

const schema = z.object({
  title: z.string().min(3, "Título deve ter ao menos 3 caracteres"),
  product_id: z.string().min(1, "Selecione um produto"),
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

/** Gera número de OP no formato OP-YYYYMMDD-XXXX */
function generateOpNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `OP-${date}-${rand}`;
}

export function CreateOPDialog({ open, onOpenChange }: CreateOPDialogProps) {
  const qc = useQueryClient();
  const { data: products = [], isLoading: productsLoading } = useMrpProducts();

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
      // Resolve product info
      const product = products.find((p) => p.id === data.product_id);
      if (!product) throw new Error("Produto não encontrado.");

      const payload = {
        // Required fields — existing schema
        product_id: data.product_id,
        product_code: product.product_code,
        op_number: generateOpNumber(),
        quantity: data.planned_quantity,
        status: "rascunho",
        type: data.demand_source || "pcp_manual",
        source: data.demand_source || "pcp_manual",
        notes: data.deviation_notes || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => createOP.mutate(data))} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label>Título da OP *</Label>
            <Input {...register("title")} placeholder="Ex: OP CarboZé — Lote 01" />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select
              onValueChange={(v) => setValue("product_id", v)}
              value={watch("product_id")}
              disabled={productsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={productsLoading ? "Carregando..." : "Selecione o produto"} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.product_code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.product_id && (
              <p className="text-xs text-destructive">{errors.product_id.message}</p>
            )}
          </div>

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
