import { useState, FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FunnelType } from "@/types/crm";
import { SOURCE_OPTIONS } from "@/types/crm";
import { useCreateCRMLead } from "@/hooks/useCRMLeads";

interface LeadFormProps {
  funnelType: FunnelType;
  initialStage?: string;
  onClose: () => void;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");
function fmtPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function fmtMoney(v: string) {
  const d = onlyDigits(v);
  return d ? Number(d).toLocaleString("pt-BR") : "";
}

export function LeadForm({ funnelType, initialStage, onClose }: LeadFormProps) {
  const create = useCreateCRMLead();
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    city: "",
    state: "",
    source: "Prospecção ativa",
    temperature: "frio",
    notes: "",
    estimated_revenue: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const canSave = form.contact_name.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    await create.mutateAsync({
      funnel_type: funnelType,
      stage: initialStage,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      city: form.city || null,
      state: form.state || null,
      source: form.source || null,
      temperature: form.temperature as "frio" | "morno" | "quente",
      notes: form.notes || null,
      estimated_revenue: form.estimated_revenue ? Number(onlyDigits(form.estimated_revenue)) : 0,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold text-sm">Novo lead</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Contato */}
          <SectionLabel>Contato</SectionLabel>
          <Field label="Nome / Empresa" required>
            <Input placeholder="Nome do contato ou empresa" value={form.contact_name}
              onChange={(e) => set("contact_name", e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone / WhatsApp">
              <Input placeholder="(00) 00000-0000" value={form.contact_phone}
                onChange={(e) => set("contact_phone", fmtPhone(e.target.value))} />
            </Field>
            <Field label="E-mail">
              <Input type="email" placeholder="email@exemplo.com" value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)} />
            </Field>
          </div>

          {/* Localização */}
          <SectionLabel>Localização</SectionLabel>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <Field label="Cidade">
              <Input placeholder="Cidade" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="UF">
              <Input placeholder="UF" maxLength={2} value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase())} />
            </Field>
          </div>

          {/* Negócio */}
          <SectionLabel>Negócio</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origem">
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.source} onChange={(e) => set("source", e.target.value)}>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Temperatura">
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form.temperature} onChange={(e) => set("temperature", e.target.value)}>
                <option value="frio">❄️ Frio</option>
                <option value="morno">🌡️ Morno</option>
                <option value="quente">🔥 Quente</option>
              </select>
            </Field>
          </div>
          <Field label="Receita estimada (R$)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input className="pl-9" inputMode="numeric" placeholder="0" value={fmtMoney(form.estimated_revenue)}
                onChange={(e) => set("estimated_revenue", onlyDigits(e.target.value))} />
            </div>
          </Field>

          <Field label="Observações">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[72px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Notas sobre este lead…" value={form.notes} onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={!canSave || create.isPending}>
              {create.isPending ? "Salvando…" : "Criar lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-1">{children}</p>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-destructive"> *</span>}</p>
      {children}
    </div>
  );
}
