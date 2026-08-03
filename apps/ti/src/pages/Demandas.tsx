import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Search, Hand, Plus, X, Inbox, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAllBugReports, useUpdateDemanda, useDemandaCounts, useAllProfiles, useAssumirDemanda,
  type BugReport, type BugStatus,
} from "@/hooks/useBugReports";
import { DemandaBoard } from "@/components/demandas/DemandaBoard";
import { DemandaModal } from "@/components/demandas/DemandaModal";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { KINDS, PRIOS, kindLabel, stageLabel } from "@/lib/demandas";
import { playMoveSuccess } from "@/lib/sfx";

// ─────────────────────────────────────────────────────────────────────────────
// Filtro por pessoa — UM controle, dois papéis.
//
// "Demandas do Fulano" é ambíguo: pode ser o que ele ESTÁ RESOLVENDO
// (assignee) ou o que ele PEDIU (reporter). O gestor faz as duas perguntas, e
// as duas precisam caber numa barra que já tem busca + 3 selects + 1 botão.
//
// Descartado: um select de pessoa + um alternador responsável/solicitante ao
// lado. São dois controles pra uma pergunta só, e o alternador fica sem sentido
// enquanto nenhuma pessoa está escolhida (estado morto ocupando espaço).
//
// Escolhido: um único select com as pessoas agrupadas por papel. O papel vira
// parte da própria opção — escolher já é responder "responsável ou
// solicitante?", sem passo extra. O valor carrega o papel no prefixo e o gatilho
// fechado sempre mostra "Resp.: X" / "Solic.: X", nunca só o nome solto.
// ─────────────────────────────────────────────────────────────────────────────
const PESSOA_TODAS = "all";
/** Demanda órfã: é justamente a que o gestor caça (o quadro já acusa "sem dono"). */
const SEM_RESPONSAVEL = "resp:__sem__";
const papelDe = (v: string) => (v.startsWith("sol:") ? "sol" : "resp");
const alvoDe = (v: string) => v.slice(v.indexOf(":") + 1);

