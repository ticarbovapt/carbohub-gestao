import { useMemo } from "react";
import { useParamUrl } from "@carbo/shell";
import { CalendarClock, CalendarX2, Car, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl, parseData, stageMeta, TIPO_TONE, type OSView } from "./osView";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SEMANA_CURTA = ["D", "S", "T", "Q", "Q", "S", "S"];

const TIPO_PONTO: Record<string, string> = {
  b2c: "bg-emerald-500",
  b2b: "bg-sky-500",
  frota: "bg-amber-500",
};
const LEGENDA = [
  { key: "b2c", label: "B2C" },
  { key: "b2b", label: "B2B" },
  { key: "frota", label: "Frota" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const chaveDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deChave = (k: string) => parseData(k);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mesCurto = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
const cancelada = (o: OSView) => o.stage === "cancelada";

type Painel = { modo: "proximos" } | { modo: "dia"; chave: string } | { modo: "semData" };

export function OSAgenda({ items }: { items: OSView[] }) {
  const hoje = new Date();
  const chaveHoje = chaveDe(hoje);
  // Mês e dia aberto moram na URL (`?mes=2026-11&dia=2026-11-04`, ou
  // `dia=sem-data`): F5 e link mandado ao colega abrem a MESMA agenda. O mês
  // corrente e o painel "próximos" são o padrão e não vão para o endereço.
  const mesHoje = chaveDe(hoje).slice(0, 7);
  const [mesUrl, setMesUrl] = useParamUrl("mes", mesHoje);
  const mes = useMemo(() => {
    const [a, m] = mesUrl.split("-").map(Number);
    return a && m ? new Date(a, m - 1, 1) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }, [mesUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMes = (d: Date) => setMesUrl(chaveDe(d).slice(0, 7));
  const [diaUrl, setDiaUrl] = useParamUrl("dia");
  const painel: Painel = diaUrl === "sem-data" ? { modo: "semData" }
    : /^\d{4}-\d{2}-\d{2}$/.test(diaUrl) ? { modo: "dia", chave: diaUrl }
    : { modo: "proximos" };
  const setPainel = (p: Painel) => setDiaUrl(p.modo === "dia" ? p.chave : p.modo === "semData" ? "sem-data" : null);

  const { porDia, semData } = useMemo(() => {
    const porDia = new Map<string, OSView[]>();
    const semData: OSView[] = [];
    for (const o of items) {
      if (!o.agendamento) { semData.push(o); continue; }
      const k = chaveDe(parseData(o.agendamento));
      const lista = porDia.get(k);
      if (lista) lista.push(o); else porDia.set(k, [o]);
    }
    for (const lista of porDia.values()) {
      lista.sort((a, b) => Number(cancelada(a)) - Number(cancelada(b)) || a.cliente.localeCompare(b.cliente, "pt-BR"));
    }
    semData.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
    return { porDia, semData };
  }, [items]);

  const dias = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - mes.getDay());
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const total = mes.getDay() + ultimo.getDate() + (6 - ultimo.getDay());
    return Array.from({ length: total }, (_, i) =>
      new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  }, [mes]);

  const resumo = useMemo(() => {
    let os = 0, veiculos = 0;
    for (const [k, lista] of porDia) {
      const d = deChave(k);
      if (d.getFullYear() !== mes.getFullYear() || d.getMonth() !== mes.getMonth()) continue;
      for (const o of lista) if (!cancelada(o)) { os++; veiculos += o.vagas; }
    }
    return { os, veiculos };
  }, [porDia, mes]);

  const proximos = useMemo(() => {
    const lista: { chave: string; os: OSView }[] = [];
    for (const k of [...porDia.keys()].sort()) {
      if (k < chaveHoje) continue;
      for (const o of porDia.get(k)!) if (!cancelada(o)) lista.push({ chave: k, os: o });
      if (lista.length >= 8) break;
    }
    return lista.slice(0, 8);
  }, [porDia, chaveHoje]);

  const irPara = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
  const irHoje = () => {
    setMes(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    setPainel({ modo: "dia", chave: chaveHoje });
  };
  const clicarDia = (k: string) =>
    setPainel(painel.modo === "dia" && painel.chave === k ? { modo: "proximos" } : { modo: "dia", chave: k });

  const noMesAtual = mes.getFullYear() === hoje.getFullYear() && mes.getMonth() === hoje.getMonth();
  const tituloMes = maiuscula(mes.toLocaleDateString("pt-BR", { month: "long" }));
  const diaSelecionado = painel.modo === "dia" ? painel.chave : null;

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <section className="min-w-0 self-start overflow-hidden rounded-xl border bg-card xl:col-span-3">
        <header className="flex items-center justify-between gap-3 border-b px-3 py-3 sm:px-5">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            {tituloMes} <span className="font-normal text-muted-foreground">{mes.getFullYear()}</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={irHoje} disabled={noMesAtual && diaSelecionado === chaveHoje}
              className="h-8 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">
              Hoje
            </button>
            <div className="flex items-center rounded-md border bg-background">
              <button type="button" onClick={() => irPara(-1)} aria-label="Mês anterior"
                className="flex h-8 w-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-border" />
              <button type="button" onClick={() => irPara(1)} aria-label="Próximo mês"
                className="flex h-8 w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-7 border-b bg-muted/40">
          {SEMANA.map((d, i) => (
            <div key={d} className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{SEMANA_CURTA[i]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {dias.map((d, i) => {
            const k = chaveDe(d);
            const lista = porDia.get(k) ?? [];
            const fora = d.getMonth() !== mes.getMonth();
            const ehHoje = k === chaveHoje;
            const selecionado = k === diaSelecionado;
            const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
            const visiveis = lista.slice(0, 3);
            const resto = lista.length - visiveis.length;
            return (
              <button key={k} type="button" onClick={() => clicarDia(k)}
                aria-label={`${d.toLocaleDateString("pt-BR")}: ${lista.length} OS`}
                aria-pressed={selecionado}
                className={cn(
                  "group relative flex min-h-[3.25rem] flex-col items-center gap-1 border-b border-r p-1 text-left transition-colors sm:min-h-[6.75rem] sm:items-stretch sm:p-1.5",
                  i % 7 === 6 && "border-r-0",
                  i >= dias.length - 7 && "border-b-0",
                  fimDeSemana && !selecionado && "bg-muted/20",
                  "hover:bg-muted/40",
                  selecionado && "bg-primary/[0.06] hover:bg-primary/10",
                )}>
                {selecionado && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/60" />}
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums sm:self-start",
                  fora ? "text-muted-foreground/40" : "text-foreground/80",
                  ehHoje && "bg-primary font-semibold text-primary-foreground",
                )}>
                  {d.getDate()}
                </span>

                {lista.length > 0 && (
                  <>
                    <span className={cn("flex items-center gap-0.5 sm:hidden", fora && "opacity-40")}>
                      {visiveis.map((o) => (
                        <span key={o.id} className={cn("h-1.5 w-1.5 rounded-full", TIPO_PONTO[o.tipoKey] ?? "bg-slate-400",
                          cancelada(o) && "opacity-40")} />
                      ))}
                      {resto > 0 && <span className="ml-0.5 text-[9px] leading-none text-muted-foreground">+{resto}</span>}
                    </span>
                    <span className={cn("hidden min-w-0 flex-col gap-1 sm:flex", fora && "opacity-50")}>
                      {visiveis.map((o) => (
                        <span key={o.id} title={`${o.cliente} · ${o.numero}`}
                          className={cn(
                            "flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4",
                            TIPO_TONE[o.tipoKey] ?? "bg-muted text-muted-foreground",
                            cancelada(o) && "line-through opacity-50",
                          )}>
                          <span className="truncate">{o.cliente}</span>
                          {o.vagas > 1 && <span className="ml-auto shrink-0 tabular-nums opacity-70">{o.vagas}×</span>}
                        </span>
                      ))}
                      {resto > 0 && <span className="px-1.5 text-[11px] font-medium text-muted-foreground">+{resto} mais</span>}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground sm:px-5">
          <div className="flex items-center gap-3">
            {LEGENDA.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", TIPO_PONTO[l.key])} />
                {l.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              <span className="font-medium text-foreground">{resumo.os}</span> {resumo.os === 1 ? "agendamento" : "agendamentos"}
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="font-medium text-foreground">{resumo.veiculos}</span> {resumo.veiculos === 1 ? "veículo" : "veículos"}
            </span>
            {semData.length > 0 && (
              <button type="button"
                onClick={() => setPainel(painel.modo === "semData" ? { modo: "proximos" } : { modo: "semData" })}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-medium tabular-nums transition-colors hover:bg-background hover:text-foreground",
                  painel.modo === "semData" ? "border-primary/50 bg-background text-foreground" : "bg-transparent",
                )}>
                {semData.length} sem data
              </button>
            )}
          </div>
        </footer>
      </section>

      <PainelLateral painel={painel} porDia={porDia} semData={semData} proximos={proximos}
        onVoltar={() => setPainel({ modo: "proximos" })} />
    </div>
  );
}

function PainelLateral({ painel, porDia, semData, proximos, onVoltar }: {
  painel: Painel;
  porDia: Map<string, OSView[]>;
  semData: OSView[];
  proximos: { chave: string; os: OSView }[];
  onVoltar: () => void;
}) {
  let titulo: string;
  let subtitulo: string | null = null;
  let corpo: JSX.Element;

  if (painel.modo === "dia") {
    const d = deChave(painel.chave);
    const lista = porDia.get(painel.chave) ?? [];
    const veiculos = lista.filter((o) => !cancelada(o)).reduce((s, o) => s + o.vagas, 0);
    titulo = maiuscula(d.toLocaleDateString("pt-BR", { weekday: "long" }));
    subtitulo = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    corpo = lista.length === 0
      ? <Vazio icone={CalendarClock} texto="Nenhuma OS agendada" />
      : (
        <>
          <p className="px-4 pb-2 text-xs text-muted-foreground tabular-nums">
            {lista.length} OS · {veiculos} {veiculos === 1 ? "veículo" : "veículos"}
          </p>
          <ul className="space-y-2 px-3 pb-3">{lista.map((o) => <ItemOS key={o.id} os={o} />)}</ul>
        </>
      );
  } else if (painel.modo === "semData") {
    titulo = "Sem data";
    subtitulo = `${semData.length} OS`;
    corpo = semData.length === 0
      ? <Vazio icone={CalendarX2} texto="Todas as OS têm data" />
      : <ul className="space-y-2 px-3 pb-3">{semData.map((o) => <ItemOS key={o.id} os={o} />)}</ul>;
  } else {
    titulo = "Próximos agendamentos";
    corpo = proximos.length === 0
      ? <Vazio icone={CalendarClock} texto="Nenhum agendamento a partir de hoje" />
      : <ul className="space-y-2 px-3 pb-3">{proximos.map((p) => <ItemOS key={p.os.id} os={p.os} chave={p.chave} />)}</ul>;
  }

  return (
    <aside className="flex max-h-[60dvh] min-w-0 flex-col overflow-hidden rounded-xl border bg-card xl:h-0 xl:max-h-none xl:min-h-full">
      <header className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {painel.modo !== "proximos" && (
          <button type="button" onClick={onVoltar} aria-label="Fechar"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{corpo}</div>
    </aside>
  );
}

function ItemOS({ os, chave }: { os: OSView; chave?: string }) {
  const etapa = stageMeta(os.stage);
  const data = chave ? deChave(chave) : null;
  return (
    <li className={cn("rounded-lg border bg-background/60 p-3 transition-colors hover:bg-muted/40", cancelada(os) && "opacity-60")}>
      <div className="flex gap-3">
        {data && (
          <div className="flex h-12 w-11 shrink-0 flex-col items-center justify-center self-start rounded-md border bg-muted/40">
            <span className="text-base font-semibold leading-none tabular-nums">{data.getDate()}</span>
            <span className="mt-1 text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">{mesCurto(data)}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium leading-5">{os.cliente}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-4 ring-1 ring-inset", etapa.badge)}>
              {etapa.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-[11px]">{os.numero}</span>
            <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold", TIPO_TONE[os.tipoKey] ?? "bg-muted text-muted-foreground")}>
              {os.tipo}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <Car className="h-3.5 w-3.5" />
              {os.vagasExecutadas}/{os.vagas} {os.vagas === 1 ? "veículo" : "veículos"}
            </span>
            {os.portes && <><span className="text-muted-foreground/50">·</span><span className="tabular-nums">{os.portes}</span></>}
          </div>
          {(os.pedido || os.valor != null) && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs">
              <span className="truncate text-muted-foreground">{os.pedido ?? "Sem pedido"}</span>
              {os.valor != null && <span className="shrink-0 font-medium tabular-nums">{brl(os.valor)}</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Vazio({ icone: Icone, texto }: { icone: typeof CalendarClock; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-8 pt-4 text-center">
      <Icone className="h-6 w-6 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}
