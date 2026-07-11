import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CarboButton } from "@/components/ui/carbo-button";

// Paginação reutilizável das listas do Faturamento. A página fica na URL (?<key>=)
// pra sobreviver ao F5, e mostramos 20 itens por vez (renderizar tudo de uma vez
// — cada linha com botão de baixar NF — deixava a tela lenta).
export const PAGE_SIZE = 20;

/** Página atual lida/gravada na URL (?<key>=…). Persiste no F5. */
export function useUrlPage(key: string): [number, (p: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = parseInt(params.get(key) || "1", 10);
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const setPage = (p: number) =>
    setParams(
      (prev) => {
        if (p <= 1) prev.delete(key);
        else prev.set(key, String(p));
        return prev;
      },
      { replace: true },
    );
  return [page, setPage];
}

/** Fatia um array para a página atual (com clamp da página em faixa válida). */
export function paginate<T>(items: T[], page: number): { slice: T[]; pageCount: number; safePage: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  return { slice: items.slice(start, start + PAGE_SIZE), pageCount, safePage };
}

export function Pager({
  page, pageCount, total, onPage,
}: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <span className="text-xs text-muted-foreground">{start}–{end} de {total}</span>
      <div className="flex items-center gap-2">
        <CarboButton size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Anterior
        </CarboButton>
        <span className="text-xs text-muted-foreground whitespace-nowrap">Página {page} de {pageCount}</span>
        <CarboButton size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="gap-1">
          Próxima <ChevronRight className="h-4 w-4" />
        </CarboButton>
      </div>
    </div>
  );
}
