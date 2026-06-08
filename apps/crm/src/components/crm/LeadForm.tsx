import { useState, FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FunnelType } from "@/types/crm";
import { SOURCE_OPTIONS } from "@/types/crm";
import { useCreateCRMLead } from "@/hooks/useCRMLeads";

interface LeadFormProps {
  funnelType: FunnelType;
  onClose: () => void;
}

export function LeadForm({ funnelType, onClose }: LeadFormProps) {
  const create = useCreateCRMLead();
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    city: "",
    state: "",
    source: "Prospecção ativa",
    notes: "",
    estimated_revenue: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      funnel_type: funnelType,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      city: form.city || null,
      state: form.state || null,
      source: form.source || null,
      notes: form.notes || null,
      estimated_revenue: form.estimated_revenue ? parseFloat(form.estimated_revenue) : 0,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl border shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Novo lead</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Nome / Empresa">
            <Input
              placeholder="Nome do contato ou empresa"
              value={form.contact_name}
              onChange={(e) => set("contact_name", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone">
              <Input
                placeholder="(XX) XXXXX-XXXX"
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade">
              <Input
                placeholder="Cidade"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="Estado">
              <Input
                placeholder="UF"
                maxLength={2}
                value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase())}
              />
            </Field>
          </div>

          <Field label="Origem">
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>

          <Field label="Receita estimada (R$)">
            <Input
              type="number"
              placeholder="0"
              min={0}
              value={form.estimated_revenue}
              onChange={(e) => set("estimated_revenue", e.target.value)}
            />
          </Field>

          <Field label="Observações">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Notas sobre este lead…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? "Salvando…" : "Criar lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
