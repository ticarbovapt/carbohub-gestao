import { CalendarDays, User, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVendedoresDir } from "@/hooks/useVendedoresDir";

export interface DashFilters { from: string; to: string; vendedor: string; segmento: string }
export const EMPTY_FILTERS: DashFilters = { from: "", to: "", vendedor: "all", segmento: "all" };

// Barra de filtros do Dashboard Comercial (Período · Vendedor · Canal), fiel ao
// controle. Controlada — o estado vive na página.
export function ComercialFilterBar({ filters, onChange, className = "" }: {
  filters: DashFilters; onChange: (f: DashFilters) => void; className?: string;
}) {
  const { data: vendedores = [] } = useVendedoresDir();
  const set = (patch: Partial<DashFilters>) => onChange({ ...filters, ...patch });
  const active = filters.from || filters.to || filters.vendedor !== "all" || filters.segmento !== "all";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* No celular cada filtro ocupa a própria linha (rótulo + campo esticado);
          a partir de `sm` volta a ser a barra corrida de sempre. */}
      <div className="flex flex-wrap sm:flex-nowrap w-full sm:w-auto items-center gap-x-2 gap-y-1">
        <div className="flex w-full sm:w-auto shrink-0 items-center gap-1 text-xs text-muted-foreground font-medium"><CalendarDays className="h-3.5 w-3.5" /> Período:</div>
        <Input type="date" className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-36 text-xs" title="Data início" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-36 text-xs" title="Data fim" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
      </div>

      <div className="flex w-full sm:w-auto items-center gap-2 sm:ml-2">
        <div className="flex w-20 sm:w-auto shrink-0 items-center gap-1 text-xs text-muted-foreground font-medium"><User className="h-3.5 w-3.5" /> Vendedor:</div>
        <Select value={filters.vendedor} onValueChange={(v) => set({ vendedor: v })}>
          <SelectTrigger className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-44 text-xs"><SelectValue placeholder="Todos vendedores" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name || "—"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-full sm:w-auto items-center gap-2">
        <div className="flex w-20 sm:w-auto shrink-0 items-center gap-1 text-xs text-muted-foreground font-medium"><Tag className="h-3.5 w-3.5" /> Canal:</div>
        <Select value={filters.segmento} onValueChange={(v) => set({ segmento: v })}>
          <SelectTrigger className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-44 text-xs"><SelectValue placeholder="Toda segmentação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda segmentação</SelectItem>
            <SelectItem value="consumo">Consumo (B2B)</SelectItem>
            <SelectItem value="revenda">Revenda (PDV)</SelectItem>
            <SelectItem value="online">On-line</SelectItem>
            <SelectItem value="none">Não classificado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {active && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="h-3 w-3 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}
