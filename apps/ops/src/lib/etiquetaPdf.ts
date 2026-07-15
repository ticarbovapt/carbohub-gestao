import jsPDF from "jspdf";

// ─────────────────────────────────────────────────────────────────────────────
// Etiqueta de transporte (10×15 cm) — gerador próprio (a do Bling é feia).
// Uma PÁGINA por volume, com "VOLUME X/N", dados de remetente/destinatário,
// NF, peso e um código de barras CODE128 vetorial (nítido p/ impressora térmica).
// ─────────────────────────────────────────────────────────────────────────────

// AJUSTÁVEL — dados fixos do remetente (confirmar com o financeiro/fiscal).
const REMETENTE = {
  nome: "CARBO SOLUÇÕES LTDA",
  cnpj: "36.060.692/0001-00",
  endereco: "Rua Almirante Tamandaré, 196 - Lagoa Nova",
  cidadeUf: "Natal - RN",
  cep: "59.054-560",
};

export interface EtiquetaData {
  order_number: string;
  invoice_number: string | null;
  cnpj: string | null;
  customer_name: string;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  volumes: number;
  weightKg: number | null;
  chaveAcesso?: string | null;
}

// ── CODE128 ──────────────────────────────────────────────────────────────────
// Tabela oficial de padrões (larguras de barra/espaço, 6 módulos; índice 106 =
// stop com 7 módulos). Índice = valor do símbolo (0..106).
const C128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

/**
 * Codifica `data` em símbolos CODE128 (com start, dígito verificador módulo 103
 * e stop). Usa Code Set C quando é tudo dígito e comprimento par (compacto p/
 * chave da NF de 44 díg.); senão Code Set B (letras/números do nº do pedido).
 */
function encode128(data: string): number[] {
  const allDigits = /^\d+$/.test(data);
  const useC = allDigits && data.length >= 2 && data.length % 2 === 0;
  const codes: number[] = [];
  if (useC) {
    codes.push(START_C);
    for (let i = 0; i < data.length; i += 2) codes.push(parseInt(data.substr(i, 2), 10));
  } else {
    codes.push(START_B);
    for (const ch of data) {
      const v = ch.charCodeAt(0) - 32; // ASCII 32..126 → 0..94 (Code Set B)
      codes.push(v >= 0 && v <= 94 ? v : 0); // caractere fora da faixa → espaço
    }
  }
  // Dígito verificador: (start + Σ i·valor_i) mod 103.
  let sum = codes[0];
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103);
  codes.push(STOP);
  return codes;
}

/**
 * Desenha o código de barras como retângulos vetoriais preenchidos, centralizado
 * na largura útil, e retorna a altura ocupada (barras + rótulo). Zona de silêncio
 * de 10 módulos de cada lado embutida no cálculo do módulo.
 */
function drawBarcode(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  barHeight: number,
): number {
  const codes = encode128(value);
  // Total de módulos: soma das larguras de todos os padrões + zonas de silêncio.
  let totalModules = 20; // 10 módulos de quiet zone em cada lado
  for (const c of codes) for (const d of C128_PATTERNS[c]) totalModules += Number(d);
  const module = maxWidth / totalModules;

  doc.setFillColor(0, 0, 0);
  let cursor = x + 10 * module; // desloca pela quiet zone esquerda
  for (const c of codes) {
    const pattern = C128_PATTERNS[c];
    let bar = true; // padrões começam sempre por barra
    for (const d of pattern) {
      const w = Number(d) * module;
      if (bar) doc.rect(cursor, y, w, barHeight, "F");
      cursor += w;
      bar = !bar;
    }
  }

  // Texto legível abaixo das barras.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text(value, x + maxWidth / 2, y + barHeight + 3, { align: "center" });
  return barHeight + 5;
}

// Formata CNPJ (14 díg.) ou CPF (11 díg.); devolve original se não bater.
function fmtDoc(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v?.trim() || null;
}

// Formata CEP (8 díg.) → 00.000-000.
function fmtCep(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 8) return d.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3");
  return v?.trim() || null;
}

/**
 * Gera o PDF da etiqueta (uma página por volume) e abre em nova aba.
 * @param data dados da etiqueta
 * @param emissao data de emissão (default: agora)
 */
