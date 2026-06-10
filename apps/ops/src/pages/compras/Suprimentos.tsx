import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, Lightbulb, MapPin, Users, Cloud, Send, AlertCircle, ArrowLeftRight, Settings2,
  ArrowDownToLine, ArrowUpFromLine, Boxes, Layers, AlertTriangle, Activity, Info, Link2, Truck,
  CheckCircle, XCircle, CheckCircle2, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StockView } from "@/components/estoque/StockView";
import { HUBS } from "@/components/estoque/stockData";

// ⚠️ PORT VISUAL FIEL ao Controle (/suprimentos → Suprimentos) — dados MOCK.
// É a versão EDITÁVEL do estoque (gestores). A versão somente leitura vive em Estoque.

type Hub = "rn" | "sp" | "sp-vendas" | "bling";
// Suprimentos usa "sp-vendas"; o módulo de estoque usa "spv".
const STOCK_HUB_ID: Record<Hub, string> = { rn: "rn", sp: "sp", "sp-vendas": "spv", bling: "bling" };

interface Mov { id: string; data: string; produto: string; tipo: "entrada" | "saida"; qtd: number; unidade: string; hub: string; }
const MOVS: Mov[] = [
  { id: "1", data: "2026-06-10", produto: "CarboZé 100ml", tipo: "entrada", qtd: 1200, unidade: "un", hub: "Hub Natal" },
  { id: "2", data: "2026-06-09", produto: "Garrafa PET 1L", tipo: "saida", qtd: 480, unidade: "un", hub: "Hub Natal" },
  { id: "3", data: "2026-06-09", produto: "CarboPRO", tipo: "entrada", qtd: 300, unidade: "un", hub: "CD SP LogHouse" },
  { id: "4", data: "2026-06-08", produto: "Reagente base", tipo: "saida", qtd: 120, unidade: "L", hub: "Hub Natal" },
];

interface Politica { id: string; produto: string; politica: string; seguranca: number; leadTime: number; }
const POLITICAS: Politica[] = [
  { id: "1", produto: "CarboZé 100ml", politica: "Ponto de pedido", seguranca: 500, leadTime: 7 },
  { id: "2", produto: "Garrafa PET 1L", politica: "Min/Máx", seguranca: 800, leadTime: 12 },
  { id: "3", produto: "Reagente base", politica: "Lote econômico", seguranca: 400, leadTime: 15 },
];

const LOW_STOCK = [{ name: "Garrafa PET 1L", qty: 0 }, { name: "CarboVapt", qty: 30 }];

// Transferências CD-SP em trânsito (mock)
interface Transito { id: string; produto: string; qtd: number; unidade: string; origem: string; destino: string; enviado: string; status: "em_transito" | "recebido"; }
const TRANSITO: Transito[] = [
  { id: "1", produto: "CarboZé 100ml", qtd: 600, unidade: "un", origem: "Hub Natal", destino: "CD SP LogHouse", enviado: "2026-06-07", status: "em_transito" },
  { id: "2", produto: "CarboPRO", qtd: 150, unidade: "un", origem: "Hub Natal", destino: "CD SP LogHouse", enviado: "2026-06-05", status: "recebido" },
  { id: "3", produto: "Garrafa PET 1L", qtd: 1000, unidade: "un", origem: "Hub Natal", destino: "CD SP LogHouse", enviado: "2026-06-09", status: "em_transito" },
];

// Mapeamento SKU plataforma → produto interno (auto-match por código), mock
const SKU_MAP: { sku: string; produto: string }[] = [
  { sku: "SKU-CP100", produto: "CarboPRO 100ml" }, { sku: "SKU-CZ1L", produto: "CarboZé 1 Litro" },
  { sku: "SKU-CZ100", produto: "CarboZé 100ml" }, { sku: "CARB-SACH-10ML", produto: "CARBOZE SACHÊ 10ML" },
  { sku: "INS-GARR-100ML", produto: "Garrafa 100ml Boca 24" }, { sku: "INS-GARR-1L", produto: "Garrafa 1L com Tampa" },
  { sku: "KIT-CARB-SACH-10ML", produto: "KIT 10und CARBOZE SACHÊ 10ML" }, { sku: "KIT-5UN-CARB-100ML", produto: "KIT 5un CARBOZE 100ML" },
  { sku: "INS-LIQ-CARBO", produto: "Líquido CARBO (ml)" }, { sku: "SKU-VAPT70", produto: "Reagente CarboVapt 70ml" },
  { sku: "INS-ROT-CP", produto: "Rótulo CarboPRO" }, { sku: "INS-ROT-CZ", produto: "Rótulo CarboZé" },
];

