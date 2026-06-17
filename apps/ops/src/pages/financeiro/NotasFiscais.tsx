import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { FileText, Search, Link2, AlertTriangle, XCircle, Archive, CheckCircle2 } from "lucide-react";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";

// TODO: ligar em <tabela financeira/bling> (Supabase)

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Match = "matched" | "manual" | "no_code" | "invalid_code" | "ignored";
const MATCH_LABEL: Record<Match, string> = { matched: "Vínculo automático", manual: "Vínculo manual", no_code: "Sem código", invalid_code: "Código inválido", ignored: "Arquivada" };
const MATCH_VARIANT: Record<Match, "success" | "info" | "warning" | "destructive" | "secondary"> = { matched: "success", manual: "info", no_code: "warning", invalid_code: "destructive", ignored: "secondary" };

interface NFe { id: string; data: string; numero: string; serie: string; cliente: string; cnpj: string; valor: number; situacao: string; match: Match; }
const NFES: NFe[] = [];

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Link2; label: string; value: string; color: string }) {
  return (
    <CarboCard variant="kpi" padding="sm"><CarboCardContent>
      <div className="flex items-center gap-2 mb-1"><Icon className={`h-4 w-4 ${color}`} /><span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </CarboCardContent></CarboCard>
  );
}

export default function NotasFiscais() {
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<Match | "all">("all");

  const stats = useMemo(() => ({
    vinculadas: NFES.filter((n) => n.match === "matched" || n.match === "manual").length,
    semCodigo: NFES.filter((n) => n.match === "no_code").length,
    invalidas: NFES.filter((n) => n.match === "invalid_code").length,
    arquivadas: NFES.filter((n) => n.match === "ignored").length,
    total: NFES.reduce((s, n) => s + n.valor, 0),
  }), []);

  const filtered = useMemo(() => NFES.filter((n) => {
    if (matchFilter !== "all" && n.match !== matchFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return n.cliente.toLowerCase().includes(q) || n.cnpj.includes(q) || n.numero.includes(q);
  }), [search, matchFilter]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Notas Fiscais" description="NF-e importadas do Bling e vínculo com pedidos" icon={FileText} />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Kpi icon={CheckCircle2} label="Vinculadas" value={String(stats.vinculadas)} color="text-success" />
          <Kpi icon={AlertTriangle} label="Sem código" value={String(stats.semCodigo)} color="text-warning" />
          <Kpi icon={XCircle} label="Código inválido" value={String(stats.invalidas)} color="text-destructive" />
          <Kpi icon={Archive} label="Arquivadas" value={String(stats.arquivadas)} color="text-muted-foreground" />
          <Kpi icon={FileText} label="Total no mês" value={brl(stats.total)} color="text-carbo-green" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente, CNPJ ou nº NF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "matched", "no_code", "invalid_code", "ignored"] as const).map((k) => (
              <button key={k} onClick={() => setMatchFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${matchFilter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {k === "all" ? "Todas" : MATCH_LABEL[k as Match]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-muted/30">
              {["Data", "NF / Série", "Cliente", "CNPJ", "Valor", "Situação", "Vínculo"].map((h) => (
                <th key={h} className={`p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap ${h === "Valor" ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y">
              {filtered.map((n) => (
                <tr key={n.id} className="hover:bg-muted/20">
                  <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{n.data}</td>
                  <td className="p-3 text-sm font-mono whitespace-nowrap">{n.numero}/{n.serie}</td>
                  <td className="p-3 font-medium">{n.cliente}</td>
                  <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{n.cnpj}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{brl(n.valor)}</td>
                  <td className="p-3"><CarboBadge variant={n.situacao === "Cancelada" ? "destructive" : "success"} size="sm">{n.situacao}</CarboBadge></td>
                  <td className="p-3"><CarboBadge variant={MATCH_VARIANT[n.match]} size="sm" dot>{MATCH_LABEL[n.match]}</CarboBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <CarboEmptyState icon={FileText} title="Nenhuma nota fiscal" />}
        </div>
      </div>
    </div>
  );
}
