import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type OSView, TIPO_TONE, brl, dt, parseData, stageMeta } from "./osView";

type Campo = "agendamento" | "cliente" | "stage";
type Ordem = { campo: Campo; asc: boolean };

const ORDEM_ETAPA: Record<string, number> = { nova: 0, em_execucao: 1, concluida: 2, cancelada: 3 };

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function comparar(a: OSView, b: OSView, { campo, asc }: Ordem): number {
  const s = asc ? 1 : -1;
  if (campo === "cliente") return s * a.cliente.localeCompare(b.cliente, "pt-BR");
  if (campo === "stage") return s * ((ORDEM_ETAPA[a.stage] ?? 9) - (ORDEM_ETAPA[b.stage] ?? 9));
  // Sem data vai sempre para o fim, nos dois sentidos.
  if (!a.agendamento && !b.agendamento) return 0;
  if (!a.agendamento) return 1;
  if (!b.agendamento) return -1;
  return s * (parseData(a.agendamento).getTime() - parseData(b.agendamento).getTime());
}

const atrasada = (o: OSView, hoje: string) =>
  !!o.agendamento && o.agendamento < hoje && o.stage !== "concluida" && o.stage !== "cancelada";

function EtapaSelo({ stage }: { stage: string }) {
  const m = stageMeta(stage);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", m.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function TipoSelo({ o }: { o: OSView }) {
  return (
    <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium", TIPO_TONE[o.tipoKey] ?? "bg-muted text-muted-foreground")}>
      {o.tipo}
    </span>
  );
}

function Progresso({ o, className }: { o: OSView; className?: string }) {
  const pct = o.vagas > 0 ? Math.min(100, (o.vagasExecutadas / o.vagas) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-11 shrink-0 text-sm tabular-nums">
        <span className="font-medium text-foreground">{o.vagasExecutadas}</span>
        <span className="text-muted-foreground">/{o.vagas}</span>
      </span>
      <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", stageMeta(o.stage).bar)} style={{ width: `${pct}%` }} />
      </div>
      {o.portes && <span className="truncate text-xs text-muted-foreground">{o.portes}</span>}
    </div>
  );
}

function Data({ o, hoje }: { o: OSView; hoje: string }) {
  const late = atrasada(o, hoje);
  return (
    <span className={cn("whitespace-nowrap tabular-nums", !o.agendamento && "text-muted-foreground", late && "text-amber-600 dark:text-amber-400")}>
      {dt(o.agendamento)}
    </span>
  );
}

function Cabecalho({
  rotulo, campo, ordem, onOrdenar, className,
}: { rotulo: string; campo?: Campo; ordem: Ordem; onOrdenar: (c: Campo) => void; className?: string }) {
  const base = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
  if (!campo) return <th className={cn(base, className)}>{rotulo}</th>;
  const ativo = ordem.campo === campo;
  const Icone = !ativo ? ChevronsUpDown : ordem.asc ? ArrowUp : ArrowDown;
  return (
    <th className={cn(base, className)} aria-sort={ativo ? (ordem.asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground", ativo && "text-foreground")}
      >
        {rotulo}
        <Icone className={cn("h-3 w-3", !ativo && "opacity-40")} />
      </button>
    </th>
  );
}

export function OSLista({ items }: { items: OSView[] }) {
  const [ordem, setOrdem] = useState<Ordem>({ campo: "agendamento", asc: true });
  const hoje = hojeISO();

  const linhas = useMemo(() => [...items].sort((a, b) => comparar(a, b, ordem)), [items, ordem]);

  const ordenar = (campo: Campo) =>
    setOrdem((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }));

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
        Nenhuma OS encontrada
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Celular */}
      <ul className="divide-y md:hidden">
        {linhas.map((o) => (
          <li key={o.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{o.cliente}</p>
                {o.veiculo && <p className="truncate text-xs text-muted-foreground">{o.veiculo}</p>}
              </div>
              <EtapaSelo stage={o.stage} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{o.numero}</span>
              <span aria-hidden>·</span>
              <TipoSelo o={o} />
              <span aria-hidden>·</span>
              <Data o={o} hoje={hoje} />
              {o.valor != null && (
                <span className="ml-auto font-medium tabular-nums text-foreground">{brl(o.valor)}</span>
              )}
            </div>
            <Progresso o={o} />
          </li>
        ))}
      </ul>

      {/* Tela larga */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <Cabecalho rotulo="OS" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Cliente" campo="cliente" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Tipo" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Veículos" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Agendada" campo="agendamento" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Pedido" ordem={ordem} onOrdenar={ordenar} />
              <Cabecalho rotulo="Valor" ordem={ordem} onOrdenar={ordenar} className="text-right" />
              <Cabecalho rotulo="Etapa" campo="stage" ordem={ordem} onOrdenar={ordenar} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{o.numero}</td>
                <td className="max-w-[18rem] px-4 py-3">
                  <p className="truncate font-medium text-foreground">{o.cliente}</p>
                  {o.veiculo && <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.veiculo}</p>}
                </td>
                <td className="px-4 py-3"><TipoSelo o={o} /></td>
                <td className="px-4 py-3"><Progresso o={o} className="min-w-[12rem]" /></td>
                <td className="px-4 py-3"><Data o={o} hoje={hoje} /></td>
                <td className="whitespace-nowrap px-4 py-3">
                  {o.pedido
                    ? <span className="font-mono text-xs text-foreground">{o.pedido}</span>
                    : <span className="text-xs text-muted-foreground">Manual</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {o.valor != null ? brl(o.valor) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3"><EtapaSelo stage={o.stage} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
