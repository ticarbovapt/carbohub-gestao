import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, Lightbulb, MapPin, Users, Cloud, Send, AlertCircle, ArrowLeftRight, Settings2,
  ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/suprimentos → Suprimentos) — dados MOCK.

type Hub = "rn" | "sp" | "sp-vendas" | "bling";

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
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export default function Suprimentos() {
  const [hub, setHub] = useState<Hub>("rn");
  const [planningMode, setPlanningMode] = useState(false);
  const [activeTab, setActiveTab] = useState("movimentacoes");
  const isRN = hub === "rn", isSP = hub === "sp", isVendas = hub === "sp-vendas", isBling = hub === "bling";

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
          <Button variant={isRN ? "default" : "outline"} size="sm" className={cn("gap-2", isRN && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => setHub("rn")}><MapPin className="h-4 w-4" /> Hub Natal</Button>
          <Button variant={isSP ? "default" : "outline"} size="sm" className={cn("gap-2", isSP && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => setHub("sp")}><MapPin className="h-4 w-4" /> CD SP LogHouse</Button>
          <Button variant={isVendas ? "default" : "outline"} size="sm" className={cn("gap-2", isVendas && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => setHub("sp-vendas")}><Users className="h-4 w-4" /> CD SP Vendas</Button>
          <Button variant={isBling ? "default" : "outline"} size="sm" className={cn("gap-2", isBling && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => setHub("bling")}><Cloud className="h-4 w-4" /> CD Bling</Button>
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="movimentacoes" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="politica" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Política de Estoque</TabsTrigger>
          </TabsList>

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
