// ─────────────────────────────────────────────────────────────────────────────
// Fluxogramas do PÓS-VENDA, gerados a partir dos ROTEIROS do sistema
// (`apps/atendimento/src/lib/posvendaCasos.ts`).
//
// O desenho NÃO é feito à mão: ele sai do mesmo arquivo que a tela usa para
// guiar o atendente. Roteiro mudou ⇒ rode de novo e os PNGs mudam juntos —
// desenho que descreve o roteiro de ontem é pior que desenho nenhum.
//
//   cd apps/atendimento && npm ci          (uma vez: traz o esbuild)
//   node docs/posvenda/gerar-fluxos.mjs    (da raiz do repo; precisa do `dot`,
//                                           pacote graphviz: apt-get install graphviz)
//
// Saída: docs/posvenda/fluxos/*.png
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const SAIDA = join(AQUI, "fluxos");

// ── carrega os roteiros (TS puro) ────────────────────────────────────────────
const require = createRequire(join(RAIZ, "apps/atendimento/package.json"));
const esbuild = require("esbuild");
const tmp = mkdtempSync(join(tmpdir(), "fluxos-"));
const js = join(tmp, "casos.mjs");
esbuild.buildSync({
  entryPoints: [join(RAIZ, "apps/atendimento/src/lib/posvendaCasos.ts")],
  outfile: js, format: "esm", bundle: true, platform: "node", logLevel: "silent",
});
const { FLUXOS, FLUXO, DESFECHOS, proximosDe } = await import(pathToFileURL(js).href);

