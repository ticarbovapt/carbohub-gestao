import { Phone, ChevronRight, AlertTriangle, ArrowLeftRight, Megaphone, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { CRMLead, FunnelType } from "@/types/crm";
import {
  getDaysSinceUpdate, segmentOf, sourceLabel, FUNNEL_CONFIG,
  waitingLabel, esperaVencida,
} from "@/types/crm";

// Data-só é parseada como UTC por new Date("2026-07-30") e volta um dia no
// fuso do Brasil. Monta a data local componente a componente.
const dataCurta = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const funilCurto = (id: string | null | undefined) =>
  (id ? FUNNEL_CONFIG[id as FunnelType]?.shortName : null) ?? "outro funil";

export interface LeadOwner { id: string; name: string | null; avatar_url: string | null }

interface LeadCardProps {
  lead: CRMLead;
  funnelType: FunnelType;
  owner?: LeadOwner;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onClick?: (lead: CRMLead) => void;
  // Na visão "Todos os funis": mostra de qual pipeline o card veio.
  originFunnel?: { icon?: string; name: string; color: string };
  /** Nome de quem repassou o card (o SDR). Resolvido pelo board. */
  repassadoPor?: string | null;
}

const TEMP_VARIANT = {
  quente: "destructive" as const,
  morno:  "warning"    as const,
  frio:   "secondary"  as const,
};
const TEMP_LABEL = { quente: "🔥 Quente", morno: "🌡️ Morno", frio: "❄️ Frio" };

export function LeadCard({ lead, funnelType: _funnelType, owner, onAdvance, onMarkLost, onClick, originFunnel, repassadoPor }: LeadCardProps) {
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const aging: "red" | "amber" | null = daysSince > 7 ? "red" : daysSince > 3 ? "amber" : null;
  const displayName = lead.legal_name || lead.trade_name || lead.contact_name || "Sem nome";
  const seg = segmentOf(lead.lead_segment);
  // Nome fantasia aparece como linha secundária só quando difere da razão social exibida.
  const secondaryTradeName = lead.trade_name && lead.trade_name !== displayName ? lead.trade_name : null;
  const waLink = lead.contact_phone ? `https://wa.me/55${lead.contact_phone.replace(/\D/g, "")}` : null;

  return (
    <div
      className={`p-3 bg-card rounded-lg border transition-all hover:shadow-md cursor-pointer flex flex-col min-h-[196px] ${
        aging === "red" ? "border-destructive/50 bg-destructive/5"
        : aging === "amber" ? "border-amber-500/40 bg-amber-500/5"
        : "border-border"
      }`}
      onClick={() => onClick?.(lead)}
    >
      {/* Segmento — o que o lead É. Aparece sempre; é o que substitui as
          pipelines separadas por PDV/frotista/licenciado. */}
      {seg && (
        <div className="mb-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5"
            style={{ background: seg.color + "1a", color: seg.color }}
            title={seg.label}
          >
            <span>{seg.icon}</span> {seg.shortName}
          </span>
        </div>
      )}

      {/* PROCEDÊNCIA — de onde este lead veio.
          Duas coisas diferentes moram aqui: o card que chegou por REPASSE
          mostra o funil de origem e QUEM repassou (é o que permite medir qual
          SDR entrega mais); o card que entrou por outro caminho mostra a
          origem (anúncio, indicação, formulário). Sem isso o closer olha a
          fila e não sabe se está falando com um lead de frota trabalhado pelo
          SDR ou com alguém que clicou num anúncio. */}
      {lead.origin_lead_id ? (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-[#6366F1]/15 text-[#818CF8]">
            <ArrowLeftRight className="h-2.5 w-2.5" />
            {funilCurto(lead.origin_funnel_type)}
          </span>
          {repassadoPor && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              por <strong className="font-medium text-foreground/80">{repassadoPor}</strong>
            </span>
          )}
        </div>
      ) : lead.source && lead.source !== "prospeccao_ativa" ? (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
            <Megaphone className="h-2.5 w-2.5" /> {sourceLabel(lead.source)}
          </span>
        </div>
      ) : null}

      {/* AGUARDANDO — de quem o negócio depende, e até quando.
          Vencida fica vermelha: alguém prometeu uma data e ela passou, o que é
          cobrança, não abandono. Sem prazo em dia a flag simplesmente não
          aparece — é o que impede o "aguardando" eterno. */}
      {lead.waiting_on && lead.waiting_until && (
        <div className="mb-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
              esperaVencida(lead)
                ? "bg-destructive/15 text-destructive"
                : "bg-amber-500/15 text-amber-500"
            }`}
            title={lead.waiting_note ?? undefined}
          >
            <Hourglass className="h-2.5 w-2.5" />
            {waitingLabel(lead.waiting_on)} · {dataCurta(lead.waiting_until)}
          </span>
        </div>
      )}

      {/* Origem (visão "Todos os funis") — de qual pipeline o card veio */}
      {originFunnel && (
        <div className="mb-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5"
            style={{ background: originFunnel.color + "1a", color: originFunnel.color }}
          >
            {originFunnel.icon && <span>{originFunnel.icon}</span>} {originFunnel.name}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{displayName}</p>
          {secondaryTradeName && (
            <p className="text-xs text-muted-foreground truncate">{secondaryTradeName}</p>
          )}
          {lead.city && (
            <p className="text-xs text-muted-foreground truncate">
              {lead.city}{lead.state ? `, ${lead.state}` : ""}
            </p>
          )}
        </div>
      </div>

      {lead.contact_phone && (
        <a
          href={waLink ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-500 mb-2 w-fit"
          title="Abrir no WhatsApp"
        >
          <Phone className="h-3 w-3" />
          <span>{lead.contact_phone}</span>
        </a>
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

      {/* Linha de aging sempre reservada (mesma altura com ou sem aviso) → cards uniformes */}
      <div className={`flex items-center gap-1 text-xs mb-2 h-4 ${aging === "red" ? "text-destructive" : aging === "amber" ? "text-amber-500" : ""}`}>
        {aging && <><AlertTriangle className="h-3 w-3" /><span>{daysSince} dias sem atividade</span></>}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {lead.estimated_revenue > 0
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.estimated_revenue)
            : ""}
        </span>
        <span>{daysSince}d</span>
      </div>

      {/* Dono do lead (responsável) */}
      {owner && (
        <div className="flex items-center gap-1.5 mt-2" title={`Responsável: ${owner.name || "—"}`}>
          <ProfileAvatar userId={owner.id} avatarUrl={owner.avatar_url} fullName={owner.name} size={18} />
          <span className="text-[11px] text-muted-foreground truncate">{owner.name || "—"}</span>
        </div>
      )}

      {(onAdvance || onMarkLost) && (
        <div className="flex gap-1 mt-auto pt-2 border-t border-border">
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
