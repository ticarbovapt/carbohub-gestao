import { Phone, ChevronRight, AlertTriangle, ArrowLeftRight, Megaphone, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { CRMLead, FunnelType } from "@/types/crm";
import {
  getDaysSinceUpdate, segmentOf, sourceLabel, FUNNEL_CONFIG,
  waitingLabel, esperaVencida,
} from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Card do lead no kanban.
//
// A ordem aqui é deliberada: NOME PRIMEIRO. Antes o card abria com duas
// pílulas coloridas (segmento e origem) e o nome só vinha na terceira linha —
// o olho lia "Licenciado" e "Formulário CarboVapt" antes de saber com quem
// estava falando, e o nome é justamente o que identifica o card.
//
// Segmento, origem, repasse e ramo continuam todos aqui, mas como ponto de
// 6px + texto cinza em vez de pílula preenchida. A informação não sumiu:
// parou de competir com o nome.
//
// O card usa --kanban-card, não bg-card. Motivo em index.css: no tema escuro
// o card era MAIS ESCURO que a coluna e ficava a 2% do fundo; no claro, card
// e coluna eram os dois branco puro. Não havia contraste nenhum.
// ─────────────────────────────────────────────────────────────────────────────

// Data-só é parseada como UTC por new Date("2026-07-30") e volta um dia no
// fuso do Brasil. Monta a data local componente a componente.
const dataCurta = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const funilCurto = (id: string | null | undefined) =>
  (id ? FUNNEL_CONFIG[id as FunnelType]?.shortName : null) ?? "outro funil";

const brlCurto = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(".", ",")}k`
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

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

// Temperatura vira um ponto ao lado do nome. Antes era uma etiqueta com emoji
// ocupando uma linha inteira para dizer uma coisa de três estados.
const TEMP_COR = {
  quente: "bg-destructive",
  morno: "bg-amber-500",
  frio: "bg-sky-400",
} as const;
const TEMP_LABEL = { quente: "Quente", morno: "Morno", frio: "Frio" };

/** Item da linha de metadados: ponto colorido + texto discreto. */
function Meta({ cor, children, title }: { cor?: string; children: React.ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={title}>
      {cor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: cor }} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function LeadCard({ lead, funnelType: _funnelType, owner, onAdvance, onMarkLost, onClick, originFunnel, repassadoPor }: LeadCardProps) {
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const aging: "red" | "amber" | null = daysSince > 7 ? "red" : daysSince > 3 ? "amber" : null;
  const displayName = lead.legal_name || lead.trade_name || lead.contact_name || "Sem nome";
  const seg = segmentOf(lead.lead_segment);
  // Nome fantasia aparece como linha secundária só quando difere da razão social exibida.
  const secondaryTradeName = lead.trade_name && lead.trade_name !== displayName ? lead.trade_name : null;
  const waLink = lead.contact_phone ? `https://wa.me/55${lead.contact_phone.replace(/\D/g, "")}` : null;
  const local = [lead.city, lead.state].filter(Boolean).join(", ");

  return (
    <div
      className="relative overflow-hidden p-3 rounded-xl border cursor-pointer flex flex-col gap-2
                 bg-[hsl(var(--kanban-card))] border-[hsl(var(--kanban-card-border))]
                 shadow-sm hover:shadow-md transition-shadow"
      onClick={() => onClick?.(lead)}
    >
      {/* Atraso vira FAIXA lateral, não fundo tingido: pintar o card inteiro
          brigava com a leitura do texto e apagava o contraste que a cor
          própria do card acabou de ganhar. */}
      {aging && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${aging === "red" ? "bg-destructive" : "bg-amber-500"}`}
        />
      )}

      {/* ── Topo: temperatura, nome, valor ─────────────────────────────── */}
      <div className="flex items-start gap-2">
        <span
          className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${TEMP_COR[lead.temperature]}`}
          title={TEMP_LABEL[lead.temperature]}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight truncate" title={displayName}>
            {displayName}
          </p>
          {secondaryTradeName && (
            <p className="text-xs text-muted-foreground truncate">{secondaryTradeName}</p>
          )}
          {/* Cidade e telefone na MESMA linha — antes eram duas, empurrando
              todo o resto do card para baixo. */}
          <p className="text-xs text-muted-foreground truncate">
            {local}
            {local && lead.contact_phone && " · "}
            {lead.contact_phone && (
              <a
                href={waLink ?? undefined}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-emerald-500 inline-flex items-center gap-1"
                title="Abrir no WhatsApp"
              >
                <Phone className="h-3 w-3 inline shrink-0" />{lead.contact_phone}
              </a>
            )}
          </p>
        </div>
        {/* Valor sobe para o topo: é o dado que decide prioridade. Antes ficava
            no rodapé, misturado com a contagem de dias. */}
        {lead.estimated_revenue > 0 && (
          <span className="text-xs font-semibold tabular-nums shrink-0">
            {brlCurto(lead.estimated_revenue)}
          </span>
        )}
      </div>

      {/* ── Metadados: tudo que antes era pílula colorida ───────────────── */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        {seg && <Meta cor={seg.color} title={seg.label}>{seg.shortName}</Meta>}

        {/* Procedência: repasse mostra o funil de origem e QUEM repassou (é o
            que permite medir qual SDR entrega mais); o resto mostra a origem. */}
        {lead.origin_lead_id ? (
          <Meta cor="#6366F1" title={repassadoPor ? `Repassado por ${repassadoPor}` : undefined}>
            <ArrowLeftRight className="h-2.5 w-2.5 inline mr-1" />
            {funilCurto(lead.origin_funnel_type)}{repassadoPor ? ` · ${repassadoPor}` : ""}
          </Meta>
        ) : lead.source && lead.source !== "prospeccao_ativa" ? (
          <Meta title={sourceLabel(lead.source)}>
            <Megaphone className="h-2.5 w-2.5 inline mr-1" />{sourceLabel(lead.source)}
          </Meta>
        ) : null}

        {originFunnel && (
          <Meta cor={originFunnel.color} title={originFunnel.name}>{originFunnel.name}</Meta>
        )}

        {lead.ramo && <Meta title={lead.ramo}>{lead.ramo}</Meta>}

        {/* Aguardando: só aparece com prazo definido — é o que impede o
            "aguardando" eterno. Vencido é cobrança, não abandono. */}
        {lead.waiting_on && lead.waiting_until && (
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              esperaVencida(lead) ? "text-destructive" : "text-amber-500"}`}
            title={lead.waiting_note ?? undefined}
          >
            <Hourglass className="h-2.5 w-2.5 shrink-0" />
            {waitingLabel(lead.waiting_on)} · {dataCurta(lead.waiting_until)}
          </span>
        )}

        {aging && (
          <span className={`inline-flex items-center gap-1 font-medium ${
            aging === "red" ? "text-destructive" : "text-amber-500"}`}>
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{daysSince} dias sem atividade
          </span>
        )}
      </div>

      {/* ── Rodapé: dono e idade do card ───────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 border-t border-[hsl(var(--kanban-card-border))]">
        {owner ? (
          <>
            <ProfileAvatar userId={owner.id} avatarUrl={owner.avatar_url} fullName={owner.name} size={18} />
            <span className="text-[11px] text-muted-foreground truncate">{owner.name || "—"}</span>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">sem responsável</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">{daysSince}d</span>
      </div>

      {(onAdvance || onMarkLost) && (
        <div className="flex gap-1">
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
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
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
