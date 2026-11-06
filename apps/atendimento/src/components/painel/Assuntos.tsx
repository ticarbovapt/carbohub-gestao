import { useMemo, type CSSProperties, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  lerErroDoPainel, useAssuntosAtendimento, useClientesDoAssunto,
  type AssuntoDestaque, type AssuntoGrupo, type AssuntoLinha, type PainelAssuntos, type PainelNumero,
} from "@/hooks/usePainelAtendimento";
import { fmtData, fmtDataHora, fmtFone, fmtMin, fmtNum, haQuanto, variacaoRel, type Variacao } from "@/lib/painelAtendimento";
import { AbrirConversa, Bolinha, NumeroChip, RiscoBadge, Secao, VariacaoChip, Vazio, useFatia, MostrarMais } from "./comum";

// ─────────────────────────────────────────────────────────────────────────────
// Aba ASSUNTOS do painel (06/11/2026): o que os clientes falam, medido.
//
// ⚠️ A tela não classifica nada: grupo, assunto e a regra de cada um moram no
// CADASTRO do banco (`carbo_wa_assuntos`, migração 20261149) e chegam aqui
// agregados por `carbo_atendimento_assuntos`. A conta é CLIENTE, não mensagem.
//
// URL: ?grupo=<código> filtra o ranking · ?topico=<filtro> abre quem falou
//      (código do assunto | "_nenhum" | "grupo:<código>" | "risco").
// ─────────────────────────────────────────────────────────────────────────────

const EIXO = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const GRADE = "hsl(var(--border))";

/** Reclamação: subir é ruim. Elogio: subir é bom. O resto só muda de tamanho. */
function variacaoDoGrupo(grupo: string, atual: number, anterior: number): Variacao | null {
  const v = variacaoRel(atual, anterior, grupo === "reclamacao");
  if (!v) return null;
  return grupo === "reclamacao" || grupo === "elogio" ? v : { ...v, tom: "neutro" };
}

