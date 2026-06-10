import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Building2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/mrp/suppliers → MrpSuppliers "Fornecedores (MRP)") — dados MOCK.

const formatCnpj = (v: string) => v.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5");

interface Supplier { id: string; cnpj: string; legal_name: string; trade_name: string; category: string; status: "active" | "inactive"; }
const MOCK: Supplier[] = [
  { id: "1", cnpj: "12345678000190", legal_name: "Química Sul Indústria LTDA", trade_name: "QuímicaSul", category: "Reagentes", status: "active" },
  { id: "2", cnpj: "98765432000110", legal_name: "BioReagentes Comércio S.A.", trade_name: "BioReagentes", category: "Reagentes", status: "active" },
  { id: "3", cnpj: "45678912000133", legal_name: "Embalagens Norte LTDA", trade_name: "EmbaNorte", category: "Embalagem", status: "active" },
  { id: "4", cnpj: "32165498000177", legal_name: "Insumos Brasil EIRELI", trade_name: "InsumosBR", category: "Insumos", status: "inactive" },
];

export default function FornecedoresMrp() {
  const canEdit = true;
  const [search, setSearch] = useState("");

  const filtered = MOCK.filter((s) => {
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
          actions={canEdit ? <CarboButton onClick={() => toast("Novo Fornecedor (em breve)")}><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</CarboButton> : undefined}
        />

        <div className="max-w-md"><CarboSearchInput placeholder="Buscar por CNPJ, razão social ou nome fantasia..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>

        {filtered.length === 0 ? (
          <CarboEmptyState icon={Building2} title="Nenhum fornecedor" description="Ajuste a busca." />
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
                    {canEdit && <CarboTableCell><button onClick={() => toast("Editar fornecedor (em breve)")} className="p-2 hover:bg-muted rounded-md"><Pencil className="h-4 w-4" /></button></CarboTableCell>}
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Cadastro real e consulta CNPJ entram na fase de lógica.</p>
      </div>
    </div>
  );
}
