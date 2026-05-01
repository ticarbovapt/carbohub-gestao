/**
 * CRMLeadDrawer — slide-over panel with full lead detail, activity timeline, and inline editing
 * Plan reference: LeadDrawer.tsx + ActivityFeed.tsx
 */
import React, { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, MessageCircle, Mail, MapPin, Calendar, TrendingUp,
  Loader2, Send, FileText, PhoneCall, MessageSquare, Building2,
  ChevronRight, AlertTriangle, CheckCircle2, XCircle, Edit2, Save, X,
} from "lucide-react";
import { useCRMActivities, useCreateCRMActivity } from "@/hooks/useCRMActivities";
import { useUpdateCRMLead, useAdvanceLeadStage, useMarkLeadLost } from "@/hooks/useCRMLeads";
import { useCnpjLookup, cnpjStatusVariant } from "@/hooks/useCnpjLookup";
import { usePipelineStageConfig, validateStageAdvance } from "@/hooks/useCRMPipelineGating";
import { FUNNEL_CONFIG, LOSS_REASONS, getStagesForFunnel, getNextStage, isTerminalStage } from "@/types/crm";
import type { CRMLead, FunnelType, ActivityType, CRMActivity } from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Activity icons
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  note:         <FileText className="h-3.5 w-3.5" />,
  call:         <PhoneCall className="h-3.5 w-3.5" />,
  whatsapp:     <MessageCircle className="h-3.5 w-3.5" />,
  email:        <Mail className="h-3.5 w-3.5" />,
  meeting:      <Calendar className="h-3.5 w-3.5" />,
  stage_change: <ChevronRight className="h-3.5 w-3.5" />,
  task:         <CheckCircle2 className="h-3.5 w-3.5" />,
  system:       <TrendingUp className="h-3.5 w-3.5" />,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  note:         "bg-slate-100 text-slate-600",
  call:         "bg-blue-100 text-blue-600",
  whatsapp:     "bg-green-100 text-green-600",
  email:        "bg-violet-100 text-violet-600",
  meeting:      "bg-amber-100 text-amber-600",
  stage_change: "bg-emerald-100 text-emerald-600",
  task:         "bg-orange-100 text-orange-600",
  system:       "bg-gray-100 text-gray-500",
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note:         "Nota",
  call:         "Ligação",
  whatsapp:     "WhatsApp",
  email:        "E-mail",
  meeting:      "Reunião",
  stage_change: "Etapa",
  task:         "Tarefa",
  system:       "Sistema",
};

