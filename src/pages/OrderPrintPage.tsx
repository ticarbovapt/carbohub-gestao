/**
 * OrderPrintPage — Página dedicada para impressão do Pedido de Compra
 * Rota: /orders/:id/print
 *
 * Abre em nova aba, carrega o pedido e dispara window.print() automaticamente.
 * CSS @media print oculta tudo exceto o documento.
 */

import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { OrderPrintView } from "@/components/orders/OrderPrintView";
import { useOrder } from "@/hooks/useCarbozeOrders";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderPrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: order, isLoading } = useOrder(id);

  // Dispara print automaticamente após carregar
  useEffect(() => {
    if (order) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [order]);

  return (
    <>
      {/* Barra de ações — oculta na impressão */}
      <div
        className="no-print flex items-center gap-3 p-3 border-b bg-muted/40 print:hidden"
        style={{ printVisibility: "hidden" } as React.CSSProperties}
      >
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Imprimir / Salvar PDF
        </Button>
        {order && (
          <span className="text-sm text-muted-foreground ml-2">
            Pedido {order.po_number || order.order_number}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 print:hidden">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !order ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground print:hidden">
          Pedido não encontrado.
        </div>
      ) : (
        <OrderPrintView order={order} />
      )}

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          .no-print,
          header, nav, aside, footer,
          [data-radix-portal] {
            display: none !important;
          }
          body {
            background: white !important;
          }
          #order-print-root {
            max-width: 100% !important;
            padding: 10px !important;
          }
        }
      `}</style>
    </>
  );
}
