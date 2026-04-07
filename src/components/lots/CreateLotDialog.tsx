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
import { useCreateLot } from "@/hooks/useLots";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  product_id: z.string().min(1, "Selecione um produto"),
  initial_volume_ml: z.coerce.number().positive("Volume deve ser positivo"),
  supplier_id: z.string().optional(),
  received_at: z.string().optional(),
  expired_at: z.string().optional(),
  expected_samples: z.coerce.number().int().min(1).default(3),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLotDialog({ open, onOpenChange }: CreateLotDialogProps) {
  const createLot = useCreateLot();
  const { data: products = [] } = useMrpProducts();
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_list"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("suppliers")
        .select("id, name")
        .order("name");
      return data || [];
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
      initial_volume_ml: 200000,
      expected_samples: 3,
    },
  });

  const onSubmit = async (data: FormData) => {
    await createLot.mutateAsync({
      product_id: data.product_id,
      initial_volume_ml: data.initial_volume_ml,
      supplier_id: data.supplier_id || null,
      received_at: data.received_at || null,
      expired_at: data.expired_at || null,
      expected_samples: data.expected_samples,
      notes: data.notes || null,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lote de Reagente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select onValueChange={(v) => setValue("product_id", v)} value={watch("product_id")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.product_id && (
              <p className="text-xs text-destructive">{errors.product_id.message}</p>
            )}
          </div>

          {/* Volume e Amostras */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Volume Inicial (ml) *</Label>
              <Input type="number" {...register("initial_volume_ml")} />
              {errors.initial_volume_ml && (
                <p className="text-xs text-destructive">{errors.initial_volume_ml.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Amostras Esperadas</Label>
              <Input type="number" {...register("expected_samples")} />
            </div>
          </div>

          {/* Fornecedor */}
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <Select onValueChange={(v) => setValue("supplier_id", v)} value={watch("supplier_id")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Recebimento</Label>
              <DatePickerInput
                value={watch("received_at") ?? ""}
                onChange={v => setValue("received_at", v)}
                placeholder="Selecionar data"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Validade</Label>
              <DatePickerInput
                value={watch("expired_at") ?? ""}
                onChange={v => setValue("expired_at", v)}
                placeholder="Selecionar data"
              />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea {...register("notes")} placeholder="Observações sobre o lote..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createLot.isPending}>
              {createLot.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Lote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
