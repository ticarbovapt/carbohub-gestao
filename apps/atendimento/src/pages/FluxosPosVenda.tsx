import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Download, GitBranch, Maximize2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
// Estado na URL: ?pagina=N · ?tipo=<tipo do caso> (abre a 1ª página dele) ·
// ?passo=<id do passo> (abre a página do passo e o marca: "O caso está aqui").
//
// "→ vá ao passo N" (23/11/2026): o desenho não puxa linha de volta para cima
// nem de uma coluna para a outra; escreve o aviso. Passar o mouse ou clicar
// nele ACENDE a caixa do passo N (`vai`/`caixas` do mapa gerado).
//
// Atalhos de mensagem (23/11/2026): as pílulas "/fotos_produto" dentro das
// caixas dizem qual mensagem padrão o atendente usa naquele passo. Clicar abre
// a mensagem para ler e copiar. Os textos moram em
// `apps/atendimento/src/lib/posvendaAtalhos.ts` e chegam aqui pelo mapa gerado.
// ─────────────────────────────────────────────────────────────────────────────

const { slides, tipos, largura, altura } = FLUXOS_SLIDES;
const TOTAL = slides.length;
const pct = (v: number, de: number) => `${(v / de) * 100}%`;
// As variáveis ficam entre colchetes: quem envia completa com os dados do cliente.
const ROTULO_VAR: Record<string, string> = {
  nome: "nome", pedido: "pedido", entregue: "data da entrega", previsao: "previsão", rastreio: "rastreio", valor: "valor",
};
const textoDeExemplo = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => `[${ROTULO_VAR[k] ?? k}]`);

