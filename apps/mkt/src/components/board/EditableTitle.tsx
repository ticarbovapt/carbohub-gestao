import { useEffect, useState } from "react";

// Título editável inline (usado na Tabela de quadro e na Tabela geral da área).
export function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  // Mantém sincronizado quando o valor muda por fora (ex.: realtime).
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 text-sm w-full min-w-[160px] rounded-md border border-transparent hover:border-border focus:border-border bg-transparent px-2 font-medium text-foreground" />
  );
}
