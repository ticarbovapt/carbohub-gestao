import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Factory, Plus, Search, Loader2, Pencil } from "lucide-react";
import { useMrpSuppliers, useCnpjLookup, useCreateMrpSupplier, useUpdateMrpSupplier, MrpSupplier } from "@/hooks/useMrpSuppliers";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const SUPPLIER_CATEGORIES = ["Reagentes", "Embalagem", "Logística", "Serviços", "Equipamentos", "TI", "Outro"];

function formatCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function SupplierForm({ supplier, onClose }: { supplier?: MrpSupplier; onClose: () => void }) {
  const createMut = useCreateMrpSupplier();
  const updateMut = useUpdateMrpSupplier();
  const cnpjLookup = useCnpjLookup();

  const [form, setForm] = useState({
    cnpj: supplier?.cnpj || "",
    legal_name: supplier?.legal_name || "",
    trade_name: supplier?.trade_name || "",
    category: supplier?.category || "",
    notes: supplier?.notes || "",
    status: supplier?.status || "active",
  });
  const [address, setAddress] = useState<Record<string, string>>(supplier?.address as Record<string, string> || {});
  const [phones, setPhones] = useState<string[]>((supplier?.phones as string[]) || []);
  const [emails, setEmails] = useState<string[]>((supplier?.emails as string[]) || []);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(supplier?.raw as Record<string, unknown> || null);

  const handleCnpjLookup = async () => {
    const cleanCnpj = form.cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) { toast.error("CNPJ deve ter 14 dígitos"); return; }
    try {
      const data = await cnpjLookup.mutateAsync(cleanCnpj);
      setForm(f => ({
        ...f,
        legal_name: data.legal_name || f.legal_name,
        trade_name: data.trade_name || f.trade_name,
      }));
      if (data.address) setAddress(data.address);
      if (data.phones) setPhones(data.phones);
      if (data.emails) setEmails(data.emails);
      setRawData(data.raw || null);
      toast.success("Dados do CNPJ carregados!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      cnpj: form.cnpj.replace(/\D/g, ""),
      legal_name: form.legal_name || null,
      trade_name: form.trade_name || null,
      category: form.category || null,
      notes: form.notes || null,
      status: form.status,
      address: Object.keys(address).length ? (address as any) : null,
      phones: phones.length ? (phones as any) : null,
      emails: emails.length ? (emails as any) : null,
      raw: rawData as any,
    };
    if (supplier) {
      await updateMut.mutateAsync({ id: supplier.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>CNPJ *</Label>
        <div className="flex gap-2">
          <Input
            value={form.cnpj}
            onChange={e => setForm(f => ({ ...f, cnpj: formatCnpj(e.target.value) }))}
            placeholder="00.000.000/0000-00"
            required
            disabled={!!supplier}
          />
          {!supplier && (
            <CarboButton type="button" variant="outline" onClick={handleCnpjLookup} disabled={cnpjLookup.isPending}>
              {cnpjLookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </CarboButton>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Razão Social</Label><Input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} /></div>
        <div><Label>Nome Fantasia</Label><Input value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {Object.keys(address).length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <p className="font-medium mb-1">Endereço (via CNPJ)</p>
          <p>{address.street}{address.number ? `, ${address.number}` : ""}</p>
          <p>{address.neighborhood} — {address.city}/{address.state} CEP {address.zip}</p>
        </div>
      )}
      <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
      <div className="flex justify-end gap-2 pt-2">
        <CarboButton variant="outline" type="button" onClick={onClose}>Cancelar</CarboButton>
        <CarboButton type="submit" loading={createMut.isPending || updateMut.isPending}>
          {supplier ? "Salvar" : "Cadastrar Fornecedor"}
        </CarboButton>
      </div>
    </form>
  );
}

export default function MrpSuppliers() {
  const { isAdmin, isCeo } = useAuth();
  const { data: suppliers = [], isLoading } = useMrpSuppliers();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<MrpSupplier | undefined>();

  const canEdit = isAdmin || isCeo;

  const filtered = suppliers.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.cnpj.includes(q) || s.legal_name?.toLowerCase().includes(q) || s.trade_name?.toLowerCase().includes(q);
  });

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Fornecedores (MRP)"
          description="Cadastro mestre de fornecedores — consulta automática por CNPJ"
          icon={Factory}
          actions={canEdit ? (
            <CarboButton onClick={() => { setEditSupplier(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Fornecedor
            </CarboButton>
          ) : undefined}
        />
        <div className="max-w-md">
          <CarboSearchInput placeholder="Buscar por CNPJ, razão social..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <CarboCard padding="none"><div className="p-6 space-y-4">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-14 w-full" />)}</div></CarboCard>
        ) : filtered.length === 0 ? (
          <CarboCard>
            <CarboEmptyState icon={Factory} title="Nenhum fornecedor" description="Cadastre seu primeiro fornecedor" action={canEdit ? { label: "Novo Fornecedor", onClick: () => { setEditSupplier(undefined); setDialogOpen(true); } } : undefined} />
          </CarboCard>
        ) : (
          <CarboTable>
            <CarboTableHeader>
              <CarboTableRow>
                <CarboTableHead>CNPJ</CarboTableHead>
                <CarboTableHead>Razão Social</CarboTableHead>
                <CarboTableHead>Nome Fantasia</CarboTableHead>
                <CarboTableHead>Categoria</CarboTableHead>
                <CarboTableHead>Status</CarboTableHead>
                {canEdit && <CarboTableHead className="w-10"></CarboTableHead>}
              </CarboTableRow>
            </CarboTableHeader>
            <CarboTableBody>
              {filtered.map(s => (
                <CarboTableRow key={s.id}>
                  <CarboTableCell><span className="font-mono text-sm">{formatCnpj(s.cnpj)}</span></CarboTableCell>
                  <CarboTableCell><span className="font-medium">{s.legal_name || "—"}</span></CarboTableCell>
                  <CarboTableCell>{s.trade_name || "—"}</CarboTableCell>
                  <CarboTableCell>{s.category || "—"}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={s.status === "active" ? "success" : "secondary"}>{s.status === "active" ? "Ativo" : "Inativo"}</CarboBadge></CarboTableCell>
                  {canEdit && (
                    <CarboTableCell>
                      <button onClick={() => { setEditSupplier(s); setDialogOpen(true); }} className="p-2 hover:bg-muted rounded-md"><Pencil className="h-4 w-4" /></button>
                    </CarboTableCell>
                  )}
                </CarboTableRow>
              ))}
            </CarboTableBody>
          </CarboTable>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <SupplierForm supplier={editSupplier} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
}