function Cartoes({ a, grupo, onGrupo }: { a: PainelAssuntos; grupo: string; onGrupo: (g: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {a.grupos.map((g) => {
        const ativo = grupo === g.codigo;
        return (
          <button
            key={g.codigo}
            type="button"
            aria-pressed={ativo}
            onClick={() => onGrupo(ativo ? "" : g.codigo)}
            className={cn(
              "min-w-0 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40",
              ativo && "ring-2 ring-offset-1 ring-offset-background",
            )}
            style={ativo ? ({ "--tw-ring-color": g.cor } as CSSProperties) : undefined}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Bolinha cor={g.cor} className="h-2 w-2" /> <span className="truncate">{g.rotulo}</span>
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums leading-tight">{fmtNum(g.clientes)}</span>
            <span className="block text-[11px] text-muted-foreground">clientes · {fmtNum(g.mensagens)} mensagens</span>
            <span className="mt-1 block min-h-4"><VariacaoChip v={variacaoDoGrupo(g.codigo, g.clientes, g.clientes_ant)} /></span>
          </button>
        );
      })}
    </div>
  );
}

function Tendencia({ a, grupos }: { a: PainelAssuntos; grupos: AssuntoGrupo[] }) {
  const visiveis = grupos.filter((g) => g.codigo !== "outros");
  const dados = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const s of a.serie_grupo ?? []) {
      const linha = m.get(s.balde) ?? {};
      linha[s.grupo] = s.clientes;
      m.set(s.balde, linha);
    }
    return a.baldes.map((b) => {
      const l = m.get(b) ?? {};
      return { balde: b, rotulo: fmtData(b), ...Object.fromEntries(visiveis.map((g) => [g.codigo, l[g.codigo] ?? 0])) };
    });
  }, [a.serie_grupo, a.baldes, visiveis]);

  return (
    <Secao
      titulo={a.balde === "dia" ? "Clientes por dia" : "Clientes por semana"}
      acoes={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {visiveis.map((g) => (
            <span key={g.codigo} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: g.cor }} />{g.rotulo}
            </span>
          ))}
        </div>
      }
    >
      {!a.serie_grupo ? <Vazio>Sem série no período.</Vazio> : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRADE} strokeOpacity={0.6} />
              <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
              <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof dados)[number] & Record<string, number>;
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
                      <p className="mb-1 font-semibold">
                        {a.balde === "dia"
                          ? new Date(`${d.balde}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
                          : `Semana de ${fmtData(d.balde)}`}
                      </p>
                      {visiveis.map((g) => (
                        <p key={g.codigo} className="flex items-center justify-between gap-4 tabular-nums">
                          <span className="inline-flex items-center gap-1.5"><Bolinha cor={g.cor} className="h-2 w-2" />{g.rotulo}</span>
                          <span className="font-medium">{fmtNum(d[g.codigo])}</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {visiveis.map((g) => (
                <Line key={g.codigo} type="monotone" dataKey={g.codigo} stroke={g.cor} strokeWidth={g.codigo === "reclamacao" || g.codigo === "elogio" ? 2.25 : 1.5}
                  dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Secao>
  );
}

/** Minigráfico da linha: clientes por dia/semana daquele assunto, na cor do grupo. */
function Faisca({ valores, cor }: { valores: number[]; cor: string }) {
  const max = Math.max(1, ...valores);
  const n = valores.length || 1;
  const w = 88, h = 18, passo = w / n, larg = Math.max(1, passo - (n > 40 ? 0.5 : 1));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      {valores.map((v, i) => v > 0 && (
        <rect key={i} x={i * passo} y={h - Math.max(1.5, (v / max) * h)} width={larg} height={Math.max(1.5, (v / max) * h)} rx={0.5} fill={cor} />
      ))}
    </svg>
  );
}

function Ranking({ a, grupo, onAbrir, carregando }: { a: PainelAssuntos; grupo: string; onAbrir: (filtro: string) => void; carregando: boolean }) {
  const cor = useMemo(() => new Map(a.grupos.map((g) => [g.codigo, g.cor])), [a.grupos]);
  const serie = useMemo(() => {
    const idx = new Map(a.baldes.map((b, i) => [b, i]));
    const m = new Map<string, number[]>();
    for (const s of a.serie) {
      const arr = m.get(s.codigo) ?? Array(a.baldes.length).fill(0);
      const i = idx.get(s.balde);
      if (i != null) arr[i] = s.clientes;
      m.set(s.codigo, arr);
    }
    return m;
  }, [a.serie, a.baldes]);

  const grupos = a.grupos.filter((g) => !grupo || g.codigo === grupo);
  const porGrupo = (g: string) => a.assuntos
    .filter((x) => x.grupo === g && (x.clientes > 0 || x.clientes_ant > 0))
    .sort((x, y) => y.clientes - x.clientes || x.ordem - y.ordem);

  return (
    <Secao
      titulo="Assuntos"
      corpo="p-0"
      acoes={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {carregando && <Loader2 className="h-3 w-3 animate-spin" />}
          {fmtNum(a.totais.clientes)} clientes · {fmtNum(a.totais.mensagens)} mensagens
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pl-4 font-medium">Assunto</th>
              <th className="w-[30%] py-2 font-medium md:w-[26%]">Clientes</th>
              <th className="hidden py-2 font-medium md:table-cell">vs. anterior</th>
              <th className="py-2 text-right font-medium">Sem resposta</th>
              <th className="hidden py-2 text-right font-medium md:table-cell">1ª resposta</th>
              <th className="py-2 pr-4 font-medium"><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const linhas = porGrupo(g.codigo);
              if (!linhas.length) return null;
              return [
                !grupo && (
                  <tr key={`g-${g.codigo}`} className="border-b bg-muted/40">
                    <td colSpan={6} className="py-1.5 pl-4">
                      <button type="button" onClick={() => onAbrir(`grupo:${g.codigo}`)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline">
                        <Bolinha cor={g.cor} className="h-2 w-2" />{g.rotulo}
                        <span className="font-normal text-muted-foreground">· {fmtNum(g.clientes)} clientes</span>
                      </button>
                    </td>
                  </tr>
                ),
                ...linhas.map((x) => <LinhaAssunto key={x.codigo} x={x} cor={cor.get(x.grupo) ?? "#64748B"} max={Math.max(1, linhas[0].clientes)}
                  serie={serie.get(x.codigo) ?? Array(a.baldes.length).fill(0)} onAbrir={onAbrir} />),
              ];
            })}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

function LinhaAssunto({ x, cor, max, serie, onAbrir }: {
  x: AssuntoLinha; cor: string; max: number; serie: number[]; onAbrir: (f: string) => void;
}) {
  const v = variacaoDoGrupo(x.grupo, x.clientes, x.clientes_ant);
  const sem = x.pede && !x.automatico ? x.sem_resposta : null;
  return (
    <tr className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => onAbrir(x.codigo)}>
      <td className="py-2 pl-4">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate font-medium", x.codigo === "_nenhum" && "italic text-muted-foreground")}>{x.rotulo}</span>
          {x.com_risco > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
              <ShieldAlert className="h-3 w-3" />{x.com_risco}
            </span>
          )}
        </span>
      </td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-2">
          <span className="h-2 flex-1 rounded-full bg-muted">
            <span className="block h-2 rounded-full" style={{ width: `${(x.clientes / max) * 100}%`, backgroundColor: cor }} />
          </span>
          <span className="w-9 shrink-0 text-right tabular-nums">{fmtNum(x.clientes)}</span>
        </span>
      </td>
      <td className="hidden whitespace-nowrap py-2 pr-3 md:table-cell"><VariacaoChip v={v} rotulo="" /></td>
      <td className={cn("py-2 pr-3 text-right tabular-nums", sem && "font-medium text-red-600 dark:text-red-400", sem == null && "text-muted-foreground/60")}>
        {sem == null ? "—" : fmtNum(sem)}
      </td>
      <td className="hidden py-2 pr-3 text-right tabular-nums text-muted-foreground md:table-cell">
        {x.pede && !x.automatico ? fmtMin(x.resposta_mediana_min) : "—"}
      </td>
      <td className="py-2 pr-4">
        <span className="flex items-center justify-end gap-1">
          <span className="hidden md:inline-flex"><Faisca valores={serie} cor={cor} /></span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </span>
      </td>
    </tr>
  );
}

function Destaque({ d, numeros, rotulos, agora, risco = false }: {
  d: AssuntoDestaque; numeros: Map<string, PainelNumero>; rotulos: Map<string, string>; agora: number; risco?: boolean;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{d.nome || fmtFone(d.wa_id)}</p>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <NumeroChip id={d.numero_id} numero={numeros.get(d.numero_id)} />
            <span>{haQuanto(d.ocorrido_em, agora)}</span>
          </span>
        </div>
        <AbrirConversa numeroId={d.numero_id} waId={d.wa_id} compacto />
      </div>
      <p className={cn("whitespace-pre-line break-words text-sm", risco ? "line-clamp-3" : "line-clamp-4")}>{d.texto}</p>
      <div className="flex flex-wrap items-center gap-1">
        {risco && d.respondido === false && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">Sem resposta</span>
        )}
        {risco && d.respondido && (
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Respondido</span>
        )}
        {d.assuntos.slice(0, risco ? 1 : 2).map((c) => (
          <span key={c} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{rotulos.get(c) ?? c}</span>
        ))}
      </div>
    </li>
  );
}

function ListaDestaques({ titulo, itens, numeros, rotulos, agora, risco, vazio, onVerTodos }: {
  titulo: ReactNode; itens: AssuntoDestaque[]; numeros: Map<string, PainelNumero>; rotulos: Map<string, string>;
  agora: number; risco?: boolean; vazio: string; onVerTodos?: () => void;
}) {
  const f = useFatia(itens, risco ? 4 : 9);
  return (
    <Secao
      titulo={titulo}
      acoes={onVerTodos && itens.length > 0 && (
        <button type="button" onClick={onVerTodos} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
          Ver todos
        </button>
      )}
    >
      {itens.length === 0 ? <Vazio>{vazio}</Vazio> : (
        <>
          <ul className={cn("grid gap-2", risco ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
            {f.visiveis.map((d) => (
              <Destaque key={`${d.numero_id}:${d.wa_id}:${d.ocorrido_em}`} d={d} numeros={numeros} rotulos={rotulos} agora={agora} risco={risco} />
            ))}
          </ul>
          <MostrarMais resto={f.resto} onClick={f.mais} />
        </>
      )}
    </Secao>
  );
}

function rotuloDoFiltro(filtro: string, a: PainelAssuntos): { titulo: string; cor: string | null } {
  if (filtro === "risco") return { titulo: "Risco (Procon, golpe, cobrança…)", cor: "#DC2626" };
  if (filtro.startsWith("grupo:")) {
    const g = a.grupos.find((x) => x.codigo === filtro.slice(6));
    return { titulo: g?.rotulo ?? filtro, cor: g?.cor ?? null };
  }
  const x = a.assuntos.find((y) => y.codigo === filtro);
  return { titulo: x?.rotulo ?? filtro, cor: a.grupos.find((g) => g.codigo === x?.grupo)?.cor ?? null };
}

function QuemFalou({ a, filtro, numero, numeros, rotulos, agora, onFechar }: {
  a: PainelAssuntos; filtro: string; numero: string | null; numeros: Map<string, PainelNumero>;
  rotulos: Map<string, string>; agora: number; onFechar: () => void;
}) {
  const q = useClientesDoAssunto(a.periodo.de, a.periodo.ate, filtro, numero);
  const { titulo, cor } = rotuloDoFiltro(filtro, a);
  const linha = a.assuntos.find((x) => x.codigo === filtro);
  const pede = linha ? linha.pede && !linha.automatico : true;
  const itens = q.data?.pages.flatMap((p) => p.itens) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="flex items-center gap-2"><Bolinha cor={cor} />{titulo}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {q.isLoading ? "…" : `${fmtNum(total)} ${total === 1 ? "cliente" : "clientes"}`} · {fmtData(a.periodo.de)} a {fmtData(a.periodo.ate)}
          </p>
        </SheetHeader>

        <div className="mt-4">
          {q.isError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
              {lerErroDoPainel(q.error).mensagem}
            </p>
          ) : q.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
          ) : itens.length === 0 ? <Vazio>Ninguém no período.</Vazio> : (
            <ul className="space-y-2">
              {itens.map((c) => (
                <li key={`${c.numero_id}:${c.wa_id}`} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.nome || fmtFone(c.wa_id)}</p>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <NumeroChip id={c.numero_id} numero={numeros.get(c.numero_id)} />
                        <span>{haQuanto(c.ultima_em, agora)}</span>
                        {c.n > 1 && <span>{c.n} mensagens</span>}
                      </span>
                    </div>
                    <AbrirConversa numeroId={c.numero_id} waId={c.wa_id} compacto />
                  </div>
                  {(c.risco || (pede && !c.respondido_depois)) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.risco && <RiscoBadge />}
                      {pede && !c.respondido_depois && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">Sem resposta</span>
                      )}
                    </div>
                  )}
                  <ul className="mt-2 space-y-1.5 border-l-2 pl-3" style={{ borderColor: cor ?? undefined }}>
                    {c.mensagens.map((m, i) => (
                      <li key={i} className="text-sm">
                        <span className="mr-2 text-[11px] tabular-nums text-muted-foreground">{fmtDataHora(m.em)}</span>
                        <span className="whitespace-pre-line break-words">
                          {m.texto || <span className="italic text-muted-foreground">({m.tipo})</span>}
                        </span>
                        {m.assuntos.length > 1 && (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            · {m.assuntos.filter((x) => x !== filtro).map((x) => rotulos.get(x) ?? x).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {q.hasNextPage && (
            <button
              type="button"
              disabled={q.isFetchingNextPage}
              onClick={() => q.fetchNextPage()}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
            >
              {q.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Mostrar mais ({fmtNum(total - itens.length)})
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[112px] rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function Assuntos({ de, ate, numero, numeros, agora, grupo, setGrupo, topico, setTopico }: {
  de: string; ate: string; numero: string | null; numeros: Map<string, PainelNumero>; agora: number;
  grupo: string; setGrupo: (g: string) => void; topico: string; setTopico: (t: string) => void;
}) {
  const q = useAssuntosAtendimento(de, ate, numero);
  const a = q.data;
  const rotulos = useMemo(() => new Map((a?.assuntos ?? []).map((x) => [x.codigo, x.rotulo])), [a?.assuntos]);
  const grupoValido = a?.grupos.some((g) => g.codigo === grupo) ? grupo : "";

  if (q.error && !a) {
    const e = lerErroDoPainel(q.error);
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-8 text-center">
        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
        <p className="font-semibold">{e.tipo === "sem_funcao" ? "Os assuntos ainda não foram instalados no banco." : "Não foi possível carregar os assuntos."}</p>
        {e.tipo !== "sem_funcao" && <p className="max-w-xl break-words text-sm text-muted-foreground">{e.mensagem}</p>}
      </div>
    );
  }
  if (!a) return <Esqueleto />;

  return (
    <div className="space-y-4">
      <Cartoes a={a} grupo={grupoValido} onGrupo={setGrupo} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><Tendencia a={a} grupos={a.grupos} /></div>
        <ListaDestaques
          titulo={
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" /> Risco
              <span className="font-normal text-muted-foreground">· {fmtNum(a.totais.com_risco)}</span>
            </span>
          }
          itens={a.riscos} numeros={numeros} rotulos={rotulos} agora={agora} risco
          vazio="Ninguém falou em Procon, golpe ou processo." onVerTodos={() => setTopico("risco")}
        />
      </div>

      <Ranking a={a} grupo={grupoValido} onAbrir={setTopico} carregando={q.isFetching} />

      <ListaDestaques
        titulo="Elogios"
        itens={a.elogios} numeros={numeros} rotulos={rotulos} agora={agora}
        vazio="Nenhum elogio no período." onVerTodos={() => setTopico("grupo:elogio")}
      />

      {topico && <QuemFalou a={a} filtro={topico} numero={numero} numeros={numeros} rotulos={rotulos} agora={agora} onFechar={() => setTopico("")} />}
    </div>
  );
}
