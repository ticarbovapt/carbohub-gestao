import { useState } from "react";
import { LABEL_COLORS } from "@/lib/mktTheme";
import type { CustomField } from "@/hooks/useCustomFields";

// Input de um Campo Personalizado, renderizado conforme o tipo. Reusado no
// CardModal e na view de Tabela (D3). `onSave` recebe o valor no formato jsonb.
export function CustomFieldInput({ field, value, onSave }: { field: CustomField; value: unknown; onSave: (v: unknown) => void }) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  const commonInput = "h-8 text-sm w-full rounded-md border border-border bg-card px-2";

  if (field.type === "checkbox") {
    return <input type="checkbox" checked={value === true} onChange={(e) => onSave(e.target.checked)} />;
  }
  if (field.type === "select") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onSave(e.target.value || null)} className={commonInput}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {field.options.map((o) => {
          const on = arr.includes(o.id);
          return (
            <button key={o.id} onClick={() => onSave(on ? arr.filter((x) => x !== o.id) : [...arr, o.id])}
              className={`h-6 px-2 rounded text-xs font-medium ${on ? "text-white" : "text-muted-foreground bg-muted"}`}
              style={on ? { background: LABEL_COLORS[o.color ?? "blue"] } : undefined}>{o.label}</button>
          );
        })}
        {field.options.length === 0 && <span className="text-xs text-muted-foreground">Sem opções.</span>}
      </div>
    );
  }
  if (field.type === "date") {
    return <input type="date" value={(value as string) ?? ""} onChange={(e) => onSave(e.target.value || null)} className={commonInput} />;
  }
  // text / number / url
  return (
    <div className="flex items-center gap-1.5">
      <input type={field.type === "number" ? "number" : "text"} value={local} onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onSave(field.type === "number" ? (local === "" ? null : Number(local)) : (local || null))}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder={field.type === "url" ? "https://…" : ""} className={commonInput} />
      {field.type === "url" && value ? <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary text-xs shrink-0">abrir</a> : null}
    </div>
  );
}
