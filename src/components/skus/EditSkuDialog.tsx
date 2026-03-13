import { useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CarboButton } from "@/components/ui/carbo-button";
import { useUpdateSku, Sku } from "@/hooks/useSkus";
import { BomEditor } from "./BomEditor";
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

interface EditSkuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: Sku | null;
}

export function EditSkuDialog({ open, onOpenChange, sku }: EditSkuDialogProps) {
  const updateSku = useUpdateSku();

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

  // Populate form when sku changes
  useEffect(() => {
    if (sku) {
      form.reset({
        code: sku.code,
        name: sku.name,
        description: sku.description || "",
        category: sku.category,
        unit: sku.unit,
        packaging_ml: sku.packaging_ml || 100,
        safety_stock_qty: sku.safety_stock_qty,
        target_coverage_days: sku.target_coverage_days,
        is_active: sku.is_active,
      });
    }
  }, [sku, form]);

  const onSubmit = async (values: FormValues) => {
    if (!sku) return;
    await updateSku.mutateAsync({
      id: sku.id,
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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar SKU — {sku?.code}</DialogTitle>
          <DialogDescription>{sku?.name}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados do SKU</TabsTrigger>
            <TabsTrigger value="bom" className="flex-1">Ficha Técnica (BOM)</TabsTrigger>
          </TabsList>

          {/* Tab 1: SKU Data */}
          <TabsContent value="dados" className="mt-4">
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
                            <Input {...field} />
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
                            <Input {...field} />
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
                          <Textarea rows={2} {...field} />
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
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
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
                            <Input type="number" {...field} />
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
                            <Input {...field} />
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
                            <Input type="number" {...field} />
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
                            <Input type="number" {...field} />
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
                  <CarboButton type="submit" disabled={updateSku.isPending}>
                    {updateSku.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Salvar
                  </CarboButton>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* Tab 2: BOM Editor */}
          <TabsContent value="bom" className="mt-4">
            {sku && <BomEditor skuId={sku.id} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
