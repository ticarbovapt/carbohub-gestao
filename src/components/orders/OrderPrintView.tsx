/**
 * OrderPrintView — Documento de Pedido de Compra no padrão SAP / OutBuyCenter
 *
 * Replicar layout do PDF Brisanet:
 * - Cabeçalho: FATURAR PARA | ENTREGAR EM | FORNECEDOR
 * - Tabela de itens com campos fiscais (NCM, unidade, impostos, data entrega)
 * - Totais + Observações
 *
 * Usar via rota /orders/:id/print → window.print() automático
 */

import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CarbozeOrder, OrderItem } from "@/hooks/useCarbozeOrders";

// ─── Dados fixos da Carbo (FORNECEDOR) ───────────────────────────────────────

const FORNECEDOR = {
  name:    "CARBO SOLUCOES LTDA",
  cnpj:    "36.060.692/0001-00",
  address: "R ALMIRANTE TAMANDARE 196, 196 - LAGOA NOVA. Natal/RN",
  contact: "CARBO SOLUCOES LTDA",
  email:   "ADMINISTRATIVO@CARBOVAPT.COM.BR",
  phone:   "(84) 3207-5055",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: number | undefined | null, decimals = 2) {
  if (value == null) return "0,00";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(value: number | undefined | null) {
  return `${fmt(value ?? 0, 2)}%`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OrderPrintViewProps {
  order: CarbozeOrder;
}

export function OrderPrintView({ order }: OrderPrintViewProps) {
  const items: OrderItem[] = Array.isArray(order.items)
    ? (order.items as unknown as OrderItem[])
    : [];

  const billingName    = order.customer_name;
  const billingCnpj    = (order as any).cnpj ?? "";
  const billingIe      = order.ie ?? "";
  const billingAddr    = order.billing_address || order.delivery_address || "";
  const billingCity    = order.billing_city || order.delivery_city || "";
  const billingState   = order.billing_state || order.delivery_state || "";
  const billingZip     = order.billing_zip || order.delivery_zip || "";
  const billingContact = order.billing_contact_name ?? "";
  const billingEmail   = order.billing_contact_email ?? order.customer_email ?? "";

  const deliveryAddr   = order.delivery_address || "";
  const deliveryCity   = order.delivery_city || "";
  const deliveryState  = order.delivery_state || "";
  const deliveryZip    = order.delivery_zip || "";
  const paymentTerms   = order.payment_terms ?? "";
  const freightType    = order.freight_type ?? "";

  const poNumber = order.po_number || order.order_number;
  const poDate   = order.po_date || order.created_at;

  return (
    <div
      id="order-print-root"
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "11px",
        color: "#000",
        backgroundColor: "#fff",
        padding: "20px",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        {/* Logo */}
        <div style={{ fontWeight: "bold", fontSize: "20px", color: "#1a7a4a" }}>
          🌿 Carbo
        </div>
        {/* Número do pedido */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>PEDIDO</div>
          <div style={{ fontWeight: "bold", fontSize: "22px" }}>{poNumber}</div>
          <div style={{ fontSize: "11px" }}>de {fmtDate(poDate)}</div>
        </div>
      </div>

      {/* ── 3 colunas: FATURAR PARA | ENTREGAR EM | FORNECEDOR ──────────────── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <tbody>
          <tr>
            <td style={{ width: "33%", border: "1px solid #ccc", padding: "8px", verticalAlign: "top" }}>
              <div style={{ fontWeight: "bold", fontSize: "10px", color: "#555", marginBottom: "4px" }}>FATURAR PARA</div>
              <div style={{ fontWeight: "bold" }}>{billingName}</div>
              {billingCnpj && (
                <div>{billingCnpj}{billingIe ? `  I.E.: ${billingIe}` : ""}</div>
              )}
              {billingAddr && <div>{billingAddr}</div>}
              {(billingCity || billingZip) && (
                <div>CEP {billingZip}. {billingCity}/{billingState}</div>
              )}
              {billingContact && <div>Responsável: {billingContact}</div>}
              {billingEmail && <div style={{ color: "#1a6bb5" }}>{billingEmail}</div>}
            </td>

            <td style={{ width: "34%", border: "1px solid #ccc", padding: "8px", verticalAlign: "top" }}>
              <div style={{ fontWeight: "bold", fontSize: "10px", color: "#555", marginBottom: "4px" }}>ENTREGAR EM</div>
              <div style={{ fontWeight: "bold" }}>{billingName}{deliveryCity ? `, ${deliveryCity}/${deliveryState}` : ""}</div>
              {billingCnpj && <div>{billingCnpj}</div>}
              {deliveryAddr && <div>{deliveryAddr}</div>}
              {(deliveryCity || deliveryZip) && (
                <div>CEP: {deliveryZip}. {deliveryCity}/{deliveryState}</div>
              )}
              {paymentTerms && <div>Condição de Pagamento: {paymentTerms}</div>}
              {freightType && <div>Frete {freightType}</div>}
            </td>

            <td style={{ width: "33%", border: "1px solid #ccc", padding: "8px", verticalAlign: "top" }}>
              <div style={{ fontWeight: "bold", fontSize: "10px", color: "#555", marginBottom: "4px" }}>FORNECEDOR</div>
              <div style={{ fontWeight: "bold" }}>{FORNECEDOR.name}</div>
              <div>{FORNECEDOR.cnpj}</div>
              <div>{FORNECEDOR.address}</div>
              <div>Responsável: {FORNECEDOR.contact}</div>
              <div style={{ color: "#1a6bb5" }}>{FORNECEDOR.email}</div>
              <div>{FORNECEDOR.phone}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Aviso ──────────────────────────────────────────────────────────── */}
      <div style={{
        border: "1px solid #e0a800",
        padding: "6px 10px",
        marginBottom: "12px",
        fontWeight: "bold",
        color: "#b8860b",
        fontSize: "11px",
      }}>
        ATENÇÃO: Mencionar em sua Nota Fiscal o número do Pedido de Compra e o item correspondente.
      </div>

      {/* ── Tabela de itens ────────────────────────────────────────────────── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", fontSize: "10px" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5", textAlign: "left" }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Qtd</th>
            <th style={thStyle}>Und</th>
            <th style={thStyle}>Código</th>
            <th style={{ ...thStyle, width: "28%" }}>Descrição</th>
            <th style={thStyle}>Data de entrega</th>
            <th style={thStyle}>R$ Unit</th>
            <th style={thStyle}>R$ Frete</th>
            <th style={{ ...thStyle, textAlign: "center" }}>IMPOSTOS</th>
            <th style={thStyle}>R$ Total</th>
            <th style={thStyle}>R$ Desconto</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={11} style={{ ...tdStyle, textAlign: "center", color: "#888", fontStyle: "italic" }}>
                Nenhum item cadastrado
              </td>
            </tr>
          ) : (
            items.map((item, idx) => {
              const grossVal = item.gross_value ?? (item.quantity * item.unit_price);
              return (
                <tr key={idx} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <td style={tdStyle}>{idx + 1}</td>
                  <td style={tdStyle}>{fmt(item.quantity, 4)}</td>
                  <td style={tdStyle}>{item.unit_code || "UN"}</td>
                  <td style={tdStyle}>{item.client_code || "—"}</td>
                  <td style={{ ...tdStyle, lineHeight: "1.4" }}>
                    <div style={{ fontWeight: "bold" }}>{item.name}</div>
                    {item.cost_center && (
                      <div style={{ marginTop: "2px" }}>
                        <strong>Motivo:</strong> {item.cost_center}
                      </div>
                    )}
                    {item.ncm && (
                      <div><strong>NCM:</strong> {item.ncm}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: item.delivery_date ? "#1a7a4a" : undefined }}>
                    {item.delivery_date ? (
                      <>
                        {fmtDate(item.delivery_date)}
                        <div style={{ fontSize: "9px", color: "#1a7a4a" }}>Entrega autorizada para essa data</div>
                      </>
                    ) : "—"}
                  </td>
                  <td style={tdStyle}>{fmt(item.unit_price, 4)}</td>
                  <td style={tdStyle}>{fmt(item.freight_value, 4)}</td>
                  <td style={{ ...tdStyle, fontSize: "9px" }}>
                    <div>IPI: {fmtPct(item.ipi_pct)}</div>
                    <div>ICMS: {fmtPct(item.icms_pct)}</div>
                    <div>Desonera. ICMS: {fmtPct(item.icms_desone_pct)}</div>
                    <div>ST: {fmtPct(item.st_pct)}</div>
                    <div>Base ST retido: {fmtPct(item.st_base_ret_pct)}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(item.total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(grossVal)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* ── Totais ─────────────────────────────────────────────────────────── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "11px" }}>
        <tbody>
          <tr>
            <td style={{ width: "60%" }} />
            <td style={{ textAlign: "right", fontWeight: "bold", padding: "4px 8px" }}>VALOR TOTAL R$</td>
            <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: "bold" }}>{fmt(order.total)}</td>
          </tr>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <td />
            <td style={{ textAlign: "right", fontWeight: "bold", padding: "4px 8px" }}>VALOR TOTAL DO PEDIDO R$</td>
            <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: "bold" }}>{fmt(order.total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Observações ────────────────────────────────────────────────────── */}
      <div style={{ border: "1px solid #ddd", padding: "10px", fontSize: "11px" }}>
        <div style={{ marginBottom: "6px" }}>
          <strong>OBSERVAÇÕES DO COMPRADOR:</strong>
          <div style={{ marginTop: "2px", whiteSpace: "pre-wrap" }}>{order.buyer_notes || ""}</div>
        </div>
        {order.general_notes && (
          <div>
            <strong>OBSERVAÇÕES GERAIS:</strong>
            <div style={{ marginTop: "2px", whiteSpace: "pre-wrap" }}>{order.general_notes}</div>
          </div>
        )}
        {!order.buyer_notes && !order.general_notes && (
          <div style={{ color: "#888", fontStyle: "italic" }}>Sem observações.</div>
        )}
      </div>
    </div>
  );
}

// ─── Estilos inline para células da tabela ────────────────────────────────────

const thStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "5px 6px",
  fontWeight: "bold",
  fontSize: "10px",
  verticalAlign: "bottom",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  padding: "5px 6px",
  verticalAlign: "top",
};
