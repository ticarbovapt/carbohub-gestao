// Gera src/docs/marcadores.ts a partir de marcadores.json (medido pela captura).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(fs.readFileSync(path.join(AQUI, "marcadores.json"), "utf8"));
let s = 'import type { Caixa } from "./tipos";\n\n// ⚠️ GERADO por docs-prints/gerar.mjs (mede o elemento de verdade na tela).\n// Não edite à mão: refaça o print e gere de novo. Caixas em % da imagem.\nexport const MARCADORES: Record<string, Record<number, Caixa>> = {\n';
for (const k of Object.keys(m).sort()) {
  s += `  "${k}": {\n`;
  for (const [n, c] of Object.entries(m[k])) s += `    ${n}: { x: ${c.x}, y: ${c.y}, w: ${c.w}, h: ${c.h} },\n`;
  s += "  },\n";
}
s += "};\n";
fs.writeFileSync(path.join(AQUI, "../src/docs/marcadores.ts"), s);
console.log("src/docs/marcadores.ts gerado:", Object.keys(m).length, "prints");
