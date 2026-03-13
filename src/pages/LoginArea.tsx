import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  UserCircle,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  CheckCircle,
  Settings2,
  Users,
  Store,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LoginLoading } from "@/components/auth/LoginLoading";
import { TempPasswordExpired } from "@/components/auth/TempPasswordExpired";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { FloatingParticles } from "@/components/animations/FloatingParticles";
import logoAvatar from "@/assets/logo-avatar.png";

type ViewMode = "login" | "forgot-password";
type AreaType = "ops" | "licensee" | "pdv";

interface AreaConfig {
  id: AreaType;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  dashboardRoute: string;
}

const areaConfigs: Record<AreaType, AreaConfig> = {
  ops: {
    id: "ops",
    title: "Carbo Controle",
    subtitle: "Gestão, operação e estratégia",
    icon: <Settings2 className="h-5 w-5" />,
    gradient: "from-area-controle to-area-controle-dark",
    dashboardRoute: "/dashboard",
  },
  licensee: {
    id: "licensee",
    title: "Área dos Licenciados",
    subtitle: "Pedidos, consumo, ganhos e crescimento",
    icon: <Users className="h-5 w-5" />,
    gradient: "from-area-licensee to-area-licensee-dark",
    dashboardRoute: "/licensee/dashboard",
  },
  pdv: {
    id: "pdv",
    title: "Área Produtos",
    subtitle: "Estoque, reposição e logística",
    icon: <Store className="h-5 w-5" />,
    gradient: "from-area-products to-area-products-dark",
    dashboardRoute: "/pdv/dashboard",
  },
};

