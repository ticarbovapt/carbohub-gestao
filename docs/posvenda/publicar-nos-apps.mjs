// Leva os fluxos do PowerPoint para dentro do Atendimento e do Finanças
// (`/pos-venda/fluxos` e `/reembolsos/fluxos`): um JPG por slide, o .pptx para
// baixar e o mapa de conectores clicáveis como módulo TS.
//
// Uso (depois do gerar-pptx.mjs):  node docs/posvenda/publicar-nos-apps.mjs
// Precisa de: soffice (LibreOffice) e pdftoppm (poppler).
//
// ⚠️ Roteiro mudou ⇒ gerar-pptx.mjs E este, na MESMA tarefa: senão a tela do
// app mostra o fluxo de ontem.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "../..");
const PPTX = join(AQUI, "fluxos-pos-venda.pptx");
const MAPA = JSON.parse(readFileSync(join(AQUI, "fluxos-pos-venda.json"), "utf8"));
const APPS = ["atendimento", "financas"];

const tmp = mkdtempSync(join(tmpdir(), "fluxos-"));
execFileSync("soffice", ["--headless", `-env:UserInstallation=file://${tmp}/perfil`, "--convert-to", "pdf", "--outdir", tmp, PPTX], { stdio: "ignore" });
// 1600 px de largura: nítido em tela cheia, ~100 KB por slide.
execFileSync("pdftoppm", ["-jpeg", "-jpegopt", "quality=86", "-scale-to-x", "1600", "-scale-to-y", "-1", join(tmp, "fluxos-pos-venda.pdf"), join(tmp, "p")]);
const imagens = readdirSync(tmp).filter((f) => /^p-\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
if (imagens.length !== MAPA.slides.length) throw new Error(`${imagens.length} imagens para ${MAPA.slides.length} slides`);

const modulo = `// GERADO por docs/posvenda/publicar-nos-apps.mjs — não editar.
// Os slides de docs/posvenda/fluxos-pos-venda.pptx: título e conectores
// clicáveis (em polegadas, slide de ${MAPA.largura} × ${MAPA.altura}).
export interface Caixa { x: number; y: number; w: number; h: number }
export interface LinkDoSlide extends Caixa { slide: number }
export interface SlideDoFluxo { n: number; titulo: string; sub?: string; links: LinkDoSlide[]; passos?: Record<string, Caixa> }

export const FLUXOS_SLIDES = ${JSON.stringify(MAPA, null, 1)} as {
  largura: number; altura: number; reembolso: number;
  tipos: Record<string, number>;
  /** tipo → passo → slide em que ele está desenhado. */
  passos: Record<string, Record<string, number>>;
  slides: SlideDoFluxo[];
};
`;

for (const app of APPS) {
  const pub = join(RAIZ, "apps", app, "public", "fluxos-posvenda");
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub, { recursive: true });
  imagens.forEach((f, i) => copyFileSync(join(tmp, f), join(pub, `pagina-${i + 1}.jpg`)));
  copyFileSync(PPTX, join(pub, "fluxos-pos-venda.pptx"));
  writeFileSync(join(RAIZ, "apps", app, "src", "lib", "fluxosPosVenda.ts"), modulo);
  console.log(`✔ apps/${app}: ${imagens.length} páginas`);
}
rmSync(tmp, { recursive: true, force: true });
