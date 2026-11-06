import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { FinBoleto } from "@/hooks/useBoletos";

// ─────────────────────────────────────────────────────────────────────────────
// O PDF do boleto híbrido. O Bradesco NÃO devolve PDF (manual, PARTE 2.5):
// desenhamos a ficha de compensação a partir do que o banco devolveu — linha
// digitável, código de barras (44, derivado da linha e conferido no servidor)
// e o Pix copia-e-cola.
//
// ⚠️ Nada aqui é calculado de novo a partir do valor ou da data: o que vai no
// papel é o que o BANCO registrou. Sem código de barras (linha que não fecha o
// dígito — a do sandbox é fictícia), o papel sai sem as barras e diz por quê.
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function formatarDoc(d: string | null | undefined): string {
  const s = dig(d);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d ?? "";
}

export function formatarLinha(linha: string | null): string {
  const l = dig(linha);
  if (l.length !== 47) return linha ?? "";
  return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
}

/** Dígito do nosso número Bradesco: módulo 11, pesos 2..7, sobre carteira (2) + número (11). Resto 1 → "P". */
export function dvNossoNumero(carteira: number, nosso: number | string): string {
  const base = String(carteira).padStart(2, "0") + String(nosso).padStart(11, "0");
  let soma = 0, peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r === 0 ? "0" : r === 1 ? "P" : String(11 - r);
}

export function nossoNumeroImpresso(b: Pick<FinBoleto, "nosso_numero" | "nosso_numero_banco" | "carteira">): string {
  const cart = b.carteira?.carteira ?? 9;
  const nn = b.nosso_numero_banco ?? String(b.nosso_numero);
  return `${String(cart).padStart(2, "0")}/${nn.padStart(11, "0")}-${dvNossoNumero(cart, nn)}`;
}

/** "AAAA / CCCCCCC" a partir da negociação de 18 (agência 4 + zeros 7 + conta 7). */
export function agenciaConta(neg18: string | null | undefined): string {
  const d = dig(neg18);
  return d.length === 18 ? `${d.slice(0, 4)} / ${d.slice(11)}` : "";
}

/**
 * Intercalado 2 de 5 (ITF), o código do boleto: pares de dígitos, o primeiro
 * nas barras e o segundo nos espaços. n = estreita, w = larga (3×).
 */
const ITF = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
export function barrasITF(codigo: string): Array<{ barra: boolean; largura: 1 | 3 }> {
  const d = dig(codigo);
  if (d.length % 2) throw new Error("ITF precisa de quantidade par de dígitos.");
  const out: Array<{ barra: boolean; largura: 1 | 3 }> = [];
  const add = (barra: boolean, c: string) => out.push({ barra, largura: c === "w" ? 3 : 1 });
  "nnnn".split("").forEach((c, i) => add(i % 2 === 0, c));        // início
  for (let i = 0; i < d.length; i += 2) {
    const a = ITF[Number(d[i])], b = ITF[Number(d[i + 1])];
    for (let k = 0; k < 5; k++) { add(true, a[k]); add(false, b[k]); }
  }
  add(true, "w"); add(false, "n"); add(true, "n");                 // fim
  return out;
}

function desenharBarras(doc: jsPDF, codigo: string, x: number, y: number, larguraTotal: number, altura: number) {
  const barras = barrasITF(codigo);
  const modulos = barras.reduce((s, b) => s + b.largura, 0);
  const m = larguraTotal / modulos;
  let cx = x;
  doc.setFillColor(0, 0, 0);
  for (const b of barras) {
    const w = b.largura * m;
    if (b.barra) doc.rect(cx, y, w, altura, "F");
    cx += w;
  }
}

export interface DadosPdf {
  boleto: FinBoleto;
  multaPct?: number | null;
  jurosMesPct?: number | null;
}

