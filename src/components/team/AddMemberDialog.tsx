import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { UserPlus, Loader2, CheckCircle, Mail, User, Shield, Briefcase, Users, Store, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateTeamMember } from "@/hooks/useCreateTeamMember";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { SQUAD_DEPARTMENTS } from "@/constants/departments";

type DepartmentType = Database["public"]["Enums"]["department_type"];
type AppRole = Database["public"]["Enums"]["app_role"];

type PlatformArea = "carbo_ops" | "portal_licenciado" | "portal_pdv";

interface AreaOption {
  value: PlatformArea;
  label: string;
  description: string;
  IconComponent: React.ElementType;
  gradient: string;
  bgColor: string;
}

// ── sem JSX no nível de módulo (evita "Z is not a constructor" no build SWC) ──
const PLATFORM_AREAS: AreaOption[] = [
  {
    value: "carbo_ops",
    label: "Carbo Controle",
    description: "Gestão operacional interna",
    IconComponent: Briefcase,
    gradient: "from-blue-500 to-blue-700",
    bgColor: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20",
  },
  {
    value: "portal_licenciado",
    label: "Portal Licenciado",
    description: "Acesso para licenciados parceiros",
    IconComponent: Users,
    gradient: "from-carbo-green to-emerald-600",
    bgColor: "bg-carbo-green/10 border-carbo-green/30 hover:bg-carbo-green/20",
  },
  {
    value: "portal_pdv",
    label: "Portal PDV",
    description: "Acesso para pontos de venda",
    IconComponent: Store,
    gradient: "from-amber-500 to-orange-600",
    bgColor: "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20",
  },
];

const DEPARTMENTS = SQUAD_DEPARTMENTS;

const ROLES: { value: AppRole; label: string; description: string }[] = [
  { value: "operator", label: "Operador", description: "Execução de tarefas operacionais" },
  { value: "manager", label: "Gestor", description: "Gerenciamento de equipe e processos" },
];

const CARBO_ROLE_OPTIONS = [
  { value: "gestor_adm",      label: "Gestor ADM",            hint: "Equipe, Admin, Configurações" },
  { value: "gestor_fin",      label: "Gestor Financeiro",     hint: "Financeiro, Relatórios" },
  { value: "gestor_compras",  label: "Gestor Compras & Log.", hint: "Suprimentos, Logística" },
  { value: "operador_fiscal", label: "Operador Fiscal",       hint: "NF-e, Faturamento" },
  { value: "operador",        label: "Operador",              hint: "Produção, OS" },
];

interface AddMemberDialogProps {
  onMemberAdded?: () => void;
  defaultArea?: PlatformArea;
  variant?: "default" | "sidebar";
}

