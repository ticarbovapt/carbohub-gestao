import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$%^&*)", test: (p: string) => /[!@#$%^&*]/.test(p) },
];

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ username?: string; fullName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRulesPass && passwordsMatch && !isSubmitting;

  useEffect(() => {
    if (!token) {
      setError("Link inválido. Token não encontrado na URL.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !token) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("set-initial-password", {
        body: { token, password },
      });

      if (fnError) {
        throw new Error(fnError.message || "Erro ao definir senha");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Erro ao definir senha");
      }

      setIsSuccess(true);
      setSuccessData(data.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Senha cadastrada!</h1>
          <p className="text-gray-600">
            {successData?.fullName ? `${successData.fullName}, sua` : "Sua"} senha foi criada com sucesso.
          </p>
          {successData?.username && (
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-sm text-gray-500">Seu UserID para login:</p>
              <p className="text-xl font-mono font-bold text-blue-600">{successData.username}</p>
            </div>
          )}
          <p className="text-sm text-gray-500">
            Use seu e-mail ou UserID junto com a senha que você acabou de criar.
          </p>
          <Button className="w-full" size="lg" onClick={() => navigate("/")}>
            Ir para o Login
          </Button>
        </div>
      </div>
    );
  }

  // Error state (no token)
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Link inválido</h1>
          <p className="text-gray-600">
            Este link não contém um token válido. Solicite ao seu gestor um novo convite de acesso.
          </p>
          <Button variant="outline" onClick={() => navigate("/")}>
            Voltar ao Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Cadastre sua Senha</h1>
          <p className="text-gray-500 text-sm">
            Crie uma senha forte para acessar o Carbo OPS
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Nova Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie sua senha"
                className="pr-10"
                autoComplete="new-password"
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

          {/* Password strength rules */}
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

          <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cadastrando...
              </>
            ) : (
              "Cadastrar Senha"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
