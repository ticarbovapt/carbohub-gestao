import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, MapPin, Plus, Play, CloudOff, RefreshCw, Loader2, Navigation,
  CircleAlert, Check, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePdvs } from "@/hooks/usePdvs";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import {
  useRtmAgenda, usePlanejarVisita, useCancelarPlanejada, useRtmFila, pegarLocal,
  diaLocal, RTM_SITUACAO_LABEL, RTM_RESULTADO_LABEL,
  type RtmAgendaRow, type RtmSituacaoAgenda,
} from "@/hooks/useRtm";
import { rtmAbrirLocal } from "@/lib/rtmFila";

// ─────────────────────────────────────────────────────────────────────────────
// RTM · Agenda do dia — Fase 1
//
// Responde à segunda das cinco perguntas do briefing: "quem deveria ser
// visitado hoje — e foi?". As duas metades da pergunta estão na tela ao mesmo
// tempo de propósito: o plano e o que aconteceu com ele. Uma tela que só
// mostrasse as visitas feitas responderia metade, e é a metade fácil.
//
// ⚠️ Por isso a linha "não cumprida" é a mais importante daqui. Ela é o único
// registro do que deixou de acontecer, e é dela que sai a aderência.
// ─────────────────────────────────────────────────────────────────────────────

const CORES: Record<RtmSituacaoAgenda, string> = {
  pendente:     "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  em_andamento: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  concluida:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  nao_cumprida: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  cancelada:    "bg-muted text-muted-foreground",
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export default function RtmAgenda() {
  const navigate = useNavigate();
  const { user, isGestor } = useAuth();
  const [dia, setDia] = useState(() => diaLocal());
  // Gestor começa vendo o time inteiro; vendedor só se vê (e a RLS confirma).
  const [vendedor, setVendedor] = useState<string>(() => (isGestor ? "todos" : (user?.id ?? "")));
  const [novoOpen, setNovoOpen] = useState(false);
  const [iniciando, setIniciando] = useState<string | null>(null);

  const { emAndamento, pendentes, online, sincronizar } = useRtmFila();
  const { data: agenda, isLoading } = useRtmAgenda(dia, dia, vendedor === "todos" ? null : vendedor);
  const { data: equipe } = useTeamMembers();

  const linhas = agenda ?? [];
  const resumo = useMemo(() => {
    const c = { pendente: 0, em_andamento: 0, concluida: 0, nao_cumprida: 0, cancelada: 0 };
    for (const l of linhas) c[l.situacao] += 1;
    return c;
  }, [linhas]);

  // Aderência do dia: cumpridas ÷ planejadas, tirando as canceladas do
  // denominador — visita cancelada com motivo não é falha de execução.
  const denominador = linhas.length - resumo.cancelada;
  const aderencia = denominador > 0 ? Math.round((resumo.concluida / denominador) * 100) : null;

  async function iniciar(l: RtmAgendaRow) {
    if (emAndamento) {
      toast.error("Você tem uma visita em aberto. Finalize antes de iniciar outra.");
      navigate("/rtm/visita");
      return;
    }
    setIniciando(l.planejada_id);
    try {
      // O GPS é tentado, mas não decide nada: sem permissão ou sem sinal vem
      // nulo e o check-in acontece do mesmo jeito.
      const geo = await pegarLocal();
      const v = await rtmAbrirLocal({
        vendedor_id: user!.id,
        pdv_id: l.pdv_id,
        pdv_nome: l.pdv_nome,
        visita_planejada_id: l.planejada_id,
        tipo: "roteiro",
        geo,
      });
      toast.success(`Check-in em ${l.pdv_nome}.`);
      navigate(`/rtm/visita?v=${v.client_uuid}`);
    } catch (e) {
      toast.error("Não deu para iniciar: " + ((e as { message?: string })?.message ?? ""));
    } finally {
      setIniciando(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1200px] mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CarboPageHeader
            title="Agenda de visitas"
            description="Quem deveria ser visitado hoje — e o que aconteceu"
            icon={CalendarDays}
          />
          <div className="flex items-center gap-2">
            <Input type="date" value={dia} onChange={(e) => setDia(e.target.value || diaLocal())}
              className="w-[150px] h-9" />
            {isGestor && (
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todo o time</SelectItem>
                  {(equipe ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4" /> Agendar
            </Button>
          </div>
        </div>

        {/* ── Estado da conexão e da fila ───────────────────────────────────
            Fica no topo e não some: o vendedor precisa saber que a visita está
            só no aparelho ANTES de sair do PDV, não depois. */}
        {(!online || pendentes.length > 0) && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            online ? "border-amber-300 bg-amber-50 dark:bg-amber-950/40" : "border-slate-300 bg-muted"}`}>
            {online ? <RefreshCw className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
            <span className="flex-1">
              {online
                ? `${pendentes.length} visita(s) aguardando envio.`
                : "Sem conexão. As visitas ficam salvas no aparelho e sobem sozinhas quando o sinal voltar."}
            </span>
            {online && pendentes.length > 0 && (
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => { void sincronizar(); toast.info("Enviando..."); }}>
                Enviar agora
              </Button>
            )}
          </div>
        )}

        {emAndamento && (
          <button
            onClick={() => navigate(`/rtm/visita?v=${emAndamento.client_uuid}`)}
            className="w-full flex items-center gap-3 rounded-lg border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-left"
          >
            <Play className="h-4 w-4 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">Visita em andamento · {emAndamento.pdv_nome}</p>
              <p className="text-xs text-muted-foreground">
                Check-in às {hora(emAndamento.ts_dispositivo_checkin)} — toque para continuar
              </p>
            </div>
          </button>
        )}

        {/* ── Resumo do dia ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Resumo label="Planejadas" valor={linhas.length} />
          <Resumo label="Concluídas" valor={resumo.concluida} />
          <Resumo label="Não cumpridas" valor={resumo.nao_cumprida}
            alerta={resumo.nao_cumprida > 0} />
          <Resumo label="Aderência" valor={aderencia === null ? "—" : `${aderencia}%`} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando agenda...
          </div>
        ) : linhas.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-10 text-center space-y-2">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Nada planejado para este dia.</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                A visita precisa estar na agenda antes do dia — é o que permite
                medir o que deixou de acontecer, não só o que aconteceu.
              </p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => setNovoOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Agendar visita
              </Button>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {linhas.map((l) => (
              <LinhaAgenda
                key={l.planejada_id}
                l={l}
                podeIniciar={l.situacao === "pendente" || l.situacao === "nao_cumprida"}
                meu={l.vendedor_id === user?.id}
                iniciando={iniciando === l.planejada_id}
                onIniciar={() => iniciar(l)}
                onAbrir={() => navigate(`/rtm/visita?v=${l.visita_id}&ver=1`)}
              />
            ))}
          </div>
        )}
      </div>

      <DialogAgendar open={novoOpen} onOpenChange={setNovoOpen} dia={dia} />
    </div>
  );
}

function Resumo({ label, valor, alerta }: { label: string; valor: number | string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${alerta ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "bg-card"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold leading-tight">{valor}</p>
    </div>
  );
}

function LinhaAgenda({
  l, podeIniciar, meu, iniciando, onIniciar, onAbrir,
}: {
  l: RtmAgendaRow; podeIniciar: boolean; meu: boolean; iniciando: boolean;
  onIniciar: () => void; onAbrir: () => void;
}) {
  const temCoord = l.pdv_lat != null && l.pdv_lng != null;
  return (
    <CarboCard>
      <CarboCardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{l.pdv_nome}</p>
              <Badge variant="outline" className={`text-[10px] border-0 ${CORES[l.situacao]}`}>
                {RTM_SITUACAO_LABEL[l.situacao]}
              </Badge>
              {l.origem === "roteiro" && (
                <Badge variant="outline" className="text-[10px]">roteiro</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[l.endereco, l.cidade, l.uf].filter(Boolean).join(" · ") || "Sem endereço cadastrado"}
            </p>
            {!meu && l.vendedor_nome && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{l.vendedor_nome}</p>
            )}

            {l.situacao === "concluida" && (
              <p className="text-xs mt-1">
                <span className="text-muted-foreground">{hora(l.ts_checkin)}–{hora(l.ts_checkout)}</span>
                {l.resultado && <> · <strong>{RTM_RESULTADO_LABEL[l.resultado] ?? l.resultado}</strong></>}
              </p>
            )}
            {l.situacao === "cancelada" && l.cancelamento_motivo && (
              <p className="text-xs text-muted-foreground mt-1 italic">{l.cancelamento_motivo}</p>
            )}
            {l.observacao && (
              <p className="text-xs text-muted-foreground mt-1">{l.observacao}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            {podeIniciar && meu && (
              <Button size="sm" className="h-8 gap-1.5" onClick={onIniciar} disabled={iniciando}>
                {iniciando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Check-in
              </Button>
            )}
            {(l.situacao === "concluida" || l.situacao === "em_andamento") && l.visita_id && (
              <Button size="sm" variant="outline" className="h-8" onClick={onAbrir}>Ver</Button>
            )}
            {temCoord && (
              // Abre o app de mapas do celular. É a função mais usada da tela
              // em campo e não depende de nada nosso.
              <a
                className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-md border text-xs"
                href={`https://www.google.com/maps/dir/?api=1&destination=${l.pdv_lat},${l.pdv_lng}`}
                target="_blank" rel="noreferrer"
              >
                <Navigation className="h-3.5 w-3.5" /> Rota
              </a>
            )}
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ── Agendar ──────────────────────────────────────────────────────────────────

function DialogAgendar({
  open, onOpenChange, dia,
}: { open: boolean; onOpenChange: (v: boolean) => void; dia: string }) {
  const { user, isGestor } = useAuth();
  const { data: pdvs } = usePdvs();
  const { data: equipe } = useTeamMembers();
  const planejar = usePlanejarVisita();

  const [pdvId, setPdvId] = useState("");
  const [vendedorId, setVendedorId] = useState(() => user?.id ?? "");
  const [data, setData] = useState(dia);
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    // PDV inativo fica de fora: agendar visita a ponto fechado é ruído puro.
    const ativos = (pdvs ?? []).filter((p) => p.status !== "inactive");
    if (!t) return ativos.slice(0, 50);
    return ativos.filter((p) =>
      p.name.toLowerCase().includes(t) ||
      (p.address_city ?? "").toLowerCase().includes(t) ||
      p.pdv_code.toLowerCase().includes(t),
    ).slice(0, 50);
  }, [pdvs, busca]);

  function salvar() {
    if (!pdvId) { toast.error("Escolha o PDV."); return; }
    planejar.mutate(
      { pdv_id: pdvId, vendedor_id: vendedorId, data_prevista: data, observacao: obs.trim() || null },
      { onSuccess: () => { onOpenChange(false); setPdvId(""); setObs(""); setBusca(""); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agendar visita</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Dia</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9" />
          </div>

          {isGestor && (
            <div>
              <Label className="text-xs">Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {(equipe ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Ponto de venda</Label>
            <Input placeholder="Buscar por nome, cidade ou código..." value={busca}
              onChange={(e) => setBusca(e.target.value)} className="h-9 mb-1.5" />
            <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
              {lista.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">Nenhum PDV encontrado.</p>
              )}
              {lista.map((p) => (
                <button key={p.id} type="button" onClick={() => setPdvId(p.id)}
                  className={`w-full text-left px-2.5 py-2 text-sm flex items-center gap-2 ${
                    pdvId === p.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                  {pdvId === p.id
                    ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    : <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[p.address_city, p.address_state].filter(Boolean).join("/")} · {p.pdv_code}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
              placeholder="Levar material de PDV, falar com o gerente..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={planejar.isPending}>
            {planejar.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
