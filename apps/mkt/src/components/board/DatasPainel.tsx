import { useState } from "react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

// O painel "Datas" do Trello: calendário, início, entrega com hora, REPETIR e
// LEMBRETE — e só grava no "Salvar". É o MESMO no cartão aberto e na edição
// rápida.
// ⚠️ Repetir não é agenda: a próxima ocorrência nasce quando ESTA é CONCLUÍDA
// (gatilho `trg_mkt_recorrencia`, 20261068). Por isso a frase abaixo do campo
// diz exatamente isso — "repete toda semana" sozinho faz esperar cartão novo
// toda segunda, concluído ou não.
// ⚠️ Lembrete precisa de ENTREGA: sem data não há "antes de quê".

export const LEMBRETES: { v: number | null; rot: string }[] = [
  { v: null, rot: "Nenhum" },
  { v: 0, rot: "Na hora da entrega" },
  { v: 5, rot: "5 minutos antes" },
  { v: 10, rot: "10 minutos antes" },
  { v: 15, rot: "15 minutos antes" },
  { v: 60, rot: "1 hora antes" },
  { v: 120, rot: "2 horas antes" },
  { v: 1440, rot: "1 dia antes" },
  { v: 2880, rot: "2 dias antes" },
];
export const RECORRENCIAS: { v: string | null; rot: string }[] = [
  { v: null, rot: "Nunca" },
  { v: "diaria", rot: "Todo dia" },
  { v: "semanal", rot: "Toda semana" },
  { v: "mensal", rot: "Todo mês" },
  { v: "anual", rot: "Todo ano" },
];

export interface DatasDoCartao {
  start_date: string | null; due_date: string | null;
  lembrete_minutos?: number | null; recorrencia?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const diaIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d, 12); };

export function DatasPainel({ card, onSalvar, onFechar }: {
  card: DatasDoCartao;
  onSalvar: (patch: Record<string, unknown>) => void;
  onFechar?: () => void;
}) {
  const inicial = (iso: string | null) => (iso ? diaIso(new Date(iso)) : "");
  const [temInicio, setTemInicio] = useState(!!card.start_date);
  const [inicio, setInicio] = useState(inicial(card.start_date));
  const [temEntrega, setTemEntrega] = useState(!!card.due_date || !card.start_date);
  const [entrega, setEntrega] = useState(inicial(card.due_date) || diaIso(new Date()));
  const [hora, setHora] = useState(card.due_date ? (() => { const d = new Date(card.due_date!); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : "18:00");
  const [repetir, setRepetir] = useState<string | null>(card.recorrencia ?? null);
  const [lembrete, setLembrete] = useState<number | null>(card.lembrete_minutos ?? null);
  // Qual campo o calendário está editando — o clique no dia vai para ele.
  const [alvo, setAlvo] = useState<"inicio" | "entrega">(card.start_date && !card.due_date ? "inicio" : "entrega");

  const selecionado = alvo === "inicio" ? (inicio ? deIso(inicio) : undefined) : (entrega ? deIso(entrega) : undefined);
  const escolherDia = (d?: Date) => {
    if (!d) return;
    if (alvo === "inicio") { setInicio(diaIso(d)); setTemInicio(true); }
    else { setEntrega(diaIso(d)); setTemEntrega(true); }
  };

  const salvar = () => {
    const due = temEntrega && entrega ? new Date(`${entrega}T${hora || "18:00"}:00`).toISOString() : null;
    onSalvar({
      start_date: temInicio && inicio ? new Date(`${inicio}T12:00:00`).toISOString() : null,
      due_date: due,
      // Sem entrega, lembrete e repetição não têm de onde contar.
      lembrete_minutos: due ? lembrete : null,
      recorrencia: due ? repetir : null,
    });
    onFechar?.();
  };
  const remover = () => {
    onSalvar({ start_date: null, due_date: null, lembrete_minutos: null, recorrencia: null });
    onFechar?.();
  };

  const campo = "mkt-field text-sm w-full min-w-0";
  return (
    <div className="space-y-3">
      <Calendar mode="single" locale={ptBR} selected={selecionado} onSelect={escolherDia}
        defaultMonth={selecionado} className="p-0 mx-auto w-fit" />

      <div className="space-y-1">
        <span className="mkt-meta-label block">Data de início</span>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={temInicio} onChange={(e) => { setTemInicio(e.target.checked); if (e.target.checked) { setAlvo("inicio"); if (!inicio) setInicio(entrega || diaIso(new Date())); } }}
            className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
          <input type="date" value={inicio} disabled={!temInicio} onFocus={() => setAlvo("inicio")} onChange={(e) => setInicio(e.target.value)}
            className={`${campo} disabled:opacity-40 ${alvo === "inicio" && temInicio ? "ring-1 ring-primary" : ""}`} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="mkt-meta-label block">Data de entrega</span>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={temEntrega} onChange={(e) => { setTemEntrega(e.target.checked); if (e.target.checked) setAlvo("entrega"); }}
            className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
          <input type="date" value={entrega} disabled={!temEntrega} onFocus={() => setAlvo("entrega")} onChange={(e) => setEntrega(e.target.value)}
            className={`${campo} disabled:opacity-40 ${alvo === "entrega" && temEntrega ? "ring-1 ring-primary" : ""}`} />
          <input type="time" value={hora} disabled={!temEntrega} onChange={(e) => setHora(e.target.value)}
            className="mkt-field text-sm w-24 shrink-0 disabled:opacity-40" />
        </div>
      </div>

      <div className="space-y-1">
        <span className="mkt-meta-label block">Repetir</span>
        <select value={repetir ?? ""} disabled={!temEntrega} onChange={(e) => setRepetir(e.target.value || null)} className={`${campo} disabled:opacity-40`}>
          {RECORRENCIAS.map((r) => <option key={r.rot} value={r.v ?? ""}>{r.rot}</option>)}
        </select>
        {repetir && temEntrega && (
          <p className="text-[11px] text-muted-foreground">Ao concluir este cartão, nasce a próxima ocorrência logo abaixo dele, com a nova data e o checklist desmarcado.</p>
        )}
      </div>

      <div className="space-y-1">
        <span className="mkt-meta-label block">Lembrete</span>
        <select value={lembrete ?? ""} disabled={!temEntrega} onChange={(e) => setLembrete(e.target.value === "" ? null : Number(e.target.value))} className={`${campo} disabled:opacity-40`}>
          {LEMBRETES.map((l) => <option key={l.rot} value={l.v ?? ""}>{l.rot}</option>)}
        </select>
        {lembrete !== null && temEntrega && (
          <p className="text-[11px] text-muted-foreground">Avisa no sininho os membros do cartão (sem membro, quem o criou).</p>
        )}
      </div>

      <div className="space-y-1.5 pt-1">
        <Button className="w-full" onClick={salvar}>Salvar</Button>
        <Button variant="ghost" className="w-full" onClick={remover}>Remover</Button>
      </div>
    </div>
  );
}

/** Texto curto para o resumo do cartão: "Toda semana · lembrete 1 hora antes". */
export function resumoRepetirLembrete(c: DatasDoCartao): string {
  const r = RECORRENCIAS.find((x) => x.v === (c.recorrencia ?? null));
  const l = LEMBRETES.find((x) => x.v === (c.lembrete_minutos ?? null));
  return [c.recorrencia && r ? r.rot : "", c.lembrete_minutos != null && l ? `lembrete ${l.rot.toLowerCase()}` : ""].filter(Boolean).join(" · ");
}