export function AddMemberDialog({ onMemberAdded, defaultArea = "carbo_ops", variant = "default" }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"area" | "form" | "success">("area");
  const [createdMember, setCreatedMember] = useState<{ username: string; email: string; setPasswordUrl?: string; emailSent?: boolean } | null>(null);
  const [selectedArea, setSelectedArea] = useState<PlatformArea>(defaultArea);
  const [selectedCarboRoles, setSelectedCarboRoles] = useState<string[]>([]);

  const createMember = useCreateTeamMember();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const fullName = formData.get("fullName") as string;
    const department = formData.get("department") as DepartmentType;
    const role = formData.get("role") as AppRole;
    const funcao = (formData.get("funcao") as string) || undefined;
    const escopo = (formData.get("escopo") as string) || undefined;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("E-mail inválido");
      return;
    }

    try {
      const result = await createMember.mutateAsync({
        email,
        fullName,
        department,
        role,
        funcao,
        escopo,
      });

      setCreatedMember({
        username: result.username,
        email: result.email,
        setPasswordUrl: result.setPasswordUrl,
        emailSent: result.emailSent,
      });

      // Assign carbo_user_roles if selected
      if (selectedArea === "carbo_ops" && selectedCarboRoles.length > 0) {
        const rows = selectedCarboRoles.map((role) => ({
          user_id: result.userId,
          role: role as any,
        }));
        const { error: carboRolesError } = await supabase
          .from("carbo_user_roles")
          .insert(rows);
        if (carboRolesError) {
          toast.warning("Conta criada, mas erro ao atribuir funções: " + carboRolesError.message);
        }
      }

      setStep("success");

      if (result.emailSent) {
        toast.success("Conta criada e convite enviado por e-mail!");
      } else {
        toast.warning("Conta criada! Compartilhe o link de acesso manualmente.");
      }

      onMemberAdded?.();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after animation
    setTimeout(() => {
      setStep("area");
      setCreatedMember(null);
      setSelectedArea(defaultArea);
      setSelectedCarboRoles([]);
    }, 200);
  };

  const handleAreaSelect = (area: PlatformArea) => {
    setSelectedArea(area);
    setStep("form");
  };

  const handleBackToArea = () => {
    setStep("area");
  };

  const selectedAreaConfig = PLATFORM_AREAS.find(a => a.value === selectedArea);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        {variant === "sidebar" ? (
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium bg-secondary/80 text-foreground hover:bg-secondary transition-all duration-200">
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
      <DialogContent className="max-w-lg z-[9999]">
        {step === "area" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <UserPlus className="h-5 w-5 text-carbo-green" />
                Criar Nova Conta
              </DialogTitle>
              <DialogDescription>
                Selecione a área da plataforma para o novo usuário
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              {PLATFORM_AREAS.map((area) => (
                <button
                  key={area.value}
                  onClick={() => handleAreaSelect(area.value)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left",
                    area.bgColor
                  )}
                >
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center text-white",
                    `bg-gradient-to-br ${area.gradient}`
                  )}>
                    <area.IconComponent className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{area.label}</p>
                    <p className="text-sm text-muted-foreground">{area.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
            </div>
          </>
        ) : step === "form" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <button 
                  onClick={handleBackToArea}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Voltar
                </button>
              </div>
              <DialogTitle className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center text-white",
                  `bg-gradient-to-br ${selectedAreaConfig?.gradient}`
                )}>
                  {selectedAreaConfig && <selectedAreaConfig.IconComponent className="h-5 w-5" />}
                </div>
                <div>
                  <span className="block">Nova Conta - {selectedAreaConfig?.label}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedAreaConfig?.description}
                  </span>
                </div>
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="fullName" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Nome Completo
                  </Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    placeholder="João Silva"
                    required
                    autoComplete="off"
                    className="h-11"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="joao@empresa.com"
                    required
                    autoComplete="off"
                    className="h-11"
                  />
                </div>

                {/* Campos condicionais baseados na área */}
                {selectedArea === "carbo_ops" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        Função
                      </Label>
                      <Select name="role" defaultValue="operator">
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Selecione a função" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          {ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              <div>
                                <span className="font-medium">{role.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({role.description})
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">Departamento</Label>
                      <Select name="department" required>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          {DEPARTMENTS.map((dept) => (
                            <SelectItem key={dept.value} value={dept.value}>
                              <span className="flex items-center gap-2">
                                <code className="text-xs bg-muted px-1 rounded">{dept.prefix}</code>
                                {dept.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="funcao">Função Principal</Label>
                      <Input
                        id="funcao"
                        name="funcao"
                        placeholder="ex: Diretor de Expansão, Analista Financeiro..."
                        className="h-11"
                      />
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="escopo">Escopo / Responsabilidades</Label>
                      <Input
                        id="escopo"
                        name="escopo"
                        placeholder="Principais atividades e responsabilidades..."
                        className="h-11"
                      />
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        Funções de Acesso (módulos do Carbo Controle)
                      </Label>
                      <div className="grid grid-cols-1 gap-1.5 border border-border rounded-xl p-3 bg-muted/30">
                        {CARBO_ROLE_OPTIONS.map((opt) => (
                          <div key={opt.value} className="flex items-center gap-2.5">
                            <Checkbox
                              id={`cr-${opt.value}`}
                              checked={selectedCarboRoles.includes(opt.value)}
                              onCheckedChange={(checked) =>
                                setSelectedCarboRoles((prev) =>
                                  checked
                                    ? [...prev, opt.value]
                                    : prev.filter((r) => r !== opt.value)
                                )
                              }
                            />
                            <Label
                              htmlFor={`cr-${opt.value}`}
                              className="font-normal cursor-pointer text-sm leading-none"
                            >
                              <span className="font-medium">{opt.label}</span>
                              <span className="text-muted-foreground ml-1.5 text-xs">— {opt.hint}</span>
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Selecione as funções que este colaborador poderá exercer no sistema.
                      </p>
                    </div>
                  </>
                )}

                {selectedArea === "portal_licenciado" && (
                  <div className="col-span-2 p-4 bg-carbo-green/5 border border-carbo-green/20 rounded-xl">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Nota:</strong> Este usuário será vinculado a um licenciado. 
                      Após a criação, configure o vínculo na página de detalhes do licenciado.
                    </p>
                  </div>
                )}

                {selectedArea === "portal_pdv" && (
                  <div className="col-span-2 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Nota:</strong> Este usuário será vinculado a um PDV. 
                      Após a criação, configure o vínculo na página de gestão de PDVs.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMember.isPending}
                  className="carbo-gradient text-white"
                >
                  {createMember.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Criar Conta
                    </>
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-carbo-green/20 to-carbo-blue/20">
                <CheckCircle className="h-10 w-10 text-carbo-green" />
              </div>
              <DialogTitle className="text-xl">Conta Criada com Sucesso!</DialogTitle>
              <DialogDescription>
                {createdMember?.emailSent
                  ? "O convite foi enviado por e-mail com o link para cadastro de senha."
                  : "O acesso foi criado. Compartilhe o link de cadastro manualmente."}
              </DialogDescription>
            </DialogHeader>

            <div className="bg-muted/50 rounded-xl p-5 space-y-4 my-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Área:</span>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-6 w-6 rounded-lg flex items-center justify-center text-white text-xs",
                    `bg-gradient-to-br ${selectedAreaConfig?.gradient}`
                  )}>
                    {selectedAreaConfig && <selectedAreaConfig.IconComponent className="h-5 w-5" />}
                  </div>
                  <span className="font-medium">{selectedAreaConfig?.label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">UserID:</span>
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                    {createdMember?.username}
                  </code>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(createdMember?.username || "");
                      toast.success("UserID copiado!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">E-mail:</span>
                <span className="text-sm font-medium">{createdMember?.email}</span>
              </div>

              {/* Always show invite link when available */}
              {createdMember?.setPasswordUrl && (
                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    {createdMember.emailSent ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className={cn(
                      "text-sm font-semibold",
                      createdMember.emailSent ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {createdMember.emailSent
                        ? "Link de Acesso (e-mail enviado)"
                        : "Link de Acesso (compartilhe manualmente)"}
                    </span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg p-3 border",
                    createdMember.emailSent
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                  )}>
                    <code className={cn(
                      "font-mono text-xs break-all flex-1",
                      createdMember.emailSent
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    )}>
                      {createdMember.setPasswordUrl}
                    </code>
                    <button
                      type="button"
                      className={cn(
                        "p-1.5 rounded-md transition-colors flex-shrink-0",
                        createdMember.emailSent
                          ? "hover:bg-emerald-200/50 dark:hover:bg-emerald-800/30"
                          : "hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
                      )}
                      onClick={() => {
                        navigator.clipboard.writeText(createdMember.setPasswordUrl || "");
                        toast.success("Link copiado!");
                      }}
                    >
                      <Copy className={cn(
                        "h-4 w-4",
                        createdMember.emailSent ? "text-emerald-600" : "text-amber-600"
                      )} />
                    </button>
                  </div>
                  <p className={cn(
                    "text-xs mt-2",
                    createdMember.emailSent
                      ? "text-emerald-600 dark:text-emerald-500"
                      : "text-amber-600 dark:text-amber-500"
                  )}>
                    {createdMember.emailSent
                      ? "O e-mail foi enviado. Guarde este link como backup — expira em 72 horas."
                      : "Envie este link ao colaborador. Ele expira em 72 horas."}
                  </p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {createdMember?.emailSent
                ? "O colaborador receberá um e-mail com seu UserID e um link para cadastrar a senha."
                : "Envie o link acima ao colaborador para que ele cadastre sua senha de acesso."}
            </p>

            <Button className="w-full mt-4 carbo-gradient text-white" onClick={handleClose}>
              Concluir
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