export default function Demandas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useAllBugReports();
  const { data: counts = {} } = useDemandaCounts();
  const { data: dir = [] } = useAllProfiles();
  const update = useUpdateDemanda();
  const assumir = useAssumirDemanda();

  // Foto do responsável no cartão (resolvida pelo diretório).
  const avatarOf = (id: string | null) => (id ? dir.find((x) => x.id === id)?.avatar_url : null);

  const [q, setQ] = useState("");
  const [fKind, setFKind] = useState("all");
  const [fApp, setFApp] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  // "Minhas" NÃO é um estado separado: é um atalho que preenche este mesmo
  // seletor com o usuário logado como responsável. Dois estados no mesmo eixo
  // (pessoa) se contradiziam — "Minhas" ligado + "Solic.: Marcio" devolvia um
  // quadro vazio sem o usuário entender por quê.
  const [fPessoa, setFPessoa] = useState(PESSOA_TODAS);
  const [detail, setDetail] = useState<BugReport | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const apps = useMemo(() => Array.from(new Set(all.map((b) => b.app).filter(Boolean))).sort(), [all]);

  // Só quem aparece nas demandas carregadas. O diretório inteiro da empresa no
  // dropdown seria uma lista de gente que nunca abriu nem recebeu demanda.
  // O nome vem do diretório (fica atualizado) e cai pro nome gravado na demanda
  // quando a pessoa já não está no diretório.
  const pessoas = useMemo(() => {
    const nomeDe = (id: string, gravado: string | null) =>
      dir.find((p) => p.id === id)?.full_name ?? gravado ?? "Sem nome";
    const resp = new Map<string, string>();
    const sol = new Map<string, string>();
    let semResponsavel = false;
    for (const b of all) {
      if (b.assignee_id) resp.set(b.assignee_id, nomeDe(b.assignee_id, b.assignee_name));
      else semResponsavel = true;
      if (b.reporter_id) sol.set(b.reporter_id, nomeDe(b.reporter_id, b.reporter_name));
    }
    const ordenar = (m: Map<string, string>) =>
      [...m].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { resp: ordenar(resp), sol: ordenar(sol), semResponsavel };
  }, [all, dir]);

  /** Rótulo do filtro ativo — usado no gatilho e no aviso fixo da barra. */
  const pessoaAtiva = useMemo(() => {
    if (fPessoa === PESSOA_TODAS) return null;
    if (fPessoa === SEM_RESPONSAVEL) return { papel: "Sem responsável", nome: "", curto: "Sem responsável" };
    const papel = papelDe(fPessoa) === "resp" ? "Responsável" : "Solicitante";
    const id = alvoDe(fPessoa);
    const lista = papelDe(fPessoa) === "resp" ? pessoas.resp : pessoas.sol;
    const nome = lista.find((p) => p.id === id)?.nome
      ?? dir.find((p) => p.id === id)?.full_name
      ?? "Sem nome";
    return { papel, nome, curto: `${papel === "Responsável" ? "Resp." : "Solic."}: ${nome}` };
  }, [fPessoa, pessoas, dir]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((b) => {
      if (fPessoa === SEM_RESPONSAVEL ? !!b.assignee_id
        : fPessoa !== PESSOA_TODAS
          && (papelDe(fPessoa) === "resp" ? b.assignee_id : b.reporter_id) !== alvoDe(fPessoa)) return false;
      if (fKind !== "all" && b.kind !== fKind) return false;
      if (fApp !== "all" && b.app !== fApp) return false;
      if (fPrio === "__none__" ? !!b.priority : fPrio !== "all" && b.priority !== fPrio) return false;
      if (term && !`${b.title} ${b.description} ${b.reporter_name ?? ""} ${b.assignee_name ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [all, q, fKind, fApp, fPrio, fPessoa]);

  // "Minhas" é só o atalho pro próprio usuário como responsável.
  const valorMinhas = user?.id ? `resp:${user.id}` : "";
  const soMinhas = !!valorMinhas && fPessoa === valorMinhas;

  const filtroAtivo = !!q.trim() || fPessoa !== PESSOA_TODAS || fKind !== "all" || fApp !== "all" || fPrio !== "all";
  const limparFiltros = () => { setQ(""); setFPessoa(PESSOA_TODAS); setFKind("all"); setFApp("all"); setFPrio("all"); };

  // Mantém o modal em sincronia com o dado recarregado. Se a demanda sumiu
  // (arquivada por outra pessoa), fecha em vez de operar sobre um fantasma.
  const detailLive = detail ? all.find((d) => d.id === detail.id) ?? null : null;
  useEffect(() => { if (detail && !isLoading && !detailLive) setDetail(null); }, [detail, detailLive, isLoading]);

  // Mover card = mudar etapa.
  //  • cache otimista pra não "voltar" no meio do gesto;
  //  • o SOM toca no gesto (política de autoplay), mas o TOAST de sucesso só
  //    depois que o banco confirma — antes a tela cantava vitória mesmo quando
  //    a RLS recusava a escrita;
  //  • em erro, desfaz a mudança no cache.
  //  A atividade de troca de etapa é gravada por trigger no banco.
  function handleMove(d: BugReport, to: BugStatus, undo = false) {
    const from = d.status;
    const anterior = qc.getQueryData<BugReport[]>(["bug_reports", "all"]);
    qc.setQueryData(["bug_reports", "all"], (old: BugReport[] | undefined) =>
      (old ?? []).map((x) => (x.id === d.id ? { ...x, status: to } : x)));
    playMoveSuccess();

    update.mutate({ id: d.id, status: to }, {
      onSuccess: () => {
        toast.success("Demanda movida", {
          description: `${stageLabel(from)}  →  ${stageLabel(to)}`,
          action: undo ? undefined : {
            label: "Desfazer",
            onClick: () => handleMove({ ...d, status: to }, from, true),
          },
        });
      },
      onError: () => {
        if (anterior) qc.setQueryData(["bug_reports", "all"], anterior);
      },
      onSettled: () => qc.invalidateQueries({ queryKey: ["bug_reports"] }),
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
          <span className="text-xs text-muted-foreground">
            ({filtered.length}{filtroAtivo ? ` de ${all.length}` : ""})
          </span>
          <Button size="sm" className="h-8 gap-1.5 ml-1" onClick={() => setNovaAberta(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        </div>

        <div className="relative flex-1 min-w-0 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar demanda…" className="pl-9 h-9" />
        </div>

        <div className="flex gap-2 flex-wrap lg:ml-auto">
          <Button variant={soMinhas ? "default" : "outline"} size="sm" className="h-9 gap-1.5"
            disabled={!valorMinhas}
            onClick={() => setFPessoa(soMinhas ? PESSOA_TODAS : valorMinhas)}>
            <Hand className="h-3.5 w-3.5" /> Minhas
          </Button>

          <Select value={fPessoa} onValueChange={setFPessoa}>
            {/* Sem <SelectValue />: o texto da opção é só o nome, e nome solto
                não diz se o filtro é por quem resolve ou por quem pediu. */}
            <SelectTrigger className="w-44 h-9">
              <span className="truncate">{pessoaAtiva?.curto ?? "Qualquer pessoa"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PESSOA_TODAS}>Qualquer pessoa</SelectItem>
              {pessoas.semResponsavel && (
                <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
              )}
              {pessoas.resp.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Responsável (quem resolve)</SelectLabel>
                    {pessoas.resp.map((p) => (
                      <SelectItem key={`resp:${p.id}`} value={`resp:${p.id}`}>{p.nome}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {pessoas.sol.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Solicitante (quem pediu)</SelectLabel>
                    {pessoas.sol.map((p) => (
                      <SelectItem key={`sol:${p.id}`} value={`sol:${p.id}`}>{p.nome}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={fKind} onValueChange={setFKind}>
            <SelectTrigger className="w-36 h-9">
              <span className="truncate">{fKind === "all" ? "Todos os tipos" : kindLabel(fKind)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {/* Vem de KINDS pra categoria nova entrar no filtro sozinha. */}
              {KINDS.map((k) => (
                <SelectItem key={k.key} value={k.key} title={k.hint}>{k.label}</SelectItem>
              ))}
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
              <SelectItem value="__none__">A triar</SelectItem>
              {PRIOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtroAtivo && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={limparFiltros}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Faixa fixa: com o filtro de pessoa ligado o quadro pode ficar quase
          vazio, e um dropdown fechado não explica isso. Aqui fica claro QUEM e
          em QUAL papel — e dá pra desfazer sem procurar o controle. */}
      {pessoaAtiva && (
        <div className="shrink-0 border-b bg-primary/5 px-4 py-1.5 flex items-center gap-2 text-xs">
          <UserRound className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">
            Mostrando só as demandas
            {pessoaAtiva.nome
              ? <> em que <strong className="text-foreground">{pessoaAtiva.nome}</strong> é <strong className="text-foreground">{pessoaAtiva.papel.toLowerCase()}</strong></>
              : <> <strong className="text-foreground">sem responsável</strong></>}
            {" "}({filtered.length} de {all.length})
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs gap-1"
            onClick={() => setFPessoa(PESSOA_TODAS)}>
            <X className="h-3 w-3" /> Remover
          </Button>
        </div>
      )}

      {/* Quadro */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4">
        {isLoading ? (
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-80 shrink-0 h-64 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 && filtroAtivo ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nenhuma demanda com esses filtros</p>
              <p className="text-sm text-muted-foreground">Ajuste a busca ou limpe os filtros.</p>
            </div>
            <Button variant="outline" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
          </div>
        ) : (
          <DemandaBoard demandas={filtered} onCardClick={setDetail} onMove={handleMove}
            counts={counts} avatarOf={avatarOf}
            onAssumir={(d) => assumir.mutate(d.id)}
            onFiltrarSemDono={() => setFPessoa(SEM_RESPONSAVEL)} />
        )}
      </div>

      {detailLive && <DemandaModal demanda={detailLive} onClose={() => setDetail(null)} />}
      <NovaDemandaDialog open={novaAberta} onClose={() => setNovaAberta(false)} />
    </div>
  );
}
