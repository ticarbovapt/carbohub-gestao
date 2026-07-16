import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Trash2, ChevronRight, ArrowRightLeft, ShoppingCart, History,
  StickyNote, Phone, CheckSquare, Clock, GitBranch, AlertTriangle, Pin, PinOff,
  MessageSquare, ArrowRight, Pencil,
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
  useLeadActivities, useAddLeadActivity, useDeleteLead, useUpdateCRMLead,
  useToggleActivityPin, type LeadActivity,
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

const ACT_TYPES = [
  { id: "note", label: "Nota", icon: <StickyNote className="h-4 w-4" /> },
  { id: "call", label: "Ligação", icon: <Phone className="h-4 w-4" /> },
  { id: "task", label: "Tarefa", icon: <CheckSquare className="h-4 w-4" /> },
];

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
  const togglePin = useToggleActivityPin();

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

  // Edição do bloco Cliente / Contato (botão Editar → Salvar/Cancelar).
  const [editContact, setEditContact] = useState(false);
  const [draftName, setDraftName] = useState(lead.contact_name ?? "");
  const [draftPhone, setDraftPhone] = useState(lead.contact_phone ?? "");
  const [draftEmail, setDraftEmail] = useState(lead.contact_email ?? "");
  useEffect(() => {
    setDraftName(lead.contact_name ?? "");
    setDraftPhone(lead.contact_phone ?? "");
    setDraftEmail(lead.contact_email ?? "");
    setEditContact(false);
  }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startEditContact() {
    setDraftName(lead.contact_name ?? "");
    setDraftPhone(lead.contact_phone ?? "");
    setDraftEmail(lead.contact_email ?? "");
    setEditContact(true);
  }
  async function saveContact() {
    await updateLead.mutateAsync({
      id: lead.id,
      contact_name: draftName.trim() || null,
      contact_phone: draftPhone.trim() || null,
      contact_email: draftEmail.trim() || null,
    });
    setEditContact(false);
  }

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
  // Gestor pode excluir qualquer card; o criador só o próprio (a policy de DELETE
  // no banco confirma; toda exclusão é registrada por trigger de auditoria).
  const canDelete = isGestor || (!!user?.id && lead.created_by === user.id);

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
            {canDelete && (
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

            <Card
              title="Cliente / Contato"
              action={!editContact ? (
                <button onClick={startEditContact} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
              ) : null}
            >
              {editContact ? (
                <>
                  <LabeledInput label="Nome do contato" value={draftName} onChange={setDraftName} placeholder="Nome da pessoa" />
                  <LabeledInput label="Telefone" type="tel" value={draftPhone} onChange={setDraftPhone} placeholder="(00) 00000-0000" />
                  <LabeledInput label="E-mail" type="email" value={draftEmail} onChange={setDraftEmail} placeholder="email@empresa.com" />
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveContact} disabled={updateLead.isPending}>
                      {updateLead.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditContact(false)} disabled={updateLead.isPending}>Cancelar</Button>
                  </div>
                  <div className="mt-1 space-y-2.5 border-t pt-2.5">
                    <Field label="WhatsApp" value={lead.contact_whatsapp} />
                    <Field label="Cidade / UF" value={contactCity} />
                    <Field label={docLabel} value={formatDoc(lead.cnpj)} />
                    <Field label="Razão social" value={lead.legal_name} />
                    <Field label="Nome fantasia" value={lead.trade_name} />
                  </div>
                </>
              ) : (
                <>
                  <Field label="Nome do contato" value={lead.contact_name} />
                  <Field label="Telefone" value={lead.contact_phone} />
                  <Field label="E-mail" value={lead.contact_email} />
                  <Field label="WhatsApp" value={lead.contact_whatsapp} />
                  <Field label="Cidade / UF" value={contactCity} />
                  <Field label={docLabel} value={formatDoc(lead.cnpj)} />
                  <Field label="Razão social" value={lead.legal_name} />
                  <Field label="Nome fantasia" value={lead.trade_name} />
                  {!lead.contact_name && !lead.contact_phone && !lead.contact_email && (
                    <p className="text-xs text-muted-foreground">Nenhum contato cadastrado. Clique em <span className="font-medium">Editar</span> para adicionar.</p>
                  )}
                </>
              )}
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
            {/* Compositor — abas de tipo (Nota / Ligação / Tarefa) no topo */}
            <div className="border-b p-5">
              <div className="flex gap-1 border-b">
                {ACT_TYPES.map((t) => {
                  const active = actType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActType(t.id)}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium -mb-px border-b-2 transition-colors",
                        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {t.icon} {t.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                className="mt-3 min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={actType === "task" ? "O que precisa ser feito?" : actType === "call" ? "Resumo da ligação..." : "Escreva a nota / o que foi conversado..."}
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

            {/* Timeline agrupada por data (com faixa de fixados no topo) */}
            <div className="flex-1 overflow-y-auto p-5">
              <Timeline
                activities={activities}
                onTogglePin={(a) => togglePin.mutate({ id: a.id, pinned: !a.pinned, lead_id: lead.id })}
                pinBusy={togglePin.isPending}
                resolveUser={(id) => {
                  const u = id ? dir.find((d) => d.id === id) : undefined;
                  return { avatar_url: u?.avatar_url, full_name: u?.full_name };
                }}
                stageLabel={(sid) => (sid ? (stages.find((s) => s.id === sid)?.label ?? sid) : "?")}
              />
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

type ActMeta = { label: string; nodeClass: string; Icon: typeof Phone };

function activityMeta(type: string, status: string | null): ActMeta {
  switch (type) {
    case "call": return { label: "Ligação", nodeClass: "bg-sky-500", Icon: Phone };
    case "task": return { label: "Tarefa", nodeClass: "bg-amber-500", Icon: status === "pending" ? Clock : CheckSquare };
    case "stage_change": return { label: "Etapa alterada", nodeClass: "bg-muted-foreground/40", Icon: GitBranch };
    case "note": return { label: "Comentário", nodeClass: "bg-blue-500", Icon: MessageSquare };
    default: return { label: "Registro", nodeClass: "bg-muted-foreground/40", Icon: StickyNote };
  }
}

interface TimelineProps {
  activities: LeadActivity[];
  onTogglePin: (a: LeadActivity) => void;
  pinBusy: boolean;
  resolveUser: (id: string | null) => { avatar_url?: string | null; full_name?: string | null };
  stageLabel: (stageId: string | null) => string;
}

function Timeline({ activities, onTogglePin, pinBusy, resolveUser, stageLabel }: TimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Registre a primeira acima.</p>;
  }

  // Fixados sobem para uma faixa no topo, mas permanecem na sequência normal abaixo.
  const pinned = activities.filter((a) => a.pinned);

  // activities já vêm ordenadas desc por created_at. Agrupa por dia preservando a ordem.
  const groups: { label: string; items: LeadActivity[] }[] = [];
  for (const a of activities) {
    const label = dayLabel(a.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }

  const common = { onTogglePin, pinBusy, resolveUser, stageLabel };

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Fixados</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {pinned.map((a) => (
            <ActivityCard key={`pin-${a.id}`} a={a} highlight {...common} />
          ))}
        </div>
      )}

      {/* Feed com trilho vertical à esquerda (estilo Bitrix) */}
      <div className="relative">
        <div className="pointer-events-none absolute bottom-2 left-4 top-2 w-px bg-border" aria-hidden />
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label} className="space-y-4">
              <div className="relative flex justify-center py-1">
                <span className="z-10 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">{g.label}</span>
              </div>
              {g.items.map((a) => {
                const meta = activityMeta(a.activity_type, a.status);
                return (
                  <div key={a.id} className="relative flex gap-3">
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background ${meta.nodeClass}`}>
                      <meta.Icon className="h-4 w-4 text-white" />
                    </div>
                    <ActivityCard a={a} {...common} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  a, onTogglePin, pinBusy, resolveUser, stageLabel, highlight,
}: {
  a: LeadActivity;
  onTogglePin: (a: LeadActivity) => void;
  pinBusy: boolean;
  resolveUser: (id: string | null) => { avatar_url?: string | null; full_name?: string | null };
  stageLabel: (stageId: string | null) => string;
  highlight?: boolean;
}) {
  const meta = activityMeta(a.activity_type, a.status);
  const when = new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const canPin = a.activity_type !== "stage_change";
  const author = resolveUser(a.created_by);
  const authorName = author.full_name || a.created_by_name || "—";
  const isStage = a.activity_type === "stage_change";

  return (
    <div className={[
      "min-w-0 flex-1 rounded-lg border bg-card shadow-sm",
      highlight ? "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" : "",
    ].join(" ")}>
      {/* Header: tipo + hora à esquerda, avatar de quem fez à direita */}
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-2">
          {a.pinned && <Pin className="h-3 w-3 text-amber-500" />}
          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
          <span className="text-[11px] text-muted-foreground">{when}</span>
        </div>
        <div title={authorName} className="shrink-0">
          <ProfileAvatar userId={a.created_by || a.id} avatarUrl={author.avatar_url} fullName={author.full_name} size={24} />
        </div>
      </div>

      {/* Corpo */}
      <div className="px-3 pb-2.5 pt-1.5">
        {isStage ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{stageLabel(a.stage_from)}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{stageLabel(a.stage_to)}</span>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{a.subject || a.body || meta.label}</p>
        )}

        {a.activity_type === "task" && a.status === "pending" && a.due_at && (
          <p className="mt-1 text-[11px] text-amber-500">prazo {new Date(a.due_at).toLocaleDateString("pt-BR")}</p>
        )}

        {/* Rodapé: autor + ação fixar */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">por {authorName}</span>
          {canPin && (
            <button
              type="button"
              onClick={() => onTogglePin(a)}
              disabled={pinBusy}
              className={[
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors",
                a.pinned ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/20"
                         : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {a.pinned ? <><PinOff className="h-3 w-3" /> Desafixar</> : <><Pin className="h-3 w-3" /> Fixar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Campos ---------- */

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
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

