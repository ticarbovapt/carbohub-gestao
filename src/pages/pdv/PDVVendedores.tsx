import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, ChevronLeft, Pencil, ToggleLeft, ToggleRight, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVStatus } from "@/hooks/usePDV";
import {
  usePDVSellers,
  useCreatePDVSeller,
  useUpdatePDVSeller,
  type PDVSeller,
} from "@/hooks/usePDVSellers";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface SellerForm {
  name: string;
  email: string;
  phone: string;
  is_manager: boolean;
  commission_rate: string;
  rv_vendedor_name: string;
  notes: string;
}

const emptyForm = (): SellerForm => ({
  name: "",
  email: "",
  phone: "",
  is_manager: false,
  commission_rate: "0",
  rv_vendedor_name: "",
  notes: "",
});

export default function PDVVendedores() {
  const navigate = useNavigate();
  const { data: pdvStatus } = usePDVStatus();
  const pdvId = pdvStatus?.pdv?.id;
  const { data: sellers = [], isLoading } = usePDVSellers(pdvId);
  const createSeller = useCreatePDVSeller();
  const updateSeller = useUpdatePDVSeller();

  const [createOpen, setCreateOpen] = useState(false);
  const [editSeller, setEditSeller] = useState<PDVSeller | null>(null);
  const [form, setForm] = useState<SellerForm>(emptyForm());

  function openCreate() {
    setForm(emptyForm());
    setCreateOpen(true);
  }

  function openEdit(s: PDVSeller) {
    setEditSeller(s);
    setForm({
      name: s.name,
      email: s.email ?? "",
      phone: s.phone ?? "",
      is_manager: s.is_manager,
      commission_rate: String(s.commission_rate),
      rv_vendedor_name: s.rv_vendedor_name ?? "",
      notes: s.notes ?? "",
    });
  }

  async function handleCreate() {
    if (!pdvId || !form.name.trim()) return;
    await createSeller.mutateAsync({
      pdv_id: pdvId,
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      is_manager: form.is_manager,
      commission_rate: parseFloat(form.commission_rate) || 0,
      rv_vendedor_name: form.rv_vendedor_name || null,
      notes: form.notes || null,
    });
    setCreateOpen(false);
  }

  async function handleUpdate() {
    if (!editSeller || !pdvId) return;
    await updateSeller.mutateAsync({
      id: editSeller.id,
      pdv_id: pdvId,
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      is_manager: form.is_manager,
      commission_rate: parseFloat(form.commission_rate) || 0,
      rv_vendedor_name: form.rv_vendedor_name || null,
      notes: form.notes || null,
    });
    setEditSeller(null);
  }

  async function toggleActive(s: PDVSeller) {
    if (!pdvId) return;
    await updateSeller.mutateAsync({ id: s.id, pdv_id: pdvId, is_active: !s.is_active });
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <CarboSkeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <CarboSkeleton key={i} className="h-20" />)}
      </div>
    );
  }

  const SellerFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label className="text-sm">Nome *</Label>
          <Input
            className="mt-1"
            placeholder="Nome do vendedor"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-sm">E-mail</Label>
          <Input
            className="mt-1"
            type="email"
            placeholder="email@exemplo.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-sm">Telefone</Label>
          <Input
            className="mt-1"
            placeholder="(00) 00000-0000"
            inputMode="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-sm">Comissão (%)</Label>
          <Input
            className="mt-1"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.commission_rate}
            onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-sm">Vendedor RV (Grupo Carbo)</Label>
          <Input
            className="mt-1"
            placeholder="Nome do RV vinculado"
            value={form.rv_vendedor_name}
            onChange={e => setForm(f => ({ ...f, rv_vendedor_name: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-sm">Observações</Label>
          <Input
            className="mt-1"
            placeholder="Opcional..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Manager do PDV</p>
            <p className="text-xs text-muted-foreground">Pode criar/editar outros vendedores e ver todas as vendas</p>
          </div>
          <Switch
            checked={form.is_manager}
            onCheckedChange={v => setForm(f => ({ ...f, is_manager: v }))}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/dashboard")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-lg">Vendedores</h1>
        </div>
        <Button size="sm" className="ml-auto carbo-gradient gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Vendedor
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {sellers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium mb-1">Nenhum vendedor cadastrado</p>
            <p className="text-sm mb-4">Crie o primeiro vendedor para começar a registrar vendas.</p>
            <Button onClick={openCreate} className="carbo-gradient">
              <Plus className="h-4 w-4 mr-1.5" /> Criar Vendedor
            </Button>
          </div>
        ) : (
          sellers.map(s => (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                !s.is_active && "opacity-60"
              )}
            >
              {/* Avatar + info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-full carbo-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {s.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.is_manager && (
                      <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">Manager</Badge>
                    )}
                    {!s.is_active && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Inativo</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {s.email && <span>{s.email}</span>}
                    {s.phone && <span>{s.phone}</span>}
                    {s.rv_vendedor_name && <span>RV: {s.rv_vendedor_name}</span>}
                  </div>
                </div>
              </div>

              {/* Commission */}
              <div className="text-center sm:text-right px-3">
                <p className="text-lg font-bold text-primary">{s.commission_rate}%</p>
                <p className="text-[10px] text-muted-foreground">comissão</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => openEdit(s)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 gap-1.5", s.is_active ? "text-muted-foreground" : "text-primary")}
                  onClick={() => toggleActive(s)}
                  disabled={updateSeller.isPending}
                >
                  {s.is_active ? (
                    <><ToggleLeft className="h-4 w-4" /> Desativar</>
                  ) : (
                    <><ToggleRight className="h-4 w-4" /> Ativar</>
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Novo Vendedor</DialogTitle>
          </DialogHeader>
          <SellerFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              className="carbo-gradient"
              onClick={handleCreate}
              disabled={createSeller.isPending || !form.name.trim()}
            >
              {createSeller.isPending ? "Criando..." : "Criar Vendedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editSeller} onOpenChange={v => { if (!v) setEditSeller(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Vendedor</DialogTitle>
          </DialogHeader>
          <SellerFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSeller(null)}>Cancelar</Button>
            <Button
              className="carbo-gradient"
              onClick={handleUpdate}
              disabled={updateSeller.isPending || !form.name.trim()}
            >
              {updateSeller.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
