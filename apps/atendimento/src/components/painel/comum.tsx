import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldAlert, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { linkDaConversa, type PainelNumero, type Tema } from "@/hooks/usePainelAtendimento";
import { TEMA_ROTULO, type Variacao } from "@/lib/painelAtendimento";

/** O relógio da tela: contagem regressiva da janela e "há quanto" andam sozinhos. */
export function useAgora(passoMs = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(t);
  }, [passoMs]);
  return agora;
}

export function Bolinha({ cor, className }: { cor: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: cor ?? "hsl(var(--muted-foreground))" }}
    />
  );
}

export function NumeroChip({ numero, id }: { numero?: PainelNumero | null; id: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Bolinha cor={numero?.cor} className="h-2 w-2" />
      <span className="truncate">{numero?.rotulo ?? id}</span>
    </span>
  );
}

export function TemaBadge({ tema }: { tema: Tema }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {TEMA_ROTULO[tema] ?? tema}
    </span>
  );
}

export function RiscoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
      <ShieldAlert className="h-3 w-3" /> Risco
    </span>
  );
}

export function AbrirConversa({ numeroId, waId, className, compacto = false }: { numeroId: string; waId: string; className?: string; compacto?: boolean }) {
  return (
    <Link
      to={linkDaConversa(numeroId, waId)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      {compacto ? "Abrir" : "Abrir conversa"} <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function VariacaoChip({ v, rotulo = "vs. anterior" }: { v: Variacao | null; rotulo?: string }) {
  if (!v) return null;
  const Icone = v.sobe == null ? Minus : v.sobe ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        v.tom === "bom" && "text-emerald-600 dark:text-emerald-400",
        v.tom === "ruim" && "text-red-600 dark:text-red-400",
        v.tom === "neutro" && "text-muted-foreground",
      )}
    >
      <Icone className="h-3.5 w-3.5" />
      {v.texto}
      <span className="font-normal text-muted-foreground">{rotulo}</span>
    </span>
  );
}

export function Secao({ titulo, acoes, children, className, corpo }: {
  titulo: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; corpo?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </header>
      <div className={cn("p-4", corpo)}>{children}</div>
    </section>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Botão de "Mostrar mais" para listas longas (a tela desenha em fatias). */
export function useFatia<T>(lista: T[], passo = 30, chave = "") {
  const [n, setN] = useState(passo);
  // ⚠️ Reinicia quando o FILTRO muda (`chave`), não a cada releitura de 1 min —
  // senão o "Mostrar mais" fecharia sozinho enquanto o gestor lê.
  useEffect(() => setN(passo), [chave, passo]);
  const resto = Math.max(0, lista.length - n);
  return {
    visiveis: lista.slice(0, n),
    resto,
    mais: () => setN((x) => x + passo),
  };
}

export function MostrarMais({ resto, onClick }: { resto: number; onClick: () => void }) {
  if (resto <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
    >
      Mostrar mais ({resto})
    </button>
  );
}

/** Pílula de filtro (uma escolha) — o mesmo desenho em toda barra de filtro do painel. */
export function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        ativo ? "border-foreground/30 bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