export function gerarEtiquetaPDF(data: EtiquetaData, emissao: Date = new Date()): void {
  const doc = new jsPDF({ unit: "mm", format: [100, 150], orientation: "portrait" });
  const W = 100;
  const M = 6;                 // margem
  const CW = W - 2 * M;        // largura útil
  const total = Math.max(1, Math.floor(data.volumes) || 1);

  const cidadeUf = [data.delivery_city, data.delivery_state].filter(Boolean).join(" / ");
  const cep = fmtCep(data.delivery_zip);
  const doc_ = fmtDoc(data.cnpj);
  const nf = data.invoice_number?.trim() || null;
  const peso = data.weightKg != null && data.weightKg > 0
    ? `${String(data.weightKg).replace(".", ",")} kg` : "—";
  const dataEmissao = emissao.toLocaleDateString("pt-BR");
  // Código de barras: chave de acesso da NF (44 díg.) quando houver; senão o pedido.
  const barcodeValue = (data.chaveAcesso && /^\d{20,}$/.test(data.chaveAcesso.replace(/\D/g, "")))
    ? data.chaveAcesso.replace(/\D/g, "")
    : (data.order_number || "SEM-PEDIDO");

  for (let vol = 1; vol <= total; vol++) {
    if (vol > 1) doc.addPage([100, 150], "portrait");
    let y = M;

    // Moldura externa.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.rect(M - 2, M - 2, CW + 4, 150 - 2 * (M - 2));

    // ── REMETENTE ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("REMETENTE", M, y + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(REMETENTE.nome, M, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(`CNPJ: ${REMETENTE.cnpj}`, M, y + 8.5);
    doc.text(REMETENTE.endereco, M, y + 11.5);
    doc.text(`${REMETENTE.cidadeUf} · CEP ${REMETENTE.cep}`, M, y + 14.5);
    y += 18;

    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    y += 4;

    // ── NF + PESO + VOLUME (faixa de destaque) ──
    // Caixa VOLUME grande no canto superior direito.
    const volBoxW = 30, volBoxH = 16;
    const volBoxX = W - M - volBoxW, volBoxY = y - 1;
    doc.setLineWidth(0.4);
    doc.rect(volBoxX, volBoxY, volBoxW, volBoxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("VOLUME", volBoxX + volBoxW / 2, volBoxY + 4, { align: "center" });
    doc.setFontSize(15);
    doc.text(`${vol}/${total}`, volBoxX + volBoxW / 2, volBoxY + 12.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("NOTA FISCAL", M, y + 2);
    doc.setFontSize(13);
    doc.text(nf || "—", M, y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("PESO BRUTO", M, y + 13.5);
    doc.setFontSize(11);
    doc.text(peso, M, y + 18.5);
    y += 22;

    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    y += 4;

    // ── DESTINATÁRIO ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("DESTINATÁRIO", M, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const nomeLines = doc.splitTextToSize(data.customer_name || "—", CW);
    doc.text(nomeLines, M, y);
    y += nomeLines.length * 4.6 + 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const addrLines: string[] = [];
    if (data.delivery_address) addrLines.push(...doc.splitTextToSize(data.delivery_address, CW));
    if (cidadeUf) addrLines.push(cidadeUf);
    if (cep) addrLines.push(`CEP ${cep}`);
    for (const ln of addrLines) { doc.text(ln, M, y); y += 4; }
    if (doc_) {
      doc.setFont("helvetica", "bold");
      doc.text(`CNPJ/CPF: ${doc_}`, M, y);
      y += 4;
    }

    // ── Código de barras (ancorado na parte de baixo) ──
    const barcodeH = 20;
    const barcodeY = 150 - M - 4 - barcodeH - 5; // deixa espaço p/ rodapé
    doc.setLineWidth(0.2);
    doc.line(M, barcodeY - 3, W - M, barcodeY - 3);
    drawBarcode(doc, barcodeValue, M, barcodeY, CW, barcodeH);

    // ── Rodapé ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);
    doc.text(`Pedido: ${data.order_number || "—"}`, M, 150 - M);
    doc.text(`Emissão: ${dataEmissao}`, W - M, 150 - M, { align: "right" });
  }

  // Abre em nova aba (fallback: download).
  try {
    const url = doc.output("bloburl");
    const win = window.open(url as unknown as string, "_blank");
    if (!win) doc.save(`etiqueta-${data.order_number || "pedido"}.pdf`);
  } catch {
    doc.save(`etiqueta-${data.order_number || "pedido"}.pdf`);
  }
}
