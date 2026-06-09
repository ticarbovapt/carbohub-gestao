import { Phone, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CRMLead, FunnelType } from "@/types/crm";
import { getDaysSinceUpdate } from "@/types/crm";

interface LeadCardProps {
  lead: CRMLead;
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onClick?: (lead: CRMLead) => void;
}

const TEMP_VARIANT = {
  quente: "destructive" as const,
  morno:  "warning"    as const,
  frio:   "secondary"  as const,
};
const TEMP_LABEL = { quente: "🔥 Quente", morno: "🌡️ Morno", frio: "❄️ Frio" };

const SEG_VARIANT = {
  A: "success"   as const,
  B: "info"      as const,
  C: "warning"   as const,
  D: "secondary" as const,
};

export function LeadCard({ lead, funnelType: _funnelType, onAdvance, onMarkLost, onClick }: LeadCardProps) {
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const isStale = daysSince > 3;
  const displayName = lead.trade_name || lead.legal_name || lead.contact_name || "Sem nome";

  return (
    <div
      className={`p-3 bg-card rounded-lg border transition-all hover:shadow-md cursor-pointer ${
        isStale ? "border-destructive/50 bg-destructive/5" : "border-border"
      }`}
      onClick={() => onClick?.(lead)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{displayName}</p>
          {lead.city && (
            <p className="text-xs text-muted-foreground truncate">
              {lead.city}{lead.state ? `, ${lead.state}` : ""}
            </p>
          )}
        </div>
        {lead.segment && (
          <Badge variant={SEG_VARIANT[lead.segment]} className="ml-1 text-[9px]">
            {lead.segment}
          </Badge>
        )}
      </div>

      {lead.contact_phone && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Phone className="h-3 w-3" />
          <span>{lead.contact_phone}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-2">
        <Badge variant={TEMP_VARIANT[lead.temperature]} className="text-[9px]">
          {TEMP_LABEL[lead.temperature]}
        </Badge>
        {lead.ramo && (
          <Badge variant="secondary" className="text-[9px]">
            {lead.ramo.length > 15 ? lead.ramo.slice(0, 12) + "…" : lead.ramo}
          </Badge>
        )}
      </div>

      {isStale && (
        <div className="flex items-center gap-1 text-xs text-destructive mb-2">
          <AlertTriangle className="h-3 w-3" />
          <span>{daysSince} dias sem atividade</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {lead.estimated_revenue > 0
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.estimated_revenue)
            : ""}
        </span>
        <span>{daysSince}d</span>
      </div>

      {(onAdvance || onMarkLost) && (
        <div className="flex gap-1 mt-2 pt-2 border-t border-border">
          {onAdvance && (
            <Button
              variant="outline" size="sm"
              className="flex-1 h-7 text-xs text-carbo-green"
              onClick={(e) => { e.stopPropagation(); onAdvance(lead); }}
            >
              Avançar <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
          {onMarkLost && (
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs text-destructive"
              onClick={(e) => { e.stopPropagation(); onMarkLost(lead); }}
            >
              Perdido
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
