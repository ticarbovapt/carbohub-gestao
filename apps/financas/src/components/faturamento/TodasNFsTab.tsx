import { useState } from "react";
import { FileText } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { BaixarNFButton } from "./BaixarNFButton";
import { useAllNFes } from "@/hooks/useNfeLinking";

const fmtBRL = (v: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};

// Todas as NFs importadas do Bling — vinculadas ou não. Serve pra localizar e
// baixar QUALQUER nota rapidamente (busca por nº, cliente ou pedido).
export function TodasNFsTab() {
  const [search, setSearch] = useState("");
  const { data: nfes = [], isLoading } = useAllNFes(search);

  return (
    <CarboCard>
      <CarboCardContent className="pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Todas as notas fiscais</p>
            <p className="text-xs text-muted-foreground">Todas as NFs do Bling — baixe o PDF de qualquer uma. Busque por nº, cliente ou pedido.</p>
          </div>
          <div className="w-full sm:w-72">
            <CarboSearchInput placeholder="Buscar por nº da NF, cliente ou pedido…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
        ) : nfes.length === 0 ? (
          <CarboEmptyState icon={FileText} title="Nenhuma NF" description={search ? "Nenhuma NF encontrada." : "Nenhuma NF importada do Bling ainda."} />
        ) : (
          <CarboTable>
            <CarboTableHeader>
              <CarboTableRow>
                <CarboTableHead>NF</CarboTableHead>
                <CarboTableHead>Cliente</CarboTableHead>
                <CarboTableHead>Emissão</CarboTableHead>
                <CarboTableHead className="text-right">Valor</CarboTableHead>
                <CarboTableHead>Vínculo</CarboTableHead>
                <CarboTableHead className="text-right">Ações</CarboTableHead>
              </CarboTableRow>
            </CarboTableHeader>
            <CarboTableBody>
              {nfes.map((n) => (
                <CarboTableRow key={n.id}>
                  <CarboTableCell>
                    <CarboBadge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> {n.numero || n.bling_id}{n.serie ? `/${n.serie}` : ""}</CarboBadge>
                  </CarboTableCell>
                  <CarboTableCell className="max-w-[240px] truncate">{n.contato_nome || "—"}</CarboTableCell>
                  <CarboTableCell>{fmtDate(n.data_emissao)}</CarboTableCell>
                  <CarboTableCell className="text-right font-medium">{fmtBRL(n.valor_total)}</CarboTableCell>
                  <CarboTableCell>
                    {n.order_id ? (
                      <CarboBadge variant="success">{n.matched_order_number || "Vinculada"}</CarboBadge>
                    ) : (
                      <CarboBadge variant="warning">Sem vínculo</CarboBadge>
                    )}
                  </CarboTableCell>
                  <CarboTableCell>
                    <div className="flex items-center justify-end">
                      <BaixarNFButton blingNfId={n.bling_id} label="Baixar" />
                    </div>
                  </CarboTableCell>
                </CarboTableRow>
              ))}
            </CarboTableBody>
          </CarboTable>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}
