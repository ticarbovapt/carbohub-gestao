import { useState } from "react";
import { Users, Pencil, CheckCircle2, AlertCircle } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboInput } from "@/components/ui/carbo-input";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployeesFinance, useUpsertEmployeeFinance, type EmployeeRow, type EmployeeFinance } from "@/hooks/useEmployeeFinance";

function EditDialog({ row, onClose }: { row: EmployeeRow | null; onClose: () => void }) {
  const upsert = useUpsertEmployeeFinance();
  const [form, setForm] = useState<EmployeeFinance | null>(null);
  // Sincroniza o form quando abre um funcionário
  const current = form && row && form.user_id === row.user_id ? form : row ? { ...row } : null;
  const set = (k: keyof EmployeeFinance, v: string) => current && setForm({ ...current, [k]: v });

  if (!row || !current) return null;

  const save = () => {
    const { team_name, username, email, hasData, ...data } = current as any;
    upsert.mutate(data as EmployeeFinance, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados financeiros — {row.team_name || row.full_name || "Funcionário"}</DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome completo</Label>
            <CarboInput value={current.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <CarboInput value={current.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de chave PIX</Label>
            <Select value={current.pix_type ?? ""} onValueChange={(v) => set("pix_type", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Chave PIX</Label>
            <CarboInput value={current.pix_key ?? ""} onChange={(e) => set("pix_key", e.target.value)} placeholder="Chave PIX" />
          </div>

          <div className="space-y-1.5">
            <Label>Banco</Label>
            <CarboInput value={current.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} placeholder="Nome do banco" />
          </div>
          <div className="space-y-1.5">
            <Label>Código do banco</Label>
            <CarboInput value={current.bank_code ?? ""} onChange={(e) => set("bank_code", e.target.value)} placeholder="Ex.: 341" />
          </div>
          <div className="space-y-1.5">
            <Label>Agência</Label>
            <CarboInput value={current.bank_agency ?? ""} onChange={(e) => set("bank_agency", e.target.value)} placeholder="0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Conta</Label>
            <CarboInput value={current.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="00000-0" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de conta</Label>
            <Select value={current.account_type ?? ""} onValueChange={(v) => set("account_type", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <CarboInput value={current.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Contato de emergência (nome)</Label>
            <CarboInput value={current.emergency_name ?? ""} onChange={(e) => set("emergency_name", e.target.value)} placeholder="Nome" />
          </div>
          <div className="space-y-1.5">
            <Label>Contato de emergência (telefone)</Label>
            <CarboInput value={current.emergency_phone ?? ""} onChange={(e) => set("emergency_phone", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <CarboInput value={current.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anotações" />
          </div>
        </div>

        <DialogFooter>
          <CarboButton variant="outline" onClick={onClose}>Cancelar</CarboButton>
          <CarboButton onClick={save} disabled={upsert.isPending}>{upsert.isPending ? "Salvando…" : "Salvar"}</CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Funcionarios() {
  const { rows, isLoading } = useEmployeesFinance();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EmployeeRow | null>(null);

  const q = search.trim().toLowerCase();
  const list = q
    ? rows.filter((r) => (r.team_name || r.full_name || "").toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q))
    : rows;

  return (
    <div className="space-y-6">
      <CarboPageHeader title="Funcionários" description="Dados financeiros para pagamento (PIX, banco) e contato de emergência." icon={Users} />

      <CarboCard>
        <CarboCardContent className="pt-6 space-y-4">
          <div className="flex justify-end">
            <div className="w-full sm:w-72">
              <CarboSearchInput placeholder="Buscar funcionário…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
          ) : list.length === 0 ? (
            <CarboEmptyState icon={Users} title="Nenhum funcionário" description={search ? "Nenhum encontrado." : "A lista vem da sua equipe cadastrada."} />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Funcionário</CarboTableHead>
                  <CarboTableHead>PIX</CarboTableHead>
                  <CarboTableHead>Banco</CarboTableHead>
                  <CarboTableHead>Telefone</CarboTableHead>
                  <CarboTableHead>Cadastro</CarboTableHead>
                  <CarboTableHead className="text-right">Ação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {list.map((r) => (
                  <CarboTableRow key={r.user_id}>
                    <CarboTableCell className="font-medium">{r.team_name || r.full_name || "—"}</CarboTableCell>
                    <CarboTableCell className="max-w-[200px] truncate">{r.pix_key || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>{r.bank_name ? `${r.bank_name}${r.bank_agency ? ` · ag ${r.bank_agency}` : ""}` : <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>{r.phone || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>
                      {r.hasData
                        ? <CarboBadge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completo</CarboBadge>
                        : <CarboBadge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" /> Pendente</CarboBadge>}
                    </CarboTableCell>
                    <CarboTableCell className="text-right">
                      <CarboButton size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </CarboButton>
                    </CarboTableCell>
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          )}
        </CarboCardContent>
      </CarboCard>

      <EditDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
