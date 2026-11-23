// ─────────────────────────────────────────────────────────────────────────────
// O PowerPoint dos fluxos do PÓS-VENDA, gerado dos ROTEIROS do sistema
// (`apps/atendimento/src/lib/posvendaCasos.ts`) — o mesmo arquivo que guia o
// atendente na tela. Roteiro mudou ⇒ rode de novo.
//
//   cd docs/posvenda && npm ci            (uma vez: traz o pptxgenjs)
//   cd apps/atendimento && npm ci         (uma vez: traz o esbuild)
//   node docs/posvenda/gerar-pptx.mjs     (da raiz)
//
// Saída: docs/posvenda/fluxos-pos-venda.pptx
//
// Pedido do dono do processo (18/11/2026): cada fluxo cabe num slide, sem
// rolagem, e o que se repete vira CONECTOR DE PÁGINA ("→ pág. N", clicável):
//   • o reembolso (pedir → Financeiro paga → comprovante) tem slide próprio;
//   • "vira caso de Defeito" aponta o slide do Defeito;
//   • fluxo grande demais para um slide continua no seguinte, com conector
//     dos dois lados.
// As formas são as do fluxograma do PowerPoint e tudo é editável: caixa é
// forma, seta é forma.
//
// Desenho (23/11/2026, pedido do dono do processo: "melhorar a visualização,
// não mudar os fluxos"): layout pelo ELK (`elkjs`), linhas em ÂNGULO RETO de
// cima para baixo, em até 3 colunas lidas da esquerda para a direita. Os
// passos são NUMERADOS na ordem de leitura; seta que voltaria para cima ou
// passaria de uma coluna a outra NÃO é desenhada — vira "→ vá ao passo N"
// embaixo de quem a solta. No app, esse aviso é clicável e acende o passo
// (`vai`/`caixas` no .json). Sim = linha verde, Não = vermelha.
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
const ELK = reqAqui("elkjs/lib/elk.bundled.js");
const elk = new ELK();
const esbuild = createRequire(join(RAIZ, "apps/atendimento/package.json"))("esbuild");

const tmp = mkdtempSync(join(tmpdir(), "pptx-fluxos-"));
const js = join(tmp, "casos.mjs");
esbuild.buildSync({
  entryPoints: [join(RAIZ, "apps/atendimento/src/lib/posvendaCasos.ts")],
  outfile: js, format: "esm", bundle: true, platform: "node", logLevel: "silent",
});
const { FLUXOS, FLUXO, DESFECHOS, ATALHOS, atalhosDoPasso } = await import(pathToFileURL(js).href);

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
      const atalhos = atalhosDoPasso(f.tipo, p.id);
      if (p.cdc) sub.push(`CDC ${p.cdc}`);
      if (p.mensagem && !atalhos.length) sub.push("mensagem pronta ao cliente");
      const obrig = (p.campos ?? []).filter((c) => c.obrigatorio).map((c) => c.rotulo);
      if (obrig.length) sub.push(`registra: ${obrig.join(", ")}`);
      const decisao = p.opcoes.length >= 2;
      add({ id: p.id, tipo: decisao ? "decisao" : "acao", titulo: p.titulo, sub: decisao ? (p.cdc ? [`CDC ${p.cdc}`] : []) : sub, atalhos });

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
        arestas.push({ de: p.id, para, rotulo: rot, nao, sim: o.tom === "sim" });
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