// ── estilo ───────────────────────────────────────────────────────────────────
const FONTE = "Inter";
const DIRECAO = process.env.DIRECAO ?? "TB";
const AZUL = { borda: "#3b82f6", fundo: "#e8f1fe", texto: "#0f172a" };
const AMARELO = { borda: "#eab308", fundo: "#fef3c7" };
const FIN = { borda: "#0d9488", fundo: "#ccfbf1" };
const CINZA = "#64748b";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Quebra o texto em linhas de até `n` caracteres. */
function quebra(s, n = 26) {
  const linhas = [];
  let atual = "";
  for (const p of String(s).split(/\s+/)) {
    if ((atual + " " + p).trim().length > n && atual) { linhas.push(atual); atual = p; }
    else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}
const html = (s, n) => quebra(s, n).map(esc).join("<BR/>");
const linhaPequena = (s, cor = CINZA, n = 34) =>
  `<BR/><FONT POINT-SIZE="9" COLOR="${cor}">${html(s, n)}</FONT>`;

/** Rótulo de uma AÇÃO: título + detalhes pequenos. */
function rotuloTarefa(titulo, detalhes = []) {
  return `<<B>${html(titulo, 26)}</B>${detalhes.filter(Boolean).map((d) => linhaPequena(d)).join("")}>`;
}

const noTarefa = (id, label, c = AZUL, extra = "") =>
  `  "${id}" [shape=box, style="rounded,filled", fillcolor="${c.fundo}", color="${c.borda}", penwidth=1.4, label=${label}, margin="0.18,0.1"${extra}];`;

const noDecisao = (id, titulo, cdc) =>
  `  "${id}" [shape=diamond, style=filled, fillcolor="${AMARELO.fundo}", color="${AMARELO.borda}", penwidth=1.6, ` +
  `label=<<FONT POINT-SIZE="10"><B>${html(titulo, 18)}</B></FONT>${cdc ? linhaPequena(cdc, CINZA, 18) : ""}>, margin="0.02,0.02"];`;

const noInicio = (id, texto) =>
  `  "${id}" [shape=circle, style=filled, fillcolor="#dcfce7", color="#16a34a", penwidth=2, width=0.42, fixedsize=true, label=""];\n` +
  `  "${id}_t" [shape=plaintext, label=<<FONT POINT-SIZE="10">${html(texto, 18)}</FONT>>];\n` +
  `  "${id}_t" -> "${id}" [style=invis];  { rank=same; "${id}"; "${id}_t"; }`;

function noFim(id, rotulo, cor) {
  return `  "${id}" [shape=doublecircle, style=filled, fillcolor="#ffffff", color="${cor}", penwidth=2.6, width=0.34, fixedsize=true, label=""];\n` +
    `  "${id}_t" [shape=plaintext, label=<<FONT POINT-SIZE="10" COLOR="${cor}"><B>${html(rotulo, 16)}</B></FONT>>];\n` +
    `  "${id}" -> "${id}_t" [style=invis, minlen=0];  { rank=same; "${id}"; "${id}_t"; }`;
}

function aresta(de, para, rotulo, extra = "") {
  const l = rotulo ? `, label=<<FONT POINT-SIZE="9" COLOR="#334155">${html(rotulo, 22)}</FONT>>` : "";
  return `  "${de}" -> "${para}" [color="#475569", arrowsize=0.7${l}${extra}];`;
}

const CEL = (fundo, borda, texto) =>
  `<TD BGCOLOR="${fundo}" COLOR="${borda}" BORDER="1" CELLPADDING="4"><FONT POINT-SIZE="9">${texto}</FONT></TD>`;
const LEGENDA_HTML =
  `<TABLE BORDER="0" CELLSPACING="6" CELLPADDING="0"><TR>` +
  CEL(AZUL.fundo, AZUL.borda, "Ação de quem atende") + CEL(AMARELO.fundo, AMARELO.borda, "◆ Decisão") +
  CEL(FIN.fundo, FIN.borda, "Financeiro") + CEL("#ffffff", CINZA, "Continua em outro fluxo") +
  `<TD><FONT POINT-SIZE="9" COLOR="#16a34a">● início</FONT></TD><TD><FONT POINT-SIZE="9" COLOR="#b91c1c">◎ desfecho · seta vermelha = "não"</FONT></TD>` +
  `</TR></TABLE>`;

function cabecalho(titulo, subtitulo) {
  return [
    "digraph G {",
    `  graph [rankdir=${DIRECAO}, fontname="${FONTE}", bgcolor="white", pad=0.4, nodesep=0.35, ranksep=0.55, newrank=true,`,
    `         labelloc=t, labeljust=l, label=<<TABLE BORDER="0" CELLSPACING="2" CELLPADDING="0">` +
      `<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="20"><B>${esc(titulo)}</B></FONT></TD></TR>` +
      `<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="11" COLOR="${CINZA}">${esc(subtitulo)}</FONT></TD></TR>` +
      `<TR><TD ALIGN="LEFT">${LEGENDA_HTML}</TD></TR></TABLE>>];`,
    `  node [fontname="${FONTE}", fontsize=10];`,
    `  edge [fontname="${FONTE}"];`,
  ];
}

const LEGENDA = [];

/** Garante que nenhum id de passo colida com os nós auxiliares. */
const pid = (id) => `p_${id}`;

// ── um diagrama por TIPO de caso ─────────────────────────────────────────────
function diagramaDoTipo(f, numero) {
  const out = [];
  const prazo = f.prazoDias ? ` · resolver em até ${f.prazoDias} dias (${f.prazoRotulo})` : "";
  out.push(...cabecalho(`${numero}. ${f.rotulo}`, `${f.resumo}${f.cdc ? ` · CDC ${f.cdc}` : ""}${prazo}`));

  // O começo comum a todos os fluxos.
  out.push(noInicio("inicio", "Cliente reclama (WhatsApp, e-mail, loja)"));
  out.push(noTarefa("abrir", rotuloTarefa("Abrir o caso no pedido", [`Pós-venda › Tratar › ${f.rotulo}`])));
  out.push(aresta("inicio", "abrir"));
  out.push(aresta("abrir", pid(f.inicio)));

  const fins = new Map();     // desfecho -> id
  const links = new Map();    // tipo -> id
  const financeiro = [];

  for (const p of f.passos) {
    if (p.financeiro) {
      financeiro.push(noTarefa(pid(p.id), rotuloTarefa("Financeiro paga e anexa o comprovante",
        ["Finanças › Reembolsos", "ou devolve ao atendente com o motivo"]), FIN));
      out.push(aresta(pid(p.id), pid(p.financeiro.pago), "pago, com comprovante"));
      // A volta ("devolve com motivo") fica só no texto do nó e no fluxo do
      // reembolso: desenhada aqui, ela cruza o diagrama inteiro.
      continue;
    }
    const detalhes = [];
    if (p.cdc) detalhes.push(`CDC ${p.cdc}`);
    if (p.texto) detalhes.push(p.texto);
    if (p.mensagem) detalhes.push("✉ mensagem pronta para o cliente");
    if (p.reembolso) detalhes.push("valor · Pix, estorno ou transferência · dados");
    const obrig = (p.campos ?? []).filter((c) => c.obrigatorio && !p.reembolso).map((c) => c.rotulo);
    if (obrig.length) detalhes.push(`registra: ${obrig.join(", ")}`);
    if (p.comprovante) detalhes.push("pelo WhatsApp ou por outro meio");

    const decisao = p.opcoes.length >= 2;
    if (decisao) out.push(noDecisao(pid(p.id), p.titulo, p.cdc ? `CDC ${p.cdc}` : ""));
    else out.push(noTarefa(pid(p.id), rotuloTarefa(p.titulo, detalhes)));

    for (const o of p.opcoes) {
      const rot = decisao ? o.rotulo : (p.opcoes.length === 1 && !o.desfecho ? "" : o.rotulo);
      const cor = o.tom === "nao" ? `, color="#b91c1c", fontcolor="#b91c1c"` : "";
      if (o.proximo) out.push(aresta(pid(p.id), pid(o.proximo), rot, cor));
      else if (o.desfecho) {
        if (!fins.has(o.desfecho)) {
          const id = `fim_${o.desfecho}`;
          fins.set(o.desfecho, id);
          const d = DESFECHOS[o.desfecho];
          out.push(noFim(id, d.rotulo, d.cor));
        }
        out.push(aresta(pid(p.id), fins.get(o.desfecho), rot, cor));
      } else if (o.mudaPara) {
        if (!links.has(o.mudaPara)) {
          const id = `vira_${o.mudaPara}`;
          links.set(o.mudaPara, id);
          const n = ORDEM.indexOf(o.mudaPara) + 1;
          out.push(`  "${id}" [shape=box, style="rounded,dashed", color="${FLUXO[o.mudaPara].cor}", penwidth=1.6, ` +
            `label=<<B>Vira caso de ${esc(FLUXO[o.mudaPara].rotulo)}</B>${linhaPequena(`continua no fluxo ${n}`)}>];`);
        }
        out.push(aresta(pid(p.id), links.get(o.mudaPara), rot, cor));
      }
    }
  }

  if (financeiro.length) {
    out.push(`  subgraph cluster_fin {`,
      `    label=<<FONT POINT-SIZE="11" COLOR="${FIN.borda}"><B>Financeiro</B></FONT>>; labeljust=l;`,
      `    style="rounded,filled"; fillcolor="#f0fdfa"; color="${FIN.borda}";`,
      ...financeiro.map((l) => "  " + l),
      `  }`);
  }
  out.push(...LEGENDA, "}");
  return out.join("\n");
}

// ── 00: a visão geral (qual fluxo seguir) ────────────────────────────────────
const ORDEM = FLUXOS.filter((f) => f.tipo !== "outro").map((f) => f.tipo);

function visaoGeral() {
  const out = cabecalho("Pós-venda · qual fluxo seguir",
    "O sistema lê a reclamação no WhatsApp e SUGERE o tipo; quem atende confirma ao abrir o caso.");
  out.push(noInicio("inicio", "Cliente reclama (WhatsApp, e-mail, loja)"));
  out.push(noTarefa("abrir", rotuloTarefa("Abrir o pedido no Pós-venda", ["selo Reclamou ⇒ o tipo vem sugerido"])));
  out.push(noDecisao("qual", "Qual é o problema?", ""));
  out.push(aresta("inicio", "abrir"), aresta("abrir", "qual"));
  const DICA = {
    faltante: "Chegou incompleto", avaria: "Chegou quebrado, amassado, vazando",
    defeito: "Não funcionou / defeito", errado: "Veio outro produto",
    arrependimento: "Desistiu da compra / quer devolver", nao_recebido: "Rastreio diz entregue, não recebeu",
    atraso: "Ainda não chegou", devolvido: "Voltou para nós", outro: "Dúvida, NF, cadastro…",
  };
  FLUXOS.forEach((f) => {
    const n = ORDEM.indexOf(f.tipo) + 1;
    const det = [f.cdc ? `CDC ${f.cdc}` : "", f.prazoDias ? `resolver em até ${f.prazoDias} dias` : "",
      n > 0 ? `fluxo ${n}` : "só registra o atendimento"];
    out.push(`  "t_${f.tipo}" [shape=box, style="rounded,filled", fillcolor="#ffffff", color="${f.cor}", penwidth=2.2, ` +
      `label=<<FONT COLOR="${f.cor}"><B>${esc(f.rotulo)}</B></FONT>${det.filter(Boolean).map((d) => linhaPequena(d)).join("")}>, margin="0.2,0.1"];`);
    out.push(aresta("qual", `t_${f.tipo}`, DICA[f.tipo]));
  });
  out.push(...LEGENDA, "}");
  return out.join("\n");
}

// ── 09: o reembolso, de ponta a ponta ────────────────────────────────────────
function reembolso() {
  const out = cabecalho("Reembolso · do pedido ao comprovante",
    "Quem atende NÃO faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta ao atendente para avisar o cliente.");
  out.push(noInicio("inicio", "O roteiro chega a Reembolso parcial ou integral"));
  out.push(noTarefa("pedir", rotuloTarefa("Pedir o reembolso ao Financeiro",
    ["valor · Pix, estorno na plataforma ou transferência", "chave Pix ou dados bancários (menos no estorno)", "o caso fica esperando o Financeiro"])));
  out.push(aresta("inicio", "pedir"));
  out.push(`  subgraph cluster_fin {`,
    `    label=<<FONT POINT-SIZE="11" COLOR="${FIN.borda}"><B>Financeiro · Finanças › Reembolsos</B></FONT>>; labeljust=l;`,
    `    style="rounded,filled"; fillcolor="#f0fdfa"; color="${FIN.borda}";`,
    "  " + noTarefa("aviso", rotuloTarefa("Recebe o aviso no sininho", ["“Reembolso a pagar”"]), FIN),
    "  " + noDecisao("ok", "Dados e valor conferem?", ""),
    "  " + noTarefa("pagar", rotuloTarefa("Paga e confirma", ["comprovante OBRIGATÓRIO", "valor pago e data"]), FIN),
    "  " + noTarefa("devolver", rotuloTarefa("Devolve ao atendente", ["com o motivo"]), FIN),
    `  }`);
  out.push(aresta("pedir", "aviso"), aresta("aviso", "ok"),
    aresta("ok", "pagar", "Sim"), aresta("ok", "devolver", "Não", `, color="#b91c1c", fontcolor="#b91c1c"`));
  out.push(noTarefa("corrigir", rotuloTarefa("Atendente corrige e pede de novo", ["aviso “Reembolso devolvido”"])));
  out.push(aresta("devolver", "corrigir"), aresta("corrigir", "pedir", "", `, style=dashed, constraint=false`));
  out.push(noTarefa("comprovante", rotuloTarefa("Enviar o comprovante ao cliente",
    ["aviso “Reembolso pago”", "✉ mensagem pronta com o valor", "pelo WhatsApp ou por outro meio"])));
  out.push(aresta("pagar", "comprovante"));
  out.push(noFim("fim", "Reembolso feito · caso encerrado", "#0d9488"));
  out.push(aresta("comprovante", "fim", "Comprovante enviado"));
  out.push(noTarefa("voltar", rotuloTarefa("Atendente volta o passo", ["antes de pago: o pedido ao Financeiro é cancelado"]),
    { borda: CINZA, fundo: "#f1f5f9" }));
  out.push(aresta("pedir", "voltar", "mudou de ideia", `, style=dashed, color="${CINZA}"`));
  out.push(noFim("fim_canc", "Pedido cancelado", "#94a3b8"));
  out.push(aresta("voltar", "fim_canc"));
  out.push(...LEGENDA, "}");
  return out.join("\n");
}

// ── gera ─────────────────────────────────────────────────────────────────────
const SLUG = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
const diagramas = [["00-visao-geral", visaoGeral()]];
ORDEM.forEach((t, i) => diagramas.push([`${String(i + 1).padStart(2, "0")}-${SLUG(FLUXO[t].rotulo)}`, diagramaDoTipo(FLUXO[t], i + 1)]));
diagramas.push([`${String(ORDEM.length + 1).padStart(2, "0")}-reembolso-pelo-financeiro`, reembolso()]);

// Confere que todo passo do roteiro apareceu no desenho (o teste da tela
// garante que todos são alcançáveis; aqui, que nenhum ficou de fora do papel).
for (const f of FLUXOS) {
  if (f.tipo === "outro") continue;
  const dot = diagramas.find(([n]) => n.endsWith(SLUG(f.rotulo)))[1];
  for (const p of f.passos) if (!dot.includes(`"${pid(p.id)}"`)) throw new Error(`${f.tipo}: passo ${p.id} fora do desenho`);
  for (const p of f.passos) for (const x of proximosDe(p)) if (!f.passos.some((q) => q.id === x)) throw new Error(`${f.tipo}: ${x}`);
}

for (const [nome, dot] of diagramas) {
  const arq = join(tmp, `${nome}.dot`);
  writeFileSync(arq, dot);
  execFileSync("dot", ["-Tpng", "-Gdpi=150", arq, "-o", join(SAIDA, `${nome}.png`)]);
  console.log("✔", `docs/posvenda/fluxos/${nome}.png`);
}
rmSync(tmp, { recursive: true, force: true });