// ─────────────────────────────────────────────────────────────────────────────
// Relative time helper
// ─────────────────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}m atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityItem
// ─────────────────────────────────────────────────────────────────────────────
function ActivityItem({ activity }: { activity: CRMActivity }) {
  const type = activity.activity_type as ActivityType;
  return (
    <div className="flex gap-2.5 py-2.5 border-b border-border/50 last:border-0">
      <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${ACTIVITY_COLORS[type]}`}>
        {ACTIVITY_ICONS[type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {ACTIVITY_LABELS[type]}
          </span>
          {activity.subject && (
            <span className="text-sm font-medium truncate">{activity.subject}</span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
            {relativeTime(activity.created_at)}
          </span>
        </div>
        {activity.body && (
          <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap">{activity.body}</p>
        )}
        {activity.created_by_name && (
          <p className="text-[10px] text-muted-foreground mt-0.5">por {activity.created_by_name}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityComposer
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_TYPES: { type: ActivityType; label: string; icon: React.ReactNode }[] = [
  { type: "note",     label: "Nota",     icon: <FileText className="h-3.5 w-3.5" /> },
  { type: "call",     label: "Ligação",  icon: <PhoneCall className="h-3.5 w-3.5" /> },
  { type: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { type: "meeting",  label: "Reunião",  icon: <Calendar className="h-3.5 w-3.5" /> },
];

function ActivityComposer({ leadId }: { leadId: string }) {
  const create = useCreateCRMActivity();
  const [selectedType, setSelectedType] = useState<ActivityType>("note");
  const [body, setBody] = useState("");

  const handleSend = () => {
    if (!body.trim()) return;
    create.mutate(
      { lead_id: leadId, activity_type: selectedType, body: body.trim() },
      { onSuccess: () => setBody("") }
    );
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      {/* Type selector */}
      <div className="flex gap-1.5 flex-wrap">
        {QUICK_TYPES.map(({ type, label, icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
              selectedType === type
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div className="flex gap-2">
        <Textarea
          placeholder={
            selectedType === "note" ? "Adicione uma nota..." :
            selectedType === "call" ? "Resultado da ligação..." :
            selectedType === "whatsapp" ? "Resumo da conversa..." :
            "Pontos da reunião..."
          }
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleSend(); }}
          className="text-sm resize-none"
        />
        <Button
          size="icon"
          className="h-full aspect-square"
          onClick={handleSend}
          disabled={!body.trim() || create.isPending}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Ctrl+Enter para enviar</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LeadInfoTab — read/edit lead fields
// ─────────────────────────────────────────────────────────────────────────────
function LeadInfoTab({ lead, funnelType }: { lead: CRMLead; funnelType: FunnelType }) {
  const update = useUpdateCRMLead();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<CRMLead>>({});

  const startEdit = () => {
    setDraft({
      contact_name: lead.contact_name,
      contact_phone: lead.contact_phone,
      contact_whatsapp: lead.contact_whatsapp,
      contact_email: lead.contact_email,
      estimated_revenue: lead.estimated_revenue,
      next_action_desc: lead.next_action_desc,
      next_follow_up_at: lead.next_follow_up_at,
      notes: lead.notes,
      temperature: lead.temperature,
    });
    setEditing(true);
  };

  const saveEdit = () => {
    update.mutate({ id: lead.id, ...draft }, { onSuccess: () => setEditing(false) });
  };

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || <span className="text-muted-foreground italic">—</span>}</p>
    </div>
  );

  // CNPJ status badge
  const cnpjVariant = cnpjStatusVariant(lead.cnpj_status);

  return (
    <div className="space-y-4">
      {/* Edit toolbar */}
      <div className="flex justify-end gap-2">
        {editing ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Salvar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
        )}
      </div>

      {/* Empresa */}
      {funnelType !== "f1" && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
          <div className="col-span-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empresa</span>
          </div>
          <Field label="Razão Social" value={lead.legal_name} />
          <Field label="Nome Fantasia" value={lead.trade_name} />
          {lead.cnpj && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CNPJ</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-mono">{lead.cnpj}</p>
                {lead.cnpj_status && (
                  <Badge
                    variant={cnpjVariant === "success" ? "default" : cnpjVariant === "destructive" ? "destructive" : "secondary"}
                    className="text-[9px] h-4"
                  >
                    {lead.cnpj_status.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          )}
          <Field label="Ramo" value={lead.ramo} />
          {(lead.city || lead.state) && (
            <div className="col-span-2 flex items-center gap-1 text-sm">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {[lead.city, lead.state].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Contato */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
        <div className="col-span-2 flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</span>
        </div>

        {editing ? (
          <>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Nome</p>
              <Input
                value={draft.contact_name || ""}
                onChange={(e) => setDraft((d) => ({ ...d, contact_name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Telefone</p>
              <Input
                value={draft.contact_phone || ""}
                onChange={(e) => setDraft((d) => ({ ...d, contact_phone: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">E-mail</p>
              <Input
                value={draft.contact_email || ""}
                onChange={(e) => setDraft((d) => ({ ...d, contact_email: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            <Field label="Nome" value={lead.contact_name} />
            {lead.contact_phone && (
              <div className="flex items-center gap-1">
                <a
                  href={`https://wa.me/55${lead.contact_phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-green-600 hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {lead.contact_phone}
                </a>
              </div>
            )}
            {lead.contact_email && (
              <div className="flex items-center gap-1 col-span-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`mailto:${lead.contact_email}`} className="text-sm hover:underline">{lead.contact_email}</a>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pipeline info */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
        <div className="col-span-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</span>
        </div>

        {editing ? (
          <>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Receita estimada (R$)</p>
              <Input
                type="number"
                value={draft.estimated_revenue ?? lead.estimated_revenue}
                onChange={(e) => setDraft((d) => ({ ...d, estimated_revenue: Number(e.target.value) }))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Temperatura</p>
              <Select
                value={draft.temperature || lead.temperature}
                onValueChange={(v) => setDraft((d) => ({ ...d, temperature: v as CRMLead["temperature"] }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="frio">❄️ Frio</SelectItem>
                  <SelectItem value="morno">🌡️ Morno</SelectItem>
                  <SelectItem value="quente">🔥 Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground mb-1">Próxima ação</p>
              <Input
                placeholder="Descrição da próxima ação..."
                value={draft.next_action_desc || ""}
                onChange={(e) => setDraft((d) => ({ ...d, next_action_desc: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground mb-1">Observações</p>
              <Textarea
                value={draft.notes || ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </>
        ) : (
          <>
            <Field
              label="Receita estimada"
              value={lead.estimated_revenue > 0
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.estimated_revenue)
                : null}
            />
            <Field
              label="Temperatura"
              value={lead.temperature === "quente" ? "🔥 Quente" : lead.temperature === "morno" ? "🌡️ Morno" : "❄️ Frio"}
            />
            <Field label="Próxima ação" value={lead.next_action_desc} />
            <Field label="Origem" value={lead.source} />
            {lead.notes && (
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Observações</p>
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Drawer
// ─────────────────────────────────────────────────────────────────────────────
interface CRMLeadDrawerProps {
  lead: CRMLead | null;
  funnelType: FunnelType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CRMLeadDrawer({ lead, funnelType, open, onOpenChange }: CRMLeadDrawerProps) {
  const { data: activities = [], isLoading: activitiesLoading } = useCRMActivities(lead?.id);
  const advanceLead = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const { data: stageConfig = {} } = usePipelineStageConfig(funnelType);
  const [lostReason, setLostReason] = useState("");
  const [showLostPicker, setShowLostPicker] = useState(false);
  const [gatingErrors, setGatingErrors] = useState<string[]>([]);

  if (!lead) return null;

  const config = FUNNEL_CONFIG[funnelType];
  const stages = getStagesForFunnel(funnelType);
  const currentStageConfig = stages.find((s) => s.id === lead.stage);
  const nextStage = getNextStage(funnelType, lead.stage);
  const terminal = isTerminalStage(lead.stage);
  const displayName = lead.trade_name || lead.legal_name || lead.contact_name || "Lead sem nome";
  const daysSince = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));

  const handleAdvance = () => {
    if (!nextStage) return;
    // Progressive gating: validate required fields before advancing
    const missing = validateStageAdvance(lead, nextStage, funnelType, stageConfig);
    if (missing.length > 0) {
      setGatingErrors(missing);
      toast.error(`Preencha antes de avançar: ${missing.join(", ")}`, { duration: 5000 });
      return;
    }
    setGatingErrors([]);
    advanceLead.mutate({
      id: lead.id,
      newStage: nextStage,
      funnelType,
      currentStage: lead.stage,
    });
  };

  const handleLost = () => {
    if (!lostReason) return;
    markLost.mutate({ id: lead.id, reason: lostReason, funnelType, currentStage: lead.stage });
    setShowLostPicker(false);
    setLostReason("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-base font-semibold leading-tight">{displayName}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] h-5" style={{ color: config.color, borderColor: config.color }}>
                  {config.shortName}
                </Badge>
                {currentStageConfig && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {currentStageConfig.icon} {currentStageConfig.label}
                  </Badge>
                )}
                {daysSince > 7 && (
                  <Badge variant="destructive" className="text-[10px] h-5">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {daysSince}d sem atividade
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stage advance / lost actions */}
          {!terminal && (
            <div className="flex gap-2">
              {nextStage && (
                <Button
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={handleAdvance}
                  disabled={advanceLead.isPending}
                >
                  {advanceLead.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
                  Avançar para {stages.find((s) => s.id === nextStage)?.label}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setShowLostPicker((v) => !v)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Perdido
              </Button>
            </div>
          )}

          {/* Gating errors */}
          {gatingErrors.length > 0 && (
            <div className="text-[11px] text-destructive bg-destructive/10 rounded-lg p-2 border border-destructive/20">
              <p className="font-semibold mb-0.5">Campos obrigatórios para avançar:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {gatingErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <p className="mt-1 text-muted-foreground">Edite o lead na aba "Dados do Lead" e preencha os campos.</p>
            </div>
          )}

          {/* Lost reason picker */}
          {showLostPicker && (
            <div className="flex gap-2">
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Motivo da perda..." /></SelectTrigger>
                <SelectContent>
                  {LOSS_REASONS.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="destructive" onClick={handleLost} disabled={!lostReason || markLost.isPending} className="text-xs">
                Confirmar
              </Button>
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="timeline" className="h-full flex flex-col">
            <TabsList className="w-full rounded-none border-b bg-transparent h-9 justify-start px-4 gap-1">
              <TabsTrigger value="timeline" className="text-xs h-7 data-[state=active]:bg-muted">
                Timeline
              </TabsTrigger>
              <TabsTrigger value="info" className="text-xs h-7 data-[state=active]:bg-muted">
                Dados do Lead
              </TabsTrigger>
            </TabsList>

            {/* ── Timeline ─────────────────────────────────────────────── */}
            <TabsContent value="timeline" className="flex-1 flex flex-col mt-0 px-4 pb-4 pt-3 space-y-3">
              <ActivityComposer leadId={lead.id} />

              <div>
                {activitiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nenhuma atividade registrada ainda.
                  </div>
                ) : (
                  <div>
                    {activities.map((activity) => (
                      <ActivityItem key={activity.id} activity={activity} />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Lead Info ─────────────────────────────────────────────── */}
            <TabsContent value="info" className="mt-0 px-4 pb-4 pt-3">
              <LeadInfoTab lead={lead} funnelType={funnelType} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