// ── layout ───────────────────────────────────────────────────────────────────
// As linhas de cada caixa são quebradas UMA vez e usadas pelo layout (que
// mede) e pelo slide (que desenha): o texto cabe porque é o mesmo texto.
function linhasDoNo(n) {
  const largura = n.tipo === "decisao" ? 28 : n.tipo === "fim" ? 24 : 30;
  return {
    titulo: quebra(n.titulo, largura),
    sub: (n.sub ?? []).flatMap((s) => quebra(s, 40)),
  };
}
// ELK: linhas em ângulo reto, rótulo colado na própria linha.
const PX = 100; // ELK trabalha em "px": 100 por polegada
// Os atalhos de mensagem ("/fotos_produto") moram no RODAPÉ da caixa, em
// pílulas que quebram linha. Medidos na escala 1, em polegadas.
const CHIP = { fs: 9, h: 0.23, gap: 0.06, pad: 0.1, topo: 0.04 };
const larguraDoChip = (barra) => (barra.length + 1) * CHIP.fs * 0.0080 + 0.16;
function chipsDoNo(n, larg) {
  const linhas = [];
  let atual = [], usado = 0;
  for (const b of n.atalhos ?? []) {
    const w = larguraDoChip(b);
    if (atual.length && usado + CHIP.gap + w > larg - 2 * CHIP.pad) { linhas.push(atual); atual = []; usado = 0; }
    atual.push({ barra: b, w }); usado += (atual.length > 1 ? CHIP.gap : 0) + w;
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}
const alturaDosChips = (linhas) => (linhas.length ? CHIP.topo + linhas.length * CHIP.h + (linhas.length - 1) * CHIP.gap + CHIP.pad : 0);
function tamanhoDoNo(n) {
  const { titulo, sub } = linhasDoNo(n);
  const ft = n.tipo === "decisao" ? FS.decisao : FS.titulo;
  const larg = { vai: 1.45, decisao: 2.45, fim: 1.9, link: 2.45, entrada: 2.45, inicio: 2.3 }[n.tipo] ?? 2.6;
  const alt = 0.2 + titulo.length * ft * 1.22 / 72 + sub.length * FS.sub * 1.25 / 72 + (n.tipo === "decisao" ? 0.06 : 0)
    + alturaDosChips(chipsDoNo(n, larg));
  return { w: larg, h: n.tipo === "vai" ? 0.34 : Math.max(alt, n.tipo === "fim" ? 0.42 : 0.5) };
}
function tamanhoDoRotulo(r) {
  const linhas = quebra(r, 22);
  return { linhas, w: Math.max(...linhas.map((t) => t.length)) * FS.rotulo * 0.0080 + 0.16, h: linhas.length * FS.rotulo * 0.0175 + 0.08 };
}
async function layout(pag, direcao, extra = {}) {
  const g = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": direcao, "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(0.3 * PX), "elk.spacing.nodeNode": String(0.28 * PX),
      "elk.spacing.edgeNode": String(0.14 * PX), "elk.spacing.edgeEdge": String(0.1 * PX),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(0.14 * PX), "elk.spacing.edgeLabel": "4",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX", "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeLabels.placement": "CENTER", "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
      ...extra,
    },
    children: pag.nos.map((n) => { const t = tamanhoDoNo(n); return { id: n.id, width: t.w * PX, height: t.h * PX }; }),
    edges: pag.arestas.map((a, i) => ({ id: `e${i}`, sources: [a.de], targets: [a.para],
      labels: a.rotulo ? [(() => { const t = tamanhoDoRotulo(a.rotulo); return { text: a.rotulo, width: t.w * PX, height: t.h * PX }; })()] : [] })),
  });
  const porId = new Map(g.children.map((c) => [c.id, { cx: (c.x + c.width / 2) / PX, cy: (c.y + c.height / 2) / PX, w: c.width / PX, h: c.height / PX }]));
  const arestas = g.edges.map((e) => {
    const i = Number(e.id.slice(1)); const sec = e.sections[0];
    const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({ x: p.x / PX, y: p.y / PX }));
    const l = e.labels?.[0];
    return { ...pag.arestas[i], pts, lp: l ? { x: (l.x + l.width / 2) / PX, y: (l.y + l.height / 2) / PX } : null };
  });
  return { W: g.width / PX, H: g.height / PX, porId, arestas };
}
const ehPasso = (n) => n && (n.tipo === "acao" || n.tipo === "decisao");
const GAP = 0.45; // entre colunas, em polegadas

