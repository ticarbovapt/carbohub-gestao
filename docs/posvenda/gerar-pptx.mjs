// ─────────────────────────────────────────────────────────────────────────────
// O PowerPoint dos fluxos do PÓS-VENDA, gerado dos ROTEIROS do sistema
// (`apps/atendimento/src/lib/posvendaCasos.ts`) — o mesmo arquivo que guia o
// atendente na tela. Roteiro mudou ⇒ rode de novo.
//
//   cd docs/posvenda && npm ci            (uma vez: traz o pptxgenjs)
//   cd apps/atendimento && npm ci         (uma vez: traz o esbuild)
//   node docs/posvenda/gerar-pptx.mjs     (da raiz; precisa do `dot`, graphviz)
//
// Saída: docs/posvenda/fluxos-pos-venda.pptx
//
// Pedido do dono do processo (18/11/2026): cada fluxo cabe num slide, sem
// rolagem, e o que se repete vira CONECTOR DE PÁGINA ("→ pág. N", clicável):
//   • o reembolso (pedir → Financeiro paga → comprovante) tem slide próprio;
//   • "vira caso de Defeito" aponta o slide do Defeito;
//   • fluxo grande demais para um slide continua no seguinte, com conector
//     dos dois lados.
// As formas são as do fluxograma do PowerPoint (terminador, processo, decisão)
// e tudo é editável: caixa é forma, seta é forma.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const SAIDA = join(AQUI, "fluxos-pos-venda.pptx");

const reqAqui = createRequire(join(AQUI, "package.json"));
const PptxGenJS = reqAqui("pptxgenjs");
const esbuild = createRequire(join(RAIZ, "apps/atendimento/package.json"))("esbuild");

const tmp = mkdtempSync(join(tmpdir(), "pptx-fluxos-"));
const js = join(tmp, "casos.mjs");
esbuild.buildSync({
  entryPoints: [join(RAIZ, "apps/atendimento/src/lib/posvendaCasos.ts")],
  outfile: js, format: "esm", bundle: true, platform: "node", logLevel: "silent",
});
const { FLUXOS, FLUXO, DESFECHOS } = await import(pathToFileURL(js).href);

// ── estilo ───────────────────────────────────────────────────────────────────
const FONTE = "Arial";
const COR = {
  texto: "0F172A", cinza: "64748B", linha: "475569", nao: "B91C1C",
  acao: { fundo: "E8F1FE", borda: "3B82F6" },
  decisao: { fundo: "FEF3C7", borda: "D97706" },
  inicio: { fundo: "DCFCE7", borda: "16A34A" },
  link: { fundo: "F1F5F9", borda: "475569" },
  fin: { fundo: "CCFBF1", borda: "0D9488" },
};
const hex = (c) => c.replace("#", "").toUpperCase();

// Área do diagrama no slide (16:9 largo, 13,333 × 7,5 pol).
const AREA = { x: 0.45, y: 1.2, w: 12.43, h: 5.85 };
// Abaixo disso o texto fica pequeno demais e o fluxo é dividido.
const ESCALA_MIN = 0.78;

