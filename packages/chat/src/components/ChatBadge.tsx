import { useUnreadTotal } from "../hooks";

// Selo de não-lidas para a sidebar/TopBar. Sem número → só a bolinha.
export function ChatBadge({ dot = false }: { dot?: boolean }) {
  const { data: total = 0 } = useUnreadTotal();
  if (!total) return null;
  if (dot) return <span className="inline-block h-2 w-2 rounded-full bg-primary" />;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
      {total > 99 ? "99+" : total}
    </span>
  );
}
