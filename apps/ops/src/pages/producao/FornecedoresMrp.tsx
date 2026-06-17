import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Building2, Plus, Pencil, Loader2 } from "lucide-react";
import { SupplierFormDialog } from "@/components/producao/SupplierFormDialog";
import { useSuppliers, type Supplier } from "@/hooks/useSuppliers";

const formatCnpj = (v: string) => v.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5");

export default function FornecedoresMrp() {
  const canEdit = true;
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading, error } = useSuppliers();

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.cnpj.includes(q) || s.legal_name.toLowerCase().includes(q) || s.trade_name.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Fornecedores (MRP)"
          description="Cadastro mestre de fornecedores — consulta automática por CNPJ"
          icon={Building2}
          actions={canEdit ? <CarboButton onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</CarboButton> : undefined}
        />

        <div className="max-w-md"><CarboSearchInput placeholder="Buscar por CNPJ, razão social ou nome fantasia..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando fornecedores…</div>
        ) : error ? (
          <CarboEmptyState icon={Building2} title="Erro ao carregar" description="Não foi possível buscar os fornecedores." />
        ) : filtered.length === 0 ? (
          <CarboEmptyState icon={Building2} title="Nenhum fornecedor" description={suppliers.length === 0 ? "Cadastre o primeiro fornecedor." : "Ajuste a busca."} />
        ) : (
          <div className="overflow-x-auto">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>CNPJ</CarboTableHead><CarboTableHead>Razão Social</CarboTableHead><CarboTableHead>Nome Fantasia</CarboTableHead>
                  <CarboTableHead>Categoria</CarboTableHead><CarboTableHead>Status</CarboTableHead>{canEdit && <CarboTableHead className="w-10" />}
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {filtered.map((s) => (
                  <CarboTableRow key={s.id}>
                    <CarboTableCell><span className="font-mono text-sm">{formatCnpj(s.cnpj)}</span></CarboTableCell>
                    <CarboTableCell><span className="font-medium">{s.legal_name || "—"}</span></CarboTableCell>
                    <CarboTableCell>{s.trade_name || "—"}</CarboTableCell>
                    <CarboTableCell>{s.category || "—"}</CarboTableCell>
                    <CarboTableCell><CarboBadge variant={s.status === "active" ? "success" : "secondary"}>{s.status === "active" ? "Ativo" : "Inativo"}</CarboBadge></CarboTableCell>
                    {canEdit && <CarboTableCell><button onClick={() => setEditSupplier(s)} className="p-2 hover:bg-muted rounded-md"><Pencil className="h-4 w-4" /></button></CarboTableCell>}
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SupplierFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editSupplier && (
        <SupplierFormDialog
          key={editSupplier.id}
          open={!!editSupplier}
          onOpenChange={(v) => { if (!v) setEditSupplier(null); }}
          mode="edit"
          id={editSupplier.id}
          initial={{
            legal_name: editSupplier.legal_name,
            cnpj: editSupplier.cnpj,
            contact: editSupplier.contact,
            email: editSupplier.email,
            phone: editSupplier.phone,
            notes: editSupplier.notes,
          }}
        />
      )}
    </div>
  );
}
