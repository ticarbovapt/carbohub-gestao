import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-grupo-carbo.png";

// Orçamento em PDF com a identidade do Grupo Carbo.
// ⚠️ DADOS DA EMPRESA: confirme/ajuste em COMPANY abaixo (CNPJ, endereço, contato).
const COMPANY = {
  name: "Carbo Soluções LTDA",
  cnpj: "36.060.692/0003-72",
  endereco: "Rua Coronel José Guimarães, 299",
  cidade: "Lagoa Nova · Natal - RN · CEP 59054-795",
  telefone: "(84) 3207-5055",
  email: "administrativo@carbovapt.com.br",
  site: "carboze.com.br",
};

const GREEN: [number, number, number] = [16, 122, 87];

interface QuoteItem {
  name?: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  bonus_quantity?: number;
}

type Endereco = Record<string, unknown> | null | undefined;

export interface QuotePdfData {
  order_number?: string | null;
  customer_name?: string | null;
  legal_name?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  endereco?: Endereco;               // endereço de entrega
  endereco_faturamento?: Endereco;   // se diferente da entrega; null = mesmo
  vendedor_name?: string | null;
  payment_terms?: string | null;     // forma de pagamento escolhida
  items?: unknown;
  subtotal?: number | null;
  discount?: number | null;          // desconto aplicado (R$)
  discount_percent?: number | null;  // % do desconto (para exibição)
  total?: number | null;
  created_at?: string | null;
  notes?: string | null;
  validityDays?: number;
}

// Modalidades exibidas como "aceitas" no PDF. NÃO listamos "Boleto faturado" aqui
// de propósito (para não induzir o cliente); ele continua selecionável no Vender e,
// se escolhido, aparece em "Forma escolhida".
const FORMAS_ACEITAS = "PIX · Boleto à vista · Cartão de débito · Cartão de crédito (até 12x)";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");

