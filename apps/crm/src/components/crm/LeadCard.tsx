import { Phone, ChevronRight, AlertTriangle, ArrowLeftRight, Megaphone, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { CRMLead, FunnelType } from "@/types/crm";
import {
  getDaysSinceUpdate, segmentOf, sourceLabel, FUNNEL_CONFIG,
  waitingLabel, esperaVencida,
} from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Card do lead no kanban — ALTURA FIXA de 184px.
//
// Fixa, não mínima. Card que cresce com o conteúdo faz a coluna serrilhar e
// o botão "Avançar" dançar de altura em altura — o alvo do clique se move a
// cada card. Aqui todo card mede o mesmo, cheio ou vazio.
//
// Como se trava: reservando o espaço de quem pode não existir. As zonas de
// identidade (50), do-que-o-lead-é (16) e estado (16) ocupam altura mesmo
// vazias.
//
//   padding 24 + topo 50 + meta 16 + estado 16 + dono 26 + ações 28
//   + 4 espaços de 6 = 184
//
// ⚠️ `overflow-hidden` em CADA zona não é enfeite. Zona de altura fixa NÃO
// esconde o excesso por padrão: ele vaza POR CIMA das linhas de baixo. Um
// nome fantasia inesperado ou um ramo longo embolariam o card inteiro.
//
// A ordem é deliberada: NOME PRIMEIRO. Antes o card abria com duas pílulas
// coloridas e o nome só vinha na terceira linha — o olho lia "Licenciado"
// antes de saber com quem estava falando.
// ─────────────────────────────────────────────────────────────────────────────

const ALTURA = 184;

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

/** Quantos itens de metadado cabem na linha de 16px sem apertar. O resto
 *  vira "+N" com a lista no tooltip — corte determinístico, sem medir DOM. */
const META_VISIVEIS = 2;

interface MetaItem { chave: string; cor?: string; texto: string; icone?: "repasse" | "origem" }

export function LeadCard({ lead, funnelType: _funnelType, owner, onAdvance, onMarkLost, onClick, originFunnel, repassadoPor }: LeadCardProps) {
  const daysSince = getDaysSinceUpdate(lead.updated_at);
  const aging: "red" | "amber" | null = daysSince > 7 ? "red" : daysSince > 3 ? "amber" : null;
  const displayName = lead.legal_name || lead.trade_name || lead.contact_name || "Sem nome";
  const seg = segmentOf(lead.lead_segment);
  // Nome fantasia aparece como linha secundária só quando difere da razão social exibida.
  const secondaryTradeName = lead.trade_name && lead.trade_name !== displayName ? lead.trade_name : null;
  const waLink = lead.contact_phone ? `https://wa.me/55${lead.contact_phone.replace(/\D/g, "")}` : null;
  const local = [lead.city, lead.state].filter(Boolean).join(", ");

  // Ordem de prioridade: o que o lead É vem antes de onde ele veio, e o ramo
  // por último — é o que menos muda a decisão de quem olha a fila.
  const metas: MetaItem[] = [];
  if (seg) metas.push({ chave: "seg", cor: seg.color, texto: seg.shortName });
  if (lead.origin_lead_id) {
    metas.push({
      chave: "repasse", cor: "#6366F1", icone: "repasse",
      texto: `${funilCurto(lead.origin_funnel_type)}${repassadoPor ? ` · ${repassadoPor}` : ""}`,
    });
  } else if (lead.source && lead.source !== "prospeccao_ativa") {
    metas.push({ chave: "origem", icone: "origem", texto: sourceLabel(lead.source) });
  }
  if (originFunnel) metas.push({ chave: "funil", cor: originFunnel.color, texto: originFunnel.name });
  if (lead.ramo) metas.push({ chave: "ramo", texto: lead.ramo });

  const metasVisiveis = metas.slice(0, META_VISIVEIS);
  const metasOcultas = metas.slice(META_VISIVEIS);

  return (
    <div
      style={{ height: ALTURA }}
      className="relative overflow-hidden p-3 rounded-xl border cursor-pointer flex flex-col gap-1.5
                 bg-[hsl(var(--kanban-card))] border-[hsl(var(--kanban-card-border))]
                 shadow-sm hover:shadow-md transition-shadow"
      onClick={() => onClick?.(lead)}
    >
      {/* Atraso vira FAIXA lateral, não fundo tingido: pintar o card inteiro
          brigava com a leitura do texto e apagava o contraste do card. */}
      {aging && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${aging === "red" ? "bg-destructive" : "bg-amber-500"}`}
        />
      )}

      {/* ── Zona 1 · identidade (50px) ─────────────────────────────────── */}
      <div className="flex items-start gap-2 h-[50px] overflow-hidden">
        <span
          className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${TEMP_COR[lead.temperature]}`}
          title={TEMP_LABEL[lead.temperature]}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[15px] font-semibold leading-[1.2] truncate" title={displayName}>
            {displayName}
          </p>
          {secondaryTradeName && (
            <p className="text-xs text-muted-foreground leading-[1.35] truncate">{secondaryTradeName}</p>
          )}
          {/* Cidade e telefone na MESMA linha — antes eram duas, empurrando
              todo o resto do card para baixo. */}
          {(local || lead.contact_phone) && (
            <p className="text-xs text-muted-foreground leading-[1.35] truncate">
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
          )}
        </div>
        {/* Valor no topo: é o dado que decide prioridade. Antes ficava no
            rodapé, misturado com a contagem de dias. */}
        {lead.estimated_revenue > 0 && (
          <span className="text-xs font-semibold tabular-nums shrink-0">
            {brlCurto(lead.estimated_revenue)}
          </span>
        )}
      </div>

      {/* ── Zona 2 · o que o lead é (16px, sempre reservada) ───────────── */}
      <div className="h-4 flex items-center gap-2.5 text-[11px] text-muted-foreground overflow-hidden whitespace-nowrap">
        {metasVisiveis.map((m) => (
          <span key={m.chave} className="inline-flex items-center gap-1.5 min-w-0" title={m.texto}>
            {m.cor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.cor }} />}
            {m.icone === "repasse" && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />}
            {m.icone === "origem" && <Megaphone className="h-2.5 w-2.5 shrink-0" />}
            <span className="truncate">{m.texto}</span>
          </span>
        ))}
        {metasOcultas.length > 0 && (
          <span className="font-semibold shrink-0" title={metasOcultas.map((m) => m.texto).join(" · ")}>
            +{metasOcultas.length}
          </span>
        )}
      </div>

      {/* ── Zona 3 · estado (16px, reservada mesmo vazia) ──────────────── */}
      <div className="h-4 flex items-center gap-2.5 text-[11px] font-medium overflow-hidden whitespace-nowrap">
        {/* Aguardando só aparece com prazo definido — é o que impede o
            "aguardando" eterno. Vencido é cobrança, não abandono. */}
        {lead.waiting_on && lead.waiting_until && (
          <span
            className={`inline-flex items-center gap-1 shrink-0 ${
              esperaVencida(lead) ? "text-destructive" : "text-amber-500"}`}
            title={lead.waiting_note ?? undefined}
          >
            <Hourglass className="h-2.5 w-2.5 shrink-0" />
            {waitingLabel(lead.waiting_on)} · {dataCurta(lead.waiting_until)}
          </span>
        )}
        {aging && (
          <span className={`inline-flex items-center gap-1 min-w-0 ${
            aging === "red" ? "text-destructive" : "text-amber-500"}`}>
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{daysSince} dias sem atividade</span>
          </span>
        )}
      </div>

      {/* ── Zona 4 · responsável (encostada no rodapé) ─────────────────── */}
      <div className="mt-auto flex items-center gap-2 pt-[7px] border-t border-[hsl(var(--kanban-card-border))]">
        {owner ? (
          <>
            <ProfileAvatar userId={owner.id} avatarUrl={owner.avatar_url} fullName={owner.name} size={18} />
            <span className="text-[11px] text-muted-foreground truncate">{owner.name || "—"}</span>
          </>
        ) : (
          // Lead órfão precisa APARECER, não sumir: esconder a linha faria o
          // card sem dono parecer igual ao que tem dono.
          <span className="text-[11px] text-muted-foreground">sem responsável</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">{daysSince}d</span>
      </div>

      {/* ── Zona 5 · ações (mesma altura em todo card) ─────────────────── */}
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
