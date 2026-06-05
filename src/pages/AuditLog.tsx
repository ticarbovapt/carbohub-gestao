import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Search, ChevronDown, ChevronRight, History, RefreshCw, ArrowRight, Code2 } from "lucide-react";
import { useIsLeadership } from "@/hooks/useActionPermissions";
import { useAuditLog, type AuditEntry } from "@/hooks/useAuditLog";

const TABLE_LABEL: Record<string, string> = {
  carboze_orders:    "Pedido / Venda",
  service_orders:    "OS Descarbonização",
  purchase_requests: "Requisição (RC)",
  purchase_orders:   "Ordem de Compra",
  purchase_payables: "Conta a Pagar",
  licensees:         "Licenciado",
  production_orders: "Ordem de Produção",
  machines:          "Máquina",
  pdvs:              "Loja (PDV)",
  profiles:          "Usuário",
};

const ACTION_INFO: Record<string, { label: string; cls: string }> = {
  INSERT: { label: "Criou",  cls: "bg-green-500/15 text-green-600 border-green-500/30" },
  UPDATE: { label: "Editou", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  DELETE: { label: "Apagou", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
};

// Rótulos amigáveis para os campos mais comuns; o resto cai no humanize().
const FIELD_LABEL: Record<string, string> = {
  full_name: "Nome", name: "Nome", email: "E-mail", phone: "Telefone",
  department: "Departamento", funcao: "Função",
  secondary_department: "Departamento secundário", secondary_funcao: "Função secundária",
  status: "Status", quantity: "Quantidade", units_real: "Unidades reais",
  total: "Total", unit_price: "Preço unitário", price: "Preço",
  is_active: "Ativo", approved: "Aprovado", active: "Ativo",
  product_sku: "SKU", product_name: "Produto", platform: "Plataforma",
  notes: "Observações", description: "Descrição", address: "Endereço",
  city: "Cidade", state: "UF", warehouse_id: "Depósito", product_id: "Produto",
  current_department: "Departamento atual", current_stage: "Etapa atual",
};

// Campos automáticos que poluem o diff e não interessam ao leitor.
const NOISE_FIELDS = new Set(["updated_at", "synced_at", "last_synced_at", "search_vector"]);

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
const fieldLabel = (k: string) => FIELD_LABEL[k] ?? humanize(k);

const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (isIsoDate(v)) { try { return format(parseISO(v), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return v; } }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type FieldChange = { key: string; before: unknown; after: unknown };

// Para UPDATE: campos cujo valor mudou. Para INSERT/DELETE: snapshot dos campos preenchidos.
function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k)) continue;
    const b = before?.[k], a = after?.[k];
    if (before && after) {
      if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ key: k, before: b, after: a });
    } else {
      const val = after ? a : b;
      if (val !== null && val !== undefined && val !== "") out.push({ key: k, before: b, after: a });
    }
  }
  return out.sort((x, y) => fieldLabel(x.key).localeCompare(fieldLabel(y.key)));
}

function fmtWhen(s: string) {
  try { return format(parseISO(s), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }); } catch { return s; }
}

