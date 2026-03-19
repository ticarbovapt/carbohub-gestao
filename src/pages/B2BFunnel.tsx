import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ArrowRight, Search, Loader2, Building2, CheckCircle2,
  AlertCircle, FileText, Users, Target, MapPin, Phone, Mail, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Business verticals ──────────────────────────────────────────────────────
const BUSINESS_VERTICALS = [
  { value: "posto", label: "Posto de Combustível" },
  { value: "oficina", label: "Oficina Mecânica" },
  { value: "frota", label: "Gestão de Frotas" },
  { value: "locadora", label: "Locadora de Veículos" },
  { value: "concessionaria", label: "Concessionária" },
  { value: "industria", label: "Indústria" },
  { value: "agro", label: "Agronegócio" },
  { value: "transportadora", label: "Transportadora" },
  { value: "outros", label: "Outros" },
] as const;

const BUSINESS_MODELS = [
  { value: "licenciado", label: "Licenciado (opera com máquina Carbo)" },
  { value: "pdv", label: "PDV (ponto de venda de produtos)" },
  { value: "distribuidor", label: "Distribuidor Regional" },
  { value: "parceiro_tecnico", label: "Parceiro Técnico" },
  { value: "b2b_direto", label: "B2B Direto (compra direta)" },
] as const;

const CHECKLIST_ITEMS = [
  { id: "cnpj_ativo", label: "CNPJ ativo e regular" },
  { id: "capacidade_operacional", label: "Capacidade operacional verificada" },
  { id: "estrutura_fisica", label: "Estrutura física adequada" },
  { id: "equipe_tecnica", label: "Equipe técnica disponível" },
  { id: "area_cobertura", label: "Área de cobertura definida" },
  { id: "volume_estimado", label: "Volume estimado levantado" },
  { id: "contrato_social", label: "Contrato social apresentado" },
  { id: "referencias_comerciais", label: "Referências comerciais checadas" },
] as const;

// ── Steps ───────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "CNPJ & Dados", icon: Building2 },
  { id: 2, label: "Perfil B2B", icon: Target },
  { id: 3, label: "Checklist", icon: CheckCircle2 },
  { id: 4, label: "Resumo", icon: FileText },
] as const;