/** Numera os passos na ordem do fluxo (em largura). */
function numerar(pag) {
  const porId = new Map(pag.nos.map((n) => [n.id, n]));
  const entra = new Set(pag.arestas.map((a) => a.para));
  const fila = pag.nos.filter((n) => !entra.has(n.id)).map((n) => n.id);
  const vistos = new Set(); let k = 0;
  while (fila.length) {
    const id = fila.shift(); if (vistos.has(id)) continue; vistos.add(id);
    const n = porId.get(id); if (ehPasso(n) && n.num == null) n.num = ++k;
    for (const a of pag.arestas) if (a.de === id) fila.push(a.para);
  }
  for (const n of pag.nos) if (ehPasso(n) && n.num == null) n.num = ++k;
}

/**
 * O fluxo de cima para baixo, em ATÉ 3 COLUNAS lidas da esquerda para a
 * direita. Seta que passaria de uma coluna para outra (ou voltaria para cima)
 * NÃO é desenhada: vira "→ vá ao passo N" logo abaixo de quem a solta.
 */
async function melhorLayout(pag) {
  numerar(pag);
  const porId = new Map(pag.nos.map((n) => [n.id, n]));
  const base = await layout(pag, "DOWN");
  // A camada de cada nó (pela altura no desenho de uma coluna só).
  const ys = [...new Set([...base.porId.values()].map((b) => Math.round(b.cy * 20)))].sort((x, y) => x - y);
  const camada = (id) => ys.indexOf(Math.round(base.porId.get(id).cy * 20));
  // Onde cortar as colunas: todas as combinações de 1, 2 ou 3 colunas, cortando
  // entre camadas (o fluxo continua sempre de cima para baixo, coluna a coluna).
  const cortes = [[]];
  for (let c = 1; c < ys.length; c++) cortes.push([c]);
  for (let c1 = 1; c1 < ys.length; c1++) for (let c2 = c1 + 1; c2 < ys.length; c2++) cortes.push([c1, c2]);
  const opcoes = [];
  for (const corte of cortes) {
    const k = corte.length + 1;
    const grupo = new Map();
    for (const n of pag.nos) grupo.set(n.id, corte.filter((c) => camada(n.id) >= c).length);
    // Fim, conector e "vem de" ficam na coluna de quem os liga.
    for (const n of pag.nos) {
      if (n.tipo === "fim" || n.tipo === "link") {
        const de = pag.arestas.find((a) => a.para === n.id); if (de) grupo.set(n.id, grupo.get(de.de));
      }
      if (n.tipo === "entrada" || n.tipo === "inicio") {
        const pa = pag.arestas.find((a) => a.de === n.id); if (pa) grupo.set(n.id, grupo.get(pa.para));
      }
    }
    const nos = pag.nos.map((n) => ({ ...n })), arestas = [];
    pag.arestas.forEach((a, i) => {
      const ga = grupo.get(a.de), gb = grupo.get(a.para);
      const sobe = base.porId.get(a.para).cy < base.porId.get(a.de).cy - 0.05;
      if (ga === gb && !(sobe && ehPasso(porId.get(a.para)))) { arestas.push(a); return; }
      const alvo = porId.get(a.para);
      const id = `vai_${i}`;
      nos.push({ id, alvo: a.para, tipo: "vai", titulo: ehPasso(alvo) ? `→ vá ao passo ${alvo.num}` : `→ ${alvo.titulo}`, sub: [], cor: alvo.tipo === "decisao" ? "#B45309" : "#1D4ED8" });
      grupo.set(id, ga);
      arestas.push({ ...a, para: id });
    });
    const colunas = [];
    for (let g = 0; g < k; g++) {
      const ns = nos.filter((n) => grupo.get(n.id) === g);
      if (!ns.length) continue;
      const ids = new Set(ns.map((n) => n.id));
      colunas.push(await layout({ ...pag, nos: ns, arestas: arestas.filter((a) => ids.has(a.de) && ids.has(a.para)) }, "DOWN"));
    }
    const W = colunas.reduce((t, c) => t + c.W, 0) + GAP * (colunas.length - 1);
    const H = Math.max(...colunas.map((c) => c.H));
    const porIdF = new Map(); const arestasF = []; let x0 = 0;
    for (const c of colunas) {
      for (const [id, b] of c.porId) porIdF.set(id, { ...b, cx: b.cx + x0 });
      for (const e of c.arestas) arestasF.push({ ...e, pts: e.pts.map((p) => ({ x: p.x + x0, y: p.y })), lp: e.lp && { x: e.lp.x + x0, y: e.lp.y } });
      x0 += c.W + GAP;
    }
    opcoes.push({ W, H, larguras: colunas.map((c) => c.W), porId: porIdF, arestas: arestasF, pagFinal: { ...pag, nos, arestas }, d: "DOWN", k: colunas.length,
      escala: Math.min(AREA.w / W, AREA.h / H, 1.15) });
  }
  // Cada "vá ao passo" é um salto que a pessoa tem de fazer com os olhos: entre
  // as opções com texto grande o bastante, fica a de MENOS saltos (e, no empate,
  // a de menos colunas).
  const melhor = Math.max(...opcoes.map((o) => o.escala));
  const saltos = (o) => o.pagFinal.nos.filter((n) => n.tipo === "vai").length;
  const boas = opcoes.filter((o) => o.escala >= Math.min(0.85, melhor * 0.9));
  const L = boas.sort((a, b) => (saltos(a) - saltos(b)) || (a.k - b.k) || (b.escala - a.escala))[0];
  if (process.env.DEPURAR) console.log(pag.titulo, `→ ${L.k} col · escala ${L.escala.toFixed(2)} · ${saltos(L)} saltos (melhor escala ${melhor.toFixed(2)})`);
  // Número pela ordem de LEITURA: coluna a coluna, de cima para baixo.
  const colDe = (b) => { let x = 0, i = 0; for (const w of L.larguras) { if (b.cx < x + w + GAP / 2) return i; x += w + GAP; i++; } return i; };
  const passos = L.pagFinal.nos.filter(ehPasso).sort((a, b) => {
    const pa = L.porId.get(a.id), pb = L.porId.get(b.id);
    return (colDe(pa) - colDe(pb)) || (pa.cy - pb.cy) || (pa.cx - pb.cx);
  });
  passos.forEach((n, i) => { n.num = i + 1; });
  const num = new Map(passos.map((n) => [n.id, n.num]));
  for (const n of L.pagFinal.nos) if (n.tipo === "vai" && num.has(n.alvo)) { n.alvoNum = num.get(n.alvo); n.titulo = `→ vá ao passo ${n.alvoNum}`; }
  return L;
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

async function desenhar(pres, slide, pag, num) {
  const L = await melhorLayout(pag);
  pag = L.pagFinal;
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
    const points = a.pts.map((_, i) => rel(i));
    slide.addShape(pres.ShapeType.custGeom, {
      x: minX, y: minY, w, h, points, objectName: `seta ${a.de} → ${a.para}`,
      line: { color: a.nao ? COR.nao : a.sim ? "059669" : COR.linha, width: 1.5, endArrowType: "triangle" },
    });
  }
  // Rótulos das setas por cima das setas (fundo branco).
  for (const a of L.arestas) {
    if (!a.rotulo || !a.lp) continue;
    const t = tamanhoDoRotulo(a.rotulo); const linhas = t.linhas;
    const fs = round1(FS.rotulo * s);
    const lw = t.w * s, lh = t.h * s;
    slide.addText(linhas.join("\n"), {
      x: X(a.lp.x) - lw / 2, y: Y(a.lp.y) - lh / 2, w: lw, h: lh, margin: 0, isTextBox: true,
      fontFace: FONTE, fontSize: fs, bold: true, color: a.nao ? COR.nao : a.sim ? "047857" : "334155", align: "center", valign: "middle",
      shape: pres.ShapeType.roundRect, rectRadius: 0.05,
      fill: { color: a.nao ? "FEF2F2" : a.sim ? "ECFDF5" : "FFFFFF" }, line: { color: a.nao ? "FCA5A5" : a.sim ? "6EE7B7" : "CBD5E1", width: 0.75 },
      objectName: `rótulo ${a.de} → ${a.para}`,
    });
  }

  for (const n of pag.nos) {
    const b = L.porId.get(n.id);
    const x = X(b.cx - b.w / 2), y = Y(b.cy - b.h / 2), w = b.w * s, h = b.h * s;
    let forma = pres.ShapeType.flowChartProcess, fundo = COR.acao.fundo, borda = COR.acao.borda, largura = 1.25, dash, corTitulo = COR.texto;
    if (n.tipo === "decisao") { forma = pres.ShapeType.roundRect; fundo = COR.decisao.fundo; borda = COR.decisao.borda; largura = 1.5; }
    else if (n.tipo === "inicio") { forma = pres.ShapeType.flowChartTerminator; fundo = COR.inicio.fundo; borda = COR.inicio.borda; largura = 1.75; }
    else if (n.tipo === "fim") { forma = pres.ShapeType.flowChartTerminator; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor); largura = 2.25; }
    else if (n.tipo === "link") { forma = pres.ShapeType.homePlate; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor ?? "#475569"); largura = 1.75; dash = "dash"; }
    else if (n.tipo === "entrada") { forma = pres.ShapeType.roundRect; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor ?? "#475569"); largura = 1.75; dash = "dash"; }
    else if (n.fin) { fundo = COR.fin.fundo; borda = COR.fin.borda; }
    else if (n.tipo === "vai") { forma = pres.ShapeType.roundRect; fundo = "FFFFFF"; borda = corTitulo = hex(n.cor); largura = 1.25; dash = "dash"; }

    slide.addShape(forma, {
      x, y, w, h, fill: { color: fundo }, line: { color: borda, width: largura, ...(dash ? { dashType: dash } : {}) },
      ...(forma === pres.ShapeType.roundRect ? { rectRadius: 0.08 } : {}), objectName: `caixa ${n.id}`,
    });
    // Texto por cima, na caixa que o layout mediu (as formas do PowerPoint
    // têm área de texto menor que o desenho — o losango, a metade).
    const recuo = n.tipo === "link" ? 0.05 * s : 0;
    const chips = chipsDoNo(n, b.w);
    const hChips = alturaDosChips(chips) * s;
    slide.addText(textoDoNo(n, s, corTitulo), {
      x: x + recuo, y, w: w - (n.tipo === "link" ? 0.25 * s : 0), h: h - hChips, margin: 0, isTextBox: true, fontFace: FONTE,
      align: "center", valign: "middle", objectName: `texto ${n.id}`,
    });
    // Os atalhos: pílulas centradas no rodapé da caixa. No app, clicar abre a mensagem.
    chips.forEach((linha, li) => {
      const total = linha.reduce((t, c) => t + c.w, 0) + CHIP.gap * (linha.length - 1);
      let cx = x + (w - total * s) / 2;
      const cy = y + h - hChips + (CHIP.topo + li * (CHIP.h + CHIP.gap)) * s;
      for (const c of linha) {
        slide.addText(`/${c.barra}`, {
          x: cx, y: cy, w: c.w * s, h: CHIP.h * s, margin: 0, shape: pres.ShapeType.roundRect, rectRadius: 0.1 * s,
          fill: { color: "DCFCE7" }, line: { color: "16A34A", width: 1 }, fontFace: FONTE, fontSize: round1(CHIP.fs * s),
          bold: true, color: "166534", align: "center", valign: "middle", objectName: `atalho /${c.barra}`,
        });
        if (num) { anotar(num); (MAPA.get(num).atalhos ??= []).push({ x: r3(cx), y: r3(cy), w: r3(c.w * s), h: r3(CHIP.h * s), barra: c.barra }); }
        cx += (c.w + CHIP.gap) * s;
      }
    });
    if (n.num != null) {
      const d = 0.27 * Math.max(s, 0.8);
      slide.addText(String(n.num), { x: x - d * 0.35, y: y - d * 0.35, w: d, h: d, shape: pres.ShapeType.ellipse, margin: 0,
        fill: { color: n.tipo === "decisao" ? "B45309" : n.fin ? "0F766E" : "1D4ED8" }, line: { color: "FFFFFF", width: 1.5 },
        fontFace: FONTE, fontSize: round1(9 * Math.max(s, 0.8)), bold: true, color: "FFFFFF", align: "center", valign: "middle", objectName: `número ${n.id}` });
    }
    // O app acende a caixa do passo quando se clica no "→ vá ao passo N".
    if (num && n.num != null) { anotar(num); (MAPA.get(num).caixas ??= {})[n.num] = { x: r3(x), y: r3(y), w: r3(w), h: r3(h) }; }
    if (num && n.tipo === "vai" && n.alvoNum != null) { anotar(num); (MAPA.get(num).vai ??= []).push({ x: r3(x), y: r3(y), w: r3(w), h: r3(h), passo: n.alvoNum }); }
    // Onde cada PASSO do roteiro cai: o app marca o passo em que o caso está.
    if (num && (n.tipo === "acao" || n.tipo === "decisao")) {
      anotar(num); (MAPA.get(num).passos ??= {})[n.id] = { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
    }
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
    [pres.ShapeType.roundRect, COR.decisao.fundo, COR.decisao.borda, "Pergunta (escolha a resposta)", null],
    [pres.ShapeType.flowChartTerminator, "FFFFFF", "059669", "Desfecho do caso", null],
    [pres.ShapeType.homePlate, "FFFFFF", "475569", "Continua em outra página", "dash"],
    [pres.ShapeType.roundRect, "FFFFFF", "475569", "Vem de outra página", "dash"],
    [pres.ShapeType.roundRect, "FFFFFF", "B45309", "→ vá ao passo N (mesma página)", "dash"],
  ];
  leg.forEach(([forma, fundo, borda, txt, dash], i) => {
    const y = 1.85 + i * 0.56;
    slide.addShape(forma, { x: lx, y, w: 0.95, h: 0.45, fill: { color: fundo }, line: { color: borda, width: 1.5, ...(dash ? { dashType: dash } : {}) }, ...(forma === pres.ShapeType.roundRect ? { rectRadius: 0.06 } : {}) });
    slide.addText(txt, { x: lx + 1.1, y, w: 2.4, h: 0.45, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.texto, valign: "middle" });
  });
  slide.addText("/atalho", { x: lx, y: 5.83, w: 0.95, h: 0.3, margin: 0, shape: pres.ShapeType.roundRect, rectRadius: 0.1,
    fill: { color: "DCFCE7" }, line: { color: "16A34A", width: 1 }, fontFace: FONTE, fontSize: 10, bold: true, color: "166534", align: "center", valign: "middle" });
  slide.addText("Mensagem pronta: digite a barra na conversa", { x: lx + 1.1, y: 5.76, w: 2.6, h: 0.45, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.texto, valign: "middle" });
  slide.addShape(pres.ShapeType.line, { x: lx, y: 6.47, w: 0.95, h: 0, line: { color: COR.nao, width: 1.5, endArrowType: "triangle" } });
  slide.addText("Seta vermelha = resposta “não”", { x: lx + 1.1, y: 6.3, w: 2.4, h: 0.35, margin: 0, isTextBox: true, fontFace: FONTE, fontSize: 12, color: COR.texto, valign: "middle" });
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
  await desenhar(pres, slide, { nos, arestas, titulo: "Visão geral", direcoes: ["LR"], nodesep: 0.1, ranksep: 0.6 }, 2);
}

