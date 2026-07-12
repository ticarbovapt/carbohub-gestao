import { useState } from "react";
import { Plus, Edit2, Trash2, CreditCard, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePaymentMethods, useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod } from "@/hooks/usePaymentMethods";
import { PAYMENT_METHOD_TYPE_LABELS, type PaymentMethod, type PaymentMethodType } from "@/types/purchasing";
import { useAuth } from "@/contexts/AuthContext";

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"];
const isCard = (t: PaymentMethodType) => t === "credito" || t === "debito";

const emptyForm = { apelido: "", tipo: "credito" as PaymentMethodType, bandeira: "", ultimos4: "", titular: "", departamento: "", notes: "" };

export function PaymentMethodsList() {
  const { gestor } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editPM, setEditPM] = useState<PaymentMethod | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: methods = [], isLoading } = usePaymentMethods();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const del = useDeletePaymentMethod();
  const canManage = gestor;

  const openCreate = () => { setForm(emptyForm); setEditPM(null); setShowForm(true); };
  const openEdit = (pm: PaymentMethod) => {
    setForm({
      apelido: pm.apelido, tipo: pm.tipo, bandeira: pm.bandeira || "", ultimos4: pm.ultimos4 || "",
      titular: pm.titular || "", departamento: pm.departamento || "", notes: pm.notes || "",
    });
    setEditPM(pm); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.apelido.trim()) return;
    const payload = {
      apelido: form.apelido.trim(),
      tipo: form.tipo,
      bandeira: isCard(form.tipo) ? (form.bandeira || null) : null,
      ultimos4: isCard(form.tipo) ? (form.ultimos4 || null) : null,
      titular: form.titular || null,
      departamento: form.departamento || null,
      notes: form.notes || null,
    };
    if (editPM) await update.mutateAsync({ id: editPM.id, ...payload });
    else await create.mutateAsync(payload);
    setShowForm(false);
  };

  return (
    <CarboCard variant="elevated" padding="default">
      <CarboCardHeader>
        <div className="flex items-center justify-between w-full">
          <CarboCardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Cartões e Formas de Pagamento
          </CarboCardTitle>
          {canManage && (
            <Button onClick={openCreate} className="gap-2 carbo-gradient text-white" size="sm">
              <Plus className="h-4 w-4" /> Nova forma de pagamento
            </Button>
          )}
        </div>
      </CarboCardHeader>
      <CarboCardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Por segurança guardamos apenas os <strong>4 últimos dígitos</strong> e a bandeira — nunca o número completo.
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apelido</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Identificação</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-[80px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : methods.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma forma de pagamento cadastrada</TableCell></TableRow>
              ) : (
                methods.map((pm) => (
                  <TableRow key={pm.id}>
                    <TableCell className="font-medium">{pm.apelido}</TableCell>
                    <TableCell className="text-sm">{PAYMENT_METHOD_TYPE_LABELS[pm.tipo]}</TableCell>
                    <TableCell className="text-sm">
                      {isCard(pm.tipo)
                        ? [pm.bandeira, pm.ultimos4 ? `••${pm.ultimos4}` : null].filter(Boolean).join(" ") || "—"
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pm.departamento || "—"}</TableCell>
                    <TableCell>
                      <CarboBadge variant={pm.is_active ? "success" : "secondary"}>
                        {pm.is_active ? "Ativo" : "Inativo"}
                      </CarboBadge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pm)} title="Editar">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => update.mutate({ id: pm.id, is_active: !pm.is_active })} title={pm.is_active ? "Inativar" : "Ativar"}>
                            {pm.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-success" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(pm.id)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CarboCardContent>

      {/* Create/Edit */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editPM ? "Editar forma de pagamento" : "Nova forma de pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Apelido *</Label>
              <Input value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value })} placeholder='Ex: "Nubank TI", "Inter PJ"' />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as PaymentMethodType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Setor (opcional)</Label>
                <Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="TI, Ops…" />
              </div>
            </div>
            {isCard(form.tipo) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bandeira</Label>
                  <Select value={form.bandeira} onValueChange={(v) => setForm({ ...form, bandeira: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {BANDEIRAS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>4 últimos dígitos</Label>
                  <Input
                    value={form.ultimos4}
                    onChange={(e) => setForm({ ...form, ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="1234" inputMode="numeric" maxLength={4}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>Titular / Observação (opcional)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Dono, dia de vencimento da fatura…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.apelido.trim() || create.isPending || update.isPending} className="carbo-gradient text-white">
              {editPM ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Remover esta forma de pagamento? Compras/assinaturas já vinculadas mantêm o histórico.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => { if (deleteId) { await del.mutateAsync(deleteId); setDeleteId(null); } }} disabled={del.isPending}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CarboCard>
  );
}
