import { useEffect, useRef, useState } from "react";
import { Building2, User, Clock, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useClienteBusca, formatDocDigits, type ClienteSugestao } from "@/hooks/useClienteBusca";

// ─────────────────────────────────────────────────────────────────────────────
// Campo de CNPJ/CPF com sugestão de cliente JÁ EXISTENTE.
//
// Enquanto digita, mostra quem bate na nossa base (pedidos + leads). Escolher
// preenche o que já sabemos — o vendedor não redigita cliente que compra todo
// mês, e o cadastro não ganha uma segunda versão do mesmo cliente com o nome
// escrito diferente.
//
// A lista distingue CLIENTE (já comprou, com a contagem de pedidos) de LEAD
// (ainda não comprou). São situações comerciais diferentes e quem está
// vendendo precisa enxergar a diferença antes de clicar.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteDocInputProps {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  onPick: (c: ClienteSugestao) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : null;

export function ClienteDocInput({
  value, onChange, onEnter, onPick,
  placeholder = "CNPJ ou CPF", maxLength = 18, className,
}: ClienteDocInputProps) {
  const [aberto, setAberto] = useState(false);
  const [idx, setIdx] = useState(-1);
  // Escolher uma sugestão muda o valor do campo, o que dispararia a busca de
  // novo e reabriria a lista sozinha. Trava até a próxima digitação.
  const [travado, setTravado] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { sugestoes, buscando } = useClienteBusca(value, !travado);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => { setIdx(-1); }, [sugestoes]);

  const escolher = (c: ClienteSugestao) => {
    setTravado(true);
    setAberto(false);
    onPick(c);
  };

  const digitar = (v: string) => {
    setTravado(false);
    setAberto(true);
    onChange(v);
  };

  const teclado = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const lista = aberto ? sugestoes : [];
    if (e.key === "ArrowDown" && lista.length) {
      e.preventDefault(); setIdx((i) => (i + 1) % lista.length); return;
    }
    if (e.key === "ArrowUp" && lista.length) {
      e.preventDefault(); setIdx((i) => (i <= 0 ? lista.length - 1 : i - 1)); return;
    }
    if (e.key === "Escape") { setAberto(false); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter com item destacado escolhe o cliente; sem destaque, dispara a
      // consulta externa como sempre fez.
      if (idx >= 0 && lista[idx]) escolher(lista[idx]);
      else onEnter?.();
    }
  };

  const mostrar = aberto && !travado && (sugestoes.length > 0 || buscando);

  return (
    <div ref={rootRef} className="relative flex-1">
      <Input
        value={value}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => { if (!travado) setAberto(true); }}
        onKeyDown={teclado}
        placeholder={placeholder}
        maxLength={maxLength}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-autocomplete="list"
      />

      {mostrar && (
        <div role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {buscando && sugestoes.length === 0 ? "Procurando na base…" : "Já está na nossa base"}
          </p>

          {buscando && sugestoes.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </div>
          )}

          {sugestoes.map((c, i) => {
            const Icone = c.tipo === "cliente" ? Building2 : User;
            return (
              <button
                key={c.doc}
                type="button"
                role="option"
                aria-selected={i === idx}
                onMouseEnter={() => setIdx(i)}
                onClick={() => escolher(c)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  i === idx ? "bg-muted" : "hover:bg-muted/60"}`}
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  c.tipo === "cliente" ? "bg-carbo-green/10 text-carbo-green" : "bg-muted text-muted-foreground"}`}>
                  <Icone className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.nome || "Sem nome"}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      c.tipo === "cliente"
                        ? "bg-carbo-green/10 text-carbo-green"
                        : "bg-muted text-muted-foreground"}`}>
                      {c.tipo === "cliente" ? `${c.pedidos} pedido${c.pedidos > 1 ? "s" : ""}` : "lead"}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{formatDocDigits(c.doc)}</span>
                    {(c.cidade || c.uf) && <span>· {[c.cidade, c.uf].filter(Boolean).join("/")}</span>}
                    {c.ultimo && (
                      <span className="flex items-center gap-1">
                        · <Clock className="h-3 w-3" /> {dataCurta(c.ultimo)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