/** Gera o PDF. `download` salva o arquivo; sempre devolve o base64 (para o e-mail). */
export async function gerarBoletoPdf({ boleto: b, multaPct, jurosMesPct }: DadosPdf, opts?: { download?: boolean }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const X = 12, L = 186;                       // margem e largura útil
  const pag = b.pagador ?? {};
  const benef = b.carteira?.beneficiario_nome || "Beneficiário";
  const benefDoc = formatarDoc(b.carteira?.cnpj);
  const linha = formatarLinha(b.linha_digitavel);
  const nn = nossoNumeroImpresso(b);
  const ag = agenciaConta(b.carteira?.negociacao);
  const enderecoPagador = [
    [pag.logradouro, pag.numero].filter(Boolean).join(", "),
    pag.complemento, pag.bairro,
    [pag.cidade, pag.uf].filter(Boolean).join("/"),
    pag.cep ? `CEP ${dig(pag.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
  ].filter(Boolean).join(" · ");
  const instrucoes: string[] = [];
  if (multaPct) instrucoes.push(`Após o vencimento, multa de ${String(multaPct).replace(".", ",")}%${b.multa_cent ? ` (${brl(b.multa_cent / 100)})` : ""}.`);
  if (jurosMesPct) instrucoes.push(`Juros de ${String(jurosMesPct).replace(".", ",")}% ao mês${b.juros_dia_cent ? ` (${brl(b.juros_dia_cent / 100)} por dia de atraso)` : ""}.`);
  instrucoes.push("Pagável também por Pix, pelo QR Code ao lado, até o vencimento.");

  // Uma célula da ficha: rótulo pequeno em cima, valor embaixo.
  const celula = (x: number, y: number, w: number, h: number, rotulo: string, valor: string, o?: { direita?: boolean; negrito?: boolean; tam?: number }) => {
    doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(x, y, w, h);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(90);
    doc.text(rotulo, x + 1.2, y + 2.6);
    doc.setFont("helvetica", o?.negrito ? "bold" : "normal"); doc.setFontSize(o?.tam ?? 9); doc.setTextColor(0);
    const linhas = doc.splitTextToSize(valor || "", w - 2.4) as string[];
    doc.text(linhas.slice(0, Math.max(1, Math.floor((h - 3) / 3.6))), o?.direita ? x + w - 1.2 : x + 1.2, y + 6.4, { align: o?.direita ? "right" : "left" });
  };
  const cabecalhoBanco = (y: number, texto: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0);
    doc.text("Bradesco", X, y);
    doc.setLineWidth(0.5); doc.line(X + 27, y - 5, X + 27, y + 1); doc.line(X + 45, y - 5, X + 45, y + 1);
    doc.text("237-2", X + 29.5, y);
    doc.setFontSize(texto.length > 40 ? 10 : 11); doc.text(texto, X + L, y, { align: "right" });
    doc.setLineWidth(0.5); doc.line(X, y + 1.5, X + L, y + 1.5);
  };

  // ── Recibo do pagador ──────────────────────────────────────────────────────
  let y = 16;
  if (b.ambiente === "sandbox") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(200, 60, 40);
    doc.text("TESTE (SANDBOX BRADESCO) — SEM VALOR DE PAGAMENTO", X + L / 2, 9, { align: "center" });
  }
  cabecalhoBanco(y, "Recibo do pagador");
  y += 3;
  celula(X, y, 110, 9, "Beneficiário", `${benef}${benefDoc ? ` · ${benefDoc}` : ""}`, { tam: 8 });
  celula(X + 110, y, 38, 9, "Agência / Código do beneficiário", ag);
  celula(X + 148, y, 38, 9, "Vencimento", dataBR(b.vencimento), { direita: true, negrito: true });
  y += 9;
  celula(X, y, 110, 9, "Pagador", `${pag.nome ?? ""}${pag.documento ? ` · ${formatarDoc(pag.documento)}` : ""}`, { tam: 8 });
  celula(X + 110, y, 38, 9, "Nosso número", nn);
  celula(X + 148, y, 38, 9, "Valor do documento", brl(Number(b.valor)), { direita: true, negrito: true });
  y += 9;
  celula(X, y, 110, 9, "Nº do documento", b.seu_numero);
  celula(X + 110, y, 76, 9, "Linha digitável", linha, { tam: 6.8 });
  y += 14;
  doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(150); doc.line(X, y, X + L, y); doc.setLineDashPattern([], 0);
  doc.setFontSize(6); doc.setTextColor(120); doc.text("Corte na linha pontilhada", X + L, y - 1, { align: "right" });

  // ── Ficha de compensação ───────────────────────────────────────────────────
  y += 12;
  cabecalhoBanco(y, linha || "Linha digitável indisponível");
  y += 3;
  const W1 = 140, W2 = L - W1;
  celula(X, y, W1, 9, "Local de pagamento", "Pagável preferencialmente na rede Bradesco ou Bradesco Expresso. Também por Pix.");
  celula(X + W1, y, W2, 9, "Vencimento", dataBR(b.vencimento), { direita: true, negrito: true });
  y += 9;
  celula(X, y, W1, 9, "Beneficiário", `${benef}${benefDoc ? ` · ${benefDoc}` : ""}`);
  celula(X + W1, y, W2, 9, "Agência / Código do beneficiário", ag, { direita: true });
  y += 9;
  celula(X, y, 28, 9, "Data do documento", dataBR(b.emissao));
  celula(X + 28, y, 42, 9, "Nº do documento", b.seu_numero);
  celula(X + 70, y, 20, 9, "Espécie doc.", "DM");
  celula(X + 90, y, 14, 9, "Aceite", "N");
  celula(X + 104, y, 36, 9, "Data do processamento", dataBR(b.criado_em));
  celula(X + W1, y, W2, 9, "Nosso número", nn, { direita: true });
  y += 9;
  celula(X, y, 28, 9, "Uso do banco", "");
  celula(X + 28, y, 18, 9, "Carteira", String(b.carteira?.carteira ?? 9).padStart(2, "0"));
  celula(X + 46, y, 16, 9, "Espécie", "R$");
  celula(X + 62, y, 36, 9, "Quantidade", "");
  celula(X + 98, y, 42, 9, "Valor", "");
  celula(X + W1, y, W2, 9, "(=) Valor do documento", brl(Number(b.valor)), { direita: true, negrito: true });
  y += 9;
  // Instruções à esquerda (alto), os campos de dedução à direita.
  const hInstr = 36;
  celula(X, y, W1, hInstr, "Instruções (texto de responsabilidade do beneficiário)", instrucoes.join("\n"), { tam: 8 });
  const passos = ["(-) Desconto / Abatimento", "(-) Outras deduções", "(+) Mora / Multa", "(+) Outros acréscimos", "(=) Valor cobrado"];
  passos.forEach((r, i) => celula(X + W1, y + i * (hInstr / 5), W2, hInstr / 5, r, ""));
  y += hInstr;
  // Pagador, com o QR do Pix à direita.
  const hPag = 20;
  celula(X, y, W1, hPag, "Pagador", `${pag.nome ?? ""}${pag.documento ? ` · ${formatarDoc(pag.documento)}` : ""}\n${enderecoPagador}`, { tam: 8.5 });
  doc.setDrawColor(120); doc.rect(X + W1, y, W2, hPag);
  doc.setFontSize(6); doc.setTextColor(90); doc.text("Código de baixa", X + W1 + 1.2, y + 2.6);
  y += hPag;

  // Código de barras à esquerda; QR do Pix à direita, na mesma faixa.
  y += 4;
  if (b.codigo_barras && dig(b.codigo_barras).length === 44) {
    desenharBarras(doc, b.codigo_barras, X, y, 103, 13);
  } else {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(200, 60, 40);
    doc.text("Código de barras indisponível: pague pela linha digitável ou pelo Pix.", X, y + 6);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(120);
  doc.text("Autenticação mecânica — Ficha de compensação", X, y + 17);
  if (b.pix_copia_cola) {
    const qr = await QRCode.toDataURL(b.pix_copia_cola, { margin: 0, width: 320, errorCorrectionLevel: "M" });
    const lado = 30, qx = X + L - lado;
    doc.addImage(qr, "PNG", qx, y, lado, lado);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text("Pague com Pix", qx - 3, y + 4, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(["Aponte a câmera do app", "do seu banco para o QR Code."], qx - 3, y + 8, { align: "right" });

    // Copia-e-cola por extenso: quem paga pelo celular copia daqui.
    y += lado + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text("Pix copia e cola", X, y);
    doc.setFont("courier", "normal"); doc.setFontSize(6.5); doc.setTextColor(40);
    doc.text(doc.splitTextToSize(b.pix_copia_cola, L) as string[], X, y + 3.5);
  }

  const nome = `boleto-${(pag.nome ?? "cliente").toString().replace(/[^\w]+/g, "-").slice(0, 30)}-${b.vencimento}.pdf`;
  if (opts?.download !== false) doc.save(nome);
  return { base64: doc.output("datauristring").split(",")[1] ?? "", nome };
}
