import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2, Copy, Shield, ChevronLeft, CheckCircle2, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateTeamMember } from "@/hooks/useCreateTeamMember";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useDepartmentFunctions } from "@/hooks/useDepartmentFunctions";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { SQUAD_DEPARTMENTS } from "@/constants/departments";

type DepartmentType = Database["public"]["Enums"]["department_type"];
type AppRole = Database["public"]["Enums"]["app_role"];

const DEPARTMENTS = SQUAD_DEPARTMENTS;

const ROLES: { value: AppRole; label: string }[] = [
  { value: "operator", label: "Operador" },
  { value: "manager",  label: "Gestor" },
  { value: "admin",    label: "Administrador" },
];

const CARBO_ROLE_OPTIONS = [
  { value: "gestor_adm",      label: "Gestor ADM",            hint: "Equipe, Admin, Configurações" },
  { value: "gestor_fin",      label: "Gestor Financeiro",     hint: "Financeiro, Relatórios" },
  { value: "gestor_compras",  label: "Gestor Compras & Log.", hint: "Suprimentos, Logística" },
  { value: "operador_fiscal", label: "Operador Fiscal",       hint: "NF-e, Faturamento" },
  { value: "operador",        label: "Operador",              hint: "Produção, OS" },
];

const HUB_OPTIONS = [
  { value: "carbo_ops",         label: "Carbo Controle" },
  { value: "portal_licenciado", label: "Portal Licenciados" },
  { value: "portal_pdv",        label: "Portal Lojas (PDV)" },
];


const DEFAULT_PASSWORD = "Carbo@2026";

interface FormState {
  fullName: string;
  department: DepartmentType | "";
  role: AppRole;
  funcao: string;
  escopo: string;
  hierarchyLevel: number;
  managerUserId: string;
  carboRoles: string[];
  allowedInterfaces: string[];
}

const EMPTY_FORM: FormState = {
  fullName:         "",
  department:       "",
  role:             "operator",
  funcao:           "",
  escopo:           "",
  hierarchyLevel:   6,
  managerUserId:    "",
  carboRoles:       [],
  allowedInterfaces: ["carbo_ops"],
};

interface AddMemberDialogProps {
  onMemberAdded?: () => void;
  variant?: "default" | "sidebar";
}