const LoginArea = () => {
  const navigate = useNavigate();
  const { area } = useParams<{ area: string }>();
  const { user, profile, isLoading, signOut, signIn, passwordMustChange, tempPasswordExpired } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>("login");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-time validation states
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Validate area parameter
  const areaType = (area as AreaType) || "ops";
  const areaConfig = areaConfigs[areaType] || areaConfigs.ops;

  // Validation helpers
  const loginFieldError = loginTouched && login.length === 0 ? "Digite seu login" : null;
  const passwordError = passwordTouched && password.length > 0 && password.length < 6 ? "Mínimo de 6 caracteres" : null;
  const isFormValid = login.length > 0 && password.length >= 6;

  // Check user access for the selected area
  const checkUserAccess = async (userId: string): Promise<boolean> => {
    try {
      if (areaType === "ops") {
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        
        const { data: carboRoles } = await supabase
          .from("carbo_user_roles")
          .select("role")
          .eq("user_id", userId);
        
        return (
          (userRoles && userRoles.some(r => ["admin", "manager", "operator"].includes(r.role))) ||
          (carboRoles && carboRoles.length > 0)
        ) || false;
      } else if (areaType === "licensee") {
        const { data } = await supabase
          .from("licensee_users")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        return !!data;
      } else if (areaType === "pdv") {
        const { data } = await supabase
          .from("pdv_users")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        return !!data;
      }
      return false;
    } catch (error) {
      console.error("Error checking access:", error);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setLoginTouched(true);
    setPasswordTouched(true);

    if (!isFormValid) return;

    setIsSubmitting(true);

    // Resolve login (username or email) to email
    let emailToUse = login;
    
    if (!login.includes("@")) {
      // Look up email by username via RPC
      const { data: userEmail, error: rpcError } = await supabase.rpc(
        "get_user_email_by_username" as any,
        { p_username: login.toLowerCase() }
      );
      
      if (rpcError || !userEmail) {
        setFormError("Login não encontrado");
        setIsSubmitting(false);
        return;
      }
      
      emailToUse = userEmail as string;
    }

    const { error } = await signIn(emailToUse, password);

    if (error) {
      setFormError(error.message === "Invalid login credentials" ? "Login ou senha inválidos" : error.message);
      setIsSubmitting(false);
      return;
    }

    // Get current user to check access
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    
    if (currentUser) {
      const hasAccess = await checkUserAccess(currentUser.id);
      
      if (!hasAccess) {
        await supabase.auth.signOut();
        setFormError(`Você não possui acesso à área ${areaConfig.title}. Por favor, selecione a área correta.`);
        setIsSubmitting(false);
        return;
      }
    }

    setShowLoadingScreen(true);
    setTimeout(() => {
      navigate(areaConfig.dashboardRoute, { replace: true });
    }, 1500);
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      setSuccessMessage(
        "Sua solicitação de reset de senha foi registrada. " +
        "Entre em contato com seu gestor direto para que ele aprove a redefinição. " +
        "Você receberá uma nova senha temporária após a aprovação."
      );
    } catch (error) {
      setFormError("Erro ao processar solicitação. Tente novamente.");
    }

    setIsSubmitting(false);
  };

  const resetToLogin = () => {
    setViewMode("login");
    setFormError(null);
    setSuccessMessage(null);
  };

  // Redirect if already logged in
  useEffect(() => {
    if (user && !isLoading) {
      if (tempPasswordExpired) return;
      if (passwordMustChange) {
        navigate("/change-password", { replace: true });
      } else {
        navigate(areaConfig.dashboardRoute, { replace: true });
      }
    }
  }, [user, isLoading, passwordMustChange, tempPasswordExpired, navigate, areaConfig]);

  if (showLoadingScreen) {
    return <LoginLoading userName={profile?.full_name?.split(" ")[0]} />;
  }

  if (user && !isLoading && tempPasswordExpired) {
    return (
      <TempPasswordExpired 
        userEmail={user.email || ""} 
        onSignOut={signOut} 
      />
    );
  }

  if (user && !isLoading) {
    return <LoginLoading userName={profile?.full_name?.split(" ")[0]} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20 dark:from-background dark:via-muted/5 dark:to-background overflow-hidden">
      <FloatingParticles />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <motion.img
            src={logoAvatar}
            alt="Grupo Carbo"
            className="h-20 md:h-24 w-auto mx-auto mb-4 drop-shadow-xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-full
              bg-gradient-to-r ${areaConfig.gradient} text-white
              shadow-lg mb-4
            `}
          >
            {areaConfig.icon}
            <span className="font-semibold">{areaConfig.title}</span>
          </motion.div>
          
          <motion.p
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {areaConfig.subtitle}
          </motion.p>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-xl shadow-black/8 dark:shadow-black/30 border border-border/40 rounded-2xl overflow-hidden bg-card">
              <CardContent className="p-6 md:p-8">
                {viewMode === "login" ? (
                  <>
                    <p className="text-center text-sm text-muted-foreground mb-6">
                      Faça login para acessar <span className="font-semibold text-foreground">{areaConfig.title}</span>
                    </p>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <form onSubmit={handleLogin} className="space-y-5">
                        {formError && (
                          <Alert variant="destructive" className="rounded-xl py-2.5">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <AlertDescription className="text-sm">{formError}</AlertDescription>
                          </Alert>
                        )}

                        {/* Login field */}
                        <div className="space-y-1.5">
                          <Label htmlFor="login" className="text-sm font-semibold text-foreground">Login</Label>
                          <div className="relative">
                            <UserCircle className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${
                              loginFieldError ? "text-destructive" : login.length > 0 ? "text-primary" : "text-muted-foreground"
                            }`} />
                            <Input
                              id="login"
                              type="text"
                              placeholder="seu.login"
                              value={login}
                              onChange={(e) => setLogin(e.target.value.toLowerCase())}
                              onBlur={() => setLoginTouched(true)}
                              style={{ textTransform: "lowercase" }}
                              className={`h-12 pl-11 pr-10 text-base rounded-xl bg-muted/40 border-2 transition-colors ${
                                loginFieldError
                                  ? "border-destructive focus-visible:ring-destructive/20"
                                  : login.length > 0
                                    ? "border-primary/50 focus-visible:border-primary"
                                    : "border-border focus-visible:border-primary"
                              }`}
                            />
                            {login.length > 0 && !loginFieldError && (
                              <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                            )}
                          </div>
                          {loginFieldError && (
                            <p className="text-xs text-destructive flex items-center gap-1.5">
                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                              {loginFieldError}
                            </p>
                          )}
                        </div>

                        {/* Password field */}
                        <div className="space-y-1.5">
                          <Label htmlFor="password" className="text-sm font-semibold text-foreground">Senha</Label>
                          <div className="relative">
                            <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${
                              passwordError ? "text-destructive" : password.length >= 6 ? "text-primary" : "text-muted-foreground"
                            }`} />
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onBlur={() => setPasswordTouched(true)}
                              className={`h-12 pl-11 pr-11 text-base rounded-xl bg-muted/40 border-2 transition-colors ${
                                passwordError
                                  ? "border-destructive focus-visible:ring-destructive/20"
                                  : password.length >= 6
                                    ? "border-primary/50 focus-visible:border-primary"
                                    : "border-border focus-visible:border-primary"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                          {passwordError && (
                            <p className="text-xs text-destructive flex items-center gap-1.5">
                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                              {passwordError}
                            </p>
                          )}
                        </div>

                        {/* Submit */}
                        <Button
                          type="submit"
                          disabled={isSubmitting || !isFormValid}
                          className={`
                            w-full h-12 rounded-xl font-semibold text-base text-white
                            bg-gradient-to-r ${areaConfig.gradient}
                            hover:opacity-90 active:scale-[0.98]
                            transition-all duration-200 shadow-sm
                          `}
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              Entrar
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>

                        <button
                          type="button"
                          onClick={() => navigate("/reset-password")}
                          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                        >
                          Esqueceu sua senha?
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <Mail className="h-6 w-6 text-primary" />
                      </div>
                      <h2 className="text-xl font-bold mb-1">Recuperar Senha</h2>
                      <p className="text-sm text-muted-foreground">
                        A redefinição de senha requer aprovação do seu gestor direto
                      </p>
                    </div>

                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      {formError && (
                        <Alert variant="destructive" className="rounded-lg py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">{formError}</AlertDescription>
                        </Alert>
                      )}

                      {successMessage && (
                        <Alert className="rounded-lg py-2 border-carbo-green/50 bg-carbo-green/10">
                          <CheckCircle className="h-4 w-4 text-carbo-green" />
                          <AlertDescription className="text-sm text-carbo-green">{successMessage}</AlertDescription>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="forgot-login" className="text-sm font-semibold">Login</Label>
                        <div className="relative">
                          <UserCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="forgot-login"
                            name="login"
                            type="text"
                            placeholder="seu login (ex: OPS0001)"
                            className="h-12 pl-12 text-base rounded-xl bg-muted/30 border-2 border-border/50"
                            required
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-12 rounded-xl font-semibold"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          "Solicitar Reset"
                        )}
                      </Button>

                      <button
                        type="button"
                        onClick={resetToLogin}
                        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar ao login
                      </button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LoginArea;
