/**
 * AccessConfigDialog — Modal para configurar os 3 pilares de acesso de um usuário
 *
 * 1. Nível de Acesso (user_roles): operator / manager / admin
 * 2. Funções no Carbo Controle (carbo_user_roles): checkboxes
 * 3. Interfaces Liberadas (profiles.allowed_interfaces): checkboxes
 *
 * Abre a partir da aba "Usuários com Acesso" em /team.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield } from "lucide-react";
import {
  useUpdateUserRole,
  useReplaceCarboRoles,
  useUpdateAllowedInterfaces,
  type TeamMember,
} from "@/hooks/useTeamMembers";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// ─── Constantes ───────────────────────────────────────────────────────────────

const APP_ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  { value: "operator", label: "Operador",  hint: "Acesso operacional básico" },
  { value: "manager",  label: "Gestor",    hint: "Gerencia equipe e aprova ações" },
  { value: "admin",    label: "Admin",     hint: "Acesso completo ao sistema" },
];

const CARBO_ROLE_OPTIONS = [
  { value: "gestor_adm",      label: "Gestor ADM",            hint: "Equipe, Admin, Configurações" },
  { value: "gestor_fin",      label: "Gestor Financeiro",     hint: "Financeiro, Relatórios" },
  { value: "gestor_compras",  label: "Gestor Compras & Log.", hint: "Suprimentos, Logística" },
  { value: "operador_fiscal", label: "Operador Fiscal",       hint: "NF-e, Faturamento" },
  { value: "operador",        label: "Operador",              hint: "Produção, OS" },
];

const HUB_OPTIONS = [
  { value: "carbo_ops",          label: "Carbo Controle",      hint: "Sistema interno de gestão" },
  { value: "portal_licenciado",  label: "Portal Licenciados",  hint: "Área dos licenciados" },
  { value: "portal_pdv",         label: "Portal Lojas (PDV)",  hint: "Ponto de venda / lojas" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AccessConfigDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AccessConfigDialog({ member, open, onOpenChange }: AccessConfigDialogProps) {
  const updateRole      = useUpdateUserRole();
  const replaceCarboRoles = useReplaceCarboRoles();
  const updateInterfaces  = useUpdateAllowedInterfaces();

  const [selectedRole,        setSelectedRole]        = useState<AppRole>("operator");
  const [selectedCarboRoles,  setSelectedCarboRoles]  = useState<string[]>([]);
  const [selectedInterfaces,  setSelectedInterfaces]  = useState<string[]>([]);
  const [submitting,          setSubmitting]          = useState(false);

  // Seed state whenever member changes
  useEffect(() => {
    if (!member) return;
    setSelectedRole((member.roles[0] as AppRole) ?? "operator");
    setSelectedCarboRoles(member.carbo_roles ?? []);
    setSelectedInterfaces(member.allowed_interfaces ?? []);
  }, [member]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const toggleCarboRole = (role: string) => {
    setSelectedCarboRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleInterface = (iface: string) => {
    setSelectedInterfaces((prev) =>
      prev.includes(iface) ? prev.filter((i) => i !== iface) : [...prev, iface]
    );
  };

  const handleSave = async () => {
    if (!member) return;
    setSubmitting(true);
    try {
      await Promise.all([
        updateRole.mutateAsync({ userId: member.id, role: selectedRole }),
        replaceCarboRoles.mutateAsync({ userId: member.id, roles: selectedCarboRoles }),
        updateInterfaces.mutateAsync({ userId: member.id, allowed_interfaces: selectedInterfaces }),
      ]);
      onOpenChange(false);
    } catch {
      // Erros já tratados individualmente por cada mutation (toast.error)
    } finally {
      setSubmitting(false);
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Configurar Acesso
          </DialogTitle>
        </DialogHeader>

        {/* Identidade do usuário */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
            {getInitials(member.full_name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{member.full_name || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{member.email || "sem e-mail"}</p>
          </div>
          {member.department && (
            <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">
              {member.department}
            </Badge>
          )}
        </div>

        <div className="space-y-5">
          {/* ── Seção 1: Nível de Acesso ───────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              Nível de Acesso
              <span className="text-xs text-muted-foreground font-normal">(user_roles)</span>
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => setSelectedRole(v as AppRole)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">— {opt.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Seção 2: Funções no Carbo Controle ────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              Funções no Carbo Controle
              <span className="text-xs text-muted-foreground font-normal">(carbo_roles)</span>
            </Label>
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2.5">
              {CARBO_ROLE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`cr-${opt.value}`}
                    checked={selectedCarboRoles.includes(opt.value)}
                    onCheckedChange={() => toggleCarboRole(opt.value)}
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
              {selectedCarboRoles.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma função selecionada — sem acesso ao Carbo Controle.</p>
              )}
            </div>
          </div>

          {/* ── Seção 3: Interfaces Liberadas ─────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              Interfaces Liberadas
              <span className="text-xs text-muted-foreground font-normal">(allowed_interfaces)</span>
            </Label>
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2.5">
              {HUB_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`hub-${opt.value}`}
                    checked={selectedInterfaces.includes(opt.value)}
                    onCheckedChange={() => toggleInterface(opt.value)}
                  />
                  <Label
                    htmlFor={`hub-${opt.value}`}
                    className="font-normal cursor-pointer text-sm leading-none"
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">— {opt.hint}</span>
                  </Label>
                </div>
              ))}
              {selectedInterfaces.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum hub liberado — usuário sem acesso a nenhuma interface.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
