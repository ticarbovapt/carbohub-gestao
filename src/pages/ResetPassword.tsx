import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, ShieldCheck, ArrowLeft, Mail, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$%^&*)", test: (p: string) => /[!@#$%^&*]/.test(p) },
];

type Step = "request" | "verify" | "newPassword" | "success";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Step 1: Request code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("request-password-reset", {
        body: { identifier: identifier.trim() },
      });

      if (fnError) throw new Error(fnError.message);

      // Derive email for display (mask it)
      const isEmailInput = identifier.includes("@");
      if (isEmailInput) {
        setEmail(identifier.trim().toLowerCase());
      } else {
        setEmail(""); // Username — we don't know the email
      }

      toast({ title: "Código enviado", description: "Verifique seu e-mail." });
      setStep("verify");
    } catch (err: unknown) {
      // We always show success to prevent enumeration
      toast({ title: "Código enviado", description: "Se o cadastro existir, você receberá o código por e-mail." });
      setStep("verify");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // We need the email for verification. If user entered username, ask for email too
      const emailToUse = email || identifier;

      const { data, error: fnError } = await supabase.functions.invoke("verify-reset-code", {
        body: { email: emailToUse, code, action: "verify" },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || "Código inválido");

      setStep("newPassword");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Código inválido";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Set new password
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPass || !passwordsMatch) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const emailToUse = email || identifier;

      const { data, error: fnError } = await supabase.functions.invoke("verify-reset-code", {
        body: { email: emailToUse, code, password, action: "reset" },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || "Erro ao redefinir senha");

      setStep("success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao redefinir senha";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Senha redefinida!</h1>
          <p className="text-gray-600">Sua nova senha foi configurada com sucesso. Agora faça login com ela.</p>
          <Button className="w-full" size="lg" onClick={() => navigate("/")}>
            Ir para o Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        {/* Back button */}
        <button
          onClick={() => {
            if (step === "request") navigate("/");
            else if (step === "verify") setStep("request");
            else if (step === "newPassword") setStep("verify");
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        {/* Step 1: Request */}
        {step === "request" && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Esqueceu a senha?</h1>
              <p className="text-gray-500 text-sm">
                Informe seu e-mail ou UserID e enviaremos um código de verificação.
              </p>
            </div>

            <form onSubmit={handleRequestCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">E-mail ou UserID</Label>
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="seu@email.com ou OPS0001"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={!identifier.trim() || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Código"
                )}
              </Button>
            </form>
          </>
        )}

        {/* Step 2: Verify code */}
        {step === "verify" && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <KeyRound className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Código de Verificação</h1>
              <p className="text-gray-500 text-sm">
                Digite o código de 6 dígitos enviado para seu e-mail.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* If user entered username, we need their email too */}
            {!identifier.includes("@") && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Seu e-mail cadastrado</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setError(null);
                    }}
                    placeholder="000000"
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={code.length !== 6 || !email || isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar Código"}
                </Button>
              </form>
            )}

            {identifier.includes("@") && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setError(null);
                    }}
                    placeholder="000000"
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={code.length !== 6 || isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar Código"}
                </Button>
              </form>
            )}

            <p className="text-center text-xs text-gray-400">
              O código expira em 15 minutos.
            </p>
          </>
        )}

        {/* Step 3: New password */}
        {step === "newPassword" && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Nova Senha</h1>
              <p className="text-gray-500 text-sm">
                Código verificado! Agora crie uma nova senha forte.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Crie sua nova senha"
                    className="pr-10"
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {PASSWORD_RULES.map((rule) => {
                  const passes = rule.test(password);
                  return (
                    <div key={rule.label} className="flex items-center gap-2 text-sm">
                      {password.length === 0 ? (
                        <div className="h-4 w-4 rounded-full border border-gray-300" />
                      ) : passes ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      <span className={password.length === 0 ? "text-gray-400" : passes ? "text-green-600" : "text-red-500"}>
                        {rule.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-red-500">As senhas não coincidem</p>
                )}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={!allRulesPass || !passwordsMatch || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Redefinindo...
                  </>
                ) : (
                  "Redefinir Senha"
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
