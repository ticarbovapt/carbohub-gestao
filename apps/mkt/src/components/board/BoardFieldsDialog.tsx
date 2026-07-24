import { useState } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Trash2, Plus, X, SlidersHorizontal } from "lucide-react";
import { LABEL_COLORS, LABEL_COLOR_KEYS, tintedLabelStyle } from "@/lib/mktTheme";
import { positionForIndex } from "@/lib/mktPosition";
import {
  useCustomFields, useCustomFieldMutations, FIELD_TYPE_LABELS,
  type CustomField, type FieldType, type FieldOption,
} from "@/hooks/useCustomFields";

const TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];
const hasOptions = (t: FieldType) => t === "select" || t === "multiselect";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

function FieldRow({ field, onUpdate, onDelete }: {
  field: CustomField;
  onUpdate: (patch: Partial<Pick<CustomField, "name" | "type" | "options">>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [name, setName] = useState(field.name);
  const [optLabel, setOptLabel] = useState("");

  const addOption = () => {
    const l = optLabel.trim();
    if (!l) return;
    onUpdate({ options: [...field.options, { id: newId(), label: l, color: "blue" }] });
    setOptLabel("");
  };
  const updateOption = (id: string, patch: Partial<FieldOption>) =>
    onUpdate({ options: field.options.map((o) => o.id === id ? { ...o, ...patch } : o) });
  const removeOption = (id: string) => onUpdate({ options: field.options.filter((o) => o.id !== id) });

  return (
    <div ref={setNodeRef} style={style} className="mkt-content-block p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button className="p-1 rounded-md cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== field.name && onUpdate({ name })}
          placeholder="Nome do campo" className="h-9 text-sm flex-1" />
        <Select value={field.type} onValueChange={(v) => onUpdate({ type: v as FieldType })}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
        </Select>
        <button onClick={() => { if (confirm(`Excluir o campo "${field.name || "sem nome"}"? Isso apaga o valor dele em todos os cartões.`)) onDelete(); }}
          className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Excluir campo"><Trash2 className="h-4 w-4" /></button>
      </div>

      {hasOptions(field.type) && (
        <div className="pl-8 space-y-2 border-l-2 border-border ml-1">
          {field.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="inline-flex items-center h-6 px-2 rounded-md text-xs font-medium shrink-0 border" style={tintedLabelStyle(LABEL_COLORS[o.color ?? "blue"])}>
                {o.label || "—"}
              </span>
              <Input value={o.label} onChange={(e) => updateOption(o.id, { label: e.target.value })} className="h-8 text-sm flex-1" />
              <div className="flex gap-1">
                {LABEL_COLOR_KEYS.slice(0, 6).map((k) => (
                  <button key={k} onClick={() => updateOption(o.id, { color: k })} className={`h-5 w-5 rounded-md transition-transform hover:scale-110 ${o.color === k ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""}`} style={{ background: LABEL_COLORS[k] }} />
                ))}
              </div>
              <button onClick={() => removeOption(o.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={optLabel} onChange={(e) => setOptLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addOption(); }} placeholder="Nova opção…" className="h-8 text-sm" />
            <Button size="sm" variant="outline" className="h-8" onClick={addOption}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BoardFieldsDialog({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { data: fields = [] } = useCustomFields(boardId);
  const m = useCustomFieldMutations(boardId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");

  const add = () => {
    const n = newName.trim();
    if (!n) return;
    const pos = (fields[fields.length - 1]?.position ?? 0) + 1024;
    m.createField.mutate({ name: n, type: newType, position: pos }, { onSuccess: () => { setNewName(""); setNewType("text"); } });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const to = fields.findIndex((f) => f.id === over.id);
    const others = fields.filter((f) => f.id !== active.id).map((f) => f.position);
    m.updateField.mutate({ id: String(active.id), patch: { position: positionForIndex(others, to) } });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Campos personalizados do quadro
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {fields.map((f) => (
                <FieldRow key={f.id} field={f}
                  onUpdate={(patch) => m.updateField.mutate({ id: f.id, patch })}
                  onDelete={() => m.deleteField.mutate({ id: f.id })} />
              ))}
            </SortableContext>
          </DndContext>
          {fields.length === 0 && (
            <div className="mkt-empty">
              <div className="mkt-empty-icon"><SlidersHorizontal className="h-5 w-5" /></div>
              <p className="mkt-empty-title">Nenhum campo ainda</p>
              <p className="mkt-empty-subcopy">Crie campos personalizados para adicionar informações extras aos cartões deste quadro.</p>
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-4 mt-2">
          <div className="flex-1 space-y-1.5">
            <label className="mkt-meta-label">Novo campo</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Nome" className="h-9 text-sm" />
          </div>
          <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="h-9 shadow-[var(--shadow-carbo)]" onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
