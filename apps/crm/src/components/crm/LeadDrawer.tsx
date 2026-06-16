import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Phone, Mail, MapPin, Calendar, Tag, ChevronRight, AlertTriangle, ArrowRightLeft, History, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { CRMLead, FunnelType } from "@/types/crm";
import { FUNNEL_CONFIG, LOSS_REASONS, getDaysSinceUpdate, getNextStage, isTerminalStage } from "@/types/crm";
import { useAdvanceLeadStage, useMarkLeadLost, useTransferLead, useLeadOwnerLog, useLeadActivities, useAddLeadActivity, useDeleteLead } from "@/hooks/useCRMLeads";
import { useVendedoresDir } from "@/hooks/useVendas";
import { useAuth } from "@/contexts/AuthContext";

interface LeadDrawerProps {
  lead: CRMLead;
  funnelType: FunnelType;
  onClose: () => void;
}

const TEMP_VARIANT = { quente: "destructive" as const, morno: "warning" as const, frio: "secondary" as const };
const TEMP_LABEL   = { quente: "🔥 Quente", morno: "🌡️ Morno", frio: "❄️ Frio" };

export function LeadDrawer({ lead, funnelType, onClose }: LeadDrawerProps) {
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState(LOSS_REASONS[0] as string);

  const navigate = useNavigate();
  const advance  = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const transfer = useTransferLead();
  const deleteLead = useDeleteLead();

  async function handleDelete() {
    if (!window.confirm("Excluir este lead? Esta ação não pode ser desfeita.")) return;
    await deleteLead.mutateAsync(lead.id);
    onClose();
  }

  // Tunnel → Vendas: atalho que abre o Vender já preenchido. Opcional e one-way —
  // vender direto (sem lead) continua funcionando normalmente.
  function handleGerarVenda() {
    navigate("/vender", { state: { fromLead: {
      id: lead.id,
      name: lead.legal_name || lead.trade_name || lead.contact_name || "",
      cnpj: lead.cnpj || "",
      phone: lead.contact_phone || "",
      email: lead.contact_email || "",
      city: lead.city || "", state: lead.state || "", address: lead.address || "", bairro: lead.bairro || "",
    } } });
    onClose();
  }
  const { isGestor, user, profile } = useAuth();
  const { data: activities = [] } = useLeadActivities(lead.id);
  const addActivity = useAddLeadActivity();
  const [actType, setActType] = useState("note");
  const [actText, setActText] = useState("");
  const [actDue, setActDue] = useState("");

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
  const { data: dir = [] } = useVendedoresDir();
  const { data: ownerLog = [] } = useLeadOwnerLog(lead.id);
  const [transferTo, setTransferTo] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const nameById = (id: string | null) => (id ? (dir.find((d) => d.id === id)?.full_name ?? "—") : "—");
  const ownerId = (lead as { assigned_to?: string | null; created_by?: string | null }).assigned_to
    ?? (lead as { created_by?: string | null }).created_by ?? "";
  const owner = dir.find((d) => d.id === ownerId);

  async function handleTransfer() {
    if (!transferTo) return;
    await transfer.mutateAsync({ leadId: lead.id, toUserId: transferTo });
    setTransferTo("");
  }

  const funnelCfg = FUNNEL_CONFIG[funnelType];
  const stageCfg  = funnelCfg.stages.find((s) => s.id === lead.stage);
  const nextStage = getNextStage(funnelType, lead.stage);
  const terminal  = isTerminalStage(lead.stage);
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const displayName = lead.trade_name || lead.legal_name || lead.contact_name || "Sem nome";

  async function handleAdvance() {
    if (!nextStage) return;
    await advance.mutateAsync({ id: lead.id, newStage: nextStage, funnelType, currentStage: lead.stage });
    onClose();
  }

  async function handleLost() {
    await markLost.mutateAsync({ id: lead.id, reason: lostReason, funnelType, currentStage: lead.stage });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-background border-l shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="font-semibold text-sm">{displayName}</p>
            <p className="text-xs text-muted-foreground">{funnelCfg.icon} {funnelCfg.shortName}</p>
          </div>
          <div className="flex items-center gap-1">
            {isGestor && (
              <button onClick={handleDelete} disabled={deleteLead.isPending} className="text-muted-foreground hover:text-destructive p-1" title="Excluir lead">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            {stageCfg && (
              <Badge variant="outline" className="text-xs">
                {stageCfg.icon} {stageCfg.label}
              </Badge>
            )}
            <Badge variant={TEMP_VARIANT[lead.temperature]} className="text-xs">
              {TEMP_LABEL[lead.temperature]}
            </Badge>
            {daysSince > 3 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {daysSince}d sem atividade
              </Badge>
            )}
          </div>

          {/* Tunnel → Vendas (lead ganho vira venda; atalho opcional) */}
          {lead.stage === "ganho" && (
            <Button className="w-full gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={handleGerarVenda}>
              <ShoppingCart className="h-4 w-4" /> Gerar venda deste lead
            </Button>
          )}

          {/* Responsável */}
          <Section title="Responsável">
            <div className="flex items-center gap-2">
              <ProfileAvatar userId={ownerId || lead.id} avatarUrl={owner?.avatar_url} fullName={owner?.full_name} size={28} />
              <span className="text-sm font-medium">{owner?.full_name ?? "—"}</span>
            </div>
            {isGestor && (
              <div className="flex gap-2 mt-2">
                <select
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
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
          </Section>

          {/* Contact info */}
          <Section title="Contato">
            <InfoRow icon={<Phone />} value={lead.contact_phone} />
            <InfoRow icon={<Mail />} value={lead.contact_email} />
            <InfoRow
              icon={<MapPin />}
              value={[lead.city, lead.state].filter(Boolean).join(", ") || null}
            />
          </Section>

          {/* Deal info */}
          {(lead.estimated_revenue > 0 || lead.source) && (
            <Section title="Negócio">
              {lead.estimated_revenue > 0 && (
                <InfoRow
                  icon={<Tag />}
                  value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.estimated_revenue)}
                />
              )}
              {lead.source && <InfoRow icon={<Calendar />} value={`Origem: ${lead.source}`} />}
            </Section>
          )}

          {/* Notes */}
          {lead.notes && (
            <Section title="Observações">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
            </Section>
          )}

          {/* Atividades / Timeline */}
          <Section title="Atividades">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={actType} onChange={(e) => setActType(e.target.value)}
            >
              <option value="note">📝 Nota</option>
              <option value="call">📞 Ligação</option>
              <option value="task">✅ Tarefa</option>
            </select>
            <textarea
              className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[90px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={actType === "task" ? "O que precisa ser feito?" : "Escreva a nota / o que foi conversado..."}
              value={actText} onChange={(e) => setActText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddActivity(); } }}
            />
            {actType === "task" && (
              <input type="datetime-local" className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-2"
                value={actDue} onChange={(e) => setActDue(e.target.value)} />
            )}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-muted-foreground">Ctrl+Enter para registrar</span>
              <Button size="sm" onClick={handleAddActivity} disabled={!actText.trim() || addActivity.isPending}>Registrar</Button>
            </div>

            {activities.length > 0 && (
              <div className="mt-3 space-y-2.5 border-l-2 border-border pl-3">
                {activities.map((a) => {
                  const icon = a.activity_type === "call" ? "📞" : a.activity_type === "task" ? (a.status === "pending" ? "⏳" : "✅") : a.activity_type === "stage_change" ? "🔀" : "📝";
                  const when = new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={a.id} className="text-xs">
                      <p className="text-foreground whitespace-pre-wrap break-words"><span className="mr-1">{icon}</span>{a.subject || a.body || a.activity_type}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.created_by_name || "—"} · {when}
                        {a.activity_type === "task" && a.status === "pending" && a.due_at && (
                          <span className="text-amber-500"> · prazo {new Date(a.due_at).toLocaleDateString("pt-BR")}</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Next follow-up */}
          {lead.next_follow_up_at && (
            <Section title="Próximo follow-up">
              <p className="text-sm">
                {new Date(lead.next_follow_up_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
              </p>
            </Section>
          )}

          {/* Histórico de responsáveis (discreto) */}
          {ownerLog.length > 0 && (
            <div>
              <button onClick={() => setShowHistory((s) => !s)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
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

          {/* Timestamps */}
          <p className="text-xs text-muted-foreground">
            Criado {new Date(lead.created_at).toLocaleDateString("pt-BR")} ·
            Atualizado há {daysSince}d
          </p>
        </div>

        {/* Actions footer */}
        {!terminal && (
          <div className="sticky bottom-0 bg-background border-t p-4 space-y-2">
            {!showLostForm ? (
              <div className="flex gap-2">
                {nextStage && (
                  <Button
                    className="flex-1 text-sm"
                    onClick={handleAdvance}
                    disabled={advance.isPending}
                  >
                    Avançar <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowLostForm(true)}
                >
                  Perdido
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium">Motivo da perda:</p>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                >
                  {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowLostForm(false)}>
                    Voltar
                  </Button>
                  <Button
                    variant="destructive" className="flex-1"
                    onClick={handleLost}
                    disabled={markLost.isPending}
                  >
                    Confirmar perda
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: React.ReactNode; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