// Envios do Hub Natal → CD SP (stock_transfers from_hub = RN), mock
interface Envio { id: string; produto: string; qtd: number; unidade: string; enviado: string; nota?: string; status: "em_transito" | "entregue" | "estornado"; }
const ENVIOS_SP: Envio[] = [
  { id: "1", produto: "CarboZé 100ml", qtd: 600, unidade: "un", enviado: "2026-06-07 09:14", nota: "Remessa semanal CD SP", status: "em_transito" },
  { id: "2", produto: "CarboPRO", qtd: 150, unidade: "un", enviado: "2026-06-05 16:40", status: "entregue" },
  { id: "3", produto: "Garrafa PET 1L", qtd: 1000, unidade: "un", enviado: "2026-06-02 11:05", nota: "Reposição embalagem", status: "entregue" },
  { id: "4", produto: "Rótulo CarboPRO", qtd: 2000, unidade: "un", enviado: "2026-05-29 08:20", status: "estornado" },
];

// Remessas Hub Natal → CD SP Vendas (licenciados), mock
interface Remessa { id: string; produto: string; qtd: number; unidade: string; enviado: string; nota?: string; status: "em_transito" | "entregue"; }
const REMESSAS_VENDAS: Remessa[] = [
  { id: "1", produto: "CarboZé 100ml", qtd: 400, unidade: "un", enviado: "2026-06-08 10:30", nota: "Licenciado SP-Centro", status: "em_transito" },
  { id: "2", produto: "CarboPRO", qtd: 80, unidade: "un", enviado: "2026-06-06 14:00", nota: "Licenciado Campinas", status: "em_transito" },
  { id: "3", produto: "CarboZé 1L", qtd: 120, unidade: "un", enviado: "2026-06-03 09:00", status: "entregue" },
];

// Recebimentos de OC (purchase_receivings), mock
interface Recebimento { id: string; oc: string; recebidoEm: string; itens: number; status: "pendente" | "conferido_ok" | "conferido_divergencia"; divergencia?: string; }
const RECEBIMENTOS: Recebimento[] = [
  { id: "a1b2c3d4", oc: "a1b2c3d4", recebidoEm: "2026-06-09 15:20", itens: 4, status: "conferido_ok" },
  { id: "e5f6g7h8", oc: "e5f6g7h8", recebidoEm: "2026-06-07 10:05", itens: 7, status: "conferido_divergencia", divergencia: "2 un a menos no item Garrafa PET 1L" },
  { id: "i9j0k1l2", oc: "i9j0k1l2", recebidoEm: "2026-06-04 08:45", itens: 3, status: "pendente" },
];
const RECEB_STATUS: Record<Recebimento["status"], { label: string; variant: "warning" | "success" | "destructive" }> = {
  pendente: { label: "Pendente", variant: "warning" },
  conferido_ok: { label: "Conferido", variant: "success" },
  conferido_divergencia: { label: "Divergência", variant: "destructive" },
};