// ── texto ────────────────────────────────────────────────────────────────────
function quebra(s, n) {
  const linhas = [];
  let atual = "";
  for (const p of String(s).split(/\s+/)) {
    if ((atual + " " + p).trim().length > n && atual) { linhas.push(atual); atual = p; }
    else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}
const escDot = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Tamanhos de fonte NA ESCALA 1 (o slide multiplica pela escala da página).
const FS = { titulo: 11, sub: 8.5, decisao: 10, rotulo: 8.5 };

// ── o modelo de uma página ───────────────────────────────────────────────────
// nó: { id, tipo: inicio|acao|decisao|fim|link|entrada, titulo, sub[], cor, slide }
// aresta: { de, para, rotulo, nao }

/** Monta as páginas de um fluxo. `partes` divide os passos entre slides. */
function paginasDoFluxo(f, numero, slideDe) {
  const partes = (PARTES[f.tipo] ?? [{ ids: f.passos.map((p) => p.id) }]).map((p) => p.ids);
  const nomes = (PARTES[f.tipo] ?? []).map((p) => p.nome);
  const parteDe = new Map();
  partes.forEach((ids, i) => ids.forEach((id) => parteDe.set(id, i)));
  // Passo novo que ninguém pôs numa parte sumiria do PowerPoint, calado.
  const fora = f.passos.filter((p) => !parteDe.has(p.id)).map((p) => p.id);
  if (fora.length) throw new Error(`${f.tipo}: passo(s) fora de PARTES: ${fora.join(", ")}`);
  const ehReembolso = (id) => /^reembolso_(parcial|integral)/.test(id);

  return partes.map((ids, iParte) => {
    const nos = new Map();
    const arestas = [];
    const add = (n) => { if (!nos.has(n.id)) nos.set(n.id, n); return n.id; };
    const meuSlide = slideDe(f.tipo, iParte);

    // Começo: na 1ª parte o caso aberto; nas outras, de onde se vem.
    if (iParte === 0) {
      add({ id: "inicio", tipo: "inicio", titulo: `Caso aberto: ${f.rotulo}`, sub: ["Pós-venda › Tratar"] });
      arestas.push({ de: "inicio", para: f.inicio });
    }

    const linkPara = (alvoId, rotuloAlvo, slide, cor) =>
      add({ id: `link_${alvoId}`, tipo: "link", titulo: rotuloAlvo, sub: [`→ pág. ${slide}`], slide, cor });

    for (const p of f.passos) {
      if (parteDe.get(p.id) !== iParte) continue;
      if (p.financeiro || p.comprovante) continue;           // vivem no slide do reembolso
      if (ehReembolso(p.id) && p.reembolso) continue;         // idem (vira conector)

      const sub = [];
      if (p.cdc) sub.push(`CDC ${p.cdc}`);
      if (p.mensagem) sub.push("mensagem pronta ao cliente");
      const obrig = (p.campos ?? []).filter((c) => c.obrigatorio).map((c) => c.rotulo);
      if (obrig.length) sub.push(`registra: ${obrig.join(", ")}`);
      const decisao = p.opcoes.length >= 2;
      add({ id: p.id, tipo: decisao ? "decisao" : "acao", titulo: p.titulo, sub: decisao ? (p.cdc ? [`CDC ${p.cdc}`] : []) : sub });

      for (const o of p.opcoes) {
        const rot = decisao ? o.rotulo : (o.desfecho ? o.rotulo : "");
        const nao = o.tom === "nao";
        let para;
        if (o.desfecho) {
          const d = DESFECHOS[o.desfecho];
          para = add({ id: `fim_${o.desfecho}`, tipo: "fim", titulo: d.rotulo, cor: d.cor });
        } else if (o.mudaPara) {
          const alvo = FLUXO[o.mudaPara];
          para = linkPara(`tipo_${o.mudaPara}`, `Vira caso de ${alvo.rotulo}`, slideDe(o.mudaPara, 0), alvo.cor);
        } else if (o.proximo && ehReembolso(o.proximo)) {
          const tipo = o.proximo.includes("parcial") ? "parcial" : "integral";
          para = linkPara(`reembolso_${tipo}`, `Reembolso ${tipo} pelo Financeiro`, SLIDE_REEMBOLSO, "#0D9488");
        } else if (o.proximo && parteDe.get(o.proximo) !== iParte) {
          const alvo = f.passos.find((q) => q.id === o.proximo);
          para = linkPara(`parte_${o.proximo}`, `Continua: ${alvo.titulo}`, slideDe(f.tipo, parteDe.get(o.proximo)), f.cor);
        } else para = o.proximo;
        arestas.push({ de: p.id, para, rotulo: rot, nao });
      }
    }

    // Entradas vindas de OUTRA parte deste fluxo.
    for (const p of f.passos) {
      if (parteDe.get(p.id) === iParte) continue;
      for (const o of p.opcoes) {
        if (!o.proximo || parteDe.get(o.proximo) !== iParte || ehReembolso(o.proximo)) continue;
        const id = add({ id: `vem_${o.proximo}`, tipo: "entrada", titulo: `Vem da pág. ${slideDe(f.tipo, parteDe.get(p.id))}`,
          sub: [o.rotulo], slide: slideDe(f.tipo, parteDe.get(p.id)), cor: f.cor });
        if (!arestas.some((a) => a.de === id && a.para === o.proximo)) arestas.push({ de: id, para: o.proximo });
      }
    }
    // Entradas vindas de OUTRO fluxo ("vira caso de …"), na 1ª parte.
    if (iParte === 0) {
      const origens = FLUXOS.filter((g) => g.passos.some((p) => p.opcoes.some((o) => o.mudaPara === f.tipo)));
      if (origens.length) {
        const id = add({ id: "vem_outros", tipo: "entrada", titulo: "Também vem de",
          sub: origens.map((g) => `${g.rotulo} · pág. ${slideDe(g.tipo, 0)}`), cor: f.cor });
        arestas.push({ de: id, para: f.inicio });
      }
    }

    const prazo = f.prazoDias ? ` · resolver em até ${f.prazoDias} dias (${f.prazoRotulo})` : "";
    const parte = partes.length > 1 ? ` (${iParte + 1}/${partes.length})` : "";
    const nomeParte = nomes[iParte] ? `${nomes[iParte]} · ` : "";
    return {
      slide: meuSlide,
      titulo: `${numero}. ${f.rotulo}${parte}`,
      sub: `${nomeParte}${f.resumo}${f.cdc ? ` · CDC ${f.cdc}` : ""}${prazo}`,
      cor: f.cor, nos: [...nos.values()], arestas,
    };
  });
}

// Fluxo que não cabe num slide continua no seguinte (a parte que sobra de
// `PARTES` vai para a última). Cada parte tem um nome, que vira o subtítulo.
const PARTES = {
  defeito: [
    { nome: "Relato, fotos e decisão", ids: ["relato", "orientar", "fotos", "analise", "recusa", "escolha", "troca",
      "reembolso_parcial", "reembolso_parcial_financeiro", "reembolso_parcial_comprovante",
      "reembolso_integral", "reembolso_integral_financeiro", "reembolso_integral_comprovante"] },
    { nome: "O produto volta para análise", ids: ["recolher", "chegou", "conferir"] },
  ],
  arrependimento: [
    { nome: "Entrega e prazo de 7 dias", ids: ["entregue", "cancelar", "recusar_entrega", "prazo", "fora_prazo", "recusa_prazo",
      "reembolso_integral", "reembolso_integral_financeiro", "reembolso_integral_comprovante"] },
    { nome: "Fotos e etiqueta reversa", ids: ["fotos", "estado", "aberto", "recusa_aberto", "reversa"] },
    { nome: "O produto volta à LogHouse", ids: ["chegou", "conferir", "reavaliar", "recusa_conferencia", "escolha", "troca",
      "reembolso_parcial", "reembolso_parcial_financeiro", "reembolso_parcial_comprovante"] },
  ],
};


// ── layout pelo graphviz ─────────────────────────────────────────────────────
// As linhas de cada caixa são quebradas UMA vez e usadas pelo graphviz (que
// mede) e pelo slide (que desenha): o texto cabe porque é o mesmo texto.
function linhasDoNo(n) {
  const largura = n.tipo === "decisao" ? 17 : n.tipo === "fim" ? 22 : 26;
  return {
    titulo: quebra(n.titulo, largura),
    sub: (n.sub ?? []).flatMap((s) => quebra(s, n.tipo === "decisao" ? 20 : 34)),
  };
}
function rotuloDot(n) {
  const { titulo, sub } = linhasDoNo(n);
  const ft = n.tipo === "decisao" ? FS.decisao : FS.titulo;
  return `<<FONT POINT-SIZE="${ft}"><B>${titulo.map(escDot).join("<BR/>")}</B></FONT>` +
    sub.map((s) => `<BR/><FONT POINT-SIZE="${FS.sub}">${escDot(s)}</FONT>`).join("") + ">";
}

function rodarDot(pag, direcao, cruza, extras = []) {
  const linhas = [
    "digraph G {",
    `  graph [rankdir=${direcao}, nodesep=${pag.nodesep ?? 0.3}, ranksep=${pag.ranksep ?? 0.38}, splines=spline, pad=0, margin=0, newrank=true];`,
    `  node [fontname="${FONTE}", shape=box, margin="0.14,0.11"];`,
    `  edge [fontname="${FONTE}", fontsize=${FS.rotulo}, arrowhead=none];`,
  ];
  for (const n of pag.nos) {
    const forma = n.tipo === "decisao" ? "diamond" : "box";
    const extra = n.tipo === "decisao" ? ', margin="0.04,0.03"' : n.tipo === "link" ? ', margin="0.3,0.07"' : "";
    linhas.push(`  "${n.id}" [shape=${forma}, label=${rotuloDot(n)}${extra}];`);
  }
  pag.arestas.forEach((a, i) => {
    const l = a.rotulo ? `label=<${quebra(a.rotulo, 20).map(escDot).join("<BR/>")}>` : "";
    const c = cruza?.has(i) ? "constraint=false" : "";
    // O id liga a aresta do graphviz à NOSSA: a ordem de saída do json não é
    // a de declaração, e trocá-las põe o "Não" na seta do "Sim".
    linhas.push(`  "${a.de}" -> "${a.para}" [${[`id="e${i}"`, l, c].filter(Boolean).join(", ")}];`);
  });
  linhas.push(...extras, "}");
  const arq = join(tmp, `g${Math.random().toString(36).slice(2)}.dot`);
  writeFileSync(arq, linhas.join("\n"));
  const g = JSON.parse(execFileSync("dot", ["-Tjson", arq]).toString());
  const [, , W, H] = g.bb.split(",").map(Number);
  const porId = new Map();
  for (const o of g.objects ?? []) {
    if (!o.pos) continue;                          // subgrafo (o rank=same das colunas)
    const [x, y] = o.pos.split(",").map(Number);
    porId.set(o.name, { cx: x / 72, cy: (H - y) / 72, w: Number(o.width), h: Number(o.height), rank: direcao === "TB" ? y : x });
  }
  const arestas = (g.edges ?? []).filter((e) => /^e\d+$/.test(String(e.id ?? ""))).map((e) => {
    const pts = e.pos.split(" ").filter((t) => !/^[se],/.test(t)).map((t) => {
      const [x, y] = t.split(",").map(Number);
      return { x: x / 72, y: (H - y) / 72 };
    });
    const lp = e.lp ? e.lp.split(",").map(Number) : null;
    const i = Number(String(e.id).replace(/^e/, ""));
    if (!pag.arestas[i] || pag.arestas[i].de !== g.objects[e.tail].name || pag.arestas[i].para !== g.objects[e.head].name)
      throw new Error(`aresta ${e.id} não casa com ${g.objects[e.tail].name} → ${g.objects[e.head].name}`);
    return { ...pag.arestas[i], pts, lp: lp ? { x: lp[0] / 72, y: (H - lp[1]) / 72 } : null };
  });
  return { W: W / 72, H: H / 72, porId, arestas };
}

/**
 * Fluxo comprido vira COLUNAS (ou faixas, no LR), como no rascunho do dono do
 * processo: as camadas do graphviz são divididas em `k` blocos e toda seta que
 * passa de um bloco a outro deixa de empurrar a camada (`constraint=false`) —
 * o bloco seguinte recomeça no topo, ao lado.
 */
function layout(pag, direcao, k = 1) {
  const base = rodarDot(pag, direcao);
  if (k === 1) return base;
  const ranks = [...new Set([...base.porId.values()].map((b) => Math.round(b.rank)))];
  ranks.sort((a, b) => (direcao === "TB" ? b - a : a - b));
  const bloco = (id) => Math.floor((ranks.indexOf(Math.round(base.porId.get(id).rank)) * k) / ranks.length);
  const cruza = new Set(pag.arestas.map((a, i) => (bloco(a.de) !== bloco(a.para) ? i : -1)).filter((i) => i >= 0));
  // As colunas na ORDEM do fluxo, da esquerda para a direita: o primeiro nó de
  // cada bloco vai para o topo, lado a lado, ligado ao do bloco seguinte por
  // uma seta invisível (seta na mesma camada = esquerda → direita).
  const topos = [];
  for (let b = 0; b < k; b++) {
    const ids = pag.nos.map((n) => n.id).filter((id) => bloco(id) === b);
    if (!ids.length) continue;
    ids.sort((x, y) => ranks.indexOf(Math.round(base.porId.get(x).rank)) - ranks.indexOf(Math.round(base.porId.get(y).rank)));
    topos.push(ids[0]);
  }
  const extras = topos.length > 1
    ? [`  { rank=same; ${topos.map((t) => `"${t}"`).join("; ")}; }`,
       ...topos.slice(1).map((t, i) => `  "${topos[i]}" -> "${t}" [style=invis];`)]
    : [];
  return rodarDot(pag, direcao, cruza, extras);
}

/** Escolhe entre 1 e 4 COLUNAS (de cima para baixo, como no rascunho) a que deixa o desenho maior. */
function melhorLayout(pag) {
  const opcoes = [];
  for (const d of pag.direcoes ?? ["TB"]) for (const k of pag.colunas ?? [1, 2, 3, 4]) {
    const l = layout(pag, d, k);
    opcoes.push({ ...l, d, k, escala: Math.min(AREA.w / l.W, AREA.h / l.H, 1.25) });
  }
  // Menos colunas leem mais direto: fica com a MENOR que já deixa o texto
  // grande o bastante (ou chega a 93% da melhor); só divide quando precisa.
  const melhor = Math.max(...opcoes.map((o) => o.escala));
  return opcoes.sort((a, b) => a.k - b.k).find((o) => o.escala >= Math.min(0.9, melhor * 0.93));
}

// ── desenho ──────────────────────────────────────────────────────────────────
const round1 = (v) => Math.round(v * 10) / 10;

function textoDoNo(n, s, corTitulo = COR.texto) {
  const { titulo, sub } = linhasDoNo(n);
  const ft = round1((n.tipo === "decisao" ? FS.decisao : FS.titulo) * s);
  const runs = [];
  titulo.forEach((t, i) => runs.push({ text: t, options: { bold: true, fontSize: ft, color: corTitulo, breakLine: i < titulo.length - 1 || sub.length > 0 } }));
  const link = n.tipo === "link";
  sub.forEach((t, i) => runs.push({ text: t, options: { fontSize: round1(FS.sub * s), color: link && /pág\./.test(t) ? corTitulo : COR.cinza, bold: link && /pág\./.test(t), breakLine: i < sub.length - 1 } }));
  return runs;
}

// O que a tela do app (`/pos-venda/fluxos`) precisa saber de cada slide: o
// título e onde ficam os conectores clicáveis, em polegadas (13,333 × 7,5).
const MAPA = new Map(); // slide → { titulo, links: [{ x, y, w, h, slide }] }
const anotar = (num, link) => { if (!MAPA.has(num)) MAPA.set(num, { titulo: "", links: [] }); if (link) MAPA.get(num).links.push(link); };
const r3 = (v) => Math.round(v * 1000) / 1000;

function desenhar(pres, slide, pag, num) {
  const L = melhorLayout(pag);
  const s = L.escala;
  if (s < ESCALA_MIN) console.warn(`⚠ ${pag.titulo}: escala ${s.toFixed(2)} — considere dividir (PARTES)`);
  const ox = AREA.x + (AREA.w - L.W * s) / 2;
  const oy = AREA.y + (AREA.h - L.H * s) / 2;
  const X = (x) => ox + x * s;
  const Y = (y) => oy + y * s;

  // Setas primeiro (ficam por baixo das caixas).
  for (const a of L.arestas) {
    if (a.pts.length < 2) continue;
    const xs = a.pts.map((p) => X(p.x)), ys = a.pts.map((p) => Y(p.y));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(Math.max(...xs) - minX, 0.01), h = Math.max(Math.max(...ys) - minY, 0.01);
    const rel = (i) => ({ x: xs[i] - minX, y: ys[i] - minY });
    const points = [rel(0)];
    for (let i = 1; i + 2 < a.pts.length; i += 3) {
      const c1 = rel(i), c2 = rel(i + 1), p = rel(i + 2);
      points.push({ x: p.x, y: p.y, curve: { type: "cubic", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y } });
    }
    slide.addShape(pres.ShapeType.custGeom, {
      x: minX, y: minY, w, h, points, objectName: `seta ${a.de} → ${a.para}`,
      line: { color: a.nao ? COR.nao : COR.linha, width: 1.25, endArrowType: "triangle" },
    });
  }
  // Rótulos das setas por cima das setas (fundo branco).
  for (const a of L.arestas) {
    if (!a.rotulo || !a.lp) continue;
    const linhas = quebra(a.rotulo, 20);
    const fs = round1(FS.rotulo * s);
    const lw = (Math.max(...linhas.map((t) => t.length)) * fs * 0.0078) + 0.08;
    const lh = linhas.length * fs * 0.0175 + 0.04;
    slide.addText(linhas.join("\n"), {
      x: X(a.lp.x) - lw / 2, y: Y(a.lp.y) - lh / 2, w: lw, h: lh, margin: 0, isTextBox: true,
      fontFace: FONTE, fontSize: fs, color: a.nao ? COR.nao : "334155", align: "center", valign: "middle",
      fill: { color: "FFFFFF" }, objectName: `rótulo ${a.de} → ${a.para}`,
    });
  }

  for (const n of pag.nos) {
    const b = L.porId.get(n.id);
    const x = X(b.cx - b.w / 2), y = Y(b.cy - b.h / 2), w = b.w * s, h = b.h * s;
    let forma = pres.ShapeType.flowChartProcess, fundo = COR.acao.fundo, borda = COR.acao.borda, largura = 1.25, dash, corTitulo = COR.texto;
    if (n.tipo === "decisao") { forma = pres.ShapeType.flowChartDecision; fundo = COR.decisao.fundo; borda = COR.decisao.borda; largura = 1.5; }
    else if (n.tipo === "inicio") { forma = pres.ShapeType.flowChartTerminator; fundo = COR.inicio.fundo; borda = COR.inicio.borda; largura = 1.75; }
    else if (n.tipo === "fim") { forma = pres.ShapeType.flowChartTerminator; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor); largura = 2.25; }
    else if (n.tipo === "link") { forma = pres.ShapeType.homePlate; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor ?? "#475569"); largura = 1.75; dash = "dash"; }
    else if (n.tipo === "entrada") { forma = pres.ShapeType.roundRect; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor ?? "#475569"); largura = 1.75; dash = "dash"; }
    else if (n.fin) { fundo = COR.fin.fundo; borda = COR.fin.borda; }

    slide.addShape(forma, {
      x, y, w, h, fill: { color: fundo }, line: { color: borda, width: largura, ...(dash ? { dashType: dash } : {}) },
      ...(forma === pres.ShapeType.roundRect ? { rectRadius: 0.08 } : {}), objectName: `caixa ${n.id}`,
    });
    // Texto por cima, na caixa que o graphviz mediu (as formas do PowerPoint
    // têm área de texto menor que o desenho — o losango, a metade).
    const recuo = n.tipo === "link" ? 0.05 * s : 0;
    slide.addText(textoDoNo(n, s, corTitulo), {
      x: x + recuo, y, w: w - (n.tipo === "link" ? 0.25 * s : 0), h, margin: 0, isTextBox: true, fontFace: FONTE,
      align: "center", valign: "middle", objectName: `texto ${n.id}`,
    });
    // Conector clicável: uma forma transparente por cima de tudo.
    if (n.slide) {
      anotar(num, { x: r3(x), y: r3(y), w: r3(w), h: r3(h), slide: n.slide });
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h, fill: { color: "FFFFFF", transparency: 100 }, line: { type: "none" },
        hyperlink: { slide: n.slide, tooltip: `Ir para a página ${n.slide}` }, objectName: `link ${n.id} → pág. ${n.slide}`,
      });
    }
  }
  return { s, d: L.d, k: L.k };
}

