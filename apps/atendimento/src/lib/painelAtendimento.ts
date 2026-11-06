import type { FaixaChave, PainelConfig, Tema } from "@/hooks/usePainelAtendimento";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do atendimento — só FORMATAÇÃO e rótulos (06/11/2026).
//
// ⚠️ Nada aqui calcula métrica: as definições moram no banco
// (`carbo_atendimento_painel`, migração 20261148). O que existe é a divisão
// para taxa, a comparação com o período anterior e o texto de tempo — tudo
// puro, sem React, para a tela e o detalhe da pessoa dizerem o mesmo número.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutos em texto curto: "<1 min", "12 min", "1h05", "2d 3h". Nulo = "—". */
export function fmtMin(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const totalMin = Math.round(m);
  if (totalMin < 1440) {
    const h = Math.floor(totalMin / 60), mm = totalMin % 60;
    return `${h}h${String(mm).padStart(2, "0")}`;
  }
  const d = Math.floor(totalMin / 1440), h = Math.round((totalMin % 1440) / 60);
  return h === 24 ? `${d + 1}d` : h ? `${d}d ${h}h` : `${d}d`;
}

/** a ÷ b em %, ou nulo quando não há base. */
export function pct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !b) return null;
  return (a / b) * 100;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v > 0 && v < 1) return "<1%";
  return `${Math.round(v)}%`;
}

export const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR");

/** Variação contra o período anterior, já com o sentido de "bom". */
export interface Variacao {
  texto: string;
  /** bom | ruim | neutro — quem decide é `menorMelhor`. */
  tom: "bom" | "ruim" | "neutro";
  sobe: boolean | null;
}

/** Para TAXAS (em %): diferença em pontos percentuais. */
export function variacaoPp(atual: number | null, anterior: number | null, menorMelhor = false): Variacao | null {
  if (atual == null || anterior == null) return null;
  const d = atual - anterior;
  if (Math.abs(d) < 0.5) return { texto: "estável", tom: "neutro", sobe: null };
  const melhor = menorMelhor ? d < 0 : d > 0;
  return { texto: `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d))} p.p.`, tom: melhor ? "bom" : "ruim", sobe: d > 0 };
}

/** Para TEMPOS e CONTAGENS: variação relativa em %. */
export function variacaoRel(atual: number | null | undefined, anterior: number | null | undefined, menorMelhor = false): Variacao | null {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) {
    if (atual === 0) return { texto: "estável", tom: "neutro", sobe: null };
    return { texto: "antes 0", tom: menorMelhor ? "ruim" : "bom", sobe: true };
  }
  const r = ((atual - anterior) / anterior) * 100;
  if (Math.abs(r) < 2) return { texto: "estável", tom: "neutro", sobe: null };
  const melhor = menorMelhor ? r < 0 : r > 0;
  return { texto: `${r > 0 ? "+" : "−"}${Math.abs(Math.round(r))}%`, tom: melhor ? "bom" : "ruim", sobe: r > 0 };
}

export const TEMA_ROTULO: Record<Tema, string> = {
  reclamacao: "Reclamação",
  pagamento: "Pagamento",
  produto: "Produto",
  confianca: "Confiança / golpe",
  entrega: "Entrega",
  uso: "Uso do produto",
  onde_comprar: "Onde comprar",
  outros: "Outros",
};

export const FAIXA_ROTULO: Record<FaixaChave, string> = {
  ate_5: "até 5 min",
  ate_15: "5 a 15 min",
  ate_60: "15 a 60 min",
  ate_4h: "1 a 4 h",
  ate_24h: "4 a 24 h",
  mais_24h: "mais de 24 h",
  fechada_sem_resposta: "Fechada sem resposta",
  perdida: "Perdida",
  aguardando: "Aguardando",
};

/** O teto (em minutos) de cada faixa de resposta; nulo = não é faixa de tempo. */
export const FAIXA_TETO: Partial<Record<FaixaChave, number>> = {
  ate_5: 5, ate_15: 15, ate_60: 60, ate_4h: 240, ate_24h: 1440, mais_24h: Infinity,
};

export const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** "08:00:00" → "08:00". */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "—");

/** As horas cheias (0–23) cobertas pelo horário de atendimento. */
export function horasDoExpediente(c: PainelConfig): Set<number> {
  const hi = Number(c.hora_inicio.split(":")[0]);
  const [hf, mf] = c.hora_fim.split(":").map(Number);
  const fim = mf > 0 ? hf + 1 : hf;
  const s = new Set<number>();
  for (let h = hi; h < Math.min(fim, 24); h++) s.add(h);
  return s;
}

/** "dd/mm HH:MM" no fuso do navegador (Brasília). */
export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Minutos entre `iso` e `agora` (positivo = passado). */
export const minutosDesde = (iso: string, agora: number) => (agora - new Date(iso).getTime()) / 60000;

/** "há 3 h", "há 2 dias" — para "última resposta". */
export function haQuanto(iso: string | null | undefined, agora: number): string {
  if (!iso) return "nunca";
  const m = minutosDesde(iso, agora);
  if (m < 1) return "agora";
  return `há ${fmtMin(m)}`;
}

/** Contagem regressiva da janela de 24 h, com a cor do risco. */
export function janelaRestante(janelaAte: string, agora: number): { texto: string; tom: "vermelho" | "ambar" | "neutro" | "fechada"; min: number } {
  const m = (new Date(janelaAte).getTime() - agora) / 60000;
  if (m <= 0) return { texto: "janela fechada", tom: "fechada", min: m };
  return { texto: `fecha em ${fmtMin(m)}`, tom: m <= 120 ? "vermelho" : m <= 360 ? "ambar" : "neutro", min: m };
}

/** O telefone do WhatsApp legível: 5584991231007 → (84) 99123-1007. */
export function fmtFone(waId: string): string {
  const d = waId.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return waId;
}

/** Todos os dias YYYY-MM-DD de `de` a `ate`, inclusive. */
export function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T12:00:00`), f = new Date(`${ate}T12:00:00`);
  while (d <= f && out.length < 800) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Cores SEMÂNTICAS dos desfechos — as mesmas no gráfico, nas faixas e nas legendas. */
export const COR_DESFECHO = {
  respondida: "hsl(142 60% 42%)",
  fechada_sem_resposta: "hsl(32 95% 52%)",
  perdida: "hsl(0 72% 54%)",
  aguardando: "hsl(215 16% 62%)",
} as const;

export const ACENTO = "#9333EA";
