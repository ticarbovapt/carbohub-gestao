import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, Search, ShieldCheck, User } from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { PrintAnotado } from "@/components/docs/PrintAnotado";
import { SECOES } from "@/docs/conteudo";
import { vale, type Bloco, type Item, type Secao } from "@/docs/tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Documentação do Carbo Admin — tela a tela, botão a botão.
//
// O conteúdo mora em `docs/conteudo.ts` (texto) e `docs/marcadores.ts` (onde
// cada número cai no print, MEDIDO no elemento de verdade pelo harness). Os
// prints ficam em `public/docs/`.
//
// ⚠️ Gestor vê TUDO; colaborador vê só o que é dele (`vale()`). É recorte de
// tela, não segredo — o que protege o dado continua sendo a RLS.
// ⚠️ Tela nova no app ⇒ seção nova aqui, com print. Manual que descreve a tela
// de ontem é pior que manual nenhum: a pessoa segue o passo e não acha o botão.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function filtrarSecao(s: Secao, isGestor: boolean, busca: string): Secao | null {
  if (!vale(s.papel, isGestor)) return null;
  const q = norm(busca.trim());
  const blocos = s.blocos
    .filter((b) => vale(b.papel, isGestor))
    .map((b) => ({ ...b, itens: b.itens?.filter((i) => vale(i.papel, isGestor)) }))
    .filter((b) => !b.print || vale(b.print.papel, isGestor));
  if (!q) return { ...s, blocos };
  const bate = (t?: string) => !!t && norm(t).includes(q);
  if (bate(s.titulo) || bate(s.resumo)) return { ...s, blocos };
  const achados = blocos
    .map((b) => {
      if (bate(b.titulo) || bate(b.texto)) return b;
      const itens = b.itens?.filter((i) => bate(i.titulo) || bate(i.texto));
      return itens?.length ? { ...b, itens } : null;
    })
    .filter(Boolean) as Bloco[];
  return achados.length ? { ...s, blocos: achados } : null;
}

function SeloGestor() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
      <ShieldCheck className="h-3 w-3" /> Gestor
    </span>
  );
}

function ListaItens({ itens, ativo, setAtivo }: { itens: Item[]; ativo: number | null; setAtivo: (n: number | null) => void }) {
  return (
    <ol className="grid gap-2 md:grid-cols-2">
      {itens.map((i, k) => (
        <li key={`${i.n ?? "t"}-${k}`}
          onMouseEnter={() => i.n && setAtivo(i.n)} onMouseLeave={() => setAtivo(null)}
          onFocus={() => i.n && setAtivo(i.n)} onBlur={() => setAtivo(null)} tabIndex={i.n ? 0 : -1}
          className={`flex gap-3 rounded-lg border p-2.5 outline-none transition-colors ${i.n && ativo === i.n ? "border-rose-400 bg-rose-500/5" : "bg-card"}`}>
          {i.n ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold text-white">{i.n}</span>
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">
              {i.titulo}{i.papel === "gestor" && <SeloGestor />}
            </p>
            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{i.texto}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BlocoView({ bloco }: { bloco: Bloco }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const itens = bloco.itens ?? [];
  const numeros = itens.map((i) => i.n).filter((n): n is number => typeof n === "number");
  return (
    <div className="mt-6">
      {bloco.titulo && (
        <h3 className="text-base font-semibold text-foreground">
          {bloco.titulo}{bloco.papel === "gestor" && <SeloGestor />}
        </h3>
      )}
      {bloco.texto && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{bloco.texto}</p>}
      {/* Print na largura toda e a lista embaixo: ao lado da lista o print
          ficava pequeno demais para ler o botão que o número aponta. */}
      {bloco.print && <PrintAnotado chave={bloco.print.chave} legenda={bloco.print.legenda} ativo={ativo} mostrar={numeros} />}
      {itens.length > 0 && <div className="mt-3"><ListaItens itens={itens} ativo={ativo} setAtivo={setAtivo} /></div>}
    </div>
  );
}

function Regras({ regras, isGestor }: { regras: NonNullable<Secao["regras"]>; isGestor: boolean }) {
  return (
    <div className={`mt-6 grid gap-3 ${isGestor ? "md:grid-cols-2" : ""}`}>
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><User className="h-4 w-4 text-sky-500" />
          {isGestor ? "O colaborador nesta tela" : "O que você vê e pode fazer aqui"}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {regras.colaborador.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      {isGestor && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-500" /> O gestor nesta tela</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {regras.gestor.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Documentacao() {
  const { isGestor } = useAuth();
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [secaoUrl, setSecaoUrl] = useParamUrl("secao", "");
  const secoes = useMemo(
    () => SECOES.map((s) => filtrarSecao(s, isGestor, busca)).filter((s): s is Secao => !!s),
    [isGestor, busca],
  );
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Link direto (`?secao=pipeline`) rola até a seção, inclusive no F5.
  // ⚠️ Com atraso: o Layout leva o <main> ao topo a cada troca de página
  // (usePaginaAtual), e rolar no mesmo instante perde para ele.
  const rolouRef = useRef(false);
  useEffect(() => {
    if (!secaoUrl || rolouRef.current) return;
    const t = setTimeout(() => {
      refs.current[secaoUrl]?.scrollIntoView({ behavior: "smooth", block: "start" });
      rolouRef.current = true;
    }, 350);
    return () => clearTimeout(t);
  }, [secaoUrl, secoes.length]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <CarboPageHeader
        title="Documentação"
        description="Como usar o Carbo Admin, tela a tela e botão a botão."
        icon={BookOpen}
        actions={
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${isGestor ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>
            {isGestor ? <ShieldCheck className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            {isGestor ? "Versão do gestor (inclui a do colaborador)" : "Versão do colaborador"}
          </span>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Índice */}
        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na documentação" className="pl-8" />
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {secoes.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSecaoUrl(s.id); refs.current[s.id]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${secaoUrl === s.id ? "bg-muted font-semibold text-foreground" : "text-muted-foreground"}`}>
                {s.titulo}{s.papel === "gestor" && <SeloGestor />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Conteúdo */}
        <div className="min-w-0 space-y-10">
          {secoes.length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Nada encontrado para “{busca}”.</p>
          )}
          {secoes.map((s) => (
            <section key={s.id} ref={(el) => { refs.current[s.id] = el; }} className="scroll-mt-4 rounded-2xl border bg-background p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-xl font-bold text-foreground">{s.titulo}{s.papel === "gestor" && <SeloGestor />}</h2>
                {s.rota && (
                  <Link to={s.rota} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    Abrir esta tela <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{s.resumo}</p>
              {s.blocos.map((b, k) => <BlocoView key={k} bloco={b} />)}
              {s.regras && !busca && <Regras regras={s.regras} isGestor={isGestor} />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