// ── as páginas ───────────────────────────────────────────────────────────────
const ORDEM = FLUXOS.filter((f) => f.tipo !== "outro").map((f) => f.tipo);
// Numeração: 1 índice · 2 visão geral · 3… fluxos (com as partes) · reembolso.
const slidesDoTipo = new Map();
let prox = 3;
for (const t of ORDEM) {
  const n = (PARTES[t] ?? [null]).length;
  slidesDoTipo.set(t, Array.from({ length: n }, (_, i) => prox + i));
  prox += n;
}
const SLIDE_REEMBOLSO = prox;
const slideDe = (tipo, parte) => slidesDoTipo.get(tipo)?.[parte] ?? 2;

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
pres.title = "Pós-venda · fluxos de atendimento";
pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };

function cabecalho(slide, titulo, sub, num, cor) {
  anotar(num); MAPA.get(num).titulo = titulo; if (sub) MAPA.get(num).sub = sub;
  slide.background = { color: "FFFFFF" };
  slide.addText(titulo, { x: 0.45, y: 0.3, w: 10.5, h: 0.55, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 26, bold: true, color: hex(cor ?? COR.texto) });
  if (sub) slide.addText(sub, { x: 0.45, y: 0.82, w: 11.5, h: 0.3, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.cinza });
  slide.addText([{ text: "Índice", options: { hyperlink: { slide: 1, tooltip: "Voltar ao índice" } } }], {
    x: 11.2, y: 0.32, w: 1.68, h: 0.32, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 11, color: COR.cinza, align: "right" });
  slide.addText(`pág. ${num}`, { x: 11.2, y: 7.08, w: 1.68, h: 0.25, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 10, color: COR.cinza, align: "right" });
}

