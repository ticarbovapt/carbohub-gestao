import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateCRMLead } from "@/hooks/useCRMLeads";
import { FUNNEL_CONFIG, SOURCE_OPTIONS } from "@/types/crm";
import type { FunnelType, CRMLead } from "@/types/crm";
import { Plus } from "lucide-react";

interface CRMLeadFormProps {
  funnelType: FunnelType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CRMLeadForm({ funnelType, open, onOpenChange }: CRMLeadFormProps) {
  const createLead = useCreateCRMLead();
  const config = FUNNEL_CONFIG[funnelType];

  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_whatsapp: "",
    contact_email: "",
    legal_name: "",
    trade_name: "",
    cnpj: "",
    ramo: "",
    city: "",
    state: "",
    source: "prospeccao_ativa",
    segment: "" as string,
    temperature: "frio" as string,
    wave: "" as string,
    notes: "",
    // F2 specific
    vehicles_per_day: "",
    instagram: "",
    service_focus: "",
    // F7/F8 specific
    equipment_type: "",
    estimated_revenue: "",
  });

  const handleSubmit = () => {
    if (!form.contact_name && !form.legal_name) {
      return;
    }

    const lead: Partial<CRMLead> & { funnel_type: FunnelType } = {
      funnel_type: funnelType,
      stage: "a_contatar",
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_whatsapp: form.contact_whatsapp || form.contact_phone || null,
      contact_email: form.contact_email || null,
      legal_name: form.legal_name || null,
      trade_name: form.trade_name || null,
      cnpj: form.cnpj || null,
      ramo: form.ramo || null,
      city: form.city || null,
      state: form.state || null,
      source: form.source || null,
      segment: (form.segment || null) as CRMLead["segment"],
      temperature: (form.temperature || "frio") as CRMLead["temperature"],
      wave: form.wave || null,
      notes: form.notes || null,
      estimated_revenue: form.estimated_revenue ? Number(form.estimated_revenue) : 0,
    };

    // F2 specifics
    if (funnelType === "f2") {
      lead.vehicles_per_day = form.vehicles_per_day ? Number(form.vehicles_per_day) : null;
      lead.instagram = form.instagram || null;
      lead.service_focus = form.service_focus || null;
    }

    // F7/F8 specifics
    if (funnelType === "f7" || funnelType === "f8") {
      lead.equipment_type = form.equipment_type || null;
    }

    createLead.mutate(lead, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({
          contact_name: "", contact_phone: "", contact_whatsapp: "", contact_email: "",
          legal_name: "", trade_name: "", cnpj: "", ramo: "", city: "", state: "",
          source: "prospeccao_ativa", segment: "", temperature: "frio", wave: "", notes: "",
          vehicles_per_day: "", instagram: "", service_focus: "", equipment_type: "", estimated_revenue: "",
        });
      },
    });
  };

  const updateField = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const isB2B = funnelType !== "f1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-carbo-green" />
            Novo Lead — {config.shortName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Contact info (always) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do Contato *</Label>
              <Input placeholder="Nome completo" value={form.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefone / WhatsApp *</Label>
              <Input placeholder="(11) 99999-9999" value={form.contact_phone} onChange={(e) => updateField("contact_phone", e.target.value)} />
            </div>
          </div>

          {/* B2B fields */}
          {isB2B && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Razão Social</Label>
                  <Input placeholder="Empresa LTDA" value={form.legal_name} onChange={(e) => updateField("legal_name", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Nome Fantasia</Label>
                  <Input placeholder="Nome fantasia" value={form.trade_name} onChange={(e) => updateField("trade_name", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input placeholder="XX.XXX.XXX/XXXX-XX" value={form.cnpj} onChange={(e) => updateField("cnpj", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Ramo / Segmento</Label>
                  <Input placeholder="Auto peças, Oficina..." value={form.ramo} onChange={(e) => updateField("ramo", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Location */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Cidade</Label>
              <Input placeholder="São Paulo" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Input placeholder="SP" maxLength={2} value={form.state} onChange={(e) => updateField("state", e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Source + Temperature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Origem do Lead</Label>
              <Select value={form.source} onValueChange={(v) => updateField("source", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => (<SelectItem key={s} value={s.toLowerCase().replace(/ /g, "_")}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Temperatura</Label>
              <Select value={form.temperature} onValueChange={(v) => updateField("temperature", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="frio">❄️ Frio</SelectItem>
                  <SelectItem value="morno">🌡️ Morno</SelectItem>
                  <SelectItem value="quente">🔥 Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* F2: Licensee-specific */}
          {funnelType === "f2" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Veículos/dia</Label>
                <Input type="number" placeholder="0" value={form.vehicles_per_day} onChange={(e) => updateField("vehicles_per_day", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Instagram</Label>
                <Input placeholder="@perfil" value={form.instagram} onChange={(e) => updateField("instagram", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Foco</Label>
                <Select value={form.service_focus} onValueChange={(v) => updateField("service_focus", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventivo">Preventivo</SelectItem>
                    <SelectItem value="corretivo">Corretivo</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Revenue estimate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Receita Estimada (R$)</Label>
              <Input type="number" placeholder="0" value={form.estimated_revenue} onChange={(e) => updateField("estimated_revenue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input type="email" placeholder="email@empresa.com" value={form.contact_email} onChange={(e) => updateField("contact_email", e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea placeholder="Notas sobre o lead..." rows={2} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
          </div>

          {/* Submit */}
          <Button className="w-full" onClick={handleSubmit} disabled={createLead.isPending}>
            {createLead.isPending ? "Salvando..." : "Criar Lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
