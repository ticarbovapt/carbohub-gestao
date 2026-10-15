import { usePendentesAcademy } from "@/hooks/useAcademyAcessos";

/** Pedidos do Carbo Academy esperando o TI — mesmo desenho do `ChatBadge`. */
export function AcademyBadge() {
  const total = usePendentesAcademy();
  if (!total) return null;
  return (
    <span
      title={`${total} pedido${total === 1 ? "" : "s"} de acesso esperando`}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}