// 1 — índice + legenda
{
  const slide = pres.addSlide();
  cabecalho(slide, "Pós-venda · fluxos de atendimento", "Um slide por tipo de caso. Clique no nome para ir à página; nos fluxos, o conector “→ pág. N” leva ao trecho seguinte.", 1);
  const itens = [
    { t: "Qual fluxo seguir", s: 2, c: "#0F172A" },
    ...ORDEM.flatMap((t) => (slidesDoTipo.get(t)).map((n, i, arr) => ({ t: `${FLUXO[t].rotulo}${arr.length > 1 ? ` (${i + 1}/${arr.length})` : ""}`, s: n, c: FLUXO[t].cor, cdc: FLUXO[t].cdc }))),
    { t: "Reembolso pelo Financeiro", s: SLIDE_REEMBOLSO, c: "#0D9488" },
  ];
  itens.forEach((it, i) => {
    const col = i < 7 ? 0 : 1, lin = i < 7 ? i : i - 7;
    const x = 0.45 + col * 4.35, y = 1.45 + lin * 0.76;
    anotar(1, { x: r3(x), y: r3(y), w: 4.05, h: 0.64, slide: it.s });
    slide.addText([
      { text: it.t, options: { bold: true, color: hex(it.c), fontSize: 15, hyperlink: { slide: it.s, tooltip: `Ir para a página ${it.s}` }, breakLine: true } },
      { text: `pág. ${it.s}${it.cdc ? ` · CDC ${it.cdc}` : ""}`, options: { color: COR.cinza, fontSize: 11 } },
    ], { x, y, w: 4.05, h: 0.64, shape: pres.ShapeType.roundRect, rectRadius: 0.06, margin: 8, fontFace: FONTE,
      fill: { color: "FFFFFF" }, line: { color: hex(it.c), width: 1.5 }, valign: "middle" });
  });
  // Legenda
  const lx = 9.4;
  slide.addText("Legenda", { x: lx, y: 1.45, w: 3.4, h: 0.3, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 13, bold: true, color: COR.texto });
  const leg = [
    [pres.ShapeType.flowChartTerminator, COR.inicio.fundo, COR.inicio.borda, "Início do caso", null],
    [pres.ShapeType.flowChartProcess, COR.acao.fundo, COR.acao.borda, "Ação de quem atende", null],
    [pres.ShapeType.flowChartDecision, COR.decisao.fundo, COR.decisao.borda, "Decisão", null],
    [pres.ShapeType.flowChartTerminator, "FFFFFF", "059669", "Desfecho do caso", null],
    [pres.ShapeType.homePlate, "FFFFFF", "475569", "Continua em outra página", "dash"],
    [pres.ShapeType.roundRect, "FFFFFF", "475569", "Vem de outra página", "dash"],
  ];
  leg.forEach(([forma, fundo, borda, txt, dash], i) => {
    const y = 1.9 + i * 0.62;
    slide.addShape(forma, { x: lx, y, w: 0.95, h: 0.45, fill: { color: fundo }, line: { color: borda, width: 1.5, ...(dash ? { dashType: dash } : {}) }, ...(forma === pres.ShapeType.roundRect ? { rectRadius: 0.06 } : {}) });
    slide.addText(txt, { x: lx + 1.1, y, w: 2.4, h: 0.45, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.texto, valign: "middle" });
  });
  slide.addShape(pres.ShapeType.line, { x: lx, y: 5.72, w: 0.95, h: 0, line: { color: COR.nao, width: 1.5, endArrowType: "triangle" } });
  slide.addText("Seta vermelha = resposta “não”", { x: lx + 1.1, y: 5.55, w: 2.4, h: 0.35, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.texto, valign: "middle" });
  slide.addText("Gerado dos roteiros do Atendimento (Pós-venda › Tratar): o que está aqui é o que a tela guia.", {
    x: 0.45, y: 7.06, w: 9, h: 0.27, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 10, color: COR.cinza });
}

