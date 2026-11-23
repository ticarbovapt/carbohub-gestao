import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Loader2, MessageSquareWarning, PackageSearch } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ChipDesfecho, ChipTipo } from "@/components/posvenda/CasoPosVenda";
import { DESFECHOS, rotuloDesfecho, type Desfecho } from "@/lib/posvendaCasos";
import { usePosVendaPainel } from "@/hooks/usePosVendaPainel";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do pós-venda — `/pos-venda/acompanhamento` (17/11/2026).
//
// Pedido do dono do processo: medir o pós-venda — os tipos de reclamação, o que
// foi resolvido e como. O banco agrega tudo (`carbo_posvenda_painel`, 20261174):
//   · casos: agora (abertos, prazo vencido) e no período (abertos, encerrados,
//     desfechos, reembolso, tempo até resolver, dentro do prazo, por tipo e
//     por pessoa);
//   · reclamações do WhatsApp, pela MESMA classificação do Painel do
//     atendimento (assuntos), quantas viraram caso e quais ainda não.
//
// Estado na URL: ?modo=mes|periodo · ?de= · ?ate=
// ─────────────────────────────────────────────────────────────────────────────

const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const isoUTC = (t: Date) => t.toISOString().slice(0, 10);
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
function fimDoMes(iso: string) { const [a, m] = iso.split("-").map(Number); return isoUTC(new Date(Date.UTC(a, m, 0))); }
function maisMeses(iso: string, n: number) { const [a, m] = iso.split("-").map(Number); return isoUTC(new Date(Date.UTC(a, m - 1 + n, 1))); }
function maisDias(iso: string, n: number) { const [a, m, d] = iso.split("-").map(Number); return isoUTC(new Date(Date.UTC(a, m - 1, d + n))); }
const ehDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (iso: string) => { const s = `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`; return s.charAt(0).toUpperCase() + s.slice(1); };
const dia = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a.slice(2)}`; };

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
function horas(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
const diasDesde = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

function Kpi({ titulo, valor, detalhe, tom, href }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "alerta"; href?: string;
}) {
  const corpo = (
    <div className={cn("flex h-full min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-3.5 shadow-sm",
      tom === "alerta" && "border-red-500/40 bg-red-500/[0.04]", href && "transition-colors hover:bg-muted/50")}>
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      <span className={cn("text-2xl font-bold tabular-nums leading-none", tom === "alerta" && "text-red-600 dark:text-red-400")}>{valor}</span>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
  return href ? <Link to={href} className="block">{corpo}</Link> : corpo;
}

function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (valor / max) * 100) : 0}%`, background: cor }} />
    </div>
  );
}

const Vazio = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>
);