// Notas fiscais de entrada (purchase_invoices), mock
interface Nota { id: string; numero: string; data: string; valor: number; ocMatch: boolean; recebMatch: boolean; valorMatch: boolean; }
const NOTAS: Nota[] = [
  { id: "1", numero: "000.123.456", data: "2026-06-09", valor: 12450.0, ocMatch: true, recebMatch: true, valorMatch: true },
  { id: "2", numero: "000.123.401", data: "2026-06-06", valor: 8320.5, ocMatch: true, recebMatch: false, valorMatch: true },
  { id: "3", numero: "000.122.998", data: "2026-06-02", valor: 3990.0, ocMatch: true, recebMatch: true, valorMatch: false },
];
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PERIODOS = [{ v: "7d", label: "Últimos 7 dias" }, { v: "30d", label: "Últimos 30 dias" }, { v: "mes", label: "Este mês" }];
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export default function Suprimentos() {
  const [hub, setHub] = useState<Hub>("rn");
  const [planningMode, setPlanningMode] = useState(false);
  const [activeTab, setActiveTab] = useState("estoque");
  const [periodo, setPeriodo] = useState("7d");
  const periodLabel = periodo === "7d" ? "7 dias" : periodo === "30d" ? "30 dias" : "mês";
  const isRN = hub === "rn", isSP = hub === "sp", isVendas = hub === "sp-vendas", isBling = hub === "bling";
  const stockHub = HUBS.find((h) => h.id === STOCK_HUB_ID[hub]) ?? HUBS[0];

  // Ao trocar de hub, volta para "estoque" se a aba ativa não existir no novo hub.
  const changeHub = (next: Hub) => {
    const spOnly = ["transito", "mapeamento"];
    const vendasOnly = ["vendas-transito"];
    const rnOnly = ["envios-sp", "recebimento", "notas"];
    const invalid =
      (next !== "sp" && spOnly.includes(activeTab)) ||
      (next !== "sp-vendas" && vendasOnly.includes(activeTab)) ||
      (next !== "rn" && rnOnly.includes(activeTab));
    if (invalid) setActiveTab("estoque");
    setHub(next);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CarboPageHeader title="Suprimentos" description="Estoque, Movimentações e Recebimento" icon={Package} />
          <div className="flex items-center gap-3 shrink-0 pt-1">
            <Lightbulb className={cn("h-4 w-4 transition-colors", planningMode ? "text-warning" : "text-muted-foreground")} />
            <Label htmlFor="planning-mode" className="text-xs font-medium cursor-pointer select-none">Modo Planejamento</Label>
            <Switch id="planning-mode" checked={planningMode} onCheckedChange={setPlanningMode} />
          </div>
        </div>

        {/* Hub selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={isRN ? "default" : "outline"} size="sm" className={cn("gap-2", isRN && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("rn")}><MapPin className="h-4 w-4" /> Hub Natal</Button>
          <Button variant={isSP ? "default" : "outline"} size="sm" className={cn("gap-2", isSP && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("sp")}><MapPin className="h-4 w-4" /> CD SP LogHouse</Button>
          <Button variant={isVendas ? "default" : "outline"} size="sm" className={cn("gap-2", isVendas && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("sp-vendas")}><Users className="h-4 w-4" /> CD SP Vendas</Button>
          <Button variant={isBling ? "default" : "outline"} size="sm" className={cn("gap-2", isBling && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("bling")}><Cloud className="h-4 w-4" /> CD Bling</Button>
          {isRN && <Button size="sm" variant="outline" className="gap-2 ml-auto border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => toast("Registrar envio (em breve)")}><Send className="h-4 w-4" /> Registrar Envio para CD SP</Button>}
        </div>

        {/* Alerta reposição — SP */}
        {isSP && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">{LOW_STOCK.length} produtos abaixo do nível de segurança — enviar reposição ao CD</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {LOW_STOCK.map((s) => <span key={s.name} className="text-xs text-muted-foreground">{s.name} ({s.qty} un)</span>)}
              </div>
            </div>
          </div>
        )}

        {/* KPIs + período */}
        {!isBling && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-muted-foreground">Período dos KPIs:</span>
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><Layers className="h-4 w-4 text-carbo-blue" /><span className="text-xs text-muted-foreground">Total Produtos</span></div><p className="text-2xl font-bold">3</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Em Baixa</span></div><p className="text-2xl font-bold text-destructive">1</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><ArrowDownToLine className="h-4 w-4 text-carbo-green" /><span className="text-xs text-muted-foreground">Entradas ({periodLabel})</span></div><p className="text-2xl font-bold">11.146</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><ArrowUpFromLine className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">Saídas ({periodLabel})</span></div><p className="text-2xl font-bold">9.450</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Movimentações ({periodLabel})</span></div><p className="text-2xl font-bold">4</p></CarboCardContent></CarboCard>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="estoque" className="gap-1.5"><Boxes className="h-3.5 w-3.5" /> Estoque</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            {isSP && <TabsTrigger value="transito" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Em Trânsito</TabsTrigger>}
            {isSP && <TabsTrigger value="mapeamento" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> Mapeamento SKU</TabsTrigger>}
            {isVendas && <TabsTrigger value="vendas-transito" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Remessas</TabsTrigger>}
            {isRN && <TabsTrigger value="envios-sp" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Envios para SP</TabsTrigger>}
            {isRN && <TabsTrigger value="recebimento" className="gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5" /> Recebimento</TabsTrigger>}
            {isRN && <TabsTrigger value="notas" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Notas Fiscais</TabsTrigger>}
            <TabsTrigger value="politica" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Política de Estoque</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque" className="mt-4 space-y-3">
            {isSP && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span><strong>CD São Paulo</strong> — Estoque gerenciado manualmente conforme transferências do CD contratado. Atualize ao receber confirmação de entrada no CD.</span>
              </div>
            )}
            <StockView hub={stockHub} editable />
          </TabsContent>

          <TabsContent value="movimentacoes" className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Hub</TableHead></TableRow></TableHeader>
                <TableBody>
                  {MOVS.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">{dt(m.data)}</TableCell>
                      <TableCell className="font-medium">{m.produto}</TableCell>
                      <TableCell>
                        <CarboBadge variant={m.tipo === "entrada" ? "success" : "warning"} dot>
                          <span className="inline-flex items-center gap-1">{m.tipo === "entrada" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}{m.tipo === "entrada" ? "Entrada" : "Saída"}</span>
                        </CarboBadge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{m.qtd.toLocaleString("pt-BR")} {m.unidade}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.hub}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Em Trânsito (SP) */}
          <TabsContent value="transito" className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Origem → Destino</TableHead><TableHead>Enviado em</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {TRANSITO.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.produto}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.qtd.toLocaleString("pt-BR")} {t.unidade}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.origem} → {t.destino}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dt(t.enviado)}</TableCell>
                      <TableCell><CarboBadge variant={t.status === "recebido" ? "success" : "warning"} dot>{t.status === "recebido" ? "Recebido" : "Em trânsito"}</CarboBadge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Mapeamento SKU (SP) */}
          <TabsContent value="mapeamento" className="mt-4 space-y-4">
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-0.5">Como funciona o mapeamento</p>
                <p className="text-xs text-muted-foreground">
                  O sistema deduz o estoque CD SP em duas etapas: primeiro busca um mapeamento configurado; se não encontrar,
                  combina o SKU da plataforma com o <strong className="text-foreground">código interno do produto</strong> (1 vendido = 1 deduzido).
                  Use mapeamentos explícitos para kits ou quando o SKU da plataforma for diferente do código interno.
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Auto-match por código interno <span className="text-xs text-muted-foreground">(sem configuração necessária)</span></p>
              <div className="grid gap-2 md:grid-cols-2">
                {SKU_MAP.map((m) => (
                  <div key={m.sku} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                    <code className="text-xs font-mono text-carbo-green font-semibold shrink-0">{m.sku}</code>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="text-sm truncate">{m.produto}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">× 1 un</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Remessas — CD SP Vendas (licenciados) */}
          <TabsContent value="vendas-transito" className="mt-4 space-y-4">
            {REMESSAS_VENDAS.length === 0 ? (
              <CarboCard><CarboCardContent className="py-12 text-center"><Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" /><p className="text-muted-foreground font-medium">Nenhuma remessa registrada</p></CarboCardContent></CarboCard>
            ) : (
              <>
                <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
                  <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {REMESSAS_VENDAS.filter((r) => r.status === "em_transito").length} em trânsito</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {REMESSAS_VENDAS.filter((r) => r.status === "entregue").length} entregues</span>
                </div>
                {REMESSAS_VENDAS.map((r) => {
                  const done = r.status === "entregue";
                  return (
                    <CarboCard key={r.id}><CarboCardContent className="py-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className={cn("p-2 rounded-lg", done ? "bg-green-500/10" : "bg-blue-500/10")}>{done ? <CheckCircle className="h-5 w-5 text-carbo-green" /> : <Package className="h-5 w-5 text-blue-400" />}</div>
                        <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{r.produto}</p><p className="text-xs text-muted-foreground mt-0.5">{r.enviado}{r.nota ? ` · ${r.nota}` : ""}</p></div>
                        <div className="text-right shrink-0"><p className="font-bold text-xl">{r.qtd.toLocaleString("pt-BR")} <span className="text-xs font-normal text-muted-foreground">{r.unidade}</span></p><CarboBadge variant={done ? "success" : "info"}>{done ? "Entregue" : "Em trânsito"}</CarboBadge></div>
                        {!done && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="gap-1.5 border-green-500/30 text-carbo-green hover:bg-green-500/10" onClick={() => toast("Confirmar chegada (em breve)")}><CheckCircle className="h-4 w-4" /> Confirmar chegada</Button>
                            <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => toast("Estornar envio (em breve)")}><XCircle className="h-4 w-4" /> Não chegou / Estornar</Button>
                          </div>
                        )}
                      </div>
                    </CarboCardContent></CarboCard>
                  );
                })}
              </>
            )}
          </TabsContent>

          {/* Envios para SP — Hub Natal */}
          <TabsContent value="envios-sp" className="mt-4 space-y-4">
            <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
              <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {ENVIOS_SP.filter((e) => e.status === "em_transito").length} em trânsito</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {ENVIOS_SP.filter((e) => e.status === "entregue").length} entregues no CD SP</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><XCircle className="h-4 w-4 text-destructive" /> {ENVIOS_SP.filter((e) => e.status === "estornado").length} estornados</span>
            </div>
            {ENVIOS_SP.map((e) => {
              const done = e.status === "entregue", cancelled = e.status === "estornado";
              return (
                <CarboCard key={e.id}><CarboCardContent className="py-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className={cn("p-2 rounded-lg", done ? "bg-green-500/10" : cancelled ? "bg-destructive/10" : "bg-blue-500/10")}>{done ? <CheckCircle className="h-5 w-5 text-carbo-green" /> : cancelled ? <XCircle className="h-5 w-5 text-destructive" /> : <Truck className="h-5 w-5 text-blue-400" />}</div>
                    <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{e.produto}</p><p className="text-xs text-muted-foreground mt-0.5">Enviado em {e.enviado}{e.nota ? ` · ${e.nota}` : ""}</p></div>
                    <div className="text-right shrink-0"><p className="font-bold text-xl">{e.qtd.toLocaleString("pt-BR")} <span className="text-xs font-normal text-muted-foreground">{e.unidade}</span></p><CarboBadge variant={done ? "success" : cancelled ? "cancelled" : "info"}>{done ? "Chegou no CD SP" : cancelled ? "Estornado" : "Em trânsito"}</CarboBadge></div>
                  </div>
                </CarboCardContent></CarboCard>
              );
            })}
          </TabsContent>

          {/* Recebimento — Hub Natal (conferência de OC) */}
          <TabsContent value="recebimento" className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>OC</TableHead><TableHead>Data Recebimento</TableHead><TableHead>Itens</TableHead><TableHead>Status</TableHead><TableHead>Divergência</TableHead></TableRow></TableHeader>
                <TableBody>
                  {RECEBIMENTOS.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.oc.slice(0, 8)}...</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.recebidoEm}</TableCell>
                      <TableCell>{r.itens} itens</TableCell>
                      <TableCell><CarboBadge variant={RECEB_STATUS[r.status].variant} dot>{RECEB_STATUS[r.status].label}</CarboBadge></TableCell>
                      <TableCell>
                        {r.divergencia ? (
                          <span className="inline-flex items-center gap-1.5 text-destructive text-sm"><AlertTriangle className="h-3.5 w-3.5" /> {r.divergencia}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-carbo-green text-sm"><CheckCircle2 className="h-3.5 w-3.5" /> Sem divergências</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Notas Fiscais de entrada — Hub Natal (3-way match) */}
          <TabsContent value="notas" className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Nº NF</TableHead><TableHead>Data NF</TableHead><TableHead>Valor</TableHead><TableHead>OC ✓</TableHead><TableHead>Receb. ✓</TableHead><TableHead>Valor ✓</TableHead><TableHead>Verificação</TableHead></TableRow></TableHeader>
                <TableBody>
                  {NOTAS.map((n) => {
                    const allMatch = n.ocMatch && n.recebMatch && n.valorMatch;
                    const mark = (ok: boolean) => ok ? <CheckCircle2 className="h-4 w-4 text-carbo-green" /> : <XCircle className="h-4 w-4 text-destructive" />;
                    return (
                      <TableRow key={n.id}>
                        <TableCell className="font-mono font-medium">{n.numero}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dt(n.data)}</TableCell>
                        <TableCell className="font-mono">{brl(n.valor)}</TableCell>
                        <TableCell>{mark(n.ocMatch)}</TableCell>
                        <TableCell>{mark(n.recebMatch)}</TableCell>
                        <TableCell>{mark(n.valorMatch)}</TableCell>
                        <TableCell><CarboBadge variant={allMatch ? "success" : "warning"} dot>{allMatch ? "Conferida" : "Pendente"}</CarboBadge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="politica" className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Política</TableHead><TableHead className="text-right">Estoque Seg.</TableHead><TableHead className="text-right">Lead time</TableHead></TableRow></TableHeader>
                <TableBody>
                  {POLITICAS.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.produto}</TableCell>
                      <TableCell><CarboBadge variant="outline">{p.politica}</CarboBadge></TableCell>
                      <TableCell className="text-right tabular-nums">{p.seguranca.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.leadTime} dias</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Movimentações, transferências CD-SP e política entram na fase de lógica.</p>
      </div>
    </div>
  );
}
