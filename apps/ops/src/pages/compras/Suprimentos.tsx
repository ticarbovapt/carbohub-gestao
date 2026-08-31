import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Package, MapPin, Users, Cloud, Send, AlertCircle, ArrowLeftRight, Settings2, Building2,
  ArrowDownToLine, ArrowUpFromLine, Boxes, Layers, AlertTriangle, Activity, Info, Link2, Truck,
  CheckCircle, XCircle, FileText, Loader2, Search, Globe, ArrowUpRight,
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
import { SkuMapeamento } from "@/components/suprimentos/SkuMapeamento";


// É a versão EDITÁVEL do estoque (gestores). A versão somente leitura vive em Estoque.

// ─────────────────────────────────────────────────────────────────────────────
// HUB e ABA vivem na URL: /suprimentos/{hub}/{aba}
//
// Antes eram dois useState e a URL era sempre `/suprimentos`. Não dava para
// mandar "olha o estoque do CD SP" para ninguém, o F5 voltava pro Hub Natal e
// o Voltar do navegador saía da tela em vez de voltar de aba. É o mesmo
// problema que /logistica/:aba já resolveu — e o desenho aqui é cópia dele.
//
// A identidade do hub é o `slug` de stockData.ts, que JÁ EXISTIA (com um
// `hubBySlug` sem nenhum consumidor — resto de um desenho abandonado). Havia
// três vocabulários para dizer a mesma coisa: o `Hub` local ("sp-vendas"), o
// `HUBS[].id` ("spv") e o `code` do banco ("HUB-SP-VENDAS"). Agora só o slug
// atravessa a tela; os outros dois viraram tradução na borda.
//
// ⚠️ O `code` do banco NÃO vai na URL: é caixa alta com hífen, e no caso do
// CD Bling nenhuma migração chega a criar a linha em `warehouses` — o link
// existe e leva a uma tela naturalmente vazia.
// ─────────────────────────────────────────────────────────────────────────────
type HubId = "rn" | "sp" | "spv" | "bling" | "esc";
const HUB_PADRAO: HubId = "rn";
// slug (URL) → id de UI, e id → código do warehouse. Só estas duas traduções.
const hubIdBySlug = (slug?: string): HubId | null =>
  (HUBS.find((h) => h.slug === slug)?.id as HubId | undefined) ?? null;
const slugOf = (id: HubId) => HUBS.find((h) => h.id === id)?.slug ?? "hub-natal";
const HUB_CODE: Record<HubId, string> = { rn: "HUB-RN", sp: "HUB-SP", spv: "HUB-SP-VENDAS", bling: "CD-BLING", esc: "HUB-ESCRITORIO" };

// Ordem, rótulo, ícone e RESTRIÇÃO DE HUB das abas num lugar só — é daqui que
// sai a TabsList e é contra esta lista que a URL é validada.
//
// A restrição estava duplicada: as condições `isSP &&` / `isRN &&` na TabsList
// e as listas spOnly/vendasOnly/rnOnly no changeHub. Duas fontes para a mesma
// regra, e a URL seria a terceira — validaria contra uma enquanto a tela
// renderiza pela outra, e a aba existiria no endereço sem existir na tela.
const ABAS = [
  { id: "estoque",         label: "Estoque",             icon: Boxes },
  { id: "movimentacoes",   label: "Movimentações",       icon: ArrowLeftRight },
  { id: "transito",        label: "Em Trânsito",         icon: Truck,           hubs: ["sp"] },
  { id: "mapeamento",      label: "Mapeamento SKU",      icon: Link2,           hubs: ["sp"] },
  { id: "vendas-transito", label: "Remessas",            icon: Truck,           hubs: ["spv"] },
  // ⚠️ Sem `hubs`: envio e recebimento passaram a valer em TODOS os estoques.
  // Enquanto só Natal enviava, restringir a "rn" descrevia a realidade. Agora
  // qualquer estoque envia para qualquer outro, e o CD SP precisa da aba de
  // recebimento para aceitar o que Natal mandou — sem ela o saldo fica preso
  // em trânsito e ninguém sabe onde clicar.
  { id: "envios-sp",       label: "Envios",              icon: Send },
  { id: "recebimento",     label: "Recebimento",         icon: ArrowDownToLine },
  { id: "notas",           label: "Notas Fiscais",       icon: FileText,        hubs: ["rn"] },
  { id: "politica",        label: "Política de Estoque", icon: Settings2 },
] as const;
const ABA_PADRAO = ABAS[0].id;
// Sem `hubs` = vale em todos. "estoque" existe nos quatro, por isso é o refúgio
// seguro quando a URL pede uma combinação impossível.
const abaValeNoHub = (abaId: string, hub: HubId) => {
  const a = ABAS.find((x) => x.id === abaId);
  return !!a && (!("hubs" in a) || (a.hubs as readonly string[]).includes(hub));
};

