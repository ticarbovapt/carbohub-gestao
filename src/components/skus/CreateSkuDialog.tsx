import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CarboButton } from "@/components/ui/carbo-button";
import { useCreateSku } from "@/hooks/useSkus";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  code: z.string().min(3, "Código deve ter pelo menos 3 caracteres"),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  category: z.string().min(1, "Selecione uma categoria"),
  unit: z.string().default("un"),
  packaging_ml: z.coerce.number().positive("Deve ser maior que zero"),
  safety_stock_qty: z.coerce.number().min(0).default(0),
  target_coverage_days: z.coerce.number().min(1).default(30),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateSkuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSkuDialog({ open, onOpenChange }: CreateSkuDialogProps) {
  const createSku = useCreateSku();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      category: "produto_final",
      unit: "un",
      packaging_ml: 100,
      safety_stock_qty: 0,
      target_coverage_days: 30,
      is_active: true,
    },
  });

  const onSubmit = async (values: FormValues) => {
    await createSku.mutateAsync({
      code: values.code,
      name: values.name,
      description: values.description || null,
      category: values.category,
      unit: values.unit,
      packaging_ml: values.packaging_ml,
      safety_stock_qty: values.safety_stock_qty,
      target_coverage_days: values.target_coverage_days,
      is_active: values.is_active,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo SKU</DialogTitle>
          <DialogDescription>Cadastre um novo produto acabado (SKU)</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Identificação */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Identificação
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código *</FormLabel>
                      <FormControl>
                        <Input placeholder="SKU-CZ100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="CarboZé 100ml" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Descrição do produto..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="produto_final">Produto Final</SelectItem>
                          <SelectItem value="reagente">Reagente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <FormLabel>Status</FormLabel>
                      <div className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <span className="text-sm">{field.value ? "Ativo" : "Inativo"}</span>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Embalagem */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Embalagem
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="packaging_ml"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volume (ml) *</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade</FormLabel>
                      <FormControl>
                        <Input placeholder="un" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Parâmetros de Estoque */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Parâmetros de Estoque
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="safety_stock_qty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estoque de Segurança</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="target_coverage_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cobertura Alvo (dias)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="30" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <CarboButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </CarboButton>
              <CarboButton type="submit" disabled={createSku.isPending}>
                {createSku.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Criar SKU
              </CarboButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
