import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-grupo-carbo.png";

// Orçamento em PDF com a identidade do Grupo Carbo (logo + dados da empresa).
// ⚠️ DADOS DA EMPRESA: confirme/ajuste em COMPANY abaixo (CNPJ, endereço, contato).
const COMPANY = {
  name: "Carbo Soluções LTDA",
  cnpj: "",                                 // TODO: preencher o nº do CNPJ
  endereco: "Rua Coronel José Guimarães, 299",
  cidade: "Lagoa Nova · Natal - RN · CEP 59054-795",
  telefone: "(84) 3207-5055",
  email: "administrativo@carbovapt.com.br",
  site: "carboze.com.br",
};

interface QuoteItem {
  name?: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  bonus_quantity?: number;
}

export interface QuotePdfData {
  order_number?: string | null;
  customer_name?: string | null;
  legal_name?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  vendedor_name?: string | null;
  items?: unknown;
  subtotal?: number | null;
  total?: number | null;
  created_at?: string | null;
  notes?: string | null;
  validityDays?: number;
}

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateQuotePdf(order: QuotePdfData) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // ── Cabeçalho: logo + dados da empresa | "ORÇAMENTO" + nº/data/validade ──────
  const logo = await loadImageDataUrl(logoUrl);
  let headerY = 16;
  if (logo) {
    // mantém proporção aproximada da logo (largura ~38mm)
    doc.addImage(logo, "PNG", marginX, 12, 38, 14);
    headerY = 32;
  } else {
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY.name, marginX, 20);
    headerY = 28;
  }

  // Dados da empresa (abaixo da logo)
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  [
    COMPANY.cnpj ? `${COMPANY.name} · CNPJ ${COMPANY.cnpj}` : COMPANY.name,
    `${COMPANY.endereco} · ${COMPANY.cidade}`,
    `${COMPANY.telefone} · ${COMPANY.email} · ${COMPANY.site}`,
  ].forEach((line, i) => doc.text(line, marginX, headerY + i * 4));
  doc.setTextColor(0);

  // Bloco à direita
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 122, 87);
  doc.text("ORÇAMENTO", pageW - marginX, 18, { align: "right" });
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const created = dateBR(order.created_at);
  const validity = order.validityDays ?? 7;
  const validUntil = new Date(order.created_at ? new Date(order.created_at) : new Date());
  validUntil.setDate(validUntil.getDate() + validity);
  doc.setTextColor(120);
  [
    order.order_number ? `Nº ${order.order_number}` : "",
    `Data: ${created}`,
    `Validade: ${validity} dias (até ${validUntil.toLocaleDateString("pt-BR")})`,
  ].filter(Boolean).forEach((line, i) => doc.text(line, pageW - marginX, 24 + i * 4, { align: "right" }));
  doc.setTextColor(0);

  const lineY = Math.max(headerY + 14, 44);
  doc.setDrawColor(220);
  doc.line(marginX, lineY, pageW - marginX, lineY);

  // ── Cliente ──────────────────────────────────────────────────────────────────
  let y = lineY + 9;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  const clientLines = [
    order.customer_name || order.legal_name || "—",
    order.cnpj ? `CNPJ/CPF: ${order.cnpj}` : "",
    order.ie ? `Inscrição Estadual: ${order.ie}` : "",
    order.vendedor_name ? `Vendedor: ${order.vendedor_name}` : "",
  ].filter(Boolean);
  doc.setFontSize(9);
  clientLines.forEach((line) => { doc.text(String(line), marginX, y); y += 5; });

  // ── Itens ────────────────────────────────────────────────────────────────────
  const items = (Array.isArray(order.items) ? order.items : []) as QuoteItem[];
  const body = items
    .filter((it) => (it.name || it.product_code) && (it.quantity ?? 0) > 0)
    .map((it) => {
      const qty = it.quantity ?? 0;
      const unit = it.unit_price ?? 0;
      return [it.name || it.product_code || "—", String(qty), brl(unit), brl(qty * unit)];
    });

  autoTable(doc, {
    startY: y + 3,
    head: [["Produto", "Qtd", "Valor Unit.", "Total"]],
    body: body.length ? body : [["Nenhum item", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: [16, 122, 87], halign: "left" },
    columnStyles: {
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 32 },
    },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: marginX, right: marginX },
  });

  // ── Total ──────────────────────────────────────────────────────────────────
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const total = order.total ?? order.subtotal ?? 0;
  let ty = afterTable + 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${brl(total)}`, pageW - marginX, ty, { align: "right" });
  doc.setFont("helvetica", "normal");

  // ── Observações ──────────────────────────────────────────────────────────────
  if (order.notes) {
    ty += 10;
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text("Observações:", marginX, ty);
    const wrapped = doc.splitTextToSize(order.notes, pageW - marginX * 2);
    doc.text(wrapped, marginX, ty + 5);
    doc.setTextColor(0);
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    pageW / 2, pageH - 10, { align: "center" },
  );

  doc.save(`orcamento-${order.order_number || "carbo"}.pdf`);
}