export function AddMemberDialog({ onMemberAdded, variant = "default" }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "credentials">("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const createMember = useCreateTeamMember();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: deptFunctions = [] } = useDepartmentFunctions(form.department || undefined);

  const approvedMembers = teamMembers.filter((m) => m.status === "approved");

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep("form");
      setForm(EMPTY_FORM);
      setCredentials(null);
    }, 200);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCarboRole = (role: string) =>
    setForm((prev) => ({
      ...prev,
      carboRoles: prev.carboRoles.includes(role)
        ? prev.carboRoles.filter((r) => r !== role)
        : [...prev.carboRoles, role],
    }));

  const toggleInterface = (iface: string) =>
    setForm((prev) => ({
      ...prev,
      allowedInterfaces: prev.allowedInterfaces.includes(iface)
        ? prev.allowedInterfaces.filter((i) => i !== iface)
        : [...prev.allowedInterfaces, iface],
    }));

  const canProceed =
    form.fullName.trim().length > 0 &&
    form.department !== "" &&
    form.allowedInterfaces.length > 0;

  const handleConfirm = async () => {
    try {
      const result = await createMember.mutateAsync({
        fullName:          form.fullName,
        department:        form.department as DepartmentType,
        role:              form.role,
        funcao:            form.funcao || undefined,
        escopo:            form.escopo || undefined,
        hierarchyLevel:    form.hierarchyLevel,
        managerUserId:     form.managerUserId || undefined,
        allowedInterfaces: form.allowedInterfaces,
      });

      // Assign carbo_user_roles
      if (form.carboRoles.length > 0) {
        const rows = form.carboRoles.map((r) => ({ user_id: result.userId, role: r as any }));
        const { error } = await supabase.from("carbo_user_roles").insert(rows);
        if (error) toast.warning("Conta criada, mas erro ao atribuir funções: " + error.message);
      }

      setCredentials({ username: result.username, password: DEFAULT_PASSWORD });
      setStep("credentials");
      onMemberAdded?.();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const deptLabel = DEPARTMENTS.find((d) => d.value === form.department)?.label ?? form.department;
  const roleLabel = ROLES.find((r) => r.value === form.role)?.label ?? form.role;
  const managerLabel = approvedMembers.find((m) => m.id === form.managerUserId)?.full_name ?? "—";
  const levelLabel = deptFunctions.find((f) => f.function_key === form.funcao)?.label ?? "—";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        {variant === "sidebar" ? (
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium bg-secondary/80 text-foreground hover:bg-secondary transition-all">
            <UserPlus className="h-4 w-4 flex-shrink-0" />
            <span>+ Nova Conta</span>
          </button>
        ) : (
          <Button className="gap-2 carbo-gradient text-white hover:opacity-90">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Criar Nova Conta</span>
            <span className="sm:hidden">Criar</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg z-[9999] max-h-[90vh] overflow-y-auto">
        {/* ── FORMULÁRIO ─────────────────────────────────────────────────────── */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <UserPlus className="h-5 w-5 text-primary" />
                Criar Nova Conta
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Identidade */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identidade</p>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo *</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                    placeholder="Ex: João Silva"
                    autoComplete="off"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Departamento *</Label>
                    <Select value={form.department} onValueChange={(v) => {
                      setField("department", v as DepartmentType);
                      setField("hierarchyLevel", 99);
                      setField("funcao", "");
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent className="z-[10000]">
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            <span className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-1 rounded">{d.prefix}</code>
                              {d.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Select
                      value={form.funcao || ""}
                      onValueChange={(v) => {
                        const fn = deptFunctions.find(f => f.function_key === v);
                        setField("funcao", v);
                        setField("hierarchyLevel", fn?.hierarchy_order ?? 99);
                      }}
                      disabled={!form.department}
                    >
                      <SelectTrigger><SelectValue placeholder={form.department ? "Selecione a função" : "Selecione o dept. primeiro"} /></SelectTrigger>
                      <SelectContent className="z-[10000]">
                        {deptFunctions.map((fn) => (
                          <SelectItem key={fn.function_key} value={fn.function_key}>
                            {fn.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Escopo / Responsabilidades</Label>
                  <Input
                    value={form.escopo}
                    onChange={(e) => setField("escopo", e.target.value)}
                    placeholder="Principais atividades e áreas de atuação"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Superior Direto</Label>
                  <Select
                    value={form.managerUserId || "_none"}
                    onValueChange={(v) => setField("managerUserId", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent className="z-[10000]">
                      <SelectItem value="_none">— Sem superior direto —</SelectItem>
                      {approvedMembers
                        .filter((m) => m.full_name)
                        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name}
                            {m.department && (
                              <span className="text-muted-foreground ml-1.5 text-xs">({m.department})</span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Acesso */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Acesso
                </p>
                <div className="space-y-2">
                  <Label>Nível de Acesso</Label>
                  <Select value={form.role} onValueChange={(v) => setField("role", v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[10000]">
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Funções no Carbo Controle</Label>
                  <div className="grid grid-cols-1 gap-1.5 border rounded-xl p-3 bg-muted/30">
                    {CARBO_ROLE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2.5">
                        <Checkbox
                          id={`cr-${opt.value}`}
                          checked={form.carboRoles.includes(opt.value)}
                          onCheckedChange={() => toggleCarboRole(opt.value)}
                        />
                        <Label htmlFor={`cr-${opt.value}`} className="font-normal cursor-pointer text-sm leading-none">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-muted-foreground ml-1.5 text-xs">— {opt.hint}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Interfaces Liberadas *</Label>
                  <div className="grid grid-cols-1 gap-1.5 border rounded-xl p-3 bg-muted/30">
                    {HUB_OPTIONS.map((hub) => (
                      <div key={hub.value} className="flex items-center gap-2.5">
                        <Checkbox
                          id={`hub-${hub.value}`}
                          checked={form.allowedInterfaces.includes(hub.value)}
                          onCheckedChange={() => toggleInterface(hub.value)}
                        />
                        <Label htmlFor={`hub-${hub.value}`} className="font-normal cursor-pointer text-sm">{hub.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!canProceed}
                  className="carbo-gradient text-white"
                >
                  Revisar e Criar
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── CONFIRMAÇÃO ────────────────────────────────────────────────────── */}
        {step === "confirm" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setStep("form")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </button>
              </div>
              <DialogTitle>Confirmar criação de conta</DialogTitle>
            </DialogHeader>

            <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm mt-2">
              {[
                { label: "Nome",              value: form.fullName },
                { label: "Departamento",      value: deptLabel },
                { label: "Nível Hierárquico", value: levelLabel },
                { label: "Cargo / Função",    value: form.funcao || "—" },
                { label: "Escopo",            value: form.escopo || "—" },
                { label: "Superior Direto",   value: managerLabel },
                { label: "Nível de Acesso",   value: roleLabel },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right max-w-[60%] truncate">{value as string}</span>
                </div>
              ))}
              {form.carboRoles.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Funções Carbo</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {form.carboRoles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interfaces</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {form.allowedInterfaces.map((i) => (
                    <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-4">{i}</Badge>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              O colaborador receberá o username gerado automaticamente e a senha padrão <code className="font-mono bg-muted px-1 rounded">Carbo@2026</code>. Ele deve definir uma nova senha e informar o e-mail no primeiro acesso.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" onClick={() => setStep("form")}>Voltar</Button>
              <Button
                onClick={handleConfirm}
                disabled={createMember.isPending}
                className="carbo-gradient text-white"
              >
                {createMember.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</>
                ) : (
                  <><UserPlus className="mr-2 h-4 w-4" />Confirmar e Criar</>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ── CREDENCIAIS ────────────────────────────────────────────────────── */}
        {step === "credentials" && credentials && (
          <>
            <DialogHeader className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <DialogTitle className="text-xl">Conta criada com sucesso!</DialogTitle>
            </DialogHeader>

            <p className="text-sm text-center text-muted-foreground">
              Compartilhe as credenciais abaixo com o colaborador. Ele definirá nova senha e e-mail no primeiro acesso.
            </p>

            <div className="rounded-xl border bg-muted/30 p-4 space-y-3 my-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4" /> Username
                </span>
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                    {credentials.username}
                  </code>
                  <button
                    onClick={() => copyToClipboard(credentials.username, "Username")}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Senha inicial</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded">
                    {credentials.password}
                  </code>
                  <button
                    onClick={() => copyToClipboard(credentials.password, "Senha")}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              No primeiro login, o colaborador deverá definir uma nova senha e informar seu e-mail real.
            </p>

            <Button className="w-full mt-3 carbo-gradient text-white" onClick={handleClose}>
              Concluir
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