// Carrega a imagem preservando as dimensões naturais (para não esticar a logo).
function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const s = (e: Endereco, k: string) => (e && e[k] != null ? String(e[k]) : "");
function fmtAddrLines(e: Endereco): string[] {
  if (!e) return [];
  const l1 = [s(e, "logradouro"), s(e, "numero")].filter(Boolean).join(", ");
  const l2 = [s(e, "bairro"), [s(e, "cidade"), s(e, "uf")].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const l3 = s(e, "cep") ? `CEP ${s(e, "cep")}` : "";
  return [l1, l2, l3].filter(Boolean);
}

export async function generateQuotePdf(order: QuotePdfData) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  // ── Cabeçalho: logo (proporção correta) ────────────────────────────────────
  const logo = await loadImage(logoUrl);
  let belowLogoY = 28;
  if (logo) {
    const targetH = 28;
    let w = targetH * (logo.w / logo.h);
    let h = targetH;
    const maxW = 95;
    if (w > maxW) { w = maxW; h = maxW * (logo.h / logo.w); }
    doc.addImage(logo.dataUrl, "PNG", M, 11, w, h);
    belowLogoY = 11 + h + 4;
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(COMPANY.name, M, 20);
    belowLogoY = 26;
  }

  // Título + meta (direita)
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...GREEN);
  doc.text("ORÇAMENTO", pageW - M, 19, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  const created = dateBR(order.created_at);
  const validity = order.validityDays ?? 7;
  const validUntil = new Date(order.created_at ? new Date(order.created_at) : new Date());
  validUntil.setDate(validUntil.getDate() + validity);
  [
    order.order_number ? `Nº ${order.order_number}` : "",
    `Data: ${created}`,
    `Validade: ${validity} dias (até ${validUntil.toLocaleDateString("pt-BR")})`,
  ].filter(Boolean).forEach((line, i) => doc.text(line, pageW - M, 26 + i * 4.5, { align: "right" }));
  doc.setTextColor(0);

  // Dados da empresa (abaixo da logo)
  doc.setFontSize(7.5); doc.setTextColor(120);
  [
    `${COMPANY.name} · CNPJ ${COMPANY.cnpj}`,
    `${COMPANY.endereco} · ${COMPANY.cidade}`,
    `${COMPANY.telefone} · ${COMPANY.email} · ${COMPANY.site}`,
  ].forEach((line, i) => doc.text(line, M, belowLogoY + i * 3.6));
  doc.setTextColor(0);

  // Divisória
  let y = Math.max(belowLogoY + 12, 40);
  doc.setDrawColor(225); doc.line(M, y, pageW - M, y);
  y += 7;

  // ── Blocos do comprador (2 colunas) ────────────────────────────────────────
  const colGap = 6;
  const colW = (pageW - M * 2 - colGap) / 2;
  const leftX = M;
  const rightX = M + colW + colGap;

  const blockHeader = (x: number, yy: number, title: string) => {
    doc.setFillColor(...GREEN); doc.rect(x, yy, colW, 6, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text(title, x + 3, yy + 4.1);
    doc.setTextColor(0);
  };

  // Esquerda: dados do cliente
  blockHeader(leftX, y, "DADOS DO CLIENTE");
  let ly = y + 11;
  const clienteFields: [string, string][] = [
    ["Nome / Razão Social", order.customer_name || order.legal_name || "—"],
    ["CNPJ / CPF", order.cnpj || "—"],
    ["Inscrição Estadual", order.ie || "—"],
    ["Vendedor", order.vendedor_name || "—"],
  ];
  clienteFields.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(label, leftX + 3, ly);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20);
    doc.text(doc.splitTextToSize(String(val), colW - 6), leftX + 3, ly + 4.2);
    ly += 10.5;
  });

  // Direita: endereço de entrega (+ faturamento se diferente)
  blockHeader(rightX, y, "ENDEREÇO DE ENTREGA");
  let ry = y + 11;
  const entrega = fmtAddrLines(order.endereco);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(40);
  (entrega.length ? entrega : ["—"]).forEach((l) => { doc.text(l, rightX + 3, ry); ry += 4.6; });
  ry += 3;

  const fat = fmtAddrLines(order.endereco_faturamento);
  if (order.endereco_faturamento && fat.length) {
    blockHeader(rightX, ry, "ENDEREÇO DE FATURAMENTO");
    ry += 11;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(40);
    fat.forEach((l) => { doc.text(l, rightX + 3, ry); ry += 4.6; });
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text("Faturamento: mesmo endereço da entrega", rightX + 3, ry);
    ry += 4;
  }
  doc.setTextColor(0); doc.setFont("helvetica", "normal");

  // ── Itens ──────────────────────────────────────────────────────────────────
  y = Math.max(ly, ry) + 4;
  const items = (Array.isArray(order.items) ? order.items : []) as QuoteItem[];
  const body = items
    .filter((it) => (it.name || it.product_code) && (it.quantity ?? 0) > 0)
    .map((it) => {
      const qty = it.quantity ?? 0;
      const unit = it.unit_price ?? 0;
      const bonus = it.bonus_quantity ?? 0;
      const nome = (it.name || it.product_code || "—") + (bonus > 0 ? `  (+${bonus} bonif.)` : "");
      return [nome, String(qty), brl(unit), brl(qty * unit)];
    });

  autoTable(doc, {
    startY: y,
    head: [["Produto", "Qtd", "Valor Unit.", "Total"]],
    body: body.length ? body : [["Nenhum item", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: GREEN, halign: "left", fontSize: 9 },
    columnStyles: {
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "right", cellWidth: 34 },
      3: { halign: "right", cellWidth: 34 },
    },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: M, right: M },
  });

  // ── Total (com Subtotal + Desconto, quando houver) ──────────────────────────
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const discount = Number(order.discount ?? 0);
  const subtotal = Number(order.subtotal ?? order.total ?? 0);
  const total = order.total ?? order.subtotal ?? 0;
  let ty = afterTable + 6;
  // Linhas de Subtotal e Desconto só aparecem quando há desconto (evita poluir).
  if (discount > 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Subtotal: ${brl(subtotal)}`, pageW - M - 3, ty + 4, { align: "right" });
    ty += 5;
    const pctTxt = order.discount_percent ? ` (${order.discount_percent}%)` : "";
    doc.text(`Desconto${pctTxt}: - ${brl(discount)}`, pageW - M - 3, ty + 4, { align: "right" });
    ty += 6;
  }
  doc.setFillColor(...GREEN);
  doc.rect(pageW - M - 70, ty, 70, 9, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`Total: ${brl(total)}`, pageW - M - 3, ty + 6, { align: "right" });
  doc.setTextColor(0); doc.setFont("helvetica", "normal");
  ty += 9;

  // ── Pagamento ────────────────────────────────────────────────────────────────
  ty += 10;
  doc.setFillColor(...GREEN); doc.rect(M, ty, pageW - M * 2, 6, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("PAGAMENTO", M + 3, ty + 4.1);
  doc.setTextColor(0); ty += 11;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Formas aceitas:", M, ty);
  doc.setTextColor(40);
  doc.text(doc.splitTextToSize(FORMAS_ACEITAS, pageW - M * 2 - 30), M + 26, ty);
  ty += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20);
  doc.text(`Forma escolhida: ${order.payment_terms || "—"}`, M, ty);
  doc.setTextColor(0); doc.setFont("helvetica", "normal");
  ty += 2;

  // ── Observações ──────────────────────────────────────────────────────────────
  if (order.notes) {
    ty += 10;
    doc.setFontSize(9); doc.setTextColor(90); doc.setFont("helvetica", "bold");
    doc.text("Observações", M, ty);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(order.notes, pageW - M * 2);
    doc.text(wrapped, M, ty + 5);
    doc.setTextColor(0);
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setTextColor(150);
  doc.text(
    "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    pageW / 2, pageH - 10, { align: "center" },
  );

  doc.save(`orcamento-${order.order_number || "carbo"}.pdf`);
}