function ChangeDetail({ e }: { e: AuditEntry }) {
  const [showJson, setShowJson] = useState(false);
  const isUpdate = e.action === "UPDATE";
  const isDelete = e.action === "DELETE";
  const changes = diffFields(e.before_data, e.after_data);

  return (
    <div className="space-y-3">
      {changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem campos relevantes para exibir.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* cabeçalho */}
          <div className="grid grid-cols-[160px_1fr] sm:grid-cols-[200px_1fr_1fr] gap-px bg-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <div className="bg-muted/40 px-3 py-1.5 font-medium">Campo</div>
            {isUpdate ? (
              <>
                <div className="bg-muted/40 px-3 py-1.5 font-medium hidden sm:block">Antes</div>
                <div className="bg-muted/40 px-3 py-1.5 font-medium">Depois</div>
              </>
            ) : (
              <div className="bg-muted/40 px-3 py-1.5 font-medium">{isDelete ? "Valor removido" : "Valor"}</div>
            )}
          </div>
          {/* linhas */}
          {changes.map(c => (
            <div
              key={c.key}
              className="grid grid-cols-[160px_1fr] sm:grid-cols-[200px_1fr_1fr] gap-px bg-border"
            >
              <div className="bg-background px-3 py-1.5 text-xs font-medium">{fieldLabel(c.key)}</div>
              {isUpdate ? (
                <>
                  <div className="bg-background px-3 py-1.5 text-xs text-red-500/90 line-through decoration-red-500/40 hidden sm:flex items-center break-all">
                    {fmtValue(c.before)}
                  </div>
                  <div className="bg-background px-3 py-1.5 text-xs text-green-600 flex items-center gap-1.5 break-all">
                    <span className="sm:hidden text-red-500/90 line-through decoration-red-500/40">{fmtValue(c.before)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0 sm:hidden" />
                    <span className="font-medium">{fmtValue(c.after)}</span>
                  </div>
                </>
              ) : (
                <div className={`bg-background px-3 py-1.5 text-xs flex items-center break-all ${isDelete ? "text-red-500/90" : "text-green-600 font-medium"}`}>
                  {fmtValue(isDelete ? c.before : c.after)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* JSON cru opcional */}
      <button
        onClick={() => setShowJson(s => !s)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Code2 className="h-3.5 w-3.5" />
        {showJson ? "Ocultar dados técnicos (JSON)" : "Ver dados técnicos (JSON)"}
      </button>
      {showJson && (
        <div className="grid md:grid-cols-2 gap-3">
          {e.before_data && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Antes</p>
              <pre className="text-[11px] bg-background rounded-lg p-2 overflow-auto max-h-56 border border-border">{JSON.stringify(e.before_data, null, 2)}</pre>
            </div>
          )}
          {e.after_data && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Depois</p>
              <pre className="text-[11px] bg-background rounded-lg p-2 overflow-auto max-h-56 border border-border">{JSON.stringify(e.after_data, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ e }: { e: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const info = ACTION_INFO[e.action] ?? { label: e.action, cls: "bg-muted text-muted-foreground border-border" };
  const hasDetail = !!(e.before_data || e.after_data);

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => hasDetail && setOpen(o => !o)}>
        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">{fmtWhen(e.created_at)}</td>
        <td className="px-3 py-2">
          <div className="text-sm font-medium">{e.user_name}</div>
          {e.role && <div className="text-[11px] text-muted-foreground capitalize">{e.role}</div>}
        </td>
        <td className="px-3 py-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${info.cls}`}>{info.label}</span>
        </td>
        <td className="px-3 py-2 text-sm">{TABLE_LABEL[e.table_name] ?? e.table_name}</td>
        <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground max-w-[140px] truncate">{e.record_id ?? "—"}</td>
        <td className="px-3 py-2 text-right">
          {hasDetail && (open ? <ChevronDown className="h-4 w-4 inline text-muted-foreground" /> : <ChevronRight className="h-4 w-4 inline text-muted-foreground" />)}
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-muted/10 border-b border-border/50">
          <td colSpan={6} className="px-4 py-3">
            <ChangeDetail e={e} />
          </td>
        </tr>
      )}
    </>
  );
}

function AuditContent() {
  const isLeadership = useIsLeadership();
  const [action, setAction] = useState("all");
  const [table, setTable] = useState("all");
  const [search, setSearch] = useState("");
  const { data: entries = [], isLoading, isFetching } = useAuditLog({ action, table, search });

  if (!isLeadership) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <p className="text-lg font-semibold">Acesso restrito</p>
          <p className="text-sm text-muted-foreground mt-1">A auditoria está disponível apenas para a liderança (head, command ou TI).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-carbo-green" /> Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Quem criou, editou ou apagou registros — ao vivo. {isFetching && <RefreshCw className="h-3 w-3 inline animate-spin ml-1" />}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por pessoa ou ID do registro…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="INSERT">Criações</SelectItem>
            <SelectItem value="UPDATE">Edições</SelectItem>
            <SelectItem value="DELETE">Exclusões</SelectItem>
          </SelectContent>
        </Select>
        <Select value={table} onValueChange={setTable}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <CarboCard>
        <CarboCardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando…</div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Nenhum evento encontrado para o filtro.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Quem</th>
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Área</th>
                  <th className="px-3 py-2 font-medium">Registro</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => <Row key={e.id} e={e} />)}
              </tbody>
            </table>
          )}
        </CarboCardContent>
      </CarboCard>
      <p className="text-xs text-center text-muted-foreground">
        Mostrando os {entries.length} eventos mais recentes · atualiza a cada 15s. Clique numa linha para ver o antes/depois.
      </p>
    </div>
  );
}

export default function AuditLog() {
  return (
    <BoardLayout>
      <AuditContent />
    </BoardLayout>
  );
}
