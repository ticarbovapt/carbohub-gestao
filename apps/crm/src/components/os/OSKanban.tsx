import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES, TIPO_TONE, brl, dt, type OSView, type StageMeta } from "./osView";

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const porData = (a: OSView, b: OSView) => {
  if (a.agendamento === b.agendamento) return a.numero.localeCompare(b.numero);
  if (!a.agendamento) return 1;
  if (!b.agendamento) return -1;
  return a.agendamento.localeCompare(b.agendamento);
};

export function OSKanban({ items }: { items: OSView[] }) {
  const hoje = hojeLocal();

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:pb-0">
      {STAGES.map((stage) => (
        <Coluna
          key={stage.id}
          stage={stage}
          hoje={hoje}
          items={items.filter((o) => o.stage === stage.id).sort(porData)}
        />
      ))}
    </div>
  );
}

function Coluna({ stage, items, hoje }: { stage: StageMeta; items: OSView[]; hoje: string }) {
  return (
    // Altura FIXA e rolagem dentro da coluna: com muitas OS numa etapa, o quadro
    // continua do tamanho da tela em vez de esticar a página.
    <section className="flex h-[70dvh] w-[86vw] shrink-0 snap-start flex-col rounded-xl border bg-muted/30 md:h-[max(440px,calc(100dvh-23rem))] md:w-72 lg:w-auto lg:min-w-0">
      <header className="flex items-center gap-2 px-3.5 py-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", stage.dot)} />
        <h3 className="text-sm font-semibold tracking-tight">{stage.label}</h3>
        <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5 [scrollbar-width:thin]">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
            Nenhuma OS
          </div>
        ) : (
          items.map((o) => <Cartao key={o.id} os={o} stage={stage} hoje={hoje} />)
        )}
      </div>
    </section>
  );
}

function Cartao({ os, stage, hoje }: { os: OSView; stage: StageMeta; hoje: string }) {
  const atrasada = !!os.agendamento && os.agendamento < hoje && stage.id !== "concluida";
  const temPortes = /[PMG]/.test(os.portes);
  const pct = os.vagas > 0 ? Math.min(100, Math.round((os.vagasExecutadas / os.vagas) * 100)) : 0;
  const temVenda = !!os.pedido || os.valor != null;

  return (
    <article className="shrink-0 rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug" title={os.cliente}>
            {os.cliente}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={os.veiculo ?? undefined}>
            <span className="font-mono">{os.numero}</span>
            {os.veiculo && <> · {os.veiculo}</>}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            TIPO_TONE[os.tipoKey] ?? "bg-muted text-muted-foreground",
          )}
        >
          {os.tipo}
        </span>
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {os.vagas > 1 ? (
              <>
                <span className="font-medium tabular-nums text-foreground">{os.vagasExecutadas}</span> de{" "}
                <span className="tabular-nums">{os.vagas}</span> veículos
              </>
            ) : (
              "1 veículo"
            )}
          </span>
          {temPortes && <span className="font-medium tabular-nums text-muted-foreground">{os.portes}</span>}
        </div>
        {os.vagas > 1 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all", stage.bar)} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 tabular-nums",
            atrasada ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
          title={atrasada ? "Data agendada já passou" : undefined}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {os.agendamento ? dt(os.agendamento) : "Sem data"}
        </span>
        {temVenda && (
          <span className="flex min-w-0 items-center gap-1.5">
            {os.pedido && <span className="truncate font-mono text-[11px] text-muted-foreground">{os.pedido}</span>}
            {os.valor != null && <span className="shrink-0 font-semibold tabular-nums">{brl(os.valor)}</span>}
          </span>
        )}
      </div>
    </article>
  );
}
