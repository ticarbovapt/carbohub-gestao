import { useState } from "react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import {
  useDescarbClients,
  useCreateDescarbClient,
  useUpdateDescarbClient,
  type DescarbClient,
} from "@/hooks/useDescarbClients";
import { useDescarbVehicles } from "@/hooks/useDescarbVehicles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CarboCard } from "@/components/ui/carbo-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Users, Search, Plus, Pencil, Phone, Mail, MapPin, Car } from "lucide-react";

function ClienteForm({
  licenseeId,
  cliente,
  onClose,
}: {
  licenseeId: string;
  cliente?: DescarbClient;
  onClose: () => void;
}) {
  const create = useCreateDescarbClient();
  const update = useUpdateDescarbClient();
  const [form, setForm] = useState({
    name: cliente?.name ?? "",
    federal_code: cliente?.federal_code ?? "",
    phone: cliente?.phone ?? "",
    email: cliente?.email ?? "",
    city: cliente?.city ?? "",
    state: cliente?.state ?? "",
    notes: cliente?.notes ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cliente) {
      await update.mutateAsync({ id: cliente.id, licensee_id: licenseeId, ...form });
    } else {
      await create.mutateAsync({ licensee_id: licenseeId, ...form });
    }
    onClose();
  };

  const loading = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Nome *</Label>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CPF / CNPJ</Label><Input value={form.federal_code} onChange={e => setForm(f => ({ ...f, federal_code: e.target.value }))} /></div>
        <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" /></div>
      </div>
      <div>
        <Label>E-mail</Label>
        <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Label>Cidade</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
        <div><Label>UF</Label><Input maxLength={2} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} className="uppercase" /></div>
      </div>
      <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={loading}>{loading ? "Salvando..." : cliente ? "Salvar" : "Cadastrar"}</Button>
      </div>
    </form>
  );
}

function ClienteCard({
  cliente,
  licenseeId,
  onEdit,
}: {
  cliente: DescarbClient;
  licenseeId: string;
  onEdit: (c: DescarbClient) => void;
}) {
  const { data: veiculos = [] } = useDescarbVehicles(licenseeId, cliente.id);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{cliente.name}</p>
          {cliente.federal_code && (
            <p className="text-xs text-muted-foreground font-mono">{cliente.federal_code}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => onEdit(cliente)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1">
        {cliente.phone && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 flex-shrink-0" /> {cliente.phone}
          </p>
        )}
        {cliente.email && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground truncate">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" /> {cliente.email}
          </p>
        )}
        {(cliente.city || cliente.state) && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {[cliente.city, cliente.state].filter(Boolean).join("/")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Car className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{veiculos.length} veículo{veiculos.length !== 1 ? "s" : ""}</span>
        {veiculos.length > 0 && (
          <div className="flex gap-1 flex-wrap ml-1">
            {veiculos.slice(0, 3).map(v => (
              <Badge key={v.id} variant="outline" className="font-mono text-[9px] px-1.5 py-0">{v.license_plate}</Badge>
            ))}
            {veiculos.length > 3 && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">+{veiculos.length - 3}</Badge>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LicenseeClientes() {
  const { data: status } = useLicenseeStatus();
  const licenseeId = status?.licensee_id;
  const { data: clientes = [], isLoading } = useDescarbClients(licenseeId);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<DescarbClient | undefined>();

  const filtered = clientes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.federal_code ?? "").includes(search)
  );

  function openEdit(c: DescarbClient) { setEditCliente(c); setDialogOpen(true); }
  function openNew() { setEditCliente(undefined); setDialogOpen(true); }

  return (
    <LicenseeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{clientes.length} clientes cadastrados</p>
          </div>
          <Button onClick={openNew} className="gap-2 bg-area-licensee hover:bg-area-licensee/90" disabled={!licenseeId}>
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, CPF, telefone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <CarboCard className="flex flex-col items-center justify-center py-14 gap-3">
            <Users className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">
              {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </p>
            {!search && (
              <Button onClick={openNew} variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Cadastrar primeiro cliente
              </Button>
            )}
          </CarboCard>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <ClienteCard key={c.id} cliente={c} licenseeId={licenseeId!} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          {licenseeId && (
            <ClienteForm
              licenseeId={licenseeId}
              cliente={editCliente}
              onClose={() => setDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </LicenseeLayout>
  );
}
