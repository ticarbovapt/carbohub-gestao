// Captura os prints da Documentação e mede onde cada marcador cai (em %).
// Uso: ver README.md desta pasta. SO=chave1,chave2 refaz só esses.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
// Playwright fora do package.json do app de propósito (não vai para o build).
// PW = caminho do pacote, ex.: $(npm root -g)/playwright/index.mjs
const { chromium } = await import(process.env.PW ?? "playwright");
const OUT = process.env.OUT ?? path.join(AQUI, "../public/docs"), MARC = process.env.MARC ?? path.join(AQUI, "marcadores.json");
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SO = (process.env.SO ?? "").split(",").filter(Boolean);
const BASE = process.env.BASE ?? "http://localhost:8099";
const marc = fs.existsSync(MARC) ? JSON.parse(fs.readFileSync(MARC, "utf8")) : {};
const { SHOTS } = await import("./shots.mjs");

const b = await chromium.launch({ executablePath: CHROME, args: ["--lang=pt-BR"] });
for (const s of SHOTS) {
  if (SO.length && !SO.includes(s.chave)) continue;
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo",
    viewport: s.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
  const p = await ctx.newPage(); p.setDefaultTimeout(5000);
  p.on("pageerror", (e) => console.log("  ERRO", s.chave, e.message));
  await p.addInitScript((pp) => { localStorage.setItem("mock-papel", pp); localStorage.setItem("carbo-theme", "light"); }, s.papel);
  await p.route(/nominatim|tile\.openstreetmap|brasilapi|viacep|dicebear|record_app_access/, (r) => r.fulfill({ status: 200, body: "[]" }));
  try {
    await p.goto(BASE + s.url, { waitUntil: "domcontentloaded", timeout: 30000 }); await p.waitForTimeout(1800);
    if (s.antes) await s.antes(p);
    await p.waitForTimeout(s.espera ?? 700);
    // ⚠️ Mede só depois de a fonte carregar: ela chega atrasada e reflui a
    // página — medir antes desloca todos os marcadores.
    await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 20000))]));
    await p.waitForTimeout(400);
    let clip = { x: 0, y: 0, width: (s.viewport ?? { width: 1440 }).width, height: (s.viewport ?? { height: 900 }).height };
    if (s.clip) {
      const ls = [].concat(s.clip(p)); const bs = [];
      for (const l of ls) bs.push(await l.first().boundingBox());
      const pad = s.pad ?? 14;
      const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
      const x2 = Math.max(...bs.map((b) => b.x + b.width)), y2 = Math.max(...bs.map((b) => b.y + b.height));
      clip = { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: x2 - x + 2 * pad, height: y2 - y + 2 * pad };
    }
    const caixas = {};
    for (const [n, f] of s.marcas ?? []) {
      const loc = f(p).first();
      const bb = await loc.boundingBox().catch(() => null);
      if (!bb) { console.log("  SEM CAIXA", s.chave, n); continue; }
      const x = Math.max(bb.x, clip.x), y = Math.max(bb.y, clip.y);
      const x2 = Math.min(bb.x + bb.width, clip.x + clip.width), y2 = Math.min(bb.y + bb.height, clip.y + clip.height);
      if (x2 <= x || y2 <= y) { console.log("  FORA", s.chave, n); continue; }
      const r = (v) => Math.round(v * 100) / 100;
      caixas[n] = { x: r(((x - clip.x) / clip.width) * 100), y: r(((y - clip.y) / clip.height) * 100), w: r(((x2 - x) / clip.width) * 100), h: r(((y2 - y) / clip.height) * 100) };
    }
    await p.screenshot({ path: `${OUT}/${s.chave}.jpg`, type: "jpeg", quality: 80, clip, timeout: 45000 });
    marc[s.chave] = caixas;
    console.log("ok", s.chave, Object.keys(caixas).length, "marcadores");
  } catch (e) { console.log("FALHOU", s.chave, e.message.split("\n")[0]); }
  await ctx.close();
}
await b.close();
fs.writeFileSync(MARC, JSON.stringify(marc, null, 1));