// 2 — visão geral
{
  const DICA = {
    faltante: "Chegou incompleto", avaria: "Chegou quebrado, amassado, vazando", defeito: "Não funcionou / defeito",
    errado: "Veio outro produto", arrependimento: "Desistiu / quer devolver", nao_recebido: "Rastreio diz entregue, não recebeu",
    atraso: "Ainda não chegou", devolvido: "Voltou para nós", outro: "Dúvida, NF, cadastro…",
  };
  const nos = [
    { id: "inicio", tipo: "inicio", titulo: "Cliente reclama", sub: ["WhatsApp, e-mail, loja"] },
    { id: "abrir", tipo: "acao", titulo: "Abrir o pedido no Pós-venda", sub: ["selo Reclamou ⇒ o tipo vem sugerido"] },
    { id: "qual", tipo: "decisao", titulo: "Qual é o problema?", sub: [] },
    ...FLUXOS.map((f) => f.tipo === "outro"
      ? { id: `t_${f.tipo}`, tipo: "fim", titulo: "Outro assunto (dúvida, NF, cadastro): registrar e encerrar", cor: f.cor }
      : { id: `t_${f.tipo}`, tipo: "link", titulo: f.rotulo, sub: [DICA[f.tipo], `→ pág. ${slideDe(f.tipo, 0)}`], slide: slideDe(f.tipo, 0), cor: f.cor }),
  ];
  const arestas = [
    { de: "inicio", para: "abrir" }, { de: "abrir", para: "qual" },
    ...FLUXOS.map((f) => ({ de: "qual", para: `t_${f.tipo}` })),
  ];
  const slide = pres.addSlide();
  cabecalho(slide, "Qual fluxo seguir", "O sistema lê a reclamação no WhatsApp e sugere o tipo; quem atende confirma ao abrir o caso.", 2);
  desenhar(pres, slide, { nos, arestas, titulo: "Visão geral", direcoes: ["LR"], nodesep: 0.1, ranksep: 0.6 }, 2);
}