export default function PosVendaPainel() {
  const [modoUrl, setModo] = useParamUrl("modo", "mes");
  const modo = modoUrl === "periodo" ? "periodo" : "mes";
  const [deUrl, setDe] = useParamUrl("de", "");
  const [ateUrl, setAte] = useParamUrl("ate", "");
  const hoje = hojeBrasilia();

  const janela = modo === "mes"
    ? (() => { const a = ehDia(deUrl) ? deUrl : hoje; return { de: inicioDoMes(a), ate: fimDoMes(a) }; })()
    : (() => {
        const a = ehDia(deUrl) ? deUrl : maisDias(hoje, -29);
        const b = ehDia(ateUrl) ? ateUrl : hoje;
        return a <= b ? { de: a, ate: b } : { de: b, ate: a };
      })();

  const q = usePosVendaPainel(janela.de, janela.ate);
  const d = q.data;
  const trocarModo = (m: "mes" | "periodo") => {
    if (m === modo) return;
    setModo(m === "mes" ? "" : m);
    if (m === "periodo") { setDe(janela.de); setAte(janela.ate > hoje ? hoje : janela.ate); }
    else { setDe(""); setAte(""); }
  };

  const per = d?.periodo;
  const rec = d?.reclamacoes;
  const maxTipo = Math.max(1, ...(per?.por_tipo ?? []).map((t) => Math.max(t.abertos, t.encerrados)));
  const maxDesfecho = Math.max(1, ...(per?.desfechos ?? []).map((x) => x.n));
  const maxAssunto = Math.max(1, ...(rec?.por_assunto ?? []).map((x) => x.clientes));
  const prazo = per ? pct(per.no_prazo, per.base_prazo) : null;
  const antigo = diasDesde(d?.agora.mais_antigo ?? null);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <CarboPageHeader
          title="Painel do pós-venda"
          icon={BarChart3}
          actions={(
            <>
              {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Button asChild variant="outline" size="sm">
                <Link to="/pos-venda"><PackageSearch className="mr-1.5 h-4 w-4" />Pós-venda</Link>
              </Button>
            </>
          )}
        />

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div role="tablist" className="inline-flex h-9 shrink-0 self-start rounded-md border p-0.5">
            {([["mes", "Mês"], ["periodo", "Período"]] as const).map(([m, r]) => (
              <button key={m} role="tab" type="button" aria-selected={modo === m} onClick={() => trocarModo(m)}
                className={cn("rounded px-3 text-sm font-medium transition-colors",
                  modo === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {r}
              </button>
            ))}
          </div>
          {modo === "mes" ? (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês anterior" onClick={() => setDe(maisMeses(janela.de, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-44 text-center text-sm font-semibold">{rotuloMes(janela.de)}</span>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês seguinte" disabled={janela.ate >= hoje}
                onClick={() => setDe(maisMeses(janela.de, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40"><DatePickerInput value={janela.de} onChange={(v) => v && setDe(v)} /></div>
              <span className="text-sm text-muted-foreground">a</span>
              <div className="w-40"><DatePickerInput value={janela.ate} onChange={(v) => v && setAte(v)} /></div>
            </div>
          )}
        </div>

        {q.error && !d ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <p className="font-semibold">Não foi possível carregar o painel.</p>
            <p className="max-w-xl break-words text-sm text-muted-foreground">{String((q.error as any)?.message ?? q.error)}</p>
          </div>
        ) : !d || !per || !rec ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className={cn("space-y-4 transition-opacity", q.isPlaceholderData && "opacity-60")}>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi titulo="Casos abertos agora" valor={num(d.agora.abertos)} href="/pos-venda?aba=casos"
                tom={d.agora.vencidos > 0 ? "alerta" : undefined}
                detalhe={<>{d.agora.vencidos > 0 ? <span className="font-semibold text-red-600 dark:text-red-400">{num(d.agora.vencidos)} com prazo vencido</span> : "nenhum com prazo vencido"}
                  {antigo != null && <> · o mais antigo há {antigo} {antigo === 1 ? "dia" : "dias"}</>}</>} />
              <Kpi titulo="Casos abertos no período" valor={num(per.abertos)} detalhe={`${num(per.encerrados)} encerrados no período`} />
              <Kpi titulo="Tempo até resolver" valor={horas(per.horas_mediana)}
                detalhe={per.horas_p90 != null ? `mediana · 9 em 10 até ${horas(per.horas_p90)}` : "mediana"} />
              <Kpi titulo="Resolvidos no prazo (30 dias)" valor={prazo == null ? "—" : `${prazo}%`}
                tom={prazo != null && prazo < 90 ? "alerta" : undefined}
                detalhe={per.base_prazo > 0 ? `${num(per.no_prazo)} de ${num(per.base_prazo)} · faltante, avaria, defeito, errado` : "sem caso com prazo encerrado"} />
              <Kpi titulo="Reembolsado" valor={brl(per.reembolsado)}
                detalhe={`${num(per.desfechos.filter((x) => x.desfecho.startsWith("reembolso")).reduce((a, x) => a + x.n, 0))} reembolsos`} />
              <Kpi titulo="Reclamaram no WhatsApp" valor={num(rec.clientes)}
                detalhe={<>{num(rec.pedidos)} pedidos{rec.sem_pedido > 0 && <> · {num(rec.sem_pedido)} sem pedido</>}</>} />
              <Kpi titulo="Reclamações que viraram caso" valor={pct(rec.com_caso, rec.pedidos) == null ? "—" : `${pct(rec.com_caso, rec.pedidos)}%`}
                detalhe={`${num(rec.com_caso)} de ${num(rec.pedidos)} pedidos`} />
              <Kpi titulo="Reclamações sem caso" valor={num(rec.sem_caso_total)} tom={rec.sem_caso_total > 0 ? "alerta" : undefined}
                href="/pos-venda?aba=tratar"
                detalhe={rec.ameacas > 0 ? <span className="font-semibold text-red-600 dark:text-red-400">{num(rec.ameacas)} citaram Procon, Reclame Aqui ou similar</span> : "nenhuma ameaça no período"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Secao titulo="Casos por tipo e como foram resolvidos">
                {!per.por_tipo.length ? <Vazio>Nenhum caso no período.</Vazio> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1.5 pr-3 font-medium">Tipo</th>
                          <th className="py-1.5 pr-3 font-medium">Abertos</th>
                          <th className="py-1.5 pr-3 font-medium">Encerrados</th>
                          <th className="py-1.5 pr-3 font-medium">Como foi resolvido</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Reembolsado</th>
                          <th className="py-1.5 text-right font-medium">Tempo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[...per.por_tipo].sort((a, b) => b.abertos + b.encerrados - (a.abertos + a.encerrados)).map((t) => (
                          <tr key={t.tipo}>
                            <td className="py-2 pr-3 align-top"><ChipTipo tipo={t.tipo} /></td>
                            <td className="w-28 py-2 pr-3 align-top">
                              <div className="tabular-nums">{num(t.abertos)}</div>
                              <Barra valor={t.abertos} max={maxTipo} cor="#0284c7" />
                            </td>
                            <td className="w-28 py-2 pr-3 align-top">
                              <div className="tabular-nums">{num(t.encerrados)}</div>
                              <Barra valor={t.encerrados} max={maxTipo} cor="#059669" />
                            </td>
                            <td className="py-2 pr-3 align-top">
                              <div className="flex flex-wrap gap-1">
                                {t.desfechos.length ? t.desfechos.map((x) => (
                                  <span key={x.desfecho} className="inline-flex items-center gap-1">
                                    <ChipDesfecho desfecho={x.desfecho} /><span className="text-xs tabular-nums">{x.n}</span>
                                  </span>
                                )) : <span className="text-xs text-muted-foreground">—</span>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap py-2 pr-3 text-right align-top tabular-nums">{t.reembolsado > 0 ? brl(t.reembolsado) : "—"}</td>
                            <td className="whitespace-nowrap py-2 text-right align-top tabular-nums">{horas(t.horas_mediana)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Secao>

              <Secao titulo="Desfechos no período">
                {!per.desfechos.length ? <Vazio>Nenhum caso encerrado no período.</Vazio> : (
                  <div className="space-y-2.5">
                    {per.desfechos.map((x) => (
                      <div key={x.desfecho} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span>{rotuloDesfecho(x.desfecho)}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {num(x.n)}{x.valor > 0 ? ` · ${brl(x.valor)}` : ""}
                          </span>
                        </div>
                        <Barra valor={x.n} max={maxDesfecho} cor={DESFECHOS[x.desfecho as Desfecho]?.cor ?? "#64748b"} />
                      </div>
                    ))}
                  </div>
                )}
              </Secao>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Secao titulo="Reclamações no WhatsApp por assunto"
                acao={<Link to="/painel?aba=assuntos&grupo=reclamacao" className="text-xs text-primary hover:underline">Ver no painel do atendimento</Link>}>
                {!rec.por_assunto.length ? <Vazio>Nenhuma reclamação no período.</Vazio> : (
                  <div className="space-y-2.5">
                    {rec.por_assunto.map((a) => {
                      const viraram = pct(a.com_caso, a.pedidos);
                      return (
                        <div key={a.codigo} className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                            <Link to={`/painel?aba=assuntos&grupo=reclamacao&topico=${a.codigo}`} className="hover:underline">{a.rotulo}</Link>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {num(a.clientes)} {a.clientes === 1 ? "cliente" : "clientes"}
                              {a.pedidos > 0 && <> · {viraram}% viraram caso</>}
                            </span>
                          </div>
                          <Barra valor={a.clientes} max={maxAssunto} cor="#dc2626" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Secao>

              <Secao titulo="Semana a semana">
                {!per.semanas.length ? <Vazio>Sem dados.</Vazio> : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={per.semanas.map((s) => ({ ...s, rotulo: dia(s.semana).slice(0, 5) }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                          labelFormatter={(l) => `Semana de ${l}`}
                          formatter={(v: number, n: string) => [v, n === "abertos" ? "Abertos" : "Encerrados"]} />
                        <Bar dataKey="abertos" fill="#0284c7" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        <Bar dataKey="encerrados" fill="#059669" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#0284c7]" />Abertos</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#059669]" />Encerrados</span>
                </div>
              </Secao>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Secao titulo={`Reclamações sem caso${rec.sem_caso_total > rec.sem_caso.length ? ` · ${num(rec.sem_caso.length)} de ${num(rec.sem_caso_total)}` : ""}`}>
                {!rec.sem_caso.length ? <Vazio>Toda reclamação do período tem caso.</Vazio> : (
                  <div className="divide-y">
                    {rec.sem_caso.map((x) => (
                      <div key={x.bling_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <MessageSquareWarning className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {x.cliente ?? "—"} <span className="font-normal text-muted-foreground">· {x.pedido_codigo ?? x.pedido_numero ?? `#${Math.abs(x.bling_id)}`} · {x.canal}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {x.assuntos.join(" · ")} · {new Date(x.ultima_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/pos-venda?pedido=${x.bling_id}`}>Tratar</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Secao>

              <Secao titulo="Quem tratou">
                {!per.pessoas.length ? <Vazio>Ninguém mexeu em caso no período.</Vazio> : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Abriu</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Passos</th>
                        <th className="py-1.5 text-right font-medium">Encerrou</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {per.pessoas.map((p) => (
                        <tr key={p.nome}>
                          <td className="truncate py-2 pr-3">{p.nome}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{num(p.abriu)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{num(p.passos)}</td>
                          <td className="py-2 text-right tabular-nums">{num(p.encerrou)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Secao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
