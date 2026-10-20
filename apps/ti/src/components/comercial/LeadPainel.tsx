import { useState } from "react";
import {
  X, ExternalLink, Archive, Clock, GitBranch, StickyNote, Phone, CheckSquare,
  Hourglass, FileText, ArrowLeftRight, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeadDetalhe, useComentarLead, type LeadAtividade } from "@/hooks/useLeadDetalhe";
import { funilNome, etapaNome } from "@/lib/funis";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Data-só vira UTC em new Date("2026-07-30") e volta um dia no fuso do Brasil.
const dataBR = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
};

const ICONE: Record<string, React.ReactNode> = {
  note: <StickyNote className="h-3.5 w-3.5" />,
  call: <Phone className="h-3.5 w-3.5" />,
  task: <CheckSquare className="h-3.5 w-3.5" />,
  stage_change: <GitBranch className="h-3.5 w-3.5" />,
  funnel_change: <ArrowLeftRight className="h-3.5 w-3.5" />,
  archive: <Archive className="h-3.5 w-3.5" />,
};

const CRM_URL = "https://sales.carbohub.com.br";

/**
 * O card do CRM espelhado dentro do Admin, ao vivo.
 *
 * O gestor abre a lista de esquecidos, clica, e lê o negócio inteiro sem trocar
 * de sistema — e pode responder ali mesmo. O comentário vira nota comum na
 * timeline do CRM, com a autoria dele: indistinguível de um escrito lá dentro.
 * Fosse marcado como "comentário do Admin", viraria uma segunda timeline
 * paralela que o vendedor não lê.
 */
export function LeadPainel({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data, isLoading, error } = useLeadDetalhe(leadId);
  const comentar = useComentarLead();
  const [texto, setTexto] = useState("");

  const lead = data?.lead;
  const nome = lead?.trade_name || lead?.legal_name || lead?.contact_name || "Sem nome";

  async function enviar() {
    if (!texto.trim()) return;
    await comentar.mutateAsync({ id: leadId, texto: texto.trim() });
    setTexto("");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{isLoading ? "Carregando…" : nome}</h2>
            {lead && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {funilNome(lead.funnel_type)} · {etapaNome(lead.stage)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`${CRM_URL}/crm/pipelines?funil=${lead?.funnel_type ?? "f13"}&lead=${leadId}`}
              target="_blank" rel="noopener noreferrer"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground"
              title="Abrir no CRM"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:text-foreground" title="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error ? (
          <div className="m-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        ) : isLoading || !data || !lead ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o card…
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {data.arquivado && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs">
                  <strong>Card arquivado.</strong> Não aparece mais nas pipelines, mas continua nos
                  indicadores históricos — as datas em que ele foi criado e movido não mudam.
                </p>
              </div>
            )}

            {lead.waiting_on && lead.waiting_until && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-xs">
                  <p><strong>Aguardando</strong> até {dataBR(lead.waiting_until)}</p>
                  {lead.waiting_note && <p className="mt-0.5 text-muted-foreground">{lead.waiting_note}</p>}
                </div>
              </div>
            )}

            {/* Dados do negócio */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
              <Campo label="Valor estimado" valor={brl(lead.estimated_revenue)} />
              <Campo label="Origem" valor={lead.source} />
              <Campo label="Contato" valor={lead.contact_name} />
              <Campo label="Telefone" valor={lead.contact_phone} />
              <Campo label="Cidade" valor={[lead.city, lead.state].filter(Boolean).join(" / ")} />
              <Campo label="Criado em" valor={dataBR(lead.created_at)} />
            </div>

            {/* Qualificação — é o que o SDR entregou ao closer */}
            {(lead.qual_volume || lead.qual_dor || lead.qual_decisor || lead.qual_prazo) && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Qualificação
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Campo label="Volume / frota" valor={lead.qual_volume} />
                  <Campo label="Decisor" valor={lead.qual_decisor} />
                  <Campo label="Dor" valor={lead.qual_dor} />
                  <Campo label="Prazo" valor={lead.qual_prazo} />
                </div>
              </div>
            )}

            {data.orcamentos.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Orçamentos
                </p>
                {data.orcamentos.map((o) => (
                  <div key={o.order_id} className="flex items-center justify-between text-sm">
                    <span>{o.order_number ?? "sem número"}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {o.status === "quote" ? "orçamento" : o.status}
                      </span>
                      <strong className="tabular-nums">{brl(o.total)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Comentar sem sair do Admin */}
            <div className="space-y-2">
              <textarea
                className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Comentar neste card… (aparece na timeline do vendedor)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Ctrl+Enter para enviar</span>
                <Button size="sm" disabled={!texto.trim() || comentar.isPending} onClick={enviar}>
                  {comentar.isPending ? "Enviando…" : "Comentar"}
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Histórico ({data.atividades.length})
              </p>
              {data.atividades.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nada registrado ainda.</p>
              ) : (
                data.atividades.map((a) => <Atividade key={a.id} a={a} />)
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words">{valor}</p>
    </div>
  );
}

function Atividade({ a }: { a: LeadAtividade }) {
  const herdada = !!a.meta?.copiado_de;
  return (
    <div className="flex gap-2.5 border-b border-border/60 pb-3 last:border-0">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {ICONE[a.activity_type] ?? <StickyNote className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            {a.activity_type === "stage_change" && a.stage_to
              ? <>{etapaNome(a.stage_from ?? "?")} → {etapaNome(a.stage_to)}</>
              : (a.subject || (a.activity_type === "note" ? "Nota" : a.activity_type))}
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{dataHora(a.created_at)}</span>
        </div>
        {a.body && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {a.created_by_name || "—"}
          {a.status === "pending" && a.due_at && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-500">
              <Clock className="h-3 w-3" /> prazo {dataBR(a.due_at)}
            </span>
          )}
          {/* Herdado do repasse: sem isto a timeline do closer parece dele. */}
          {herdada && <span className="ml-2 text-muted-foreground/70">· herdado do Outbound</span>}
        </p>
      </div>
    </div>
  );
}
