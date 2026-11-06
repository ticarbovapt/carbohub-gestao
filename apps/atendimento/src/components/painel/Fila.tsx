import { useEffect, useMemo, useRef } from "react";
import { Hourglass, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PainelAtendimento, PainelFila, PainelNumero, PainelPerdida, Tema } from "@/hooks/usePainelAtendimento";
import {
  TEMA_ROTULO, fmtDataHora, fmtFone, fmtMin, janelaRestante, minutosDesde,
} from "@/lib/painelAtendimento";
import { AbrirConversa, MostrarMais, NumeroChip, Pilula, RiscoBadge, Secao, TemaBadge, Vazio, useFatia } from "./comum";

const STATUS_ROTULO: Record<string, string> = {
  aberto: "Aberto", em_atendimento: "Em atendimento", aguardando: "Aguardando", resolvido: "Resolvido",
};

function Cliente({ nome, waId }: { nome: string | null; waId: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{nome || fmtFone(waId)}</p>
      {nome && <p className="truncate text-xs text-muted-foreground">{fmtFone(waId)}</p>}
    </div>
  );
}

function Previa({ texto, n }: { texto: string; n: number }) {
  return (
    <p className="line-clamp-2 min-w-0 break-words text-sm text-muted-foreground">
      {n > 1 && <span className="mr-1 inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[11px] font-semibold text-foreground"><MessageSquare className="h-3 w-3" />{n}</span>}
      {texto || "—"}
    </p>
  );
}

function ItemFila({ f, numeros, agora }: { f: PainelFila; numeros: Map<string, PainelNumero>; agora: number }) {
  const espera = minutosDesde(f.desde, agora);
  const j = janelaRestante(f.janela_ate, agora);
  return (
    <li className={cn(
      "grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-4",
      j.tom === "vermelho" && "border-red-500/50",
    )}>
      <div className="flex min-w-0 flex-col gap-1">
        <Cliente nome={f.nome} waId={f.wa_id} />
        <div className="flex flex-wrap items-center gap-1.5">
          <NumeroChip id={f.numero_id} numero={numeros.get(f.numero_id)} />
          <TemaBadge tema={f.tema} />
          {f.risco && <RiscoBadge />}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Previa texto={f.texto} n={f.n_msgs} />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserRound className="h-3 w-3" />
          {f.responsavel_nome ?? "sem responsável"}
          {f.status && <> · {STATUS_ROTULO[f.status] ?? f.status}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-col lg:items-end lg:justify-center">
        <div className="flex flex-col lg:items-end">
          <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
            <Hourglass className="h-3.5 w-3.5 text-muted-foreground" /> {fmtMin(espera)}
          </span>
          <span className={cn("text-xs font-medium tabular-nums",
            j.tom === "vermelho" && "text-red-600 dark:text-red-400",
            j.tom === "ambar" && "text-amber-600 dark:text-amber-400",
            (j.tom === "neutro" || j.tom === "fechada") && "text-muted-foreground")}
          >{j.texto}</span>
        </div>
        <AbrirConversa numeroId={f.numero_id} waId={f.wa_id} />
      </div>
    </li>
  );
}

function ItemPerdida({ f, numeros }: { f: PainelPerdida; numeros: Map<string, PainelNumero> }) {
  const fechou = new Date(new Date(f.ultima_em).getTime() + 24 * 3600_000).toISOString();
  return (
    <li className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Cliente nome={f.nome} waId={f.wa_id} />
        <div className="flex flex-wrap items-center gap-1.5">
          <NumeroChip id={f.numero_id} numero={numeros.get(f.numero_id)} />
          <TemaBadge tema={f.tema} />
          {f.risco && <RiscoBadge />}
        </div>
      </div>
      <Previa texto={f.texto} n={f.n_msgs} />
      <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-col lg:items-end lg:justify-center">
        <div className="flex flex-col text-xs lg:items-end">
          <span className="text-muted-foreground">escreveu {fmtDataHora(f.desde)}</span>
          <span className="font-medium text-red-600 dark:text-red-400">janela fechou {fmtDataHora(fechou)}</span>
        </div>
        <AbrirConversa numeroId={f.numero_id} waId={f.wa_id} />
      </div>
    </li>
  );
}

export function FilaAgora({ p, agora, numeros, assunto, setAssunto, soRisco, setSoRisco, focarPerdidas }: {
  p: PainelAtendimento; agora: number; numeros: Map<string, PainelNumero>;
  assunto: string; setAssunto: (v: string) => void; soRisco: boolean; setSoRisco: (v: boolean) => void;
  focarPerdidas: number;
}) {
  const temasPresentes = useMemo(() => {
    const s = new Set<Tema>();
    for (const f of p.fila) s.add(f.tema);
    for (const f of p.perdidas_recentes) s.add(f.tema);
    return [...s].sort((a, b) => TEMA_ROTULO[a].localeCompare(TEMA_ROTULO[b]));
  }, [p.fila, p.perdidas_recentes]);

  const passa = (f: { tema: Tema; risco: boolean }) => (!assunto || f.tema === assunto) && (!soRisco || f.risco);
  // A fila vem da mais antiga para a mais nova: quem espera há mais tempo, primeiro.
  const fila = useMemo(() => [...p.fila].filter(passa).sort((a, b) => a.desde.localeCompare(b.desde)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fila, assunto, soRisco]);
  const perdidas = useMemo(() => [...p.perdidas_recentes].filter(passa).sort((a, b) => b.ultima_em.localeCompare(a.ultima_em)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.perdidas_recentes, assunto, soRisco]);

  const chave = `${assunto}|${soRisco}`;
  const fatiaFila = useFatia(fila, 30, chave);
  const fatiaPerd = useFatia(perdidas, 10, chave);

  const refPerdidas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focarPerdidas > 0) refPerdidas.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focarPerdidas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={assunto || "todos"} onValueChange={(v) => setAssunto(v === "todos" ? "" : v)}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os assuntos</SelectItem>
            {temasPresentes.map((t) => <SelectItem key={t} value={t}>{TEMA_ROTULO[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Pilula ativo={soRisco} onClick={() => setSoRisco(!soRisco)}>Só com risco</Pilula>
      </div>

      <Secao titulo={`Esperando resposta · ${fila.length}`}>
        {fila.length === 0
          ? <Vazio>{p.fila.length ? "Nada com esses filtros." : "Ninguém esperando resposta."}</Vazio>
          : (
            <>
              <ul className="space-y-2">{fatiaFila.visiveis.map((f) => <ItemFila key={`${f.numero_id}:${f.wa_id}`} f={f} numeros={numeros} agora={agora} />)}</ul>
              <MostrarMais resto={fatiaFila.resto} onClick={fatiaFila.mais} />
            </>
          )}
      </Secao>

      <div ref={refPerdidas} className="scroll-mt-4">
        <Secao titulo={`Janela fechou nos últimos 7 dias · ${perdidas.length}`}>
          {perdidas.length === 0
            ? <Vazio>{p.perdidas_recentes.length ? "Nada com esses filtros." : "Nenhuma perdida nos últimos 7 dias."}</Vazio>
            : (
              <>
                <ul className="space-y-2">{fatiaPerd.visiveis.map((f) => <ItemPerdida key={`${f.numero_id}:${f.wa_id}:${f.desde}`} f={f} numeros={numeros} />)}</ul>
                <MostrarMais resto={fatiaPerd.resto} onClick={fatiaPerd.mais} />
              </>
            )}
        </Secao>
      </div>
    </div>
  );
}