// 3… — os fluxos
const relatorio = [];
for (const [i, t] of ORDEM.entries()) {
  for (const pag of paginasDoFluxo(FLUXO[t], i + 1, slideDe)) {
    const slide = pres.addSlide();
    cabecalho(slide, pag.titulo, pag.sub, pag.slide, pag.cor);
    const r = await desenhar(pres, slide, pag, pag.slide);
    relatorio.push(`pág. ${pag.slide}  ${pag.titulo}  escala ${r.s.toFixed(2)} ${r.d}×${r.k}`);
  }
}

// último — o reembolso
{
  const nos = [
    { id: "entra", tipo: "entrada", titulo: "Vem de qualquer fluxo", sub: ["“Reembolso parcial” ou “integral”"], cor: "#0D9488" },
    { id: "pedir", tipo: "acao", titulo: "Pedir o reembolso ao Financeiro", sub: ["valor · Pix, estorno ou transferência", "chave Pix ou dados bancários", "o caso fica esperando"], atalhos: ["reembolso_dados"] },
    { id: "aviso", tipo: "fin", titulo: "Financeiro recebe o aviso", sub: ["Finanças › Reembolsos"] },
    { id: "ok", tipo: "decisao", titulo: "Dados e valor conferem?", sub: [] },
    { id: "pagar", tipo: "fin", titulo: "Paga e confirma", sub: ["comprovante obrigatório", "valor pago e data"] },
    { id: "devolver", tipo: "fin", titulo: "Devolve ao atendente", sub: ["com o motivo"] },
    { id: "corrigir", tipo: "acao", titulo: "Corrigir e pedir de novo", sub: ["aviso “Reembolso devolvido”"] },
    { id: "comprovante", tipo: "acao", titulo: "Enviar o comprovante ao cliente", sub: ["aviso “Reembolso pago”", "pelo WhatsApp ou por outro meio"], atalhos: ["reembolso_pago"] },
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
  const s = await desenhar(pres, slide, { nos: nos.map((n) => n.tipo === "fin" ? { ...n, tipo: "acao", fin: true } : n), arestas, titulo: "Reembolso", colunas: [1] }, SLIDE_REEMBOLSO);
  relatorio.push(`pág. ${SLIDE_REEMBOLSO}  Reembolso  escala ${s.s.toFixed(2)} ${s.d}×${s.k}`);
}

await pres.writeFile({ fileName: SAIDA });
// O slide do reembolso desenha caixas PRÓPRIAS ("pedir", "aviso"…): os passos
// do roteiro apontam para elas, senão o app não marcaria onde o caso está.
{
  const p = MAPA.get(SLIDE_REEMBOLSO)?.passos ?? {};
  for (const t of ["parcial", "integral"]) {
    if (p.pedir) p[`reembolso_${t}`] = p.pedir;
    if (p.aviso) p[`reembolso_${t}_financeiro`] = p.aviso;
    if (p.comprovante) p[`reembolso_${t}_comprovante`] = p.comprovante;
  }
}
// O mapa para a tela do app: título e conectores de cada slide, e a primeira
// página de cada tipo (o "Ver o fluxo deste caso" abre direto nela).
writeFileSync(SAIDA.replace(/\.pptx$/, ".json"), JSON.stringify({
  largura: 13.333, altura: 7.5, reembolso: SLIDE_REEMBOLSO,
  // As mensagens padrão de cada atalho (`/fotos_produto` → título e texto).
  mensagens: ATALHOS,
  tipos: Object.fromEntries([...slidesDoTipo].map(([t, ns]) => [t, ns[0]])),
  // Em que slide mora cada passo (o reembolso tem slide próprio; "outro" fica na visão geral).
  passos: Object.fromEntries(FLUXOS.map((f) => {
    const parteDe = new Map();
    (PARTES[f.tipo] ?? [{ ids: f.passos.map((p) => p.id) }]).forEach((p, i) => p.ids.forEach((id) => parteDe.set(id, i)));
    return [f.tipo, Object.fromEntries(f.passos.map((p) => [p.id,
      /^reembolso_(parcial|integral)/.test(p.id) ? SLIDE_REEMBOLSO : slideDe(f.tipo, parteDe.get(p.id) ?? 0)]))];
  })),
  slides: [...MAPA].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ n, ...v })),
}, null, 1) + "\n");
// Pastas dentro do zip fazem o arquivo falhar ao abrir no OneDrive/SharePoint.
try { execFileSync("zip", ["-dq", SAIDA, "*/"]); } catch { /* sem pastas: nada a tirar */ }
rmSync(tmp, { recursive: true, force: true });
console.log(relatorio.join("\n"));
console.log("✔", SAIDA);