/** A caixinha do atalho: o nome da barra, a mensagem e o botão de copiar. */
function MensagemDoAtalho({ barra, children }: { barra: string; children: React.ReactNode }) {
  const m = FLUXOS_SLIDES.mensagens?.[barra];
  const [copiou, setCopiou] = useState<"texto" | "barra" | null>(null);
  const copiar = async (o: "texto" | "barra") => {
    try {
      await navigator.clipboard.writeText(o === "texto" ? textoDeExemplo(m?.texto ?? "") : `/${barra}`);
      setCopiou(o); setTimeout(() => setCopiou(null), 1500);
    } catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-0" sideOffset={8}>
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquareText className="h-4 w-4 shrink-0 text-emerald-600" />{m?.titulo ?? "Mensagem"}</p>
            <button type="button" onClick={() => copiar("barra")} title="Copiar o atalho"
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-300">
              /{barra}{copiou === "barra" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
            </button>
          </div>
        </div>
        {m ? (
          <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed">{textoDeExemplo(m.texto)}</p>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Mensagem ainda não cadastrada.</p>
        )}
        {m && (
          <div className="flex justify-end border-t bg-muted/30 px-4 py-2.5">
            <Button type="button" size="sm" onClick={() => copiar("texto")}>
              {copiou === "texto" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copiou === "texto" ? "Copiada" : "Copiar mensagem"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function FluxosPosVenda({ voltar }: { voltar: { para: string; rotulo: string } }) {
  const navigate = useNavigate();
  const [paginaUrl, setPagina] = useParamUrl("pagina", "");
  const [tipo] = useParamUrl("tipo", "");
  // ?passo= marca onde o caso está, e abre na página em que ele está desenhado.
  const [passo] = useParamUrl("passo", "");
  const lida = Number(paginaUrl);
  const pagina = lida >= 1 && lida <= TOTAL ? lida : FLUXOS_SLIDES.passos[tipo]?.[passo] ?? tipos[tipo] ?? 1;
  const slide = slides[pagina - 1];
  const aqui = passo ? slide.passos?.[passo] : undefined;
  // O passo aceso pelo "vá ao passo N": o clique fixa (some sozinho), o mouse só mostra.
  const [fixo, setFixo] = useState<number | null>(null);
  const [mouse, setMouse] = useState<number | null>(null);
  useEffect(() => { setFixo(null); setMouse(null); }, [pagina]);
  useEffect(() => {
    if (fixo == null) return;
    const t = setTimeout(() => setFixo(null), 4000);
    return () => clearTimeout(t);
  }, [fixo]);
  const aceso = mouse ?? fixo;
  const caixaAcesa = aceso != null ? slide.caixas?.[String(aceso)] : undefined;

  // O passo marcado segue na URL ao trocar de página: voltar a ela marca de novo.
  const urlDa = (n: number) => `?pagina=${n}${passo ? `&passo=${encodeURIComponent(passo)}` : ""}`;
  const ir = (n: number) => { if (n >= 1 && n <= TOTAL) navigate(urlDa(n)); };

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
            <Link key={i} to={urlDa(l.slide)} aria-label={`Ir para a página ${l.slide}`}
              title={`${slides[l.slide - 1]?.titulo ?? ""} · pág. ${l.slide}`}
              className={cn("absolute rounded-md transition-colors hover:bg-primary/10 hover:ring-2 hover:ring-primary/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary")}
              style={{ left: pct(l.x, largura), top: pct(l.y, altura), width: pct(l.w, largura), height: pct(l.h, altura) }} />
          ))}
          {(slide.vai ?? []).map((v, i) => (
            <button key={`vai-${i}`} type="button" aria-label={`Mostrar o passo ${v.passo}`}
              onClick={() => setFixo(v.passo)} onMouseEnter={() => setMouse(v.passo)} onMouseLeave={() => setMouse(null)}
              onFocus={() => setMouse(v.passo)} onBlur={() => setMouse(null)}
              className={cn("absolute cursor-pointer rounded-md transition-colors hover:bg-amber-500/10 hover:ring-2 hover:ring-amber-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500", aceso === v.passo && "ring-2 ring-amber-500")}
              style={{ left: pct(v.x, largura), top: pct(v.y, altura), width: pct(v.w, largura), height: pct(v.h, altura) }} />
          ))}
          {(slide.atalhos ?? []).map((a, i) => (
            <MensagemDoAtalho key={`atalho-${i}`} barra={a.barra}>
              <button type="button" aria-label={`Ver a mensagem /${a.barra}`}
                className="absolute cursor-pointer rounded-full transition-colors hover:bg-emerald-500/15 hover:ring-2 hover:ring-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 data-[state=open]:ring-2 data-[state=open]:ring-emerald-600"
                style={{ left: pct(a.x, largura), top: pct(a.y, altura), width: pct(a.w, largura), height: pct(a.h, altura) }} />
            </MensagemDoAtalho>
          ))}
          {caixaAcesa && (
            <div key={`aceso-${aceso}`} className="pointer-events-none absolute rounded-md bg-amber-400/15 ring-4 ring-amber-500 ring-offset-2 animate-pulse"
              style={{ left: pct(caixaAcesa.x, largura), top: pct(caixaAcesa.y, altura), width: pct(caixaAcesa.w, largura), height: pct(caixaAcesa.h, altura) }}>
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white shadow">
                Passo {aceso}
              </span>
            </div>
          )}
          {aqui && (
            <div className="pointer-events-none absolute rounded-md ring-4 ring-amber-500 ring-offset-2 animate-pulse"
              style={{ left: pct(aqui.x, largura), top: pct(aqui.y, altura), width: pct(aqui.w, largura), height: pct(aqui.h, altura) }}>
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white shadow">
                O caso está aqui
              </span>
            </div>
          )}
          {pagina !== 1 && (
            <Link to={urlDa(1)} aria-label="Índice" title="Índice"
              className="absolute rounded hover:bg-primary/10"
              style={{ left: pct(11.2, largura), top: pct(0.3, altura), width: pct(1.68, largura), height: pct(0.36, altura) }} />
          )}
        </div>
      </div>
    </div>
  );
}
