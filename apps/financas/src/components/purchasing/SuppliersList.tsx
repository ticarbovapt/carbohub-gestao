import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Building2, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, type Supplier } from "@/hooks/useSuppliers";
import { useAuth } from "@/contexts/AuthContext";

export function SuppliersList() {
  const { isAdmin, isCeo, isAnyGestor } = useAuth();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const canManage = isAdmin || isCeo || isAnyGestor;

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.document_number || "").includes(search) ||
    (s.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const [form, setForm] = useState({
    name: "", legal_name: "", document_number: "", email: "", phone: "",
    city: "", state: "", zip_code: "", category: "geral", notes: "",
  });

  const openCreate = () => {
    setForm({ name: "", legal_name: "", document_number: "", email: "", phone: "", city: "", state: "", zip_code: "", category: "geral", notes: "" });
    setEditSupplier(null);
    setShowForm(true);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name, legal_name: s.legal_name || "", document_number: s.document_number || "",
      email: s.email || "", phone: s.phone || "", city: s.city || "", state: s.state || "",
      zip_code: s.zip_code || "", category: s.category || "geral", notes: s.notes || "",
    });
    setEditSupplier(s);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editSupplier) {
      await updateSupplier.mutateAsync({ id: editSupplier.id, ...form });
    } else {
      await createSupplier.mutateAsync(form);
    }
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteSupplier.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <CarboCard variant="elevated" padding="default">
      <CarboCardHeader>
        <div className="flex items-center justify-between w-full">
          <CarboCardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Fornecedores Cadastrados
          </CarboCardTitle>
          {canManage && (
            <Button onClick={openCreate} className="gap-2 carbo-gradient text-white" size="sm">
              <Plus className="h-4 w-4" /> Novo Fornecedor
            </Button>
          )}
        </div>
      </CarboCardHeader>
      <CarboCardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CNPJ ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-[80px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum fornecedor encontrado</TableCell></TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{s.document_number || "—"}</TableCell>
                    <TableCell>
                      {s.city ? (
                        <span className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {s.city}{s.state ? `/${s.state}` : ""}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {s.phone ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {s.phone}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <CarboBadge variant={s.is_active ? "success" : "secondary"}>
                        {s.is_active ? "Ativo" : "Inativo"}
                      </CarboBadge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} fornecedor(es) encontrado(s)</p>
      </CarboCardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome / Razão Social *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do fornecedor" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CNPJ/CPF</Label>
                <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 0000-0000" />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@fornecedor.com" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>Estado</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createSupplier.isPending || updateSupplier.isPending} className="carbo-gradient text-white">
              {editSupplier ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSupplier.isPending}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CarboCard>
  );
}
