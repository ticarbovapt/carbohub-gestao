// ─────────────────────────────────────────────────────────────────────────────
// Máquina de Vendas — regras PURAS do pipeline (sem rede, sem React).
// Banco: migração 20261153 (`mv_leads`). A etapa é CHECK lá; mudou aqui, mude lá.
// ─────────────────────────────────────────────────────────────────────────────

export type Etapa = "contato" | "orcado" | "agendado" | "executado" | "perdido";
export type PagoPara = "carbovapt" | "licenciado";

export interface MvLead {
  id: string;
  nome: string;
  whatsapp: string | null;
  link_chat: string | null;
  cidade: string | null;
  uf: string | null;
  modelo: string | null;
  veiculos: number | null;
  valor: number | null;
  etapa: Etapa;
  motivo_perda: string | null;
  anotacoes: string | null;
  tomador_decisao: string | null;
  parceiro: string | null;
  pago_para: PagoPara | null;
  primeiro_contato_em: string;        // YYYY-MM-DD
  ultimo_contato_em: string | null;   // YYYY-MM-DD
  proximo_contato_em: string | null;  // ISO
  fechamento_em: string | null;       // YYYY-MM-DD
  pos_venda_nf: boolean;
  responsavel_id: string | null;
  tecnico_id: string | null;
  agendado_para: string | null;       // ISO
  duracao_min: number;
  local_execucao: string | null;
  order_id: string | null;
  arquivado_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MvEvento {
  id: number;
  lead_id: string;
  tipo: string;
  de: string | null;
  para: string | null;
  user_id: string | null;
  em: string;
}

export interface Pessoa { id: string; nome: string; avatar_url: string | null }

export const ETAPAS: { id: Etapa; rotulo: string; cor: string }[] = [
  { id: "contato",   rotulo: "Primeiro contato", cor: "#64748B" },
  { id: "orcado",    rotulo: "Orçado",           cor: "#D97706" },
  { id: "agendado",  rotulo: "Agendado",         cor: "#2563EB" },
  { id: "executado", rotulo: "Executado",        cor: "#16A34A" },
  { id: "perdido",   rotulo: "Perdido",          cor: "#DC2626" },
];
export const ROTULO_ETAPA: Record<Etapa, string> =
  Object.fromEntries(ETAPAS.map((e) => [e.id, e.rotulo])) as Record<Etapa, string>;
export const COR_ETAPA: Record<Etapa, string> =
  Object.fromEntries(ETAPAS.map((e) => [e.id, e.cor])) as Record<Etapa, string>;

export const ROTULO_PAGO: Record<PagoPara, string> = { carbovapt: "CarboVAPT", licenciado: "Licenciado" };

export const ehEtapa = (v: string): v is Etapa => ETAPAS.some((e) => e.id === v);

const TZ = "America/Sao_Paulo";

/** Dia (YYYY-MM-DD) de um instante, em Brasília — nunca `toISOString()` (UTC). */
export function diaDe(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const hoje = (agora = new Date()) => diaDe(agora);

/** Dias inteiros entre dois dias YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Dias desde o último contato (cai no primeiro contato quando não há outro). */
export function diasSemContato(l: Pick<MvLead, "ultimo_contato_em" | "primeiro_contato_em">, agora = new Date()): number {
  return Math.max(0, diasEntre(l.ultimo_contato_em ?? l.primeiro_contato_em, hoje(agora)));
}

/** Lead parado: ainda em negociação e sem contato há ≥ 3 dias, ou com retorno vencido. */
export function estaParado(l: MvLead, agora = new Date()): boolean {
  if (l.etapa !== "contato" && l.etapa !== "orcado") return false;
  if (l.proximo_contato_em && new Date(l.proximo_contato_em) <= agora) return true;
  return diasSemContato(l, agora) >= 3;
}

export const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function fmtDia(dia: string | null | undefined, comAno = false): string {
  if (!dia) return "—";
  const [y, m, d] = dia.slice(0, 10).split("-");
  return comAno ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function fmtQuando(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso)).replace(".", "");
}

export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "2026-11-10T14:30" (o `DateTimePicker`, hora LOCAL) → ISO. */
export function localParaIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** ISO → "2026-11-10T14:30" na hora local do navegador. */
export function isoParaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Só dígitos; Brasil sem DDI ganha 55. Para o link do WhatsApp. */
export function linkWhatsapp(fone: string | null | undefined): string | null {
  const d = (fone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

/** Segunda-feira (YYYY-MM-DD) da semana de um dia. */
export function segundaDa(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = segunda
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}
export function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Link "adicionar ao Google Agenda" — o técnico leva o serviço para a agenda do celular. */
export function linkGoogleAgenda(l: MvLead): string | null {
  if (!l.agendado_para) return null;
  const ini = new Date(l.agendado_para);
  const fim = new Date(ini.getTime() + (l.duracao_min || 90) * 60_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const det = [l.modelo && `Veículo: ${l.modelo}`, l.whatsapp && `WhatsApp: ${l.whatsapp}`, l.anotacoes]
    .filter(Boolean).join("\n");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Descarbonização · ${l.nome}`,
    dates: `${z(ini)}/${z(fim)}`,
    details: det,
    location: [l.local_execucao, l.cidade && `${l.cidade}${l.uf ? "/" + l.uf : ""}`].filter(Boolean).join(" · "),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export interface Resumo {
  emNegociacao: number;
  valorEmAberto: number;
  agendadosSemana: number;
  executadosMes: number;
  faturadoMes: number;
  porPago: Record<PagoPara | "sem", number>;
  parados: number;
}

/** Os números do topo — do conjunto já carregado, sem os arquivados. */
export function resumir(leads: MvLead[], agora = new Date()): Resumo {
  const d = hoje(agora);
  const seg = segundaDa(d);
  const dom = somarDias(seg, 6);
  const mes = d.slice(0, 7);
  const r: Resumo = { emNegociacao: 0, valorEmAberto: 0, agendadosSemana: 0, executadosMes: 0, faturadoMes: 0,
    porPago: { carbovapt: 0, licenciado: 0, sem: 0 }, parados: 0 };
  for (const l of leads) {
    if (l.arquivado_em) continue;
    if (l.etapa === "contato" || l.etapa === "orcado") {
      r.emNegociacao++;
      r.valorEmAberto += l.valor ?? 0;
    }
    if (estaParado(l, agora)) r.parados++;
    if (l.agendado_para && l.etapa === "agendado") {
      const dia = diaDe(l.agendado_para);
      if (dia >= seg && dia <= dom) r.agendadosSemana++;
    }
    if (l.etapa === "executado") {
      const ref = l.fechamento_em ?? (l.agendado_para ? diaDe(l.agendado_para) : diaDe(l.updated_at));
      if (ref.slice(0, 7) === mes) {
        r.executadosMes++;
        r.faturadoMes += l.valor ?? 0;
        r.porPago[l.pago_para ?? "sem"] += l.valor ?? 0;
      }
    }
  }
  return r;
}

/** Busca sem acento e minúscula sobre nome, telefone, cidade, modelo e parceiro. */
export function chave(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
export function casaBusca(l: MvLead, busca: string): boolean {
  const b = chave(busca.trim());
  if (!b) return true;
  const digitos = busca.replace(/\D/g, "");
  if (digitos.length >= 4 && (l.whatsapp ?? "").replace(/\D/g, "").includes(digitos)) return true;
  return chave([l.nome, l.cidade, l.uf, l.modelo, l.parceiro, l.tomador_decisao].filter(Boolean).join(" ")).includes(b);
}

/** Avançar uma etapa (o botão do card). Perdido/executado não avançam. */
export function proximaEtapa(e: Etapa): Etapa | null {
  return e === "contato" ? "orcado" : e === "orcado" ? "agendado" : e === "agendado" ? "executado" : null;
}

/** O que falta para entrar numa etapa — a mesma trava do CHECK do banco, dita antes. */
export function faltaParaEtapa(l: Pick<MvLead, "agendado_para">, e: Etapa): string | null {
  if (e === "agendado" && !l.agendado_para) return "Defina a data da execução para agendar.";
  return null;
}
