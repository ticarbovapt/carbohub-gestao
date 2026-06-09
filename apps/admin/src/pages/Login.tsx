import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let email = login.trim();
    if (!email.includes("@")) {
      const { data, error: rpcError } = await supabase.rpc("get_user_email_by_username", {
        p_username: email.toLowerCase(),
      });
      if (rpcError || !data) {
        setError("Usuário não encontrado.");
        setLoading(false);
        return;
      }
      email = data as string;
    }

    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Usuário ou senha inválidos."
          : authError.message
      );
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl carbo-gradient flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Carbo Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de identidades e acessos</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="login">Usuário ou E-mail</label>
            <Input id="login" value={login} autoFocus
              onChange={(e) => setLogin(e.target.value)}
              placeholder="seu usuário ou seu@email.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">Senha</label>
            <Input id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" disabled={loading} className="w-full carbo-gradient text-white">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando...</> : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
