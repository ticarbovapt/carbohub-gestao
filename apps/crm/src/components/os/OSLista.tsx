import type { OSView } from "./osView";

export function OSLista({ items }: { items: OSView[] }) {
  return <div className="text-sm text-muted-foreground">{items.length}</div>;
}
