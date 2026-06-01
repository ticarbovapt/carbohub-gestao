import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Template SIMPLES de orçamento em PDF. Propositalmente enxuto — o marketing
// vai entregar o layout definitivo depois; aqui o foco é produtos + valores.

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
  vendedor_name?: string | null;
  items?: unknown;
  subtotal?: number | null;
  total?: number | null;
  created_at?: string | null;
  notes?: string | null;
  /** Validade do orçamento em dias (default 7). */
  validityDays?: number;
}

const brl = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");

export function generateQuotePdf(order: QuotePdfData) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Grupo Carbo", marginX, 20);

  doc.setFontSize(14);
  doc.setTextColor(120);
  doc.text("ORÇAMENTO", pageW - marginX, 20, { align: "right" });
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const created = dateBR(order.created_at);
  const validity = order.validityDays ?? 7;
  const validUntil = new Date(order.created_at ? new Date(order.created_at) : new Date());
  validUntil.setDate(validUntil.getDate() + validity);
  doc.setTextColor(120);
  doc.text(
    [
      order.order_number ? `Nº ${order.order_number}` : "",
      `Data: ${created}`,
      `Validade: ${validity} dias (até ${validUntil.toLocaleDateString("pt-BR")})`,
    ].filter(Boolean).join("    "),
    pageW - marginX,
    27,
    { align: "right" },
  );
  doc.setTextColor(0);

  doc.setDrawColor(220);
  doc.line(marginX, 31, pageW - marginX, 31);

  // ── Cliente ─────────────────────────────────────────────────────────────────
  let y = 40;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  const clientLines = [
    order.customer_name || order.legal_name || "—",
    order.cnpj ? `CNPJ: ${order.cnpj}` : "",
    order.vendedor_name ? `Vendedor: ${order.vendedor_name}` : "",
  ].filter(Boolean);
  doc.setFontSize(9);
  clientLines.forEach((line) => { doc.text(String(line), marginX, y); y += 5; });

  // ── Tabela de itens ──────────────────────────────────────────────────────────
  const items = (Array.isArray(order.items) ? order.items : []) as QuoteItem[];
  const body = items
    .filter((it) => (it.name || it.product_code) && (it.quantity ?? 0) > 0)
    .map((it) => {
      const qty = it.quantity ?? 0;
      const unit = it.unit_price ?? 0;
      const lineTotal = qty * unit;
      const nome = it.name || it.product_code || "—";
      const bonus = it.bonus_quantity ? `\n+ ${it.bonus_quantity} bonificação` : "";
      return [`${nome}${bonus}`, String(qty), brl(unit), brl(lineTotal)];
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

  // ── Totais ───────────────────────────────────────────────────────────────────
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const subtotal = order.subtotal ?? order.total ?? 0;
  const total = order.total ?? subtotal;
  let ty = afterTable + 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${brl(total)}`, pageW - marginX, ty, { align: "right" });
  doc.setFont("helvetica", "normal");

  // ── Observações ───────────────────────────────────────────────────────────────
  if (order.notes) {
    ty += 10;
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text("Observações:", marginX, ty);
    const wrapped = doc.splitTextToSize(order.notes, pageW - marginX * 2);
    doc.text(wrapped, marginX, ty + 5);
    doc.setTextColor(0);
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    "Este documento é um orçamento e não possui valor fiscal. Valores sujeitos a confirmação.",
    pageW / 2,
    pageH - 10,
    { align: "center" },
  );

  doc.save(`orcamento-${order.order_number || "carbo"}.pdf`);
}
