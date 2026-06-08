import { useState } from "react";
import { X, Phone, Mail, MapPin, Calendar, Tag, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CRMLead, FunnelType } from "@/types/crm";
import { FUNNEL_CONFIG, LOSS_REASONS, getDaysSinceUpdate, getNextStage, isTerminalStage } from "@/types/crm";
import { useAdvanceLeadStage, useMarkLeadLost } from "@/hooks/useCRMLeads";

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

  const advance  = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();

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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
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

          {/* Next follow-up */}
          {lead.next_follow_up_at && (
            <Section title="Próximo follow-up">
              <p className="text-sm">
                {new Date(lead.next_follow_up_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
              </p>
            </Section>
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
