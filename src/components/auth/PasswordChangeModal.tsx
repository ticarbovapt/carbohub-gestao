/**
 * PasswordChangeModal
 * Aparece automaticamente no primeiro login (profile.password_must_change = true).
 * Não pode ser fechado sem trocar a senha.
 */
import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, ShieldCheck, Eye, EyeOff, Check, X, AlertTriangle, KeyRound,
} from "lucide-react";
import logoCarbo from "@/assets/logo-carbo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

// ── Requisitos de senha ──────────────────────────────────────────────────────
const PASSWORD_REQUIREMENTS = [
  { label: "Mínimo de 8 caracteres",      test: (p: string) => p.length >= 8,                     weight: 20 },
  { label: "Letra maiúscula",             test: (p: string) => /[A-Z]/.test(p),                   weight: 20 },
  { label: "Letra minúscula",             test: (p: string) => /[a-z]/.test(p),                   weight: 20 },
  { label: "Número",                      test: (p: string) => /[0-9]/.test(p),                   weight: 20 },
  { label: 'Caractere especial (!@#$%)',  test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p), weight: 20 },
];

export function PasswordChangeModal() {
  const { user, profile, passwordMustChange, refreshProfile } = useAuth();

  const [newPassword, setNewPassword]           = useState("");
  const [confirmPassword, setConfirmPassword]   = useState("");
  const [showNew, setShowNew]                   = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [isCheckingHIBP, setIsCheckingHIBP]     = useState(false);
  const [hibpResult, setHibpResult]             = useState<{ isPwned: boolean; count: number; message: string } | null>(null);

  // ── HIBP check ──────────────────────────────────────────────────────────
  const checkPasswordHIBP = useCallback(async (password: string) => {
    if (password.length < 8) { setHibpResult(null); return; }
    setIsCheckingHIBP(true);
    try {
      const response = await supabase.functions.invoke("check-password-hibp", { body: { password } });
      if (response.data) setHibpResult(response.data);
    } catch { setHibpResult(null); }
    finally { setIsCheckingHIBP(false); }
  }, []);

  const handlePasswordChange = useCallback((value: string) => {
    setNewPassword(value);
    setHibpResult(null);
    const timer = setTimeout(() => { if (value.length >= 8) checkPasswordHIBP(value); }, 800);
    return () => clearTimeout(timer);
  }, [checkPasswordHIBP]);

  // ── Força da senha ──────────────────────────────────────────────────────
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "", color: "" };
    const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(newPassword));
    const score = Math.min(
      met.reduce((s, r) => s + r.weight, 0) + Math.min(newPassword.length - 8, 4) * 2.5,
      100
    );
    if (score < 40) return { score, label: "Fraca",   color: "bg-destructive" };
    if (score < 60) return { score, label: "Razoável",color: "bg-amber-500" };
    if (score < 80) return { score, label: "Boa",     color: "bg-blue-500" };
    return              { score, label: "Forte",    color: "bg-emerald-500" };
  }, [newPassword]);

  const isPasswordValid  = PASSWORD_REQUIREMENTS.every((r) => r.test(newPassword));
  const passwordsMatch   = newPassword === confirmPassword && confirmPassword.length > 0;
  const isPasswordPwned  = hibpResult?.isPwned === true;
  const canSubmit        = isPasswordValid && passwordsMatch && !isLoading && !isPasswordPwned && !isCheckingHIBP;

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) throw pwErr;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase
          .from("profiles")
          .update({ password_must_change: false, last_access: new Date().toISOString() })
          .eq("id", currentUser.id);
      }

      toast.success("Senha definida! Bem-vindo ao Carbo Controle.");
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar senha");
    } finally {
      setIsLoading(false);
    }
  };

  // Não mostra se não há usuário ou se não precisa trocar senha
  if (!user || !passwordMustChange) return null;

  const firstName = profile?.full_name?.split(" ")[0] || "Usuário";

  return (
    <Dialog open modal>
      {/* DialogContent sem botão X — força o usuário a trocar a senha */}
      <DialogContent
        className="max-w-md [&>button[data-radix-dialog-close]]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center items-center pb-2">
          <img src={logoCarbo} alt="Carbo" className="h-10 mb-3" />
          <DialogTitle className="text-xl flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Olá, {firstName}! Defina sua senha
          </DialogTitle>
          <DialogDescription>
            Por segurança, você precisa criar uma senha pessoal antes de continuar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Nova senha */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-newpwd">Nova Senha</Label>
            <div className="relative">
              <Input
                id="modal-newpwd"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="Digite sua nova senha"
                className={cn("pr-10", isPasswordPwned && "border-destructive")}
                autoFocus
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirmar senha */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-confirmpwd">Confirmar Senha</Label>
            <div className="relative">
              <Input
                id="modal-confirmpwd"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-destructive">As senhas não coincidem</p>
            )}
          </div>

          {/* Força */}
          {newPassword && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Força:</span>
                <span className={cn(
                  "font-medium",
                  passwordStrength.score < 40  && "text-destructive",
                  passwordStrength.score >= 40 && passwordStrength.score < 60 && "text-amber-500",
                  passwordStrength.score >= 60 && passwordStrength.score < 80 && "text-blue-500",
                  passwordStrength.score >= 80 && "text-emerald-500",
                )}>{passwordStrength.label}</span>
              </div>
              <Progress value={passwordStrength.score} className={cn(
                "h-1.5 [&>div]:transition-all [&>div]:duration-300",
                passwordStrength.score < 40  && "[&>div]:bg-destructive",
                passwordStrength.score >= 40 && passwordStrength.score < 60 && "[&>div]:bg-amber-500",
                passwordStrength.score >= 60 && passwordStrength.score < 80 && "[&>div]:bg-blue-500",
                passwordStrength.score >= 80 && "[&>div]:bg-emerald-500",
              )} />
            </div>
          )}

          {/* HIBP */}
          {isCheckingHIBP && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verificando segurança da senha…
            </div>
          )}
          {hibpResult && (
            <div className={cn(
              "rounded-lg p-2.5 text-xs",
              hibpResult.isPwned
                ? "bg-destructive/10 border border-destructive/30"
                : "bg-emerald-500/10 border border-emerald-500/30",
            )}>
              <div className="flex items-start gap-1.5">
                {hibpResult.isPwned
                  ? <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  : <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />}
                <span className={hibpResult.isPwned ? "text-destructive" : "text-emerald-600"}>
                  {hibpResult.message}
                </span>
              </div>
            </div>
          )}

          {/* Requisitos */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Requisitos:</p>
            {PASSWORD_REQUIREMENTS.map((req, i) => {
              const ok = req.test(newPassword);
              return (
                <div key={i} className={cn("flex items-center gap-1.5 text-xs transition-colors", ok ? "text-emerald-600" : "text-muted-foreground")}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {req.label}
                </div>
              );
            })}
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</>
            ) : (
              <><ShieldCheck className="mr-2 h-4 w-4" />Definir senha e continuar</>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
