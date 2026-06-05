import { useState } from "react";
import { Plus, Pencil, Trash2, Save, X, Link2, Info, Zap, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const PLATFORMS = [
  { value: "",              label: "Todas as plataformas" },
  { value: "mercadolivre",  label: "Mercado Livre" },
  { value: "amazon",        label: "Amazon" },
  { value: "nuvemshop",     label: "Nuvemshop" },
  { value: "shopee",        label: "Shopee" },
  { value: "tiktok",        label: "TikTok Shop" },
  { value: "lp",            label: "Landing Page / Vindi" },
];

interface Mapping {
  id:            string;
  platform:      string | null;
  platform_sku:  string;
  product_id:    string;
  units_per_kit: number;
  description:   string | null;
  is_active:     boolean;
  mrp_products?: { name: string; product_code: string; stock_unit: string } | null;
}

interface FormState {
  platform:      string;
  platform_sku:  string;
  product_id:    string;
  units_per_kit: string;
  description:   string;
}

const EMPTY_FORM: FormState = {
  platform:      "",
  platform_sku:  "",
  product_id:    "",
  units_per_kit: "1",
  description:   "",
};

export function SkuMappingConfig() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["sku-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sku_product_mappings" as never)
        .select("*, mrp_products:product_id(name, product_code, stock_unit)")
        .order("platform", { ascending: true, nullsFirst: false })
        .order("platform_sku");
      if (error) throw error;
      return (data || []) as Mapping[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["mrp-products-final"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mrp_products")
        .select("id, name, product_code, stock_unit")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // SKUs que já chegaram em pedidos do e-commerce mas ainda não têm
  // mapeamento ativo (nem explícito, nem auto-match por product_code).
  // Enquanto um SKU estiver aqui, as vendas dele NÃO deduzem estoque.
  const { data: pendingSkus = [] } = useQuery({
    queryKey: ["pending-sku-mappings", mappings.length, products.length],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("ecommerce_orders" as never)
        .select("platform, product_sku")
        .not("product_sku", "is", null)
        .order("ordered_at", { ascending: false })
        .limit(2000);

      const rows = (orders || []) as { platform: string; product_sku: string }[];
      if (rows.length === 0) return [];

      const productCodes = new Set(products.map(p => p.product_code));
      const activeMappings = (mappings as Mapping[]).filter(m => m.is_active);

      const isMapped = (platform: string, sku: string) => {
        if (productCodes.has(sku)) return true; // auto-match por código interno
        return activeMappings.some(
          m => m.platform_sku === sku && (m.platform === platform || m.platform == null),
        );
      };

      const agg = new Map<string, { platform: string; product_sku: string; count: number }>();
      for (const r of rows) {
        if (!r.product_sku || isMapped(r.platform, r.product_sku)) continue;
        const key = `${r.platform}::${r.product_sku}`;
        const cur = agg.get(key);
        if (cur) cur.count += 1;
        else agg.set(key, { platform: r.platform, product_sku: r.product_sku, count: 1 });
      }
      return [...agg.values()].sort((a, b) => b.count - a.count);
    },
    enabled: products.length >= 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        platform:      form.platform || null,
        platform_sku:  form.platform_sku.trim(),
        product_id:    form.product_id,
        units_per_kit: Number(form.units_per_kit),
        description:   form.description.trim() || null,
        updated_at:    new Date().toISOString(),
      };
      if (editId) {
        const { error } = await (supabase as any).from("sku_product_mappings").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("sku_product_mappings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sku-mappings"] });
      toast.success(editId ? "Mapeamento atualizado" : "Mapeamento criado");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("sku_product_mappings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sku-mappings"] });
      toast.success("Mapeamento removido");
    },
    onError: (e: any) => toast.error("Erro ao remover", { description: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("sku_product_mappings").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sku-mappings"] }),
  });

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openFromPending = (platform: string, sku: string) => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, platform: platform || "", platform_sku: sku });
    setDialogOpen(true);
  };

  const openEdit = (m: Mapping) => {
    setEditId(m.id);
    setForm({
      platform:      m.platform || "",
      platform_sku:  m.platform_sku,
      product_id:    m.product_id,
      units_per_kit: String(m.units_per_kit),
      description:   m.description || "",
    });
    setDialogOpen(true);
  };

  const isValid = form.platform_sku.trim() && form.product_id && Number(form.units_per_kit) > 0;

  const platformLabel = (p: string | null) =>
    PLATFORMS.find(x => x.value === (p || ""))?.label ?? p ?? "Todas";

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300/90">
          <p className="font-medium mb-0.5">Como funciona o mapeamento</p>
          <p className="text-xs text-muted-foreground">
            O sistema tenta deduzir o estoque CD SP em duas etapas: primeiro busca um mapeamento
            configurado abaixo; se não encontrar, tenta combinar o SKU da plataforma diretamente com o
            <strong className="text-foreground"> código interno do produto</strong> (1 vendido = 1 deduzido).
            Use mapeamentos explícitos para kits ou quando o SKU da plataforma for diferente do código interno.
          </p>
        </div>
      </div>

      {/* SKUs aguardando mapeamento — vendas que ainda não deduzem estoque */}
      {pendingSkus.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">SKUs aguardando mapeamento</span>
            <CarboBadge variant="destructive">{pendingSkus.length}</CarboBadge>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 divide-y divide-amber-500/15">
            {pendingSkus.map(s => (
              <div key={`${s.platform}::${s.product_sku}`} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                <code className="text-sm font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                  {s.product_sku}
                </code>
                <CarboBadge variant="secondary">{platformLabel(s.platform)}</CarboBadge>
                <span className="text-xs text-muted-foreground">
                  {s.count} pedido{s.count > 1 ? "s" : ""} sem dedução de estoque
                </span>
                <Button
                  size="sm"
                  className="ml-auto gap-1.5 carbo-gradient text-white"
                  onClick={() => openFromPending(s.platform, s.product_sku)}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Mapear agora
                </Button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Estes SKUs apareceram em vendas mas ainda não estão ligados a nenhum produto.
            Enquanto não forem mapeados, as vendas deles <strong className="text-amber-400">não deduzem o estoque CD SP</strong>.
          </p>
        </div>
      )}

      {/* Auto-match: produtos com product_code */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-carbo-green" />
          <span className="text-sm font-medium">Auto-match por código interno</span>
          <span className="text-xs text-muted-foreground">(sem configuração necessária)</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border">
              <code className="text-xs font-mono text-carbo-green font-semibold shrink-0">{p.product_code}</code>
              <span className="text-xs text-muted-foreground">→</span>
              <span className="text-xs font-medium truncate">{p.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0">× 1 {p.stock_unit}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Se a plataforma enviar exatamente um desses códigos como SKU, a dedução é automática (1 unidade por venda).
          Para kits ou SKUs diferentes, crie um mapeamento abaixo.
        </p>
      </div>

      {/* Mapeamentos explícitos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-carbo-blue" />
            <span className="text-sm font-medium">Mapeamentos explícitos</span>
            <span className="text-xs text-muted-foreground">(SKUs de plataforma e kits)</span>
          </div>
          <Button size="sm" onClick={openNew} className="gap-1.5 carbo-gradient text-white">
            <Plus className="h-3.5 w-3.5" />
            Novo Mapeamento
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : mappings.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-8 text-center">
              <Link2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum mapeamento explícito ainda</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adicione quando o SKU da plataforma for diferente do código interno ou para kits
              </p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {mappings.map(m => {
            const prod = m.mrp_products as any;
            return (
              <CarboCard key={m.id} className={!m.is_active ? "opacity-50" : ""}>
                <CarboCardContent className="py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <code className="text-sm font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                          {m.platform_sku}
                        </code>
                        <CarboBadge variant="secondary">{platformLabel(m.platform)}</CarboBadge>
                        {!m.is_active && <CarboBadge variant="destructive">Inativo</CarboBadge>}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="text-carbo-blue">→</span>
                        <span className="font-medium text-foreground">{prod?.name ?? "Produto não encontrado"}</span>
                        <span className="text-muted-foreground">({prod?.product_code})</span>
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-muted font-semibold text-foreground">
                          × {m.units_per_kit} {prod?.stock_unit ?? "un"}/kit
                        </span>
                      </div>
                      {m.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{m.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => toggleActive.mutate({ id: m.id, is_active: !m.is_active })}
                        title={m.is_active ? "Desativar" : "Ativar"}
                      >
                        <span className={`h-2 w-2 rounded-full ${m.is_active ? "bg-carbo-green" : "bg-muted-foreground"}`} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Remover este mapeamento?")) deleteMutation.mutate(m.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CarboCardContent>
              </CarboCard>
            );
          })}
        </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-carbo-blue" />
              {editId ? "Editar Mapeamento" : "Novo Mapeamento de SKU"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plataforma</Label>
              <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as plataformas" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                "Todas as plataformas" funciona para qualquer plataforma com esse SKU
              </p>
            </div>

            <div>
              <Label>SKU da plataforma <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ex: MLB-1234567, B08XYZ, CZ-SACHE-KIT10"
                value={form.platform_sku}
                onChange={e => setForm(f => ({ ...f, platform_sku: e.target.value }))}
              />
            </div>

            <div>
              <Label>Produto do estoque CD SP <span className="text-destructive">*</span></Label>
              <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">({p.product_code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Unidades por kit vendido <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="1"
                value={form.units_per_kit}
                onChange={e => setForm(f => ({ ...f, units_per_kit: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Quantas unidades do produto deduzir do estoque CD SP por 1 item vendido
              </p>
            </div>

            <div>
              <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="Ex: Kit 10 sachês 10ml, Kit 5 frascos 100ml..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!isValid || saveMutation.isPending}
              className="carbo-gradient text-white"
            >
              <Save className="h-4 w-4 mr-1" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
