import { useState } from "react";
import { Plus, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRCRequests, useCreateRC } from "@/hooks/useRCPurchasing";
import { RC_STATUS_LABELS, CENTROS_CUSTO, type RCStatus } from "@/types/rcPurchasing";
import { CreateRCDialog } from "./CreateRCDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  onSelectRC: (id: string) => void;
}

export function RCRequestsList({ onSelectRC }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: rcs, isLoading } = useRCRequests(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const filtered = (rcs || []).filter(rc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (rc.produto_nome || "").toLowerCase().includes(s) ||
      rc.justificativa.toLowerCase().includes(s) ||
      rc.centro_custo.toLowerCase().includes(s);
  });

  const getStatusVariant = (status: RCStatus) => {
    const map: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
      rascunho: "secondary",
      em_cotacao: "warning",
      em_analise_ia: "default",
      aguardando_aprovacao: "warning",
      aprovada: "success",
      rejeitada: "destructive",
      convertida_pc: "default",
    };
    return map[status] || "default";
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar RC..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(RC_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 carbo-gradient text-white">
          <Plus className="h-4 w-4" />
          Nova RC
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <CarboCard>
          <CarboCardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhuma requisição encontrada</p>
          </CarboCardContent>
        </CarboCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map(rc => (
            <CarboCard
              key={rc.id}
              className="cursor-pointer hover:border-primary/30 transition-all"
              onClick={() => onSelectRC(rc.id)}
            >
              <CarboCardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{rc.produto_nome || "Sem produto"}</p>
                      <CarboBadge variant={getStatusVariant(rc.status as RCStatus)}>
                        {RC_STATUS_LABELS[rc.status as RCStatus] || rc.status}
                      </CarboBadge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{rc.justificativa}</p>
                    <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                      <span>Qtd: {rc.quantidade} {rc.unidade}</span>
                      <span>{rc.centro_custo}</span>
                      <span>{format(new Date(rc.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatCurrency(rc.valor_estimado)}</p>
                  </div>
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>
      )}

      <CreateRCDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
