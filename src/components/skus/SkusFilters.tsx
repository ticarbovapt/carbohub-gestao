import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboButton } from "@/components/ui/carbo-button";
import { Search, X } from "lucide-react";

interface SkusFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  activeCount: number;
}

export function SkusFilters({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  activeCount,
}: SkusFiltersProps) {
  const hasFilters = searchQuery !== "" || categoryFilter !== "all";

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou código..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas categorias</SelectItem>
          <SelectItem value="produto_final">Produto Final</SelectItem>
          <SelectItem value="reagente">Reagente</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <CarboButton
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange("");
            onCategoryChange("all");
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Limpar ({activeCount} filtro{activeCount !== 1 ? "s" : ""})
        </CarboButton>
      )}
    </div>
  );
}