// ⚠️ `capitalize` no CSS transformava `ecommerce` em "Ecommerce" — palavra que
// ninguém usa e que não diz de onde veio a baixa. Rótulo é decisão, não efeito
// colateral de estilo.
const ORIGEM_LABEL: Record<string, string> = {
  ecommerce: "Venda on-line",
  venda: "Venda",
  ajuste: "Ajuste",
  transferencia: "Transferência",
  producao: "Produção",
};

const PERIODOS = [{ v: "7d", label: "Últimos 7 dias" }, { v: "30d", label: "Últimos 30 dias" }, { v: "mes", label: "Este mês" }];
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");


export default function Suprimentos() {
  // A URL manda. Valor inválido cai no padrão em silêncio (com `replace`), sem
  // página de erro: isto é preferência de visualização, não recurso — link
  // velho ou digitado errado deve mostrar a tela, não um 404.
  const { hub: hubSlug, aba } = useParams<{ hub?: string; aba?: string }>();
  const navigate = useNavigate();
  const hub: HubId = hubIdBySlug(hubSlug) ?? HUB_PADRAO;
  // A aba precisa ser válida E existir NESTE hub. Sem a segunda checagem,
  // /suprimentos/hub-natal/transito renderizaria um conteúdo cuja aba não está
  // na barra — o pedido some da tela sem erro nenhum, que é o modo de falha
  // que já nos mordeu no pós-venda.
  const activeTab = abaValeNoHub(aba ?? "", hub) ? (aba as string) : ABA_PADRAO;
  const irPara = (h: HubId, a: string) => navigate(`/suprimentos/${slugOf(h)}/${a}`);
  const setActiveTab = (v: string) => irPara(hub, v);

  // ── Período dos KPIs: na URL, com o localStorage rebaixado a PADRÃO ──────
  //
  // Hub e aba foram para o caminho porque dizem O QUE se está olhando. O
  // período diz COMO se está filtrando, e filtro no repo mora em query string
  // (OSBoard, Pager). Daí `?periodo=`, não um terceiro segmento de caminho.
  //
  // O localStorage NÃO virou um segundo dono: ele só fornece o valor inicial
  // quando a URL não diz nada. A partir daí quem manda é a URL, e o efeito
  // canonizador escreve o período nela — assim todo endereço copiado da barra
  // já carrega o filtro, e o colega que recebe o link vê o MESMO período, não
  // o que estava guardado no navegador dele.
  //
  // Continua sendo lembrado entre sessões, que é o que fazia esta tela virar
  // dashboard: quem abre /suprimentos puro cai no período que usava antes.
  const [searchParams, setSearchParams] = useSearchParams();
  const leiaLocal = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  // "YYYY-MM" é valor válido (mês específico do seletor), por isso o regex.
  const periodoValido = (v: string) => ["7d", "30d", "mes", "custom"].includes(v) || /^\d{4}-\d{2}$/.test(v);
  const pUrl = searchParams.get("periodo") ?? "";
  const periodo = periodoValido(pUrl) ? pUrl : (periodoValido(leiaLocal("ops_sup_periodo")) ? leiaLocal("ops_sup_periodo") : "7d");
  const customFrom = searchParams.get("de") ?? (pUrl ? "" : leiaLocal("ops_sup_from"));
  const customTo = searchParams.get("ate") ?? (pUrl ? "" : leiaLocal("ops_sup_to"));

  // Escreve na URL (histórico normal: o Voltar desfaz a troca de período) e
  // lembra a preferência para a próxima sessão.
  const aplicaPeriodo = (next: { periodo?: string; de?: string; ate?: string }) => {
    const p = next.periodo ?? periodo;
    const de = next.de ?? customFrom;
    const ate = next.ate ?? customTo;
    const sp = new URLSearchParams(searchParams);
    sp.set("periodo", p);
    // `de`/`ate` só existem no modo custom — deixá-los na URL fora dele seria
    // ruído que ninguém lê e que confunde quem tenta editar o endereço à mão.
    if (p === "custom") { de ? sp.set("de", de) : sp.delete("de"); ate ? sp.set("ate", ate) : sp.delete("ate"); }
    else { sp.delete("de"); sp.delete("ate"); }
    setSearchParams(sp);
    try {
      localStorage.setItem("ops_sup_periodo", p);
      localStorage.setItem("ops_sup_from", p === "custom" ? de : "");
      localStorage.setItem("ops_sup_to", p === "custom" ? ate : "");
    } catch { /* ignora */ }
  };
  const setPeriodo = (v: string) => aplicaPeriodo({ periodo: v });
  const setCustomFrom = (v: string) => aplicaPeriodo({ periodo: "custom", de: v });
  const setCustomTo = (v: string) => aplicaPeriodo({ periodo: "custom", ate: v });

  // Canoniza: /suprimentos puro, hub inexistente ou combinação impossível
  // viram o endereço válido. `replace` para não empilhar histórico — senão o
  // Voltar fica preso repetindo o redirecionamento.
  useEffect(() => {
    if (hubSlug !== slugOf(hub) || aba !== activeTab) {
      navigate(`/suprimentos/${slugOf(hub)}/${activeTab}?${searchParams}`, { replace: true });
      return;
    }
    // Período ausente ou inválido na URL: grava o efetivo, para que o endereço
    // copiado da barra já leve o filtro junto.
    if (pUrl !== periodo) {
      const sp = new URLSearchParams(searchParams);
      sp.set("periodo", periodo);
      if (periodo === "custom") {
        if (customFrom) sp.set("de", customFrom);
        if (customTo) sp.set("ate", customTo);
      }
      setSearchParams(sp, { replace: true });
    }
  }, [hubSlug, aba, hub, activeTab, navigate, pUrl, periodo, customFrom, customTo, searchParams, setSearchParams]);
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
  const isRN = hub === "rn", isSP = hub === "sp", isVendas = hub === "spv", isBling = hub === "bling", isEsc = hub === "esc";
  const stockHub = HUBS.find((h) => h.id === hub) ?? HUBS[0];

  useStockLive(); // atualiza ao vivo quando outro usuário mexe no estoque (produção ou manual)
  const { data: products = [] } = useStock();
  const { data: transfers = [] } = useStockTransfers();

  // Transferências por direção, RELATIVAS ao estoque aberto.
  //
  // ⚠️ Antes eram três listas com o código escrito na mão ("HUB-RN",
  // "HUB-SP"...). Com cinco estoques e as caixas dos vendedores, isso viraria
  // uma constante por par — e cada par novo exigiria mexer aqui. As duas
  // listas abaixo respondem sempre a mesma pergunta: o que SAI daqui e o que
  // CHEGA aqui.
  const enviosDaqui = useMemo(
    () => transfers.filter((t) => t.fromCode === HUB_CODE[hub]), [transfers, hub]);
  const chegandoAqui = useMemo(
    () => transfers.filter((t) => t.toCode === HUB_CODE[hub]), [transfers, hub]);
  // Mantidas para as abas próprias do CD SP e do CD SP Vendas, que existiam
  // antes e continuam fazendo sentido do ponto de vista de quem opera lá.
  const transitoSP = useMemo(() => transfers.filter((t) => t.toCode === "HUB-SP"), [transfers]);
  const remessasVendas = useMemo(() => transfers.filter((t) => t.toCode === "HUB-SP-VENDAS"), [transfers]);

  // KPIs do hub selecionado
  const stockId = hub;
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
  // Movimentações do hub no período — hub e janela filtrados NO SERVIDOR.
  // Antes vinham as 300 mais recentes de todos os hubs e a tela recortava
  // depois; bastava um hub movimentar muito para os outros ficarem com a aba
  // vazia. Com as saídas por venda entrando na tabela, isso deixaria de ser
  // hipótese.
  const { data: movsPeriodo = [], isLoading: movLoading } = useStockMovements(
    HUB_CODE[hub], range.from.toISOString(), range.to.toISOString(),
  );
  // KPIs de movimentação contados DIRETO no banco (sem o cap de 300 da lista — C10).
  const { data: movStats } = useStockMovementStats(HUB_CODE[hub], range.from.toISOString(), range.to.toISOString());
  const kpis = {
    total: products.length,
    emBaixa: lowStock.length,
    entradas: movStats?.entradas ?? movsPeriodo.filter((m) => m.tipo === "entrada").length,
    saidas: movStats?.saidas ?? movsPeriodo.filter((m) => m.tipo === "saida").length,
    movimentacoes: movStats?.movimentacoes ?? movsPeriodo.length,
  };

  // Ao trocar de hub, mantém a aba se ela existir no destino; senão cai em
  // "estoque". A regra vem da lista ABAS — a mesma que a URL valida e a mesma
  // que desenha a barra.
  const changeHub = (next: HubId) => {
    irPara(next, abaValeNoHub(activeTab, next) ? activeTab : ABA_PADRAO);
  };

  // Card de transferência (envio/remessa) com ações opcionais de chegada/estorno.
  const TransferCard = ({ t, withActions, mostrarOrigem, mostrarDestino }: {
    t: Transfer; withActions: boolean; mostrarOrigem?: boolean; mostrarDestino?: boolean;
  }) => {
    const done = t.status === "entregue", cancelled = t.status === "estornado";
    return (
      <CarboCard key={t.id}><CarboCardContent className="py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className={cn("p-2 rounded-lg", done ? "bg-green-500/10" : cancelled ? "bg-destructive/10" : "bg-blue-500/10")}>
            {done ? <CheckCircle className="h-5 w-5 text-carbo-green" /> : cancelled ? <XCircle className="h-5 w-5 text-destructive" /> : <Truck className="h-5 w-5 text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t.produto}</p>
            {/* ⚠️ De onde veio / para onde vai, escrito. Com cinco estoques e as
                caixas dos vendedores, um card que só diz "enviado em" não
                responde a primeira pergunta de quem olha. */}
            {(mostrarOrigem || mostrarDestino) && (
              <p className="text-xs text-foreground/80 mt-0.5">
                {mostrarOrigem ? <>de <strong>{t.fromNome || t.fromCode}</strong></>
                               : <>para <strong>{t.toNome || t.toCode}</strong></>}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Enviado em {fmtDate(t.enviado)}
              {t.registradoPor ? ` por ${t.registradoPor}` : ""}
              {t.nota ? ` · ${t.nota}` : ""}
            </p>
            {/* QUEM DEU O ACEITE. É o registro que transfere a responsabilidade
                sobre a mercadoria — e ele existia no banco desde a 20260710310000
                sem nunca aparecer em tela nenhuma. */}
            {t.status === "entregue" && (
              <p className="text-xs text-carbo-green mt-0.5">
                Aceito {t.aceitoEm ? `em ${fmtDate(t.aceitoEm)}` : ""}
                {t.aceitoPor ? ` por ${t.aceitoPor}` : " — autor não registrado"}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-xl">{t.qtd.toLocaleString("pt-BR")} <span className="text-xs font-normal text-muted-foreground">{t.unidade}</span></p>
            <CarboBadge variant={done ? "success" : cancelled ? "cancelled" : "info"}>{done ? "Entregue" : cancelled ? "Estornado" : "Em trânsito"}</CarboBadge>
          </div>
          {withActions && t.status === "em_transito" && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5 border-green-500/30 text-carbo-green hover:bg-green-500/10" onClick={() => setRemessaConfirm({ action: "confirmar", id: t.id, produto: t.produto })}><CheckCircle className="h-4 w-4" /> Aceitar recebimento</Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setRemessaConfirm({ action: "estornar", id: t.id, produto: t.produto })}><XCircle className="h-4 w-4" /> Não chegou / Estornar</Button>
            </div>
          )}
        </div>
      </CarboCardContent></CarboCard>
    );
  };

  // Política de Estoque do CD ATUAL (cada CD gerencia só o dele).
  const currentCode = HUB_CODE[hub];
  const currentHubId = hub;
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
          <Button variant={isVendas ? "default" : "outline"} size="sm" className={cn("gap-2", isVendas && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("spv")}><Users className="h-4 w-4" /> CD SP Vendas</Button>
          <Button variant={isBling ? "default" : "outline"} size="sm" className={cn("gap-2", isBling && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("bling")}><Cloud className="h-4 w-4" /> CD Bling</Button>
          <Button variant={isEsc ? "default" : "outline"} size="sm" className={cn("gap-2", isEsc && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")} onClick={() => changeHub("esc")}><Building2 className="h-4 w-4" /> Escritório</Button>
          {/* ⚠️ Em TODOS os estoques, não só em Natal — e a origem do diálogo é
              o estoque da aba. O CD Bling fica de fora: o saldo dele vem da
              integração, e um envio manual dali criaria um número que a
              próxima sincronização apaga sem avisar. */}
          {!isBling && <Button size="sm" variant="outline" className="gap-2 ml-auto border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => setEnvioOpen(true)}><Send className="h-4 w-4" /> Registrar Envio</Button>}
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
          {/* Gerada da lista ABAS — a mesma que valida a URL. Ver o comentário
              dela: manter isto em JSX fixo era a segunda fonte da regra. */}
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {ABAS.filter((a) => abaValeNoHub(a.id, hub)).map((a) => (
              <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
                <a.icon className="h-3.5 w-3.5" /> {a.label}
              </TabsTrigger>
            ))}
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
            ) : movsPeriodo.length === 0 ? <CarboEmptyState title="Nenhuma movimentação neste hub" description="Entradas, saídas e ajustes deste hub aparecem aqui." /> : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Por</TableHead><TableHead>Origem</TableHead><TableHead>Card</TableHead></TableRow></TableHeader>
                <TableBody>
                  {movsPeriodo.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(m.data)}</TableCell>
                      <TableCell className="font-medium">{m.produto}<span className="ml-2 text-xs text-muted-foreground font-mono">{m.product_code}</span></TableCell>
                      <TableCell>
                        <CarboBadge variant={m.tipo === "entrada" ? "success" : "warning"} dot>
                          <span className="inline-flex items-center gap-1">{m.tipo === "entrada" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}{m.tipo === "entrada" ? "Entrada" : "Saída"}</span>
                        </CarboBadge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{m.qtd.toLocaleString("pt-BR")} {m.unidade}</TableCell>
                      {/* ⚠️ "Automático" e "—" NÃO são a mesma coisa: um diz
                          que o sistema fez, o outro que ninguém sabe quem fez.
                          A dedução do e-commerce roda pelo pg_cron, sem sessão,
                          então `created_by` é nulo — e sem esta distinção ela
                          apareceria igual a movimento antigo sem autor. */}
                      <TableCell className="text-sm text-muted-foreground">
                        {m.por ?? (m.executor
                          ? <span className="text-carbo-blue" title={m.executor}>Automático</span>
                          : "—")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="capitalize">{ORIGEM_LABEL[m.origem] ?? m.origem}</span>
                        {m.observacoes ? <span className="ml-1 text-xs">· {m.observacoes}</span> : ""}
                      </TableCell>
                      {/* Coluna própria pro card de origem. O número já aparecia
                          dentro do texto da observação, mas ali é TEXTO: não dá
                          pra filtrar, ordenar nem copiar sem catar no meio da
                          frase. Aqui é o dado, vindo de order_id / op_id. */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {m.opNumber && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono" title="Ordem de produção">
                            <Layers className="h-3 w-3 shrink-0" />{m.opNumber}
                          </span>
                        )}
                        {m.orderNumber && (
                          <span className={`inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono ${m.opNumber ? "ml-1" : ""}`} title="Pedido de venda">
                            <FileText className="h-3 w-3 shrink-0" />{m.orderNumber}
                          </span>
                        )}
                        {/* Pedido de e-commerce: id de TEXTO, não cabe em
                            `order_id` (uuid, FK de carboze_orders). Vem da
                            coluna própria `ref_externa`.

                            ⚠️ O rótulo é o NÚMERO DA LOJA (601), não o
                            `plataforma:id-interno` que a coluna guarda. O id
                            interno é longo, não aparece em lugar nenhum que o
                            operador use, e a pergunta que esta tela responde é
                            "esta baixa é de qual venda?". O texto cru fica no
                            `title`, para quem precisar copiar.

                            ⚠️ E vira LINK para o card só quando existe
                            `bling_id`. Sem ele o pedido ainda não foi faturado
                            — a baixa já aconteceu e o card ainda não nasceu.
                            Isso é estado esperado, e um link que cai no vazio
                            seria pior que nenhum: o catch-all mandaria a pessoa
                            para a home sem dizer por quê, como aconteceu no
                            chip "ver pedido" das Conversas. */}
                        {m.refExterna && (() => {
                          const rotulo = m.ecomNumero ?? m.refExterna;
                          const classe = `inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono ${m.opNumber || m.orderNumber ? "ml-1" : ""}`;
                          return m.ecomBlingId ? (
                            <Link
                              /* ⚠️ O parâmetro é `card`, não `pedido`. A Esteira
                                 lê `params.get("card")` e ignora qualquer outro
                                 nome — com `?pedido=` a tela abria e o card
                                 NUNCA abria, sem erro nenhum. É a mesma falha
                                 silenciosa que o comentário logo acima descreve.
                                 O nome vem do botão "Copiar link" da própria
                                 Esteira; ao mudar um, confira o outro. */
                              to={`/logistica/esteira?card=${m.ecomBlingId}`}
                              className={`${classe} bg-carbo-blue/10 text-carbo-blue hover:bg-carbo-blue/20`}
                              title={`Abrir na Esteira do On-line · ${m.refExterna}`}
                            >
                              <Globe className="h-3 w-3 shrink-0" />{rotulo}
                              <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </Link>
                          ) : (
                            <span
                              className={`${classe} bg-muted`}
                              title={`${m.refExterna} · ainda sem card: o pedido só entra na esteira quando é faturado no Bling`}
                            >
                              <Globe className="h-3 w-3 shrink-0" />{rotulo}
                            </span>
                          );
                        })()}
                        {/* Ajuste manual e transferência não vêm de card nenhum —
                            e o traço diz isso melhor que célula vazia. */}
                        {!m.opNumber && !m.orderNumber && !m.refExterna && <span className="text-muted-foreground">—</span>}
                      </TableCell>
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

          {/* Mapeamento SKU (SP) — cadastro real em `sku_product_mappings` */}
          <TabsContent value="mapeamento" className="mt-4 space-y-4">
            <SkuMapeamento />
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

          {/* ENVIOS — o que SAI deste estoque.
              ⚠️ Sem ação de confirmar aqui: quem aceita é o destino. Botão de
              "confirmar chegada" na tela de quem enviou é como o saldo entra
              numa prateleira que ninguém conferiu. O estorno continua sendo de
              quem enviou, porque é ele que descobre que a carga não saiu. */}
          <TabsContent value="envios-sp" className="mt-4 space-y-4">
            {enviosDaqui.length === 0 ? <CarboEmptyState title="Nenhum envio registrado" description='Use "Registrar Envio" no topo da tela.' /> : (
            <>
            <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
              <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {enviosDaqui.filter((e) => e.status === "em_transito").length} em trânsito</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {enviosDaqui.filter((e) => e.status === "entregue").length} entregues</span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><XCircle className="h-4 w-4 text-destructive" /> {enviosDaqui.filter((e) => e.status === "estornado").length} estornados</span>
            </div>
            {enviosDaqui.map((e) => <TransferCard key={e.id} t={e} withActions={false} mostrarDestino />)}
            </>
            )}
          </TabsContent>

          {/* RECEBIMENTO — o que CHEGA neste estoque, e o aceite.
              ⚠️ É esta aba que credita o saldo. Antes ela era um placeholder de
              "próxima fase" e o aceite só existia nas abas do CD SP — ou seja,
              um envio para o Escritório ou para a caixa de um vendedor não
              tinha onde ser aceito e ficaria em trânsito para sempre. */}
          <TabsContent value="recebimento" className="mt-4 space-y-4">
            {chegandoAqui.length === 0 ? (
              <CarboEmptyState title="Nada chegando" description="Envios de outros estoques para cá aparecem aqui, esperando o aceite." />
            ) : (
              <>
                <div className="flex items-center gap-5 px-1 flex-wrap text-sm">
                  <span className="flex items-center gap-1.5 text-blue-400 font-medium"><Truck className="h-4 w-4" /> {chegandoAqui.filter((t) => t.status === "em_transito").length} aguardando aceite</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><CheckCircle className="h-4 w-4 text-carbo-green" /> {chegandoAqui.filter((t) => t.status === "entregue").length} recebidos</span>
                </div>
                {chegandoAqui.map((t) => <TransferCard key={t.id} t={t} withActions mostrarOrigem />)}
              </>
            )}
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
      <CDSPRegistrarEnvioDialog open={envioOpen} onOpenChange={setEnvioOpen} origemInicial={HUB_CODE[hub]} />
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
