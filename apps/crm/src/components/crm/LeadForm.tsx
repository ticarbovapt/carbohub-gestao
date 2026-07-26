import { useState, FormEvent } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FunnelType } from "@/types/crm";
import { SOURCES, FUNNEL_CONFIG, SEGMENTS, FUNIS_VISIVEIS } from "@/types/crm";
import { useCreateCRMLead } from "@/hooks/useCRMLeads";

// Só as pipelines vivas — ninguém deve conseguir criar lead numa das 9 que
// foram consolidadas.
const FUNNELS = FUNIS_VISIVEIS.map((id) => FUNNEL_CONFIG[id]);

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
  // Funil de destino: escolhível no form. Se trocar de funil, o estágio pré-selecionado
  // (vindo do "+" de uma coluna) não vale mais → cai pro estágio inicial do funil.
  const [funnel, setFunnel] = useState<FunnelType>(funnelType);
  const stage = funnel === funnelType ? initialStage : undefined;

  // No Outbound o SDR abre este formulário dezenas de vezes por dia. Pedir 11
  // campos de um lead recém-prospectado é atrito puro: cidade, UF e receita
  // estimada são coisa de DEPOIS da conversa. Nada foi removido — só saiu da
  // frente. Nos outros funis o cadastro nasce completo, como sempre foi.
  const isOutbound = funnel === "f12";
  const [maisDetalhes, setMaisDetalhes] = useState(false);
  const mostrarExtras = !isOutbound || maisDetalhes;

  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    city: "",
    state: "",
    source: "prospeccao_ativa",
    lead_segment: "a_definir",
    notes: "",
    estimated_revenue: "",
    qual_volume: "",
    qual_dor: "",
    qual_decisor: "",
    qual_prazo: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const canSave = form.contact_name.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    await create.mutateAsync({
      funnel_type: funnel,
      lead_segment: form.lead_segment,
      stage,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      city: form.city || null,
      state: form.state || null,
      source: form.source || null,
      // Lead recém-prospectado é FRIO por definição. O campo saiu do cadastro:
      // deixá-lo aqui só convidava a mentir para o próprio funil antes de haver
      // qualquer conversa. A temperatura passa a ser mexida no detalhe do lead,
      // depois de existir alguma evidência.
      temperature: "frio",
      notes: form.notes || null,
      estimated_revenue: form.estimated_revenue ? Number(onlyDigits(form.estimated_revenue)) : 0,
      qual_volume: form.qual_volume.trim() || null,
      qual_dor: form.qual_dor.trim() || null,
      qual_decisor: form.qual_decisor.trim() || null,
      qual_prazo: form.qual_prazo.trim() || null,
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
          {/* Funil de destino */}
          <Field label="Pipeline (funil)" required>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={funnel} onChange={(e) => setFunnel(e.target.value as FunnelType)}>
              {FUNNELS.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
            </select>
          </Field>

          {/* Segmento — o que o lead É (substitui as pipelines por tipo) */}
          <Field label="Segmento" required>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={form.lead_segment} onChange={(e) => set("lead_segment", e.target.value)}>
              {SEGMENTS.map((sg) => <option key={sg.id} value={sg.id}>{sg.icon} {sg.label}</option>)}
            </select>
          </Field>

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

          <Field label="Origem">
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={form.source} onChange={(e) => set("source", e.target.value)}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          {/* Qualificação — só no Outbound, e é o que o closer vai receber.
              No f13/f11 o vendedor já é o dono do negócio inteiro; não há
              handoff, então não há a quem entregar isto. */}
          {isOutbound && (
            <>
              <SectionLabel>Qualificação (o que o closer precisa saber)</SectionLabel>
              <p className="text-[11px] text-muted-foreground -mt-2">
                Pode ficar em branco agora e ser preenchido conforme a conversa avança.
                Sem os quatro, o lead não deveria sair de "Qualificado".
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Volume / frota">
                  <Input placeholder="ex.: 40 caminhões" value={form.qual_volume}
                    onChange={(e) => set("qual_volume", e.target.value)} />
                </Field>
                <Field label="Decisor">
                  <Input placeholder="nome e cargo" value={form.qual_decisor}
                    onChange={(e) => set("qual_decisor", e.target.value)} />
                </Field>
              </div>
              <Field label="Dor / problema relatado">
                <Input placeholder="ex.: consumo alto e fumaça na revisão" value={form.qual_dor}
                  onChange={(e) => set("qual_dor", e.target.value)} />
              </Field>
              <Field label="Prazo">
                <Input placeholder="ex.: quer resolver até o fim do mês" value={form.qual_prazo}
                  onChange={(e) => set("qual_prazo", e.target.value)} />
              </Field>
            </>
          )}

          {isOutbound && (
            <button type="button" onClick={() => setMaisDetalhes((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {maisDetalhes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {maisDetalhes ? "Menos detalhes" : "Mais detalhes (local, receita, observações)"}
            </button>
          )}

          {mostrarExtras && (
            <>
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

              <SectionLabel>Negócio</SectionLabel>
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
            </>
          )}

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
