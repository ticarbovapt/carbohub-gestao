import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useCreateCRMLead } from "@/hooks/useCRMLeads";
import { useCnpjLookup, formatCnpj, cnpjStatusVariant } from "@/hooks/useCnpjLookup";
import { FUNNEL_CONFIG, SOURCE_OPTIONS } from "@/types/crm";
import type { FunnelType, CRMLead, CnpjData } from "@/types/crm";

interface CRMLeadFormProps {
  funnelType: FunnelType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FORM = {
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
  address: "",
  source: "Prospecção ativa",
  segment: "" as string,
  temperature: "frio" as string,
  wave: "" as string,
  notes: "",
  vehicles_per_day: "",
  instagram: "",
  service_focus: "",
  equipment_type: "",
  estimated_revenue: "",
};

export function CRMLeadForm({ funnelType, open, onOpenChange }: CRMLeadFormProps) {
  const createLead = useCreateCRMLead();
  const config = FUNNEL_CONFIG[funnelType];
  const cnpjLookup = useCnpjLookup();

  const [form, setForm] = useState(EMPTY_FORM);
  const [cnpjAutoFilled, setCnpjAutoFilled] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isB2B = funnelType !== "f1";

  // ── CNPJ auto-lookup on change ──────────────────────────────────────────────
  useEffect(() => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length < 14) {
      if (cnpjAutoFilled) setCnpjAutoFilled(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const data: CnpjData | null = await cnpjLookup.lookup(digits);
      if (data) {
        setCnpjAutoFilled(true);
        setForm((prev) => ({
          ...prev,
          legal_name: prev.legal_name || data.razao_social || "",
          trade_name: prev.trade_name || data.nome_fantasia || "",
          city: prev.city || data.municipio || "",
          state: prev.state || data.uf || "",
          address: prev.address || [data.logradouro, data.numero].filter(Boolean).join(", "),
          ramo: prev.ramo || data.cnae_fiscal_descricao || "",
        }));
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cnpj]);

  const updateField = (key: string, value: string) => {
    if (key === "cnpj") {
      setCnpjAutoFilled(false);
      cnpjLookup.reset();
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCnpjChange = (raw: string) => {
    updateField("cnpj", formatCnpj(raw));
  };

  const handleSubmit = () => {
    if (!form.contact_name && !form.legal_name && !form.trade_name) return;

    const lead: Partial<CRMLead> & { funnel_type: FunnelType } = {
      funnel_type: funnelType,
      stage: "a_contatar",
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_whatsapp: form.contact_whatsapp || form.contact_phone || null,
      contact_email: form.contact_email || null,
      legal_name: form.legal_name || null,
      trade_name: form.trade_name || null,
      cnpj: form.cnpj.replace(/\D/g, "") || null,
      cnpj_status: cnpjLookup.data?.descricao_situacao_cadastral || null,
      cnpj_data: cnpjLookup.data ? (cnpjLookup.data as unknown as Record<string, unknown>) : null,
      ramo: form.ramo || null,
      city: form.city || null,
      state: form.state || null,
      address: form.address || null,
      source: form.source || null,
      segment: (form.segment || null) as CRMLead["segment"],
      temperature: (form.temperature || "frio") as CRMLead["temperature"],
      wave: form.wave || null,
      notes: form.notes || null,
      estimated_revenue: form.estimated_revenue ? Number(form.estimated_revenue) : 0,
    };

    if (funnelType === "f2") {
      lead.vehicles_per_day = form.vehicles_per_day ? Number(form.vehicles_per_day) : null;
      lead.instagram = form.instagram || null;
      lead.service_focus = form.service_focus || null;
    }
    if (funnelType === "f7" || funnelType === "f8") {
      lead.equipment_type = form.equipment_type || null;
    }

    createLead.mutate(lead, {
      onSuccess: () => {
        onOpenChange(false);
        setForm(EMPTY_FORM);
        cnpjLookup.reset();
        setCnpjAutoFilled(false);
      },
    });
  };

  // CNPJ status indicator
  const renderCnpjStatus = () => {
    if (!isB2B) return null;
    const s = cnpjLookup.status;
    if (s === "idle") return null;
    if (s === "loading") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
    if (s === "success" && cnpjLookup.data) {
      const situacao = cnpjLookup.data.descricao_situacao_cadastral;
      const variant = cnpjStatusVariant(situacao);
      const icon =
        variant === "success" ? <CheckCircle2 className="h-3 w-3" /> :
        variant === "destructive" ? <XCircle className="h-3 w-3" /> :
        <AlertTriangle className="h-3 w-3" />;
      return (
        <Badge variant={variant === "success" ? "default" : "destructive"} className="h-5 text-[10px] px-1.5 gap-0.5">
          {icon} {situacao}
        </Badge>
      );
    }
    if (s === "not_found" || s === "error") {
      return <span className="text-[10px] text-muted-foreground">{cnpjLookup.error}</span>;
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-carbo-green" />
            Novo Lead — {config.shortName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* ── B2B: CNPJ first (auto-fills the rest) ───────────────────── */}
          {isB2B && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">CNPJ</Label>
                <div className="flex items-center gap-1">{renderCnpjStatus()}</div>
              </div>
              <Input
                placeholder="XX.XXX.XXX/XXXX-XX"
                value={form.cnpj}
                onChange={(e) => handleCnpjChange(e.target.value)}
                className={cnpjAutoFilled ? "border-green-500 bg-green-50/30" : ""}
              />
              {cnpjAutoFilled && (
                <p className="text-[10px] text-green-600">Dados preenchidos automaticamente via Receita Federal</p>
              )}
            </div>
          )}

          {/* ── Empresa info (auto-filled or manual for B2B) ─────────────── */}
          {isB2B && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Razão Social</Label>
                <Input
                  placeholder="Empresa LTDA"
                  value={form.legal_name}
                  onChange={(e) => updateField("legal_name", e.target.value)}
                  className={cnpjAutoFilled && form.legal_name ? "bg-blue-50/30 border-blue-300" : ""}
                />
              </div>
              <div>
                <Label className="text-xs">Nome Fantasia</Label>
                <Input
                  placeholder="Nome fantasia"
                  value={form.trade_name}
                  onChange={(e) => updateField("trade_name", e.target.value)}
                  className={cnpjAutoFilled && form.trade_name ? "bg-blue-50/30 border-blue-300" : ""}
                />
              </div>
            </div>
          )}

          {/* ── Contact ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contato responsável {!isB2B && "*"}</Label>
              <Input
                placeholder="Nome completo"
                value={form.contact_name}
                onChange={(e) => updateField("contact_name", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">WhatsApp *</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={form.contact_phone}
                onChange={(e) => updateField("contact_phone", e.target.value)}
              />
            </div>
          </div>

          {/* ── Location (auto-filled from CNPJ for B2B) ────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Cidade</Label>
              <Input
                placeholder="São Paulo"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className={cnpjAutoFilled && form.city ? "bg-blue-50/30 border-blue-300" : ""}
              />
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Input
                placeholder="SP"
                maxLength={2}
                value={form.state}
                onChange={(e) => updateField("state", e.target.value.toUpperCase())}
                className={cnpjAutoFilled && form.state ? "bg-blue-50/30 border-blue-300" : ""}
              />
            </div>
          </div>

          {/* ── Ramo + Source ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {isB2B && (
              <div>
                <Label className="text-xs">Ramo / Segmento</Label>
                <Input
                  placeholder="Auto peças, Oficina..."
                  value={form.ramo}
                  onChange={(e) => updateField("ramo", e.target.value)}
                  className={cnpjAutoFilled && form.ramo ? "bg-blue-50/30 border-blue-300" : ""}
                />
              </div>
            )}
            <div className={isB2B ? "" : "col-span-2"}>
              <Label className="text-xs">Origem do Lead</Label>
              <Select value={form.source} onValueChange={(v) => updateField("source", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Temperature ─────────────────────────────────────────────────── */}
          <div>
            <Label className="text-xs">Temperatura</Label>
            <div className="flex gap-2 mt-1">
              {(["frio", "morno", "quente"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateField("temperature", t)}
                  className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.temperature === t
                      ? t === "quente" ? "bg-red-500 border-red-500 text-white"
                        : t === "morno" ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-slate-500 border-slate-500 text-white"
                      : "border-border text-muted-foreground hover:border-primary"
                  }`}
                >
                  {t === "frio" ? "❄️ Frio" : t === "morno" ? "🌡️ Morno" : "🔥 Quente"}
                </button>
              ))}
            </div>
          </div>

          {/* ── F2: Licensee-specific ─────────────────────────────────────── */}
          {funnelType === "f2" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Veículos/dia</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.vehicles_per_day}
                  onChange={(e) => updateField("vehicles_per_day", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Instagram</Label>
                <Input
                  placeholder="@perfil"
                  value={form.instagram}
                  onChange={(e) => updateField("instagram", e.target.value)}
                />
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

          {/* ── F7/F8: Equipment ─────────────────────────────────────────── */}
          {(funnelType === "f7" || funnelType === "f8") && (
            <div>
              <Label className="text-xs">Tipo de Equipamento</Label>
              <Input
                placeholder="Gerador, compressor, embarcação..."
                value={form.equipment_type}
                onChange={(e) => updateField("equipment_type", e.target.value)}
              />
            </div>
          )}

          {/* ── Revenue + Email ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Receita estimada (R$)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.estimated_revenue}
                onChange={(e) => updateField("estimated_revenue", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={form.contact_email}
                onChange={(e) => updateField("contact_email", e.target.value)}
              />
            </div>
          </div>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              placeholder="Notas sobre o lead..."
              rows={2}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={createLead.isPending}>
            {createLead.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              "Criar Lead"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
