import { useState } from "react";
import { Users, Pencil, CheckCircle2, AlertCircle, UserPlus, Link2 } from "lucide-react";
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
import { useEmployeesFinance, useUpsertEmployeeFinance, type EmployeeRow, type EmployeeFinance, type SystemProfile } from "@/hooks/useEmployeeFinance";

const NO_USER = "__none__";

function EditDialog({
  open, initial, title, allowLink, unlinkedProfiles, onClose,
}: {
  open: boolean; initial: EmployeeFinance | null; title: string; allowLink: boolean;
  unlinkedProfiles: SystemProfile[]; onClose: () => void;
}) {
  const upsert = useUpsertEmployeeFinance();
  const [form, setForm] = useState<EmployeeFinance | null>(null);
  const [lastKey, setLastKey] = useState<string>("");
  // Reinicia o form ao abrir outro funcionário
  const key = (initial?.id ?? "") + "|" + (initial?.user_id ?? "") + "|" + (initial?.full_name ?? "");
  if (open && initial && key !== lastKey) { setLastKey(key); setForm({ ...initial }); }
  const f = form;
  const set = (k: keyof EmployeeFinance, v: string | null) => f && setForm({ ...f, [k]: v });

  if (!open || !f) return null;

  const save = () => {
    if (!f.full_name || !f.full_name.trim()) { return; }
    upsert.mutate(f, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome completo *</Label>
            <CarboInput value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <CarboInput value={f.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
          </div>

          {allowLink && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Vincular usuário do sistema (opcional)</Label>
              <Select value={f.user_id ?? NO_USER} onValueChange={(v) => set("user_id", v === NO_USER ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Sem usuário vinculado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_USER}>Sem usuário vinculado</SelectItem>
                  {unlinkedProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.username || p.email || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Se a pessoa já é usuária do sistema, vincule aqui. Dá pra criar o funcionário sem usuário e vincular depois.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tipo de chave PIX</Label>
            <Select value={f.pix_type ?? ""} onValueChange={(v) => set("pix_type", v)}>
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
            <CarboInput value={f.pix_key ?? ""} onChange={(e) => set("pix_key", e.target.value)} placeholder="Chave PIX" />
          </div>

          <div className="space-y-1.5">
            <Label>Banco</Label>
            <CarboInput value={f.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} placeholder="Nome do banco" />
          </div>
          <div className="space-y-1.5">
            <Label>Código do banco</Label>
            <CarboInput value={f.bank_code ?? ""} onChange={(e) => set("bank_code", e.target.value)} placeholder="Ex.: 341" />
          </div>
          <div className="space-y-1.5">
            <Label>Agência</Label>
            <CarboInput value={f.bank_agency ?? ""} onChange={(e) => set("bank_agency", e.target.value)} placeholder="0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Conta</Label>
            <CarboInput value={f.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="00000-0" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de conta</Label>
            <Select value={f.account_type ?? ""} onValueChange={(v) => set("account_type", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <CarboInput value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Contato de emergência (nome)</Label>
            <CarboInput value={f.emergency_name ?? ""} onChange={(e) => set("emergency_name", e.target.value)} placeholder="Nome" />
          </div>
          <div className="space-y-1.5">
            <Label>Contato de emergência (telefone)</Label>
            <CarboInput value={f.emergency_phone ?? ""} onChange={(e) => set("emergency_phone", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <CarboInput value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anotações" />
          </div>
        </div>

        <DialogFooter>
          <CarboButton variant="outline" onClick={onClose}>Cancelar</CarboButton>
          <CarboButton onClick={save} disabled={upsert.isPending || !f.full_name?.trim()}>{upsert.isPending ? "Salvando…" : "Salvar"}</CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Funcionarios() {
  const { rows, unlinkedProfiles, isLoading } = useEmployeesFinance();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ initial: EmployeeFinance; title: string; allowLink: boolean } | null>(null);

  const q = search.trim().toLowerCase();
  const list = q ? rows.filter((r) => r.displayName.toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q)) : rows;

  const openEdit = (r: EmployeeRow) => setEditing({
    initial: {
      id: r.id, user_id: r.user_id, full_name: r.full_name ?? r.displayName, cpf: r.cpf,
      pix_key: r.pix_key, pix_type: r.pix_type, bank_name: r.bank_name, bank_code: r.bank_code,
      bank_agency: r.bank_agency, bank_account: r.bank_account, account_type: r.account_type,
      phone: r.phone, emergency_name: r.emergency_name, emergency_phone: r.emergency_phone, notes: r.notes,
    },
    title: `Dados financeiros — ${r.displayName}`,
    allowLink: r.origin === "avulso", // perfil do sistema já é o vínculo; avulso pode vincular
  });

  // "Novo funcionário" é pra gente que NÃO é usuário do sistema (avulso). Quem já
  // é usuário do sistema já aparece na lista — basta editar a linha dele. Por isso
  // aqui não oferecemos vínculo (evita duplicar). O vínculo aparece ao EDITAR um
  // avulso, quando ele passar a ter usuário no sistema.
  const openNew = () => setEditing({
    initial: { id: null, user_id: null, full_name: "", cpf: null, pix_key: null, pix_type: null, bank_name: null, bank_code: null, bank_agency: null, bank_account: null, account_type: null, phone: null, emergency_name: null, emergency_phone: null, notes: null },
    title: "Novo funcionário (avulso)",
    allowLink: false,
  });

  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Funcionários"
        description="Dados financeiros para pagamento (PIX, banco) e contato de emergência."
        icon={Users}
        actions={<CarboButton className="gap-1.5" onClick={openNew}><UserPlus className="h-4 w-4" /> Novo funcionário</CarboButton>}
      />

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
            <CarboEmptyState icon={Users} title="Nenhum funcionário" description={search ? "Nenhum encontrado." : "Clique em Novo funcionário para cadastrar."} />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Funcionário</CarboTableHead>
                  <CarboTableHead>Origem</CarboTableHead>
                  <CarboTableHead>PIX</CarboTableHead>
                  <CarboTableHead>Banco</CarboTableHead>
                  <CarboTableHead>Telefone</CarboTableHead>
                  <CarboTableHead>Cadastro</CarboTableHead>
                  <CarboTableHead className="text-right">Ação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {list.map((r) => (
                  <CarboTableRow key={r.key}>
                    <CarboTableCell className="font-medium">{r.displayName}</CarboTableCell>
                    <CarboTableCell>
                      {r.origin === "sistema"
                        ? <CarboBadge variant="secondary">Usuário do sistema</CarboBadge>
                        : <CarboBadge variant="secondary">Avulso</CarboBadge>}
                    </CarboTableCell>
                    <CarboTableCell className="max-w-[180px] truncate">{r.pix_key || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>{r.bank_name ? `${r.bank_name}${r.bank_agency ? ` · ag ${r.bank_agency}` : ""}` : <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>{r.phone || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>
                      {r.hasData
                        ? <CarboBadge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completo</CarboBadge>
                        : <CarboBadge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" /> Pendente</CarboBadge>}
                    </CarboTableCell>
                    <CarboTableCell className="text-right">
                      <CarboButton size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(r)}>
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

      <EditDialog
        open={!!editing}
        initial={editing?.initial ?? null}
        title={editing?.title ?? ""}
        allowLink={editing?.allowLink ?? false}
        unlinkedProfiles={unlinkedProfiles}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
