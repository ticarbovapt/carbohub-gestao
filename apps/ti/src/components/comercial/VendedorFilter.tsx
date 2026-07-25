import { User } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVendedoresDir } from "@/hooks/useVendedoresDir";

// Filtro de vendedor compartilhado pelas telas da área Comercial (Admin).
// Controlado: o estado vive na página (para alimentar useDashComercial).
export function VendedorFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: vendedoresDir = [] } = useVendedoresDir();
  const vendedorOpts = vendedoresDir.map((v) => ({
    id: v.id, name: v.full_name || "—", avulso: !v.is_vendedor,
  }));

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Vendedor</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos vendedores</SelectItem>
          {vendedorOpts.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              <span className="flex items-center gap-2">
                {v.name}
                {v.avulso
                  ? <span className="text-[10px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1">Avulso</span>
                  : <span className="text-[10px] font-semibold text-carbo-green border border-carbo-green/30 rounded px-1">Vendedor</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
