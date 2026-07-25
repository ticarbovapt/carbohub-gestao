import { useMemo, useState } from "react";
import { LifeBuoy, Search, Hand } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAllBugReports, useUpdateDemanda, useAddDemandaActivity, useDemandaCounts, useAllProfiles,
  type BugReport, type BugStatus,
} from "@/hooks/useBugReports";
import { DemandaBoard } from "@/components/demandas/DemandaBoard";
import { DemandaModal } from "@/components/demandas/DemandaModal";
import { PRIOS, stageLabel } from "@/lib/demandas";
import { playMoveSuccess } from "@/lib/sfx";

export default function Demandas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useAllBugReports();
  const { data: counts = {} } = useDemandaCounts();
  const { data: dir = [] } = useAllProfiles();
  const update = useUpdateDemanda();
  const addAct = useAddDemandaActivity();

  // Foto do responsável no cartão (resolvida pelo diretório).
  const avatarOf = (id: string | null) => (id ? dir.find((x) => x.id === id)?.avatar_url : null);

  const [q, setQ] = useState("");
  const [fKind, setFKind] = useState("all");
  const [fApp, setFApp] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [soMinhas, setSoMinhas] = useState(false);
  const [detail, setDetail] = useState<BugReport | null>(null);

  const apps = useMemo(() => Array.from(new Set(all.map((b) => b.app).filter(Boolean))).sort(), [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((b) => {
      if (soMinhas && b.assignee_id !== user?.id) return false;
      if (fKind !== "all" && b.kind !== fKind) return false;
      if (fApp !== "all" && b.app !== fApp) return false;
      if (fPrio !== "all" && b.priority !== fPrio) return false;
      if (term && !`${b.title} ${b.description} ${b.reporter_name ?? ""} ${b.assignee_name ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [all, q, fKind, fApp, fPrio, soMinhas, user?.id]);

  // Mantém o drawer em sincronia com o dado recarregado.
  const detailLive = detail ? all.find((d) => d.id === detail.id) ?? detail : null;

  // Mover card = mudar etapa. Otimista no cache (não "volta"), som + toast
  // disparados DENTRO do gesto — senão a política de autoplay bloqueia o som.
  function handleMove(d: BugReport, to: BugStatus) {
    qc.setQueryData(["bug_reports", "all"], (old: BugReport[] | undefined) =>
      (old ?? []).map((x) => (x.id === d.id ? { ...x, status: to } : x)));

    playMoveSuccess();
    toast.success("Demanda movida", { description: `${stageLabel(d.status)}  →  ${stageLabel(to)}` });

    update.mutate({ id: d.id, status: to }, {
      onSuccess: () => addAct.mutate({
        demanda_id: d.id, activity_type: "status_change",
        body: `${stageLabel(d.status)} → ${stageLabel(to)}`,
        status_from: d.status, status_to: to,
      }),
    });
  }

  return (
    // h-full (não `fixed`) pra respeitar a sidebar: o <main> do Layout já tem
    // altura definida (100vh − topbar). Só o quadro rola na horizontal.
    <div className="h-full ti-canvas bg-dot-grid flex flex-col overflow-hidden">
      {/* Barra de ferramentas */}
      <div className="shrink-0 border-b bg-card px-4 py-2.5 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <LifeBuoy className="h-5 w-5 text-carbo-green" />
          <h1 className="font-bold text-lg">Demandas</h1>
          <span className="text-xs text-muted-foreground">({filtered.length})</span>
        </div>

        <div className="relative flex-1 min-w-0 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar demanda…" className="pl-9 h-9" />
        </div>

        <div className="flex gap-2 flex-wrap lg:ml-auto">
          <Button variant={soMinhas ? "default" : "outline"} size="sm" className="h-9 gap-1.5"
            onClick={() => setSoMinhas((s) => !s)}>
            <Hand className="h-3.5 w-3.5" /> Minhas
          </Button>
          <Select value={fKind} onValueChange={setFKind}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Bugs + Sugestões</SelectItem>
              <SelectItem value="bug">Só bugs</SelectItem>
              <SelectItem value="sugestao">Só sugestões</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fApp} onValueChange={setFApp}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os apps</SelectItem>
              {apps.map((a) => <SelectItem key={a} value={a} className="uppercase">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda prioridade</SelectItem>
              {PRIOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quadro */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4">
        {isLoading ? (
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-80 shrink-0 h-64 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <DemandaBoard demandas={filtered} onCardClick={setDetail} onMove={handleMove}
            counts={counts} avatarOf={avatarOf} />
        )}
      </div>

      {detailLive && <DemandaModal demanda={detailLive} onClose={() => setDetail(null)} />}
    </div>
  );
}
