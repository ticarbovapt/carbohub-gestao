import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff, Check, X, AlertTriangle, ArrowLeft, Mail } from "lucide-react";
import logoCarbo from "@/assets/logo-carbo.png";
import { cn } from "@/lib/utils";

const INTERNAL_EMAIL_SUFFIX = "@carbo.internal";

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
  weight: number;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: "Mínimo de 8 caracteres", test: (p) => p.length >= 8, weight: 20 },
  { label: "Letra maiúscula", test: (p) => /[A-Z]/.test(p), weight: 20 },
  { label: "Letra minúscula", test: (p) => /[a-z]/.test(p), weight: 20 },
  { label: "Número", test: (p) => /[0-9]/.test(p), weight: 20 },
  { label: "Caractere especial (!@#$%)", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p), weight: 20 },
];

interface ForcePasswordChangeProps {
  userName: string;
  onPasswordChanged: () => void;
  onBack?: () => void;
}

export function ForcePasswordChange({ userName, onPasswordChanged, onBack }: ForcePasswordChangeProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingHIBP, setIsCheckingHIBP] = useState(false);
  const [hibpResult, setHibpResult] = useState<{ isPwned: boolean; count: number; message: string } | null>(null);
  const navigate = useNavigate();

  // Check password against HIBP database
  const checkPasswordHIBP = useCallback(async (password: string) => {
    if (password.length < 8) {
      setHibpResult(null);
      return;
    }

    setIsCheckingHIBP(true);
    try {
      const response = await supabase.functions.invoke("check-password-hibp", {
        body: { password },
      });

      if (response.data) {
        setHibpResult(response.data);
      }
    } catch (error) {
      console.error("HIBP check error:", error);
      setHibpResult(null);
    } finally {
      setIsCheckingHIBP(false);
    }
  }, []);

  // Debounced HIBP check when password changes
  const handlePasswordChange = useCallback((value: string) => {
    setNewPassword(value);
    setHibpResult(null);
    
    // Check HIBP after user stops typing
    const timer = setTimeout(() => {
      if (value.length >= 8) {
        checkPasswordHIBP(value);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [checkPasswordHIBP]);

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "", color: "" };
    
    const metRequirements = PASSWORD_REQUIREMENTS.filter(req => req.test(newPassword));
    const score = metRequirements.reduce((sum, req) => sum + req.weight, 0);
    
    // Add bonus for extra length
    const lengthBonus = Math.min(newPassword.length - 8, 4) * 2.5;
    const finalScore = Math.min(score + (lengthBonus > 0 ? lengthBonus : 0), 100);
    
    if (finalScore < 40) return { score: finalScore, label: "Fraca", color: "bg-destructive" };
    if (finalScore < 60) return { score: finalScore, label: "Razoável", color: "bg-amber-500" };
    if (finalScore < 80) return { score: finalScore, label: "Boa", color: "bg-blue-500" };
    return { score: finalScore, label: "Forte", color: "bg-emerald-500" };
  }, [newPassword]);

  const isPasswordValid = PASSWORD_REQUIREMENTS.every((req) => req.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isPasswordPwned = hibpResult?.isPwned === true;
  const emailTrimmed = email.trim().toLowerCase();
  const isEmailValid =
    emailTrimmed.length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed) &&
    !emailTrimmed.endsWith(INTERNAL_EMAIL_SUFFIX);
  const canSubmit = isPasswordValid && passwordsMatch && isEmailValid && !isLoading && !isPasswordPwned && !isCheckingHIBP;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit) return;
    
    setIsLoading(true);

    try {
      // Update password and real email simultaneously
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        email: emailTrimmed,
      });

      if (updateError) throw updateError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            password_must_change: false,
            last_access: new Date().toISOString(),
            email: emailTrimmed,
          } as any)
          .eq("id", user.id);

        if (profileError) {
          console.error("Profile update error:", profileError);
        }
      }

      toast.success("Senha e e-mail definidos! Bem-vindo ao Carbo Controle.");
      onPasswordChanged();
      navigate("/onboarding");
    } catch (error: any) {
      console.error("Password change error:", error);
      toast.error(error.message || "Erro ao atualizar senha");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-board-navy via-board-navy/95 to-board-navy/90 p-4 relative">
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="absolute top-4 left-4 gap-2 text-white/70 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      )}
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={logoCarbo} alt="Carbo" className="h-12" />
          </div>
          <CardTitle className="text-2xl text-board-navy">
            Olá, {userName}! 👋
          </CardTitle>
          <CardDescription className="text-base">
            Antes de continuar, informe seu e-mail real e defina sua senha.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* E-mail real */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Seu E-mail
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                className={cn(
                  email && !isEmailValid && "border-destructive"
                )}
              />
              {email && !isEmailValid && (
                <p className="text-xs text-destructive">
                  {emailTrimmed.endsWith(INTERNAL_EMAIL_SUFFIX)
                    ? "Use seu e-mail pessoal ou corporativo real."
                    : "Informe um e-mail válido."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="Digite sua nova senha"
                  className={cn("pr-10", isPasswordPwned && "border-destructive")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="text-sm text-destructive">As senhas não coincidem</p>
              )}
            </div>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Força da senha:</span>
                  <span className={cn(
                    "font-medium",
                    passwordStrength.score < 40 && "text-destructive",
                    passwordStrength.score >= 40 && passwordStrength.score < 60 && "text-amber-500",
                    passwordStrength.score >= 60 && passwordStrength.score < 80 && "text-blue-500",
                    passwordStrength.score >= 80 && "text-emerald-500"
                  )}>
                    {passwordStrength.label}
                  </span>
                </div>
                <Progress 
                  value={passwordStrength.score} 
                  className={cn(
                    "h-2 transition-all",
                    "[&>div]:transition-all [&>div]:duration-300",
                    passwordStrength.score < 40 && "[&>div]:bg-destructive",
                    passwordStrength.score >= 40 && passwordStrength.score < 60 && "[&>div]:bg-amber-500",
                    passwordStrength.score >= 60 && passwordStrength.score < 80 && "[&>div]:bg-blue-500",
                    passwordStrength.score >= 80 && "[&>div]:bg-emerald-500"
                  )}
                />
              </div>
            )}

            {/* HIBP Leak Warning */}
            {isCheckingHIBP && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verificando segurança da senha...</span>
              </div>
            )}
            
            {hibpResult && (
              <div className={cn(
                "rounded-lg p-3 text-sm",
                hibpResult.isPwned 
                  ? "bg-destructive/10 border border-destructive/30" 
                  : "bg-emerald-500/10 border border-emerald-500/30"
              )}>
                <div className="flex items-start gap-2">
                  {hibpResult.isPwned ? (
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  <span className={hibpResult.isPwned ? "text-destructive" : "text-emerald-600"}>
                    {hibpResult.message}
                  </span>
                </div>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Requisitos da senha:
              </p>
              {PASSWORD_REQUIREMENTS.map((req, index) => {
                const isMet = req.test(newPassword);
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-2 text-sm transition-colors",
                      isMet ? "text-emerald-600" : "text-muted-foreground"
                    )}
                  >
                    {isMet ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span>{req.label}</span>
                  </div>
                );
              })}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Salvar e Continuar
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Seu acesso está criado. Agora, personalize e comece a mover a operação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
