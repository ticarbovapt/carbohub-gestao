import { useForm } from "react-hook-form";
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
import {
  useCreateProductionOrderOP,
  useExplodeBOM,
  DEMAND_SOURCE_LABELS,
  PRIORITY_LABELS,
} from "@/hooks/useProductionOrders";
import { useSkus } from "@/hooks/useSkus";

const schema = z.object({
  title: z.string().min(3, "Título deve ter ao menos 3 caracteres"),
  sku_id: z.string().min(1, "Selecione um SKU"),
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

export function CreateOPDialog({ open, onOpenChange }: CreateOPDialogProps) {
  const createOP = useCreateProductionOrderOP();
  const explodeBOM = useExplodeBOM();
  const { data: skus = [] } = useSkus();

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
      planned_quantity: 1,
    },
  });

  const isSubmitting = createOP.isPending || explodeBOM.isPending;

  const onSubmit = async (data: FormData) => {
    const result = await createOP.mutateAsync({
      sku_id: data.sku_id,
      planned_quantity: data.planned_quantity,
      demand_source: data.demand_source || "pcp_manual",
      need_date: data.need_date || null,
      priority: data.priority,
      deviation_notes: data.deviation_notes || null,
      op_status: "rascunho",
    });

    // Explode BOM after creation
    await explodeBOM.mutateAsync({
      orderId: result.id,
      skuId: data.sku_id,
      plannedQuantity: data.planned_quantity,
    });

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label>Título da OP *</Label>
            <Input {...register("title")} placeholder="Ex: OP Produto X - Lote 01" />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* SKU */}
          <div className="space-y-2">
            <Label>SKU *</Label>
            <Select onValueChange={(v) => setValue("sku_id", v)} value={watch("sku_id")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o SKU" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s: any) => (
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
            <Input type="date" {...register("need_date")} />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea {...register("deviation_notes")} placeholder="Observações sobre a OP..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
