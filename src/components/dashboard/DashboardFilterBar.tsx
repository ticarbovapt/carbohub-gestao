/**
 * DashboardFilterBar — Filtros compartilhados de período e vendedor
 * Usado em todos os dashboards do sistema.
 */

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, User, X, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardFilters {
  from: string;
  to: string;
  vendedor: string;  // "all" or full_name
  segmento: string;  // "all" | "consumo" | "revenda" | "online" | "none"
}

export const EMPTY_FILTERS: DashboardFilters = { from: "", to: "", vendedor: "all", segmento: "all" };

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  showVendedor?: boolean;
  showSegmento?: boolean;
  className?: string;
}

export function DashboardFilterBar({
  filters,
  onChange,
  showVendedor = false,
  showSegmento = false,
  className,
}: DashboardFilterBarProps) {
  const { data: collaborators = [] } = useQuery({
    queryKey: ["all-collaborators-for-filter"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "approved")
        .order("full_name");
      return (data || []).filter((p) => p.full_name) as { id: string; full_name: string }[];
    },
    enabled: showVendedor,
  });

  const hasActiveFilters =
    filters.from || filters.to ||
    (showVendedor && filters.vendedor !== "all") ||
    (showSegmento && filters.segmento !== "all");

  const set = (key: keyof DashboardFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  const clear = () => onChange(EMPTY_FILTERS);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
        <CalendarDays className="h-3.5 w-3.5" />
        Período:
      </div>

      <Input
        type="date"
        className="h-8 w-36 text-xs"
        value={filters.from}
        onChange={e => set("from", e.target.value)}
        title="Data início"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <Input
        type="date"
        className="h-8 w-36 text-xs"
        value={filters.to}
        onChange={e => set("to", e.target.value)}
        title="Data fim"
      />

      {showVendedor && (
        <>
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium ml-2">
            <User className="h-3.5 w-3.5" />
            Vendedor:
          </div>
          <Select value={filters.vendedor} onValueChange={v => set("vendedor", v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Todos vendedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {collaborators.map(c => (
                <SelectItem key={c.id} value={c.full_name}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {showSegmento && (
        <>
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium ml-2">
            <Tag className="h-3.5 w-3.5" />
            Segmentação:
          </div>
          <Select value={filters.segmento} onValueChange={v => set("segmento", v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Toda segmentação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda segmentação</SelectItem>
              <SelectItem value="consumo">Consumo (B2B)</SelectItem>
              <SelectItem value="revenda">Revenda (PDV)</SelectItem>
              <SelectItem value="online">On-line</SelectItem>
              <SelectItem value="none">Não classificado</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={clear}
        >
          <X className="h-3 w-3 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}