// ── Form schema ─────────────────────────────────────────────────────────────
const formSchema = z.object({
  cnpj: z.string().min(14, "CNPJ obrigatório"),
  legal_name: z.string().optional(),
  trade_name: z.string().optional(),
  cnae: z.string().optional(),
  situacao_cadastral: z.string().optional(),
  contact_name: z.string().min(1, "Nome do contato é obrigatório"),
  contact_email: z.string().email("Email inválido").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  business_vertical: z.string().min(1, "Selecione a vertical"),
  business_model: z.string().min(1, "Selecione o modelo de negócio"),
  estimated_monthly_volume: z.number().min(0).optional().nullable(),
  works_with_diesel: z.boolean(),
  works_with_fleets: z.boolean(),
  coverage_area: z.string().optional(),
  notes: z.string().optional(),
  commercial_rep: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// ── CNPJ formatter ──────────────────────────────────────────────────────────
function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ── Component ───────────────────────────────────────────────────────────────
export default function B2BFunnel() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjFound, setCnpjFound] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cnpj: "",
      contact_name: "",
      business_vertical: "",
      business_model: "",
      works_with_diesel: false,
      works_with_fleets: false,
    },
  });

  // ── CNPJ Lookup ─────────────────────────────────────────────────────────
  const handleCnpjLookup = useCallback(async () => {
    const digits = form.getValues("cnpj").replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ deve conter 14 dígitos");
      return;
    }

    setCnpjLoading(true);
    setCnpjFound(false);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cnpj-lookup?cnpj=${digits}`,
        { headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao buscar CNPJ");
      }

      const result = await res.json();

      form.setValue("legal_name", result.razao_social || "");
      form.setValue("trade_name", result.nome_fantasia || "");
      form.setValue("cnae", result.cnae_fiscal_descricao || "");
      form.setValue("situacao_cadastral", result.descricao_situacao_cadastral || "");

      if (result.logradouro) {
        const fullAddress = [result.logradouro, result.numero, result.complemento].filter(Boolean).join(", ");
        form.setValue("address", fullAddress);
        form.setValue("city", result.municipio || "");
        form.setValue("state", result.uf || "");
        form.setValue("zip", result.cep || "");
      }

      if (result.ddd_telefone_1) {
        form.setValue("contact_phone", result.ddd_telefone_1);
      }

      setCnpjFound(true);
      toast.success("Dados do CNPJ carregados!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [form]);

  // ── Toggle checklist ────────────────────────────────────────────────────
  const toggleChecklist = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const checklistProgress = CHECKLIST_ITEMS.filter((i) => checkedItems[i.id]).length;

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("b2b_leads").insert({
        cnpj: data.cnpj.replace(/\D/g, ""),
        legal_name: data.legal_name,
        trade_name: data.trade_name,
        cnae: data.cnae,
        contact_name: data.contact_name,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        business_vertical: data.business_vertical,
        business_model: data.business_model,
        estimated_monthly_volume: data.estimated_monthly_volume || null,
        works_with_diesel: data.works_with_diesel,
        works_with_fleets: data.works_with_fleets,
        coverage_area: data.coverage_area || null,
        notes: data.notes || null,
        commercial_rep: data.commercial_rep || null,
        checklist: checkedItems,
        status: "novo",
      });

      if (error) throw error;

      toast.success("Lead B2B cadastrado com sucesso!");
      navigate("/orders");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar lead B2B");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────
  const canGoNext = () => {
    switch (step) {
      case 1: return form.getValues("cnpj").replace(/\D/g, "").length === 14 && form.getValues("contact_name");
      case 2: return form.getValues("business_vertical") && form.getValues("business_model");
      case 3: return true;
      default: return true;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <BoardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <CarboPageHeader
          title="Funil B2B"
          description="Cadastro de novas oportunidades B2B com validação automática"
          icon={Building2}
          actions={
            <CarboButton variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </CarboButton>
          }
        />

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => s.id < step && setStep(s.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  step === s.id
                    ? "bg-carbo-green text-white shadow-sm"
                    : step > s.id
                    ? "bg-carbo-green/10 text-carbo-green cursor-pointer hover:bg-carbo-green/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <s.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px flex-1", step > s.id ? "bg-carbo-green" : "bg-border")} />
              )}
            </React.Fragment>
          ))}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            {/* ── Step 1: CNPJ & Dados ──────────────────────────────── */}
            {step === 1 && (
              <CarboCard className="p-6 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Dados da Empresa</h3>
                  <p className="text-sm text-muted-foreground">
                    Informe o CNPJ para preenchimento automático dos dados
                  </p>
                </div>

                {/* CNPJ lookup */}
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="cnpj"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>CNPJ</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="00.000.000/0000-00"
                            onChange={(e) => field.onChange(formatCnpj(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-end">
                    <CarboButton
                      type="button"
                      variant="outline"
                      onClick={handleCnpjLookup}
                      disabled={cnpjLoading || form.getValues("cnpj").replace(/\D/g, "").length !== 14}
                    >
                      {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </CarboButton>
                  </div>
                </div>

                {cnpjFound && (
                  <div className="flex items-center gap-2 text-sm text-carbo-green">
                    <CheckCircle2 className="h-4 w-4" />
                    Dados carregados automaticamente
                  </div>
                )}

                <Separator />

                {/* Company data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="legal_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razão Social</FormLabel>
                      <FormControl><Input {...field} placeholder="Razão Social" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="trade_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Fantasia</FormLabel>
                      <FormControl><Input {...field} placeholder="Nome Fantasia" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cnae" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNAE</FormLabel>
                      <FormControl><Input {...field} placeholder="Atividade Econômica" readOnly className="bg-muted" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="situacao_cadastral" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Situação Cadastral</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input {...field} readOnly className="bg-muted" />
                          {field.value === "ATIVA" && <Badge className="bg-carbo-green text-white">Ativa</Badge>}
                          {field.value && field.value !== "ATIVA" && <Badge variant="destructive">{field.value}</Badge>}
                        </div>
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <Separator />

                {/* Address */}
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Logradouro</FormLabel>
                      <FormControl><Input {...field} placeholder="Rua, número" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="state" render={({ field }) => (
                    <FormItem><FormLabel>UF</FormLabel><FormControl><Input {...field} maxLength={2} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="zip" render={({ field }) => (
                    <FormItem><FormLabel>CEP</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                </div>

                <Separator />

                {/* Contact */}
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Contato</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="contact_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Contato *</FormLabel>
                      <FormControl><Input {...field} placeholder="Nome completo" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contact_phone" render={({ field }) => (
                    <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} placeholder="(00) 00000-0000" /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="contact_email" render={({ field }) => (
                    <FormItem className="md:col-span-2"><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" placeholder="email@empresa.com" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </CarboCard>
            )}

            {/* ── Step 2: Perfil B2B ─────────────────────────────────── */}
            {step === 2 && (
              <CarboCard className="p-6 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Perfil do Negócio</h3>
                  <p className="text-sm text-muted-foreground">
                    Defina a vertical e o modelo de parceria
                  </p>
                </div>

                <FormField control={form.control} name="business_vertical" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vertical de Negócio *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione a vertical" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_VERTICALS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="business_model" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modelo de Negócio *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="estimated_monthly_volume" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volume Mensal Estimado (un.)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="coverage_area" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Área de Cobertura</FormLabel>
                      <FormControl><Input {...field} placeholder="Ex: Grande SP, Interior MG" /></FormControl>
                    </FormItem>
                  )} />
                </div>

                <div className="flex gap-6">
                  <FormField control={form.control} name="works_with_diesel" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel>Trabalha com Diesel</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="works_with_fleets" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel>Trabalha com Frotas</FormLabel>
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="commercial_rep" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Representante Comercial</FormLabel>
                    <FormControl><Input {...field} placeholder="Quem trouxe essa demanda?" /></FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Textarea {...field} placeholder="Particularidades desta operação B2B..." rows={3} /></FormControl>
                  </FormItem>
                )} />
              </CarboCard>
            )}

            {/* ── Step 3: Checklist ──────────────────────────────────── */}
            {step === 3 && (
              <CarboCard className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Checklist de Validação</h3>
                    <p className="text-sm text-muted-foreground">
                      Verifique os critérios antes de avançar
                    </p>
                  </div>
                  <Badge variant={checklistProgress === CHECKLIST_ITEMS.length ? "default" : "secondary"}>
                    {checklistProgress}/{CHECKLIST_ITEMS.length}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-carbo-green h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(checklistProgress / CHECKLIST_ITEMS.length) * 100}%` }}
                  />
                </div>

                <div className="space-y-3">
                  {CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        checkedItems[item.id]
                          ? "border-carbo-green/50 bg-carbo-green/5"
                          : "border-border hover:border-carbo-green/30"
                      )}
                    >
                      <Checkbox
                        checked={!!checkedItems[item.id]}
                        onCheckedChange={() => toggleChecklist(item.id)}
                      />
                      <span className={cn("text-sm", checkedItems[item.id] && "text-carbo-green font-medium")}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </CarboCard>
            )}

            {/* ── Step 4: Resumo ─────────────────────────────────────── */}
            {step === 4 && (
              <CarboCard className="p-6 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Resumo do Lead B2B</h3>
                  <p className="text-sm text-muted-foreground">
                    Confira os dados antes de enviar
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Empresa</h4>
                    <div><span className="text-muted-foreground">CNPJ:</span> <strong>{form.getValues("cnpj")}</strong></div>
                    <div><span className="text-muted-foreground">Razão Social:</span> <strong>{form.getValues("legal_name") || "—"}</strong></div>
                    <div><span className="text-muted-foreground">Fantasia:</span> <strong>{form.getValues("trade_name") || "—"}</strong></div>
                    <div><span className="text-muted-foreground">CNAE:</span> <strong>{form.getValues("cnae") || "—"}</strong></div>
                    <div><span className="text-muted-foreground">Situação:</span>{" "}
                      {form.getValues("situacao_cadastral") === "ATIVA"
                        ? <Badge className="bg-carbo-green text-white">Ativa</Badge>
                        : <Badge variant="secondary">{form.getValues("situacao_cadastral") || "—"}</Badge>
                      }
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Contato</h4>
                    <div><span className="text-muted-foreground">Nome:</span> <strong>{form.getValues("contact_name")}</strong></div>
                    <div><span className="text-muted-foreground">Telefone:</span> <strong>{form.getValues("contact_phone") || "—"}</strong></div>
                    <div><span className="text-muted-foreground">Email:</span> <strong>{form.getValues("contact_email") || "—"}</strong></div>
                    <div><span className="text-muted-foreground">Cidade:</span> <strong>{form.getValues("city") || "—"} / {form.getValues("state") || "—"}</strong></div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Perfil B2B</h4>
                    <div><span className="text-muted-foreground">Vertical:</span>{" "}
                      <Badge variant="outline">{BUSINESS_VERTICALS.find((v) => v.value === form.getValues("business_vertical"))?.label}</Badge>
                    </div>
                    <div><span className="text-muted-foreground">Modelo:</span>{" "}
                      <Badge variant="outline">{BUSINESS_MODELS.find((m) => m.value === form.getValues("business_model"))?.label}</Badge>
                    </div>
                    <div><span className="text-muted-foreground">Vol. Mensal:</span> <strong>{form.getValues("estimated_monthly_volume") || "—"}</strong></div>
                    <div className="flex gap-2">
                      {form.getValues("works_with_diesel") && <Badge>Diesel</Badge>}
                      {form.getValues("works_with_fleets") && <Badge>Frotas</Badge>}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Checklist</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant={checklistProgress === CHECKLIST_ITEMS.length ? "default" : "secondary"}>
                        {checklistProgress}/{CHECKLIST_ITEMS.length} itens
                      </Badge>
                    </div>
                    {CHECKLIST_ITEMS.filter((i) => checkedItems[i.id]).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-carbo-green">
                        <CheckCircle2 className="h-3 w-3" /> {item.label}
                      </div>
                    ))}
                    {CHECKLIST_ITEMS.filter((i) => !checkedItems[i.id]).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-3 w-3" /> {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </CarboCard>
            )}

            {/* ── Navigation buttons ─────────────────────────────────── */}
            <div className="flex justify-between pt-4">
              <CarboButton
                type="button"
                variant="outline"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Anterior
              </CarboButton>

              {step < 4 ? (
                <CarboButton
                  type="button"
                  onClick={() => setStep((s) => Math.min(4, s + 1))}
                  disabled={!canGoNext()}
                >
                  Próximo <ArrowRight className="h-4 w-4 ml-1" />
                </CarboButton>
              ) : (
                <CarboButton type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Cadastrar Lead B2B
                </CarboButton>
              )}
            </div>
          </form>
        </Form>
      </div>
    </BoardLayout>
  );
}
