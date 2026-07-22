import { useEffect, useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, MapPin, Users, Cloud, Send, AlertCircle, ArrowLeftRight, Settings2,
  ArrowDownToLine, ArrowUpFromLine, Boxes, Layers, AlertTriangle, Activity, Info, Link2, Truck,
  CheckCircle, XCircle, FileText, Loader2, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { StockView } from "@/components/estoque/StockView";
import { HUBS, minForHub } from "@/components/estoque/stockData";
import { CDSPRegistrarEnvioDialog } from "@/components/estoque/CDSPRegistrarEnvioDialog";
import { RemessaConfirmDialog } from "@/components/estoque/RemessaConfirmDialog";
import { useStock, useStockLive } from "@/hooks/useStock";
import { useStockMovements } from "@/hooks/useStockMovements";
import { useStockMovementStats } from "@/hooks/useStockMovementStats";
import { useStockTransfers, type Transfer } from "@/hooks/useStockTransfers";
import { MinStockDialog } from "@/components/estoque/MinStockDialog";


// É a versão EDITÁVEL do estoque (gestores). A versão somente leitura vive em Estoque.

type Hub = "rn" | "sp" | "sp-vendas" | "bling";
// Suprimentos usa "sp-vendas"; o módulo de estoque usa "spv".
const STOCK_HUB_ID: Record<Hub, string> = { rn: "rn", sp: "sp", "sp-vendas": "spv", bling: "bling" };
// hub (UI) → código do warehouse no banco (pra filtrar movimentações por hub)
const HUB_CODE: Record<Hub, string> = { rn: "HUB-RN", sp: "HUB-SP", "sp-vendas": "HUB-SP-VENDAS", bling: "CD-BLING" };

const PERIODOS = [{ v: "7d", label: "Últimos 7 dias" }, { v: "30d", label: "Últimos 30 dias" }, { v: "mes", label: "Este mês" }];
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

// Mapeamento SKU plataforma → produto interno. // TODO: ligar em sku_product_mappings (fase futura)
const SKU_MAP: { sku: string; produto: string }[] = [];

export default function Suprimentos() {
  const [hub, setHub] = useState<Hub>("rn");
  const [activeTab, setActiveTab] = useState("estoque");
  // Período dos KPIs — persiste (vira dashboard). Valores: 7d | 30d | mes | custom | "YYYY-MM".
  const [periodo, setPeriodo] = useState(() => { try { return localStorage.getItem("ops_sup_periodo") || "7d"; } catch { return "7d"; } });
  const [customFrom, setCustomFrom] = useState(() => { try { return localStorage.getItem("ops_sup_from") || ""; } catch { return ""; } });
  const [customTo, setCustomTo] = useState(() => { try { return localStorage.getItem("ops_sup_to") || ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem("ops_sup_periodo", periodo); localStorage.setItem("ops_sup_from", customFrom); localStorage.setItem("ops_sup_to", customTo); } catch { /* ignora */ } }, [periodo, customFrom, customTo]);
  const [envioOpen, setEnvioOpen] = useState(false);
  const [remessaConfirm, setRemessaConfirm] = useState<{ action: "confirmar" | "estornar"; id: string; produto: string } | null>(null);

  // Últimos 12 meses para o seletor por mês.
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { v, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, []);
  const periodLabel = periodo === "7d" ? "7 dias" : periodo === "30d" ? "30 dias" : periodo === "mes" ? "este mês"
    : periodo === "custom" ? "período" : (monthOptions.find((m) => m.v === periodo)?.label ?? "período");
  const isRN = hub === "rn", isSP = hub === "sp", isVendas = hub === "sp-vendas", isBling = hub === "bling";
  const stockHub = HUBS.find((h) => h.id === STOCK_HUB_ID[hub]) ?? HUBS[0];

  useStockLive(); // atualiza ao vivo quando outro usuário mexe no estoque (produção ou manual)
  const { data: products = [] } = useStock();
  const { data: movimentacoes = [], isLoading: movLoading } = useStockMovements();
  const { data: transfers = [] } = useStockTransfers();

  // Transferências por direção
  const enviosSP = useMemo(() => transfers.filter((t) => t.fromCode === "HUB-RN"), [transfers]);
  const transitoSP = useMemo(() => transfers.filter((t) => t.toCode === "HUB-SP"), [transfers]);
  const remessasVendas = useMemo(() => transfers.filter((t) => t.toCode === "HUB-SP-VENDAS"), [transfers]);

  // KPIs do hub selecionado
  const stockId = STOCK_HUB_ID[hub];
  const lowStock = useMemo(
    () => products.filter((p) => { const min = minForHub(p, stockId); return min > 0 && (p.hubs[stockId] ?? 0) < min; })
      .map((p) => ({ name: p.name, qty: p.hubs[stockId] ?? 0, unit: p.stock_unit || "un" })),
    [products, stockId],
  );
  // Intervalo [from, to] do período escolhido (rápido, mês específico ou custom).
  const range = useMemo(() => {
    const now = new Date();
    if (periodo === "7d") { const f = new Date(); f.setDate(f.getDate() - 7); return { from: f, to: now }; }
    if (periodo === "30d") { const f = new Date(); f.setDate(f.getDate() - 30); return { from: f, to: now }; }
    if (periodo === "mes") { return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }; }
    if (periodo === "custom") {
      const f = customFrom ? new Date(customFrom + "T00:00:00") : new Date(0);
      const t = customTo ? new Date(customTo + "T23:59:59") : now;
      // Se o usuário inverter (de > até), troca em vez de mostrar vazio.
      return f > t ? { from: t, to: f } : { from: f, to: t };
    }
    const [y, mth] = periodo.split("-").map(Number);
    if (y && mth) return { from: new Date(y, mth - 1, 1), to: new Date(y, mth, 0, 23, 59, 59) };
    const f = new Date(); f.setDate(f.getDate() - 7); return { from: f, to: now };
  }, [periodo, customFrom, customTo]);
  // Movimentações do hub atual (cada tela é independente)
  const movimentacoesHub = useMemo(() => movimentacoes.filter((m) => m.warehouseCode === HUB_CODE[hub]), [movimentacoes, hub]);
  const movsPeriodo = useMemo(() => movimentacoesHub.filter((m) => { const d = new Date(m.data); return d >= range.from && d <= range.to; }), [movimentacoesHub, range]);
  // KPIs de movimentação contados DIRETO no banco (sem o cap de 300 da lista — C10).
  const { data: movStats } = useStockMovementStats(HUB_CODE[hub], range.from.toISOString(), range.to.toISOString());
  const kpis = {
    total: products.length,
    emBaixa: lowStock.length,
    entradas: movStats?.entradas ?? movsPeriodo.filter((m) => m.tipo === "entrada").length,
    saidas: movStats?.saidas ?? movsPeriodo.filter((m) => m.tipo === "saida").length,
    movimentacoes: movStats?.movimentacoes ?? movsPeriodo.length,
  };

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

  // Card de transferência (envio/remessa) com ações opcionais de chegada/estorno.
  const TransferCard = ({ t, withActions }: { t: Transfer; withActions: boolean }) => {
    const done = t.status === "entregue", cancelled = t.status === "estornado";
    return (
      <CarboCard key={t.id}><CarboCardContent className="py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className={cn("p-2 rounded-lg", done ? "bg-green-500/10" : cancelled ? "bg-destructive/10" : "bg-blue-500/10")}>
            {done ? <CheckCircle className="h-5 w-5 text-carbo-green" /> : cancelled ? <XCircle className="h-5 w-5 text-destructive" /> : <Truck className="h-5 w-5 text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t.produto}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enviado em {fmtDate(t.enviado)}{t.nota ? ` · ${t.nota}` : ""}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-xl">{t.qtd.toLocaleString("pt-BR")} <span className="text-xs font-normal text-muted-foreground">{t.unidade}</span></p>
            <CarboBadge variant={done ? "success" : cancelled ? "cancelled" : "info"}>{done ? "Entregue" : cancelled ? "Estornado" : "Em trânsito"}</CarboBadge>
          </div>
          {withActions && t.status === "em_transito" && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5 border-green-500/30 text-carbo-green hover:bg-green-500/10" onClick={() => setRemessaConfirm({ action: "confirmar", id: t.id, produto: t.produto })}><CheckCircle className="h-4 w-4" /> Confirmar chegada</Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setRemessaConfirm({ action: "estornar", id: t.id, produto: t.produto })}><XCircle className="h-4 w-4" /> Não chegou / Estornar</Button>
            </div>
          )}
        </div>
      </CarboCardContent></CarboCard>
    );
  };

  // Política de Estoque do CD ATUAL (cada CD gerencia só o dele).
  const currentCode = HUB_CODE[hub];
  const currentHubId = STOCK_HUB_ID[hub];
  const [politicaSearch, setPoliticaSearch] = useState("");
  const [minTarget, setMinTarget] = useState<{ id: string; name: string; current: number } | null>(null);
  const politicaProducts = useMemo(() => products.filter((p) => {
    if (!politicaSearch) return true;
    const q = politicaSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q);
  }), [products, politicaSearch]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CarboPageHeader title="Suprimentos" description="Estoque, Movimentações e Recebimento" icon={Package} />
        </div>

        {/* Hub selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={isRN ? "default" : "outline"} size="sm" className={cn("gap-2", isRN && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("rn")}><MapPin className="h-4 w-4" /> Hub Natal</Button>
          <Button variant={isSP ? "default" : "outline"} size="sm" className={cn("gap-2", isSP && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("sp")}><MapPin className="h-4 w-4" /> CD SP LogHouse</Button>
          <Button variant={isVendas ? "default" : "outline"} size="sm" className={cn("gap-2", isVendas && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("sp-vendas")}><Users className="h-4 w-4" /> CD SP Vendas</Button>
          <Button variant={isBling ? "default" : "outline"} size="sm" className={cn("gap-2", isBling && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("bling")}><Cloud className="h-4 w-4" /> CD Bling</Button>
          {isRN && <Button size="sm" variant="outline" className="gap-2 ml-auto border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => setEnvioOpen(true)}><Send className="h-4 w-4" /> Registrar Envio para CD SP</Button>}
        </div>

        {/* Alerta reposição — SP */}
        {isSP && lowStock.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">{lowStock.length} produtos abaixo do nível de segurança — enviar reposição ao CD</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {lowStock.map((s) => <span key={s.name} className="text-xs text-muted-foreground">{s.name} ({s.qty} {s.unit})</span>)}
              </div>
            </div>
          </div>
        )}

        {/* KPIs + período */}
        {!isBling && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 justify-end flex-wrap">
              <span className="text-xs text-muted-foreground">Período dos KPIs:</span>
              {periodo === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-[140px] text-xs" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-[140px] text-xs" />
                </div>
              )}
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[170px] h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Rápido</SelectLabel>
                    {PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                    <SelectItem value="custom">Personalizado…</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Por mês</SelectLabel>
                    {monthOptions.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><Layers className="h-4 w-4 text-carbo-blue" /><span className="text-xs text-muted-foreground">Total Produtos</span></div><p className="text-2xl font-bold">{kpis.total}</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Em Baixa</span></div><p className="text-2xl font-bold text-destructive">{kpis.emBaixa}</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><ArrowDownToLine className="h-4 w-4 text-carbo-green" /><span className="text-xs text-muted-foreground">Entradas ({periodLabel})</span></div><p className="text-2xl font-bold">{kpis.entradas}</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><ArrowUpFromLine className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">Saídas ({periodLabel})</span></div><p className="text-2xl font-bold">{kpis.saidas}</p></CarboCardContent></CarboCard>
              <CarboCard variant="kpi" padding="sm"><CarboCardContent><div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Movimentações ({periodLabel})</span></div><p className="text-2xl font-bold">{kpis.movimentacoes}</p></CarboCardContent></CarboCard>
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

          {/* Movimentações */}
          <TabsContent value="movimentacoes" className="mt-4">
            {movLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
            ) : movimentacoesHub.length === 0 ? <CarboEmptyState title="Nenhuma movimentação neste hub" description="Entradas, saídas e ajustes deste hub aparecem aqui." /> : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Por</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
                <TableBody>
                  {movimentacoesHub.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(m.data)}</TableCell>
                      <TableCell className="font-medium">{m.produto}<span className="ml-2 text-xs text-muted-foreground font-mono">{m.product_code}</span></TableCell>
                      <TableCell>
                        <CarboBadge variant={m.tipo === "entrada" ? "success" : "warning"} dot>
                          <span className="inline-flex items-center gap-1">{m.tipo === "entrada" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}{m.tipo === "entrada" ? "Entrada" : "Saída"}</span>
                        </CarboBadge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{m.qtd.toLocaleString("pt-BR")} {m.unidade}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.por ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{m.origem}{m.observacoes ? <span className="ml-1 text-xs">· {m.observacoes}</span> : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </TabsContent>

          {/* Em Trânsito (SP) — confirmar chegada / estornar */}
          <TabsContent value="transito" className="mt-4 space-y-4">
            {transitoSP.length === 0 ? <CarboEmptyState title="Nenhum envio em trânsito" /> : (
              transitoSP.map((t) => <TransferCard key={t.id} t={t} withActions />)
            )}
          </TabsContent>

          {/* Mapeamento SKU (SP) */}
          <TabsContent value="mapeamento" className="mt-4 space-y-4">
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-0.5">Como funciona o mapeamento</p>
                <p className="text-xs text-muted-foreground">
                  O sistema deduz o estoque CD SP combinando o SKU da plataforma com o <strong className="text-foreground">código interno do produto</strong> (1 vendido = 1 deduzido).
                  Use mapeamentos explícitos para kits ou quando o SKU da plataforma for diferente do código interno.
                </p>
              </div>
            </div>
            {SKU_MAP.length === 0 ? <CarboEmptyState title="Nenhum mapeamento" description="Mapeamentos de SKU entram na próxima fase." /> : (
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
            )}
          </TabsContent>

          {/* Remessas — CD SP Vendas */}
          <TabsContent value="vendas-transito" className="mt-4 space-y-4">
            {remessasVendas.length === 0 ? (
              <CarboCard><CarboCardContent className="py-12 text-center"><Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" /><p className="text-muted-foreground font-medium">Nenhuma remessa registrada</p></CarboCardContent></CarboCard>
            ) : (
              <>
                <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
                  <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {remessasVendas.filter((r) => r.status === "em_transito").length} em trânsito</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {remessasVendas.filter((r) => r.status === "entregue").length} entregues</span>
                </div>
                {remessasVendas.map((r) => <TransferCard key={r.id} t={r} withActions />)}
              </>
            )}
          </TabsContent>

          {/* Envios para SP — Hub Natal (lista; ação acontece no destino) */}
          <TabsContent value="envios-sp" className="mt-4 space-y-4">
            {enviosSP.length === 0 ? <CarboEmptyState title="Nenhum envio registrado" description='Use "Registrar Envio para CD SP".' /> : (
            <>
            <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
              <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {enviosSP.filter((e) => e.status === "em_transito").length} em trânsito</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {enviosSP.filter((e) => e.status === "entregue").length} entregues no CD SP</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><XCircle className="h-4 w-4 text-destructive" /> {enviosSP.filter((e) => e.status === "estornado").length} estornados</span>
            </div>
            {enviosSP.map((e) => <TransferCard key={e.id} t={e} withActions={false} />)}
            </>
            )}
          </TabsContent>

          {/* Recebimento — Hub Natal (próxima fase) */}
          <TabsContent value="recebimento" className="mt-4">
            <CarboEmptyState title="Nenhum registro" description="Conferência de recebimento de OC entra na próxima fase." />
          </TabsContent>

          {/* Notas Fiscais de entrada — Hub Natal (próxima fase) */}
          <TabsContent value="notas" className="mt-4">
            <CarboEmptyState title="Nenhum registro" description="Notas fiscais de entrada (3-way match) entram na próxima fase." />
          </TabsContent>

          {/* Política de Estoque — mínimo do CD atual (cada CD só o dele) */}
          <TabsContent value="politica" className="mt-4 space-y-3">
            {isBling ? (
              <CarboEmptyState title="Não se aplica ao CD Bling" description="O saldo do Bling vem da integração; não há política de mínimo manual aqui." />
            ) : (
            <>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto por nome ou código..." value={politicaSearch} onChange={(e) => setPoliticaSearch(e.target.value)} className="pl-9" />
            </div>
            {politicaProducts.length === 0 ? <CarboEmptyState icon={Package} title="Nenhum produto" /> : (
              <div className="space-y-3">
                {politicaProducts.map((p) => {
                  const min = p.mins[currentHubId] ?? 0;
                  return (
                    <CarboCard key={p.id}><CarboCardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-carbo-green/10"><Package className="h-5 w-5 text-carbo-green" /></div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{p.product_code}<span className="font-sans"> · {p.category}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{stockHub.label}</p>
                          <p className="text-xs text-muted-foreground">{stockHub.city}/{stockHub.state}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mínimo</p>
                            <p className="text-sm font-bold tabular-nums">{min > 0 ? `${min.toLocaleString("pt-BR")} ${p.stock_unit}` : "—"}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setMinTarget({ id: p.id, name: p.name, current: min })}>Configurar</Button>
                        </div>
                      </div>
                    </CarboCardContent></CarboCard>
                  );
                })}
              </div>
            )}
            </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <MinStockDialog
        open={minTarget !== null}
        onOpenChange={(v) => { if (!v) setMinTarget(null); }}
        productId={minTarget?.id ?? null}
        productName={minTarget?.name ?? ""}
        hubCode={currentCode}
        hubLabel={stockHub.label}
        currentMin={minTarget?.current ?? 0}
      />
      <CDSPRegistrarEnvioDialog open={envioOpen} onOpenChange={setEnvioOpen} />
      <RemessaConfirmDialog
        action={remessaConfirm?.action ?? null}
        transferId={remessaConfirm?.id ?? null}
        produto={remessaConfirm?.produto ?? null}
        open={remessaConfirm !== null}
        onOpenChange={(v) => !v && setRemessaConfirm(null)}
      />
    </div>
  );
}
