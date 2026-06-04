import { useEffect, useMemo, useRef, useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Maximize, RefreshCw, Settings2, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Painéis que podem ser projetados — todos reaproveitam telas/dashboards que já
// existem (consomem os mesmos dados, nada novo). São carregados em iframe com
// ?embed=1, que esconde a navegação e mostra só o conteúdo.
const PANELS: { id: string; label: string; path: string }[] = [
  { id: "dashboard",              label: "Visão Geral",            path: "/dashboard" },
  { id: "dash-producao",          label: "Dashboard Produção",     path: "/dashboards/producao" },
  { id: "dash-financeiro",        label: "Dashboard Financeiro",   path: "/dashboards/financeiro" },
  { id: "dash-logistica",         label: "Dashboard Logística",    path: "/dashboards/logistica" },
  { id: "dash-comercial",         label: "Dashboard Comercial",    path: "/dashboards/comercial" },
  { id: "dash-estrategico",       label: "Dashboard Estratégico",  path: "/dashboards/estrategico" },
  { id: "dash-ecommerce",         label: "E-commerce Vendas",      path: "/dashboards/ecommerce/vendas-online" },
  { id: "dash-meta-ecommerce",    label: "Meta E-commerce",        path: "/dashboards/metas/ecommerce" },
  { id: "dash-meta-vendedores",   label: "Meta Vendedores",        path: "/dashboards/metas/vendedores" },
  { id: "suprimentos",            label: "Suprimentos / Estoque",  path: "/suprimentos" },
  { id: "production-orders",      label: "Ordens de Produção",     path: "/production-orders" },
  { id: "faturamento",            label: "Fila de Faturamento",    path: "/financeiro/faturamento" },
  { id: "ops-alerts",             label: "Alertas Operacionais",   path: "/ops/alerts" },
];

interface ProjConfig {
  selected: string[];   // ids dos painéis, na ordem
  cols: number;         // colunas do grid
  refreshSec: number;   // intervalo de atualização (0 = manual)
}

const STORAGE_KEY = "projecao_config_v1";
const DEFAULT_CONFIG: ProjConfig = { selected: ["dashboard", "dash-producao", "dash-comercial", "dash-financeiro"], cols: 2, refreshSec: 60 };

function loadConfig(): ProjConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export default function Projecao() {
  const [config, setConfig] = useState<ProjConfig>(loadConfig);
  const [showConfig, setShowConfig] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Atualização "suave": em vez de recarregar o iframe (o que dá flash branco
  // e joga o scroll de volta pro topo), avisa cada painel para rebuscar os
  // dados. O conteúdo se mantém no lugar — só os números atualizam.
  const broadcastRefresh = () => {
    Object.values(iframeRefs.current).forEach((f) => {
      f?.contentWindow?.postMessage({ type: "carbo-refresh" }, window.location.origin);
    });
  };

  // Persiste a configuração sempre que muda
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Atualização automática: pede aos painéis que rebusquem os dados (sem F5)
  useEffect(() => {
    if (!config.refreshSec) return;
    const id = setInterval(broadcastRefresh, config.refreshSec * 1000);
    return () => clearInterval(id);
  }, [config.refreshSec]);

  // Acompanha estado de tela cheia
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const selectedPanels = useMemo(
    () => config.selected.map(id => PANELS.find(p => p.id === id)).filter(Boolean) as typeof PANELS,
    [config.selected],
  );

  const togglePanel = (id: string) => {
    setConfig(c => ({
      ...c,
      selected: c.selected.includes(id)
        ? c.selected.filter(x => x !== id)
        : [...c.selected, id],
    }));
  };

  const enterFullscreen = () => {
    gridRef.current?.requestFullscreen?.();
  };

  const rows = Math.max(1, Math.ceil(selectedPanels.length / config.cols));

  // Grid: em tela cheia ocupa 100vh dividido pelas linhas; fora, altura confortável.
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
    gridTemplateRows: isFullscreen ? `repeat(${rows}, minmax(0, 1fr))` : undefined,
    height: isFullscreen ? "100vh" : undefined,
  };

  const gridContent = (
    <div
      ref={gridRef}
      className={cn("grid gap-2 bg-background", isFullscreen && "h-screen w-screen p-2")}
      style={gridStyle}
    >
      {selectedPanels.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-20">
          <Monitor className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">Nenhum painel selecionado</p>
          <p className="text-sm">Clique em "Configurar" e escolha quais dashboards projetar.</p>
        </div>
      ) : (
        selectedPanels.map(panel => (
          <div
            key={panel.id}
            className="relative rounded-lg border border-border overflow-hidden bg-card"
            style={{ minHeight: isFullscreen ? undefined : 460 }}
          >
            <iframe
              ref={(el) => { iframeRefs.current[panel.id] = el; }}
              src={`${panel.path}?embed=1`}
              title={panel.label}
              className="w-full h-full border-0"
              style={{ minHeight: isFullscreen ? undefined : 460 }}
            />
          </div>
        ))
      )}
    </div>
  );

  // Em tela cheia o grid é renderizado direto (sem o BoardLayout)
  if (isFullscreen) return gridContent;

  return (
    <BoardLayout>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="h-6 w-6 text-carbo-green" />
              Projeção
            </h1>
            <p className="text-sm text-muted-foreground">
              Monte um telão ao vivo com vários dashboards numa tela só — sem precisar de várias abas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={broadcastRefresh} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Atualizar agora
            </Button>
            <Button variant="outline" onClick={() => setShowConfig(v => !v)} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Configurar
            </Button>
            <Button onClick={enterFullscreen} disabled={selectedPanels.length === 0} className="gap-1.5 carbo-gradient text-white">
              <Maximize className="h-4 w-4" /> Projetar (tela cheia)
            </Button>
          </div>
        </div>

        {/* Painel de configuração */}
        {showConfig && (
          <CarboCard>
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Configurar projeção</h3>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowConfig(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Layout + refresh */}
              <div className="flex flex-wrap gap-6">
                <div className="space-y-1.5">
                  <Label className="text-xs">Colunas</Label>
                  <Select value={String(config.cols)} onValueChange={v => setConfig(c => ({ ...c, cols: Number(v) }))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n} coluna{n > 1 ? "s" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Atualizar a cada</Label>
                  <Select value={String(config.refreshSec)} onValueChange={v => setConfig(c => ({ ...c, refreshSec: Number(v) }))}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Manual (não atualiza)</SelectItem>
                      <SelectItem value="30">30 segundos</SelectItem>
                      <SelectItem value="60">1 minuto</SelectItem>
                      <SelectItem value="300">5 minutos</SelectItem>
                      <SelectItem value="900">15 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Seleção de painéis */}
              <div className="space-y-2">
                <Label className="text-xs">Painéis ({config.selected.length} selecionado{config.selected.length !== 1 ? "s" : ""})</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {PANELS.map(panel => {
                    const checked = config.selected.includes(panel.id);
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        onClick={() => togglePanel(panel.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          checked
                            ? "border-carbo-green bg-carbo-green/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50",
                        )}
                      >
                        <span className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          checked ? "bg-carbo-green border-carbo-green" : "border-muted-foreground/40",
                        )}>
                          {checked && <span className="h-2 w-2 rounded-sm bg-white" />}
                        </span>
                        <span className="truncate">{panel.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Dica: os painéis aparecem na ordem em que você seleciona. Em tela cheia, use ESC para sair.
                </p>
              </div>
            </div>
          </CarboCard>
        )}

        {/* Pré-visualização do grid */}
        {gridContent}
      </div>
    </BoardLayout>
  );
}