// 3… — os fluxos
const relatorio = [];
ORDEM.forEach((t, i) => {
  for (const pag of paginasDoFluxo(FLUXO[t], i + 1, slideDe)) {
    const slide = pres.addSlide();
    cabecalho(slide, pag.titulo, pag.sub, pag.slide, pag.cor);
    const r = desenhar(pres, slide, pag, pag.slide);
    relatorio.push(`pág. ${pag.slide}  ${pag.titulo}  escala ${r.s.toFixed(2)} ${r.d}×${r.k}`);
  }
});

// último — o reembolso
{
  const nos = [
    { id: "entra", tipo: "entrada", titulo: "Vem de qualquer fluxo", sub: ["“Reembolso parcial” ou “integral”"], cor: "#0D9488" },
    { id: "pedir", tipo: "acao", titulo: "Pedir o reembolso ao Financeiro", sub: ["valor · Pix, estorno ou transferência", "chave Pix ou dados bancários", "o caso fica esperando"] },
    { id: "aviso", tipo: "fin", titulo: "Financeiro recebe o aviso", sub: ["Finanças › Reembolsos"] },
    { id: "ok", tipo: "decisao", titulo: "Dados e valor conferem?", sub: [] },
    { id: "pagar", tipo: "fin", titulo: "Paga e confirma", sub: ["comprovante obrigatório", "valor pago e data"] },
    { id: "devolver", tipo: "fin", titulo: "Devolve ao atendente", sub: ["com o motivo"] },
    { id: "corrigir", tipo: "acao", titulo: "Corrigir e pedir de novo", sub: ["aviso “Reembolso devolvido”"] },
    { id: "comprovante", tipo: "acao", titulo: "Enviar o comprovante ao cliente", sub: ["aviso “Reembolso pago”", "mensagem pronta com o valor", "pelo WhatsApp ou por outro meio"] },
    { id: "fim", tipo: "fim", titulo: "Reembolso feito · caso encerrado", cor: "#0D9488" },
    { id: "voltar", tipo: "acao", titulo: "Voltar o passo antes de pago", sub: ["o pedido ao Financeiro é cancelado"] },
    { id: "fim_canc", tipo: "fim", titulo: "Pedido cancelado", cor: "#94A3B8" },
  ];
  const arestas = [
    { de: "entra", para: "pedir" }, { de: "pedir", para: "aviso" }, { de: "aviso", para: "ok" },
    { de: "ok", para: "pagar", rotulo: "Sim" }, { de: "ok", para: "devolver", rotulo: "Não", nao: true },
    { de: "devolver", para: "corrigir" }, { de: "corrigir", para: "pedir" },
    { de: "pagar", para: "comprovante" }, { de: "comprovante", para: "fim", rotulo: "Comprovante enviado" },
    { de: "pedir", para: "voltar", rotulo: "mudou de ideia" }, { de: "voltar", para: "fim_canc" },
  ];
  const slide = pres.addSlide();
  cabecalho(slide, "Reembolso pelo Financeiro", "Quem atende não faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta para avisar o cliente.", SLIDE_REEMBOLSO, "#0D9488");
  // "fin" desenha como ação na cor do Financeiro.
  const s = desenhar(pres, slide, { nos: nos.map((n) => n.tipo === "fin" ? { ...n, tipo: "acao", fin: true } : n), arestas, titulo: "Reembolso", colunas: [1] }, SLIDE_REEMBOLSO);
  relatorio.push(`pág. ${SLIDE_REEMBOLSO}  Reembolso  escala ${s.s.toFixed(2)} ${s.d}×${s.k}`);
}

await pres.writeFile({ fileName: SAIDA });
// O mapa para a tela do app: título e conectores de cada slide, e a primeira
// página de cada tipo (o "Ver o fluxo deste caso" abre direto nela).
writeFileSync(SAIDA.replace(/\.pptx$/, ".json"), JSON.stringify({
  largura: 13.333, altura: 7.5, reembolso: SLIDE_REEMBOLSO,
  tipos: Object.fromEntries([...slidesDoTipo].map(([t, ns]) => [t, ns[0]])),
  slides: [...MAPA].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ n, ...v })),
}, null, 1) + "\n");
// Pastas dentro do zip fazem o arquivo falhar ao abrir no OneDrive/SharePoint.
try { execFileSync("zip", ["-dq", SAIDA, "*/"]); } catch { /* sem pastas: nada a tirar */ }
rmSync(tmp, { recursive: true, force: true });
console.log(relatorio.join("\n"));
console.log("✔", SAIDA);
