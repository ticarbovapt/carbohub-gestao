import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Pencil, CheckCircle2, AlertCircle, UserPlus, Link2, Cake, PartyPopper } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboInput } from "@/components/ui/carbo-input";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployeesFinance, useUpsertEmployeeFinance, type EmployeeRow, type EmployeeFinance, type SystemProfile } from "@/hooks/useEmployeeFinance";
import { useOrgLabels } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";

const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url
    ? <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover shrink-0" />
    : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">{initials(name) || "?"}</div>;
}

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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Data de aniversário</Label>
            <DatePickerInput
              value={f.birth_date ?? ""}
              onChange={(v) => set("birth_date", v || null)}
              monthYearDropdown
              disableFuture
              fromYear={1940}
              className="w-full h-9"
            />
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

// ── Aniversariantes ─────────────────────────────────────────────────────────
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function parseBirth(bd: string | null): { month: number; day: number } | null {
  const m = (bd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

// Dias corridos até o próximo aniversário (0 = hoje).
function daysUntil(month: number, day: number, today: Date): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < t0.getTime()) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - t0.getTime()) / 86_400_000);
}

interface BdayItem { r: EmployeeRow; month: number; day: number; dias: number; passou: boolean }

function PersonPill({ it }: { it: BdayItem }) {
  const hoje = it.dias === 0;
  const proximo = it.dias >= 1 && it.dias <= 7;
  const cls = hoje
    ? "ring-2 ring-emerald-500/70 bg-emerald-500/10"
    : proximo
      ? "ring-1 ring-amber-500/60 bg-amber-500/10"
      : it.passou
        ? "opacity-60 bg-muted/30"
        : "bg-muted/30";
  const legenda = hoje
    ? "🎂 É hoje!"
    : proximo
      ? `faltam ${it.dias} ${it.dias === 1 ? "dia" : "dias"}`
      : it.passou
        ? "já passou"
        : `dia ${String(it.day).padStart(2, "0")}`;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${cls}`}>
      <Avatar url={it.r.avatarUrl} name={it.r.displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{it.r.displayName}</p>
        <p className="text-[11px] text-muted-foreground">{String(it.day).padStart(2, "0")}/{String(it.month).padStart(2, "0")}</p>
      </div>
      <span className={`text-[11px] font-medium shrink-0 ${hoje ? "text-emerald-600" : proximo ? "text-amber-600" : "text-muted-foreground"}`}>{legenda}</span>
    </div>
  );
}

function Aniversariantes({ rows }: { rows: EmployeeRow[] }) {
  const today = new Date();
  const curMonth = today.getMonth() + 1;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const items: BdayItem[] = rows.flatMap((r) => {
    const b = parseBirth(r.birth_date);
    if (!b) return [];
    const thisYear = new Date(today.getFullYear(), b.month - 1, b.day);
    return [{ r, month: b.month, day: b.day, dias: daysUntil(b.month, b.day, today), passou: thisYear.getTime() < t0.getTime() }];
  });

  const doMes = items.filter((x) => x.month === curMonth).sort((a, b) => a.day - b.day);
  // Próximos 7 dias (pode cruzar pro mês que vem) — alerta de antecedência.
  const proximos = items.filter((x) => x.dias >= 0 && x.dias <= 7).sort((a, b) => a.dias - b.dias);
  const semData = rows.filter((r) => !parseBirth(r.birth_date));
  const porMes = Array.from({ length: 12 }, (_, i) => items.filter((x) => x.month === i + 1).sort((a, b) => a.day - b.day));

  return (
    <div className="space-y-6">
      {/* Alerta de antecedência: quem faz aniversário nos próximos 7 dias */}
      {proximos.length > 0 && (
        <CarboCard>
          <CarboCardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Chegando ({proximos.length}) — próximos 7 dias</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {proximos.map((it) => <PersonPill key={it.r.key} it={it} />)}
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Aniversariantes do mês atual em destaque */}
      <CarboCard>
        <CarboCardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Aniversariantes de {MESES[curMonth - 1]} ({doMes.length})</h3>
          </div>
          {doMes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém faz aniversário este mês.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {doMes.map((it) => <PersonPill key={it.r.key} it={it} />)}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Calendário anual: subdivisão por mês */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {porMes.map((lista, i) => {
          const isCur = i + 1 === curMonth;
          return (
            <CarboCard key={i} className={isCur ? "ring-1 ring-primary/50" : ""}>
              <CarboCardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className={`text-sm font-semibold ${isCur ? "text-primary" : ""}`}>{MESES[i]}</h4>
                  <CarboBadge variant={isCur ? "success" : "outline"}>{lista.length}</CarboBadge>
                </div>
                {lista.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-1">
                    {lista.map((it) => (
                      <li key={it.r.key} className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums text-muted-foreground w-6 shrink-0">{String(it.day).padStart(2, "0")}</span>
                        <span className="truncate">{it.r.displayName}</span>
                        {it.dias === 0 && <span className="ml-auto text-emerald-600 shrink-0">🎂</span>}
                        {it.dias >= 1 && it.dias <= 7 && <span className="ml-auto text-amber-600 shrink-0">⏳</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </CarboCardContent>
            </CarboCard>
          );
        })}
      </div>

      {/* Sem data cadastrada — lembra de preencher */}
      {semData.length > 0 && (
        <CarboCard>
          <CarboCardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Sem data de aniversário ({semData.length})</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {semData.map((r) => r.displayName).join(", ")}
            </p>
            <p className="text-[11px] text-muted-foreground">Edite o funcionário na aba “Equipe” para preencher a data.</p>
          </CarboCardContent>
        </CarboCard>
      )}
    </div>
  );
}

export default function Funcionarios() {
  const { gestor } = useAuth();
  // Aba ativa persistida na URL (?tab=…), pra não voltar pra "equipe" a cada F5.
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ["equipe", "aniversarios"];
  const rawTab = searchParams.get("tab") || "equipe";
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : "equipe";
  const setActiveTab = (v: string) =>
    setSearchParams((prev) => { prev.set("tab", v); return prev; }, { replace: true });
  const { rows, unlinkedProfiles, isLoading } = useEmployeesFinance();
  const { data: labels } = useOrgLabels();
  const deptLabel = labels?.deptLabel ?? {};
  const [search, setSearch] = useState("");
  const [setor, setSetor] = useState("__all__");
  const [editing, setEditing] = useState<{ initial: EmployeeFinance; title: string; allowLink: boolean } | null>(null);

  // Setores presentes na lista (pra montar o filtro), com rótulo legível.
  const setores = Array.from(new Set(rows.map((r) => r.department).filter(Boolean) as string[]))
    .sort((a, b) => (deptLabel[a] ?? a).localeCompare(deptLabel[b] ?? b, "pt-BR"));

  const q = search.trim().toLowerCase();
  const list = rows.filter((r) => {
    if (setor !== "__all__" && r.department !== setor && r.secondaryDepartment !== setor) return false;
    if (q && !(r.displayName.toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q))) return false;
    return true;
  });

  const openEdit = (r: EmployeeRow) => setEditing({
    initial: {
      id: r.id, user_id: r.user_id, full_name: r.full_name ?? r.displayName, cpf: r.cpf, birth_date: r.birth_date,
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
    initial: { id: null, user_id: null, full_name: "", cpf: null, birth_date: null, pix_key: null, pix_type: null, bank_name: null, bank_code: null, bank_agency: null, bank_account: null, account_type: null, phone: null, emergency_name: null, emergency_phone: null, notes: null },
    title: "Novo funcionário (avulso)",
    allowLink: false,
  });

  if (!gestor) {
    return (
      <div className="space-y-6">
        <CarboPageHeader title="Funcionários" description="Dados financeiros para pagamento (PIX, banco) e contato de emergência." icon={Users} />
        <CarboCard><CarboCardContent>
          <CarboEmptyState icon={AlertCircle} title="Acesso restrito"
            description="Só gestores podem ver e editar dados financeiros de funcionários (PIX, conta bancária). Fale com um gestor se precisar." />
        </CarboCardContent></CarboCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Funcionários"
        description="Dados financeiros para pagamento (PIX, banco) e contato de emergência."
        icon={Users}
        actions={<CarboButton className="gap-1.5" onClick={openNew}><UserPlus className="h-4 w-4" /> Novo funcionário</CarboButton>}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="equipe" className="gap-1.5"><Users className="h-4 w-4" /> Equipe</TabsTrigger>
          <TabsTrigger value="aniversarios" className="gap-1.5"><Cake className="h-4 w-4" /> Aniversariantes</TabsTrigger>
        </TabsList>

        <TabsContent value="equipe" className="mt-4">
      <CarboCard>
        <CarboCardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <div className="w-full sm:w-56">
              <Select value={setor} onValueChange={setSetor}>
                <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os setores</SelectItem>
                  {setores.map((d) => <SelectItem key={d} value={d}>{deptLabel[d] ?? d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                  <CarboTableHead>Setor</CarboTableHead>
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
                    <CarboTableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar url={r.avatarUrl} name={r.displayName} />
                        <span>{r.displayName}</span>
                      </div>
                    </CarboTableCell>
                    <CarboTableCell>
                      {r.department
                        ? <span>{deptLabel[r.department] ?? r.department}</span>
                        : <span className="text-muted-foreground text-xs">Avulso</span>}
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
        </TabsContent>

        <TabsContent value="aniversarios" className="mt-4">
          <Aniversariantes rows={rows} />
        </TabsContent>
      </Tabs>

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
