import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Trash2, ChevronRight, ArrowRightLeft, ShoppingCart, History,
  StickyNote, Phone, CheckSquare, Clock, GitBranch, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { CRMLead, FunnelType } from "@/types/crm";
import {
  FUNNEL_CONFIG, LOSS_REASONS, getStagesForFunnel, getNextStage, getLostStage,
  isTerminalStage, getDaysSinceUpdate,
} from "@/types/crm";
import {
  useAdvanceLeadStage, useMarkLeadLost, useTransferLead, useLeadOwnerLog,
  useLeadActivities, useAddLeadActivity, useDeleteLead, useUpdateCRMLead, type LeadActivity,
} from "@/hooks/useCRMLeads";
import { useVendedoresDir } from "@/hooks/useVendas";
import { useAuth } from "@/contexts/AuthContext";
import { StageProgressBar, getStageGroup } from "./StageProgressBar";

interface DealDetailProps {
  lead: CRMLead;
  funnelType: FunnelType;
  onClose: () => void;
}

const TEMP_VARIANT = { quente: "destructive" as const, morno: "warning" as const, frio: "secondary" as const };
const TEMP_LABEL = { quente: "🔥 Quente", morno: "🌡️ Morno", frio: "❄️ Frio" };

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

// Normaliza CPF (≤11 díg.) ou CNPJ (12+ díg.) com pontuação. Aceita valor já
// mascarado ou só dígitos; se não parecer documento, devolve como veio.
function formatDoc(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (!d) return v;
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  const c = d.slice(0, 14);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function DealDetail({ lead, funnelType, onClose }: DealDetailProps) {
  const navigate = useNavigate();
  const { isGestor, user, profile } = useAuth();

  const advance = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const transfer = useTransferLead();
  const deleteLead = useDeleteLead();
  const addActivity = useAddLeadActivity();
  const updateLead = useUpdateCRMLead();

  const { data: activities = [] } = useLeadActivities(lead.id);
  const { data: dir = [] } = useVendedoresDir();
  const { data: ownerLog = [] } = useLeadOwnerLog(lead.id);

  // Etapa local (otimista): a barra e o cabeçalho refletem a mudança sem depender
  // do drawerLead (snapshot) do pai. As atividades vêm por invalidação de query.
  const [stage, setStage] = useState(lead.stage);
  useEffect(() => { setStage(lead.stage); }, [lead.id, lead.stage]);

  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState(LOSS_REASONS[0] as string);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const [actType, setActType] = useState("note");
  const [actText, setActText] = useState("");
  const [actDue, setActDue] = useState("");

  const funnelCfg = FUNNEL_CONFIG[funnelType];
  const stages = getStagesForFunnel(funnelType);
  const stageCfg = stages.find((s) => s.id === stage);
  const nextStage = getNextStage(funnelType, stage);
  const terminal = isTerminalStage(stage);
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const displayName = lead.trade_name || lead.legal_name || lead.contact_name || "Sem nome";

  const nameById = (id: string | null) => (id ? (dir.find((d) => d.id === id)?.full_name ?? "—") : "—");
  const ownerId = lead.assigned_to ?? lead.created_by ?? "";
  const owner = dir.find((d) => d.id === ownerId);

  // Clique numa etapa: se for etapa de PERDA, abre o fluxo "Perdido" (motivo);
  // senão, seta a etapa direto via useAdvanceLeadStage (registra na timeline).
  async function handleStageClick(target: { id: string }) {
    if (target.id === getLostStage(funnelType) || getStageGroup(target.id) === "loss") {
      setShowLostForm(true);
      return;
    }
    await advance.mutateAsync({ id: lead.id, newStage: target.id, funnelType, currentStage: stage });
    setStage(target.id);
  }

  async function handleAdvance() {
    if (!nextStage) return;
    await advance.mutateAsync({ id: lead.id, newStage: nextStage, funnelType, currentStage: stage });
    setStage(nextStage);
  }

  async function handleLost() {
    await markLost.mutateAsync({ id: lead.id, reason: lostReason, funnelType, currentStage: stage });
    setStage(getLostStage(funnelType));
    setShowLostForm(false);
  }

  async function handleTransfer() {
    if (!transferTo) return;
    await transfer.mutateAsync({ leadId: lead.id, toUserId: transferTo });
    setTransferTo("");
  }

  async function handleDelete() {
    await deleteLead.mutateAsync(lead.id);
    setConfirmDelete(false);
    onClose();
  }

  async function handleAddActivity() {
    if (!actText.trim() || !user) return;
    await addActivity.mutateAsync({
      lead_id: lead.id,
      activity_type: actType,
      subject: actText.trim(),
      due_at: actType === "task" && actDue ? new Date(actDue).toISOString() : null,
      created_by: user.id,
      created_by_name: profile?.full_name ?? null,
    });
    setActText(""); setActDue("");
  }

  function handleGerarVenda() {
    navigate("/vender", { state: { fromLead: {
      id: lead.id,
      name: lead.legal_name || lead.trade_name || lead.contact_name || "",
      cnpj: lead.cnpj || "",
      phone: lead.contact_phone || "",
      email: lead.contact_email || "",
      city: lead.city || "", state: lead.state || "", address: "", bairro: "",
    } } });
    onClose();
  }

  const contactCity = [lead.city, lead.state].filter(Boolean).join(" / ") || null;
  const docDigits = (lead.cnpj || "").replace(/\D/g, "");
  const docLabel = docDigits.length > 0 && docDigits.length <= 11 ? "CPF" : "CNPJ";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[95dvh] sm:max-w-[96vw] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
        {/* 1. Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{displayName}</DialogTitle>
            <DialogDescription className="sr-only">Detalhe do negócio</DialogDescription>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-xs">{funnelCfg.icon} {funnelCfg.shortName}</Badge>
              {stageCfg && <Badge variant="outline" className="text-xs">{stageCfg.icon} {stageCfg.label}</Badge>}
              <Badge variant={TEMP_VARIANT[lead.temperature]} className="text-xs">{TEMP_LABEL[lead.temperature]}</Badge>
              {daysSince > 3 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />{daysSince}d sem atividade
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isGestor && (
              <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive p-1.5" title="Excluir lead">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5" title="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2. Barra de etapas */}
        <div className="border-b px-5 py-2.5">
          <StageProgressBar
            stages={stages}
            currentStage={stage}
            onSelect={handleStageClick}
            disabled={advance.isPending || markLost.isPending}
          />
        </div>

        {/* 3. Abas (só Geral por enquanto) */}
        <div className="border-b px-5">
          <div className="flex gap-4 text-sm">
            <button className="border-b-2 border-primary py-2 font-medium text-foreground">Geral</button>
          </div>
        </div>

        {/* 4. Duas colunas */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Esquerda — campos (~40%) */}
          <div className="w-full space-y-4 overflow-y-auto border-b p-5 lg:w-2/5 lg:border-b-0 lg:border-r">
            {stage === "ganho" && (
              <Button className="w-full gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={handleGerarVenda}>
                <ShoppingCart className="h-4 w-4" /> Gerar venda deste lead
              </Button>
            )}

            <Card title="Sobre o negócio">
              <Field label="Etapa" value={stageCfg ? `${stageCfg.icon} ${stageCfg.label}` : stage} />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</p>
                <p className="text-2xl font-semibold text-foreground">{brl(lead.estimated_revenue)}</p>
              </div>
              <Field label="Criado em" value={new Date(lead.created_at).toLocaleDateString("pt-BR")} />
              {(lead.won_at || lead.lost_at) && (
                <Field label="Encerrado em" value={new Date((lead.won_at || lead.lost_at)!).toLocaleDateString("pt-BR")} />
              )}
            </Card>

            <Card title="Cliente / Contato">
              <EditableField
                label="Nome do contato"
                value={lead.contact_name}
                placeholder="Adicionar nome…"
                onSave={(v) => updateLead.mutateAsync({ id: lead.id, contact_name: v })}
              />
              <EditableField
                label="Telefone"
                type="tel"
                value={lead.contact_phone}
                placeholder="Adicionar telefone…"
                onSave={(v) => updateLead.mutateAsync({ id: lead.id, contact_phone: v })}
              />
              <Field label="WhatsApp" value={lead.contact_whatsapp} />
              <Field label="E-mail" value={lead.contact_email} />
              <Field label="Cidade / UF" value={contactCity} />
              <Field label={docLabel} value={formatDoc(lead.cnpj)} />
              <Field label="Razão social" value={lead.legal_name} />
              <Field label="Nome fantasia" value={lead.trade_name} />
            </Card>

            <Card title="Responsável">
              <div className="flex items-center gap-2">
                <ProfileAvatar userId={ownerId || lead.id} avatarUrl={owner?.avatar_url} fullName={owner?.full_name} size={28} />
                <span className="text-sm font-medium">{owner?.full_name ?? "—"}</span>
              </div>
              {isGestor && (
                <div className="mt-2 flex gap-2">
                  <select
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                  >
                    <option value="">Transferir para…</option>
                    {dir.filter((d) => d.id !== ownerId).map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name || d.id}</option>
                    ))}
                  </select>
                  <Button size="sm" className="gap-1" onClick={handleTransfer} disabled={!transferTo || transfer.isPending}>
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
                  </Button>
                </div>
              )}
              {ownerLog.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setShowHistory((s) => !s)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <History className="h-3 w-3" /> Histórico de responsáveis ({ownerLog.length})
                  </button>
                  {showHistory && (
                    <div className="mt-1.5 space-y-1 border-l-2 border-border pl-2">
                      {ownerLog.map((l, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">
                          <span className="text-foreground">{nameById(l.from_user)}</span> → <span className="text-foreground">{nameById(l.to_user)}</span>
                          {" · por "}{nameById(l.changed_by)}{" · "}{new Date(l.changed_at).toLocaleDateString("pt-BR")}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {lead.notes && (
              <Card title="Observações">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>
              </Card>
            )}

            {lead.next_follow_up_at && (
              <Card title="Próximo follow-up">
                <p className="text-sm">{new Date(lead.next_follow_up_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p>
              </Card>
            )}
          </div>

          {/* Direita — compositor + timeline (~60%) */}
          <div className="flex w-full flex-1 flex-col overflow-hidden lg:w-3/5">
            {/* Compositor */}
            <div className="border-b p-5">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={actType} onChange={(e) => setActType(e.target.value)}
              >
                <option value="note">📝 Nota</option>
                <option value="call">📞 Ligação</option>
                <option value="task">✅ Tarefa</option>
              </select>
              <textarea
                className="mt-2 min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={actType === "task" ? "O que precisa ser feito?" : "Escreva a nota / o que foi conversado..."}
                value={actText} onChange={(e) => setActText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddActivity(); } }}
              />
              {actType === "task" && (
                <input type="datetime-local" className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={actDue} onChange={(e) => setActDue(e.target.value)} />
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Ctrl+Enter para registrar</span>
                <Button size="sm" onClick={handleAddActivity} disabled={!actText.trim() || addActivity.isPending}>Registrar</Button>
              </div>
            </div>

            {/* Timeline agrupada por data */}
            <div className="flex-1 overflow-y-auto p-5">
              <Timeline activities={activities} />
            </div>
          </div>
        </div>

        {/* Rodapé — Avançar / Perdido */}
        {!terminal && (
          <DialogFooter className="border-t p-3 sm:justify-start">
            {!showLostForm ? (
              <div className="flex w-full gap-2 sm:w-auto">
                {nextStage && (
                  <Button className="flex-1 sm:flex-none" onClick={handleAdvance} disabled={advance.isPending}>
                    Avançar <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
                <Button variant="outline" className="flex-1 text-destructive hover:text-destructive sm:flex-none" onClick={() => setShowLostForm(true)}>
                  Perdido
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-xs font-medium">Motivo da perda:</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm sm:flex-1"
                  value={lostReason} onChange={(e) => setLostReason(e.target.value)}
                >
                  {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowLostForm(false)}>Voltar</Button>
                  <Button variant="destructive" onClick={handleLost} disabled={markLost.isPending}>Confirmar perda</Button>
                </div>
              </div>
            )}
          </DialogFooter>
        )}

        {/* Confirmação de exclusão */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir lead</DialogTitle>
              <DialogDescription>Tem certeza que deseja excluir <strong>{displayName}</strong>? Esta ação não pode ser desfeita.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteLead.isPending}>
                {deleteLead.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Timeline ---------- */

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function ActivityIcon({ type, status }: { type: string; status: string | null }) {
  const cls = "h-3.5 w-3.5";
  if (type === "call") return <Phone className={cls} />;
  if (type === "task") return status === "pending" ? <Clock className={cls} /> : <CheckSquare className={cls} />;
  if (type === "stage_change") return <GitBranch className={cls} />;
  if (type === "note") return <StickyNote className={cls} />;
  return <StickyNote className={cls} />;
}

function Timeline({ activities }: { activities: LeadActivity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Registre a primeira acima.</p>;
  }

  // activities já vêm ordenadas desc por created_at. Agrupa por dia preservando a ordem.
  const groups: { label: string; items: LeadActivity[] }[] = [];
  for (const a of activities) {
    const label = dayLabel(a.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{g.label}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            {g.items.map((a) => {
              const when = new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ActivityIcon type={a.activity_type} status={a.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{a.subject || a.body || a.activity_type}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.created_by_name || "—"} · {when}
                      {a.activity_type === "task" && a.status === "pending" && a.due_at && (
                        <span className="text-amber-500"> · prazo {new Date(a.due_at).toLocaleDateString("pt-BR")}</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Campos ---------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground break-words">{value}</p>
    </div>
  );
}

// Campo editável inline: parece texto, vira input ao focar; salva no blur/Enter
// só quando o valor mudou. Fica sempre visível (mesmo vazio) para permitir preencher.
function EditableField({
  label, value, onSave, type = "text", placeholder,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => Promise<unknown>;
  type?: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(value ?? ""); }, [value]);

  const dirty = (v.trim() || null) !== (value || null);

  async function commit() {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave(v.trim() || null); } finally { setSaving(false); }
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        type={type}
        value={v}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className="w-full rounded border border-transparent bg-transparent px-0 py-0.5 text-sm text-foreground placeholder:text-muted-foreground/60 hover:border-input focus:border-primary focus:px-2 focus:outline-none"
      />
    </div>
  );
}
