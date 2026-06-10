import { useMemo, useState } from "react";
import {
  TrendingUp, DollarSign, Receipt, FileText, Search, FileCheck2, Pencil,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ⚠️ PORT VISUAL — dados MOCK. TODO: ligar nas vendas reais (Supabase) na fase de lógica.
type Status = "quote" | "confirmed" | "invoiced" | "delivered";
const STATUS_LABELS: Record<Status, string> = { quote: "Orçamento", confirmed: "Confirmada", invoiced: "Faturada", delivered: "Entregue" };
const STATUS_VARIANTS: Record<Status, "secondary" | "info" | "success"> = { quote: "secondary", confirmed: "info", invoiced: "info", delivered: "success" };

const VENDEDORES = ["Lucas Padilha", "Marcio Vannucci", "Marcius D'Ávila"];

interface Venda { id: string; numero: string; data: string; cliente: string; vendedor: string; valor: number; status: Status; }
const MOCK: Venda[] = [
  { id: "1", numero: "VND-2042", data: "2026-06-09", cliente: "Posto Shell Centro", vendedor: "Lucas Padilha", valor: 4850, status: "confirmed" },
  { id: "2", numero: "VND-2041", data: "2026-06-08", cliente: "Auto Posto Bandeirantes", vendedor: "Marcio Vannucci", valor: 12300, status: "invoiced" },
  { id: "3", numero: "ORC-1190", data: "2026-06-08", cliente: "Rede ABC Combustíveis", vendedor: "Lucas Padilha", valor: 7600, status: "quote" },
  { id: "4", numero: "VND-2039", data: "2026-06-07", cliente: "Posto Ipiranga Sul", vendedor: "Marcius D'Ávila", valor: 2200, status: "delivered" },
  { id: "5", numero: "ORC-1188", data: "2026-06-06", cliente: "Oficina do Zé", vendedor: "Lucas Padilha", valor: 980, status: "quote" },
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export default function Vendas() {
  const [search, setSearch] = useState("");
  const [vendedor, setVendedor] = useState("all");

  const filtered = useMemo(() => MOCK.filter((v) => {
    if (vendedor !== "all" && v.vendedor !== vendedor) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return v.numero.toLowerCase().includes(q) || v.cliente.toLowerCase().includes(q);
  }), [search, vendedor]);

  const resumo = useMemo(() => {
    const vendas = MOCK.filter((v) => v.status !== "quote");
    const fat = vendas.reduce((s, v) => s + v.valor, 0);
    return {
      total: vendas.length,
      fat,
      ticket: vendas.length ? fat / vendas.length : 0,
      orcamentos: MOCK.filter((v) => v.status === "quote").length,
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CarboPageHeader title="Vendas" description="Acompanhamento das vendas do time" icon={TrendingUp} />

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <CarboKPI title="Vendas" value={resumo.total} icon={TrendingUp} iconColor="blue" delay={50} />
        <CarboKPI title="Faturamento" value={brl(resumo.fat)} icon={DollarSign} iconColor="green" delay={100} />
        <CarboKPI title="Ticket médio" value={brl(resumo.ticket)} icon={Receipt} iconColor="blue" delay={150} />
        <CarboKPI title="Orçamentos" value={resumo.orcamentos} icon={FileText} iconColor="warning" delay={200} />
      </div>

      {/* Filtros */}
      <CarboCard>
        <CarboCardContent className="p-4 grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5"><Label>Data início</Label><Input type="date" /></div>
          <div className="space-y-1.5"><Label>Data fim</Label><Input type="date" /></div>
          <div className="space-y-1.5">
            <Label>Vendedor</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {VENDEDORES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buscar</Label>
            <CarboSearchInput placeholder="Nº ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Tabela */}
      <CarboCard>
        <CarboCardContent className="p-0">
          {filtered.length === 0 ? (
            <CarboEmptyState icon={TrendingUp} title="Nenhuma venda" description="Ajuste os filtros." />
          ) : (
            <div className="overflow-x-auto">
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Documento</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                    <CarboTableHead>Cliente</CarboTableHead>
                    <CarboTableHead>Vendedor</CarboTableHead>
                    <CarboTableHead className="text-right">Valor</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                    <CarboTableHead className="text-right">Ações</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {filtered.map((v) => (
                    <CarboTableRow key={v.id}>
                      <CarboTableCell className="font-mono text-xs font-medium">{v.numero}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{dt(v.data)}</CarboTableCell>
                      <CarboTableCell className="font-medium">{v.cliente}</CarboTableCell>
                      <CarboTableCell className="text-sm">{v.vendedor}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold">{brl(v.valor)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={STATUS_VARIANTS[v.status]}>{STATUS_LABELS[v.status]}</CarboBadge></CarboTableCell>
                      <CarboTableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 text-muted-foreground">
                          {v.status === "quote" && <FileCheck2 className="h-4 w-4" aria-label="Converter em venda" />}
                          <Pencil className="h-4 w-4" aria-label="Editar" />
                        </div>
                      </CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — dados de exemplo. Conversão de orçamento, edição e NF-e entram na fase de lógica.
      </p>
    </div>
  );
}
