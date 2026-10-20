import type { OSView } from "./osView";

export function OSAgenda({ items }: { items: OSView[] }) {
  return <div className="text-sm text-muted-foreground">{items.length}</div>;
}
