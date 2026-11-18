import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, GitBranch, Maximize2 } from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FLUXOS_SLIDES } from "@/lib/fluxosPosVenda";

// ─────────────────────────────────────────────────────────────────────────────
// Os fluxos do pós-venda, um slide por tela — o mesmo PowerPoint de
// `docs/posvenda/fluxos-pos-venda.pptx`, com os conectores "→ pág. N"
// clicáveis. IDÊNTICO no Atendimento (`/pos-venda/fluxos`) e no Finanças
// (`/reembolsos/fluxos`); quem muda é só o `voltar`.
//
// Imagens e mapa são GERADOS dos roteiros (`lib/posvendaCasos.ts`):
// `node docs/posvenda/gerar-pptx.mjs && node docs/posvenda/publicar-nos-apps.mjs`.
//
// Estado na URL: ?pagina=N · ?tipo=<tipo do caso> (abre a 1ª página dele).
// ─────────────────────────────────────────────────────────────────────────────

const { slides, tipos, largura, altura } = FLUXOS_SLIDES;
const TOTAL = slides.length;
const pct = (v: number, de: number) => `${(v / de) * 100}%`;

export default function FluxosPosVenda({ voltar }: { voltar: { para: string; rotulo: string } }) {
  const navigate = useNavigate();
  const [paginaUrl, setPagina] = useParamUrl("pagina", "");
  const [tipo] = useParamUrl("tipo", "");
  const lida = Number(paginaUrl);
  const pagina = lida >= 1 && lida <= TOTAL ? lida : tipos[tipo] ?? 1;
  const slide = slides[pagina - 1];

  const ir = (n: number) => { if (n >= 1 && n <= TOTAL) navigate(`?pagina=${n}`); };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, [role=listbox], [contenteditable=true]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); ir(pagina + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); ir(pagina - 1); }
      if (e.key === "Home") { e.preventDefault(); ir(1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  // A próxima página já vem carregada: trocar de slide não pisca.
  useEffect(() => {
    for (const n of [pagina - 1, pagina + 1]) if (n >= 1 && n <= TOTAL) new Image().src = `/fluxos-posvenda/pagina-${n}.jpg`;
  }, [pagina]);

  return (
    <div className="flex flex-col gap-4">
      <CarboPageHeader title="Fluxos do pós-venda" icon={GitBranch} iconColor="green"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to={voltar.para}><ArrowLeft className="mr-2 h-4 w-4" />{voltar.rotulo}</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/fluxos-posvenda/fluxos-pos-venda.pptx" download="Fluxos do pós-venda.pptx">
                <Download className="mr-2 h-4 w-4" />Baixar PowerPoint
              </a>
            </Button>
          </div>
        )} />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={pagina <= 1} onClick={() => ir(pagina - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={String(pagina)} onValueChange={(v) => setPagina(v)}>
          <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[360px] sm:flex-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            {slides.map((s) => (
              <SelectItem key={s.n} value={String(s.n)}>
                <span className="tabular-nums text-muted-foreground">{s.n}.</span> {s.n === 1 ? "Índice" : s.titulo.replace(/^\d+\.\s*/, "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={pagina >= TOTAL} onClick={() => ir(pagina + 1)} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="hidden text-sm tabular-nums text-muted-foreground sm:inline">{pagina} de {TOTAL}</span>
        {/* No celular o app não deixa dar zoom: a imagem sozinha, numa guia, deixa. */}
        <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0 sm:hidden">
          <a href={`/fluxos-posvenda/pagina-${pagina}.jpg`} target="_blank" rel="noreferrer" aria-label="Ampliar"><Maximize2 className="h-4 w-4" /></a>
        </Button>
      </div>

      {/* O slide inteiro na tela, sem rolar: a largura é limitada pela altura que sobra. */}
      <div className="flex flex-1 items-start justify-center">
        <div className="relative w-full overflow-hidden rounded-xl border bg-white shadow-sm"
          style={{ maxWidth: `calc((100dvh - 15rem) * ${largura / altura})`, aspectRatio: `${largura} / ${altura}` }}>
          <img key={pagina} src={`/fluxos-posvenda/pagina-${pagina}.jpg`} alt={slide.titulo}
            className="absolute inset-0 h-full w-full select-none" draggable={false} />
          {slide.links.map((l, i) => (
            <Link key={i} to={`?pagina=${l.slide}`} aria-label={`Ir para a página ${l.slide}`}
              title={`${slides[l.slide - 1]?.titulo ?? ""} · pág. ${l.slide}`}
              className={cn("absolute rounded-md transition-colors hover:bg-primary/10 hover:ring-2 hover:ring-primary/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary")}
              style={{ left: pct(l.x, largura), top: pct(l.y, altura), width: pct(l.w, largura), height: pct(l.h, altura) }} />
          ))}
          {pagina !== 1 && (
            <Link to="?pagina=1" aria-label="Índice" title="Índice"
              className="absolute rounded hover:bg-primary/10"
              style={{ left: pct(11.2, largura), top: pct(0.3, altura), width: pct(1.68, largura), height: pct(0.36, altura) }} />
          )}
        </div>
      </div>
    </div>
  );
}
