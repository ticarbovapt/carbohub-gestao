import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboButton } from "@/components/ui/carbo-button";
import { Filter, X, MapPin, Building2 } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import type { LicenseeStatus } from "@/hooks/useLicensees";

interface LicenseesFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: LicenseeStatus | "all";
  onStatusChange: (value: LicenseeStatus | "all") => void;
  stateFilter: string;
  onStateChange: (value: string) => void;
  cityFilter: string;
  onCityChange: (value: string) => void;
  availableStates: string[];
  availableCities: string[];
  activeFiltersCount: number;
  onClearFilters: () => void;
}

const STATUS_LABELS: Record<LicenseeStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  suspended: "Suspenso",
};

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function LicenseesFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  stateFilter,
  onStateChange,
  cityFilter,
  onCityChange,
  availableStates,
  availableCities,
  activeFiltersCount,
  onClearFilters,
}: LicenseesFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Primary filters row */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <CarboSearchInput
            placeholder="Buscar por nome, código, email ou cidade..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as LicenseeStatus | "all")}>
          <SelectTrigger className="w-40 h-11 rounded-xl">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* State filter */}
        <Select value={stateFilter} onValueChange={onStateChange}>
          <SelectTrigger className="w-40 h-11 rounded-xl">
            <MapPin className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Estados</SelectItem>
            {availableStates.length > 0 ? (
              availableStates.sort().map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))
            ) : (
              BRAZILIAN_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* City filter */}
        <Select 
          value={cityFilter} 
          onValueChange={onCityChange}
          disabled={availableCities.length === 0 && stateFilter === "all"}
        >
          <SelectTrigger className="w-48 h-11 rounded-xl">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Cidades</SelectItem>
            {availableCities.sort().map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters button */}
        {activeFiltersCount > 0 && (
          <CarboButton
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-11 gap-2"
          >
            <X className="h-4 w-4" />
            Limpar
            <CarboBadge variant="secondary" className="h-5 w-5 p-0 justify-center">
              {activeFiltersCount}
            </CarboBadge>
          </CarboButton>
        )}
      </div>
    </div>
  );
}
