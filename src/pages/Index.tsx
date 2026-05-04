import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Globe,
  Zap,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LoginLoading } from "@/components/auth/LoginLoading";
import { TempPasswordExpired } from "@/components/auth/TempPasswordExpired";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { FloatingParticles } from "@/components/animations/FloatingParticles";
import logoCarbo from "@/assets/logo-grupo-carbo.png";
import logoAvatar from "@/assets/logo-avatar.png";

type ViewMode = "login" | "forgot-password" | "request-access";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading, signOut, isAdmin, isManager, signIn, passwordMustChange, tempPasswordExpired } =
    useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>("login");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-time validation states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Validation helpers
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido" : null;
  const passwordError = passwordTouched && password.length > 0 && password.length < 6 ? "Mínimo de 6 caracteres" : null;
  const isFormValid = isValidEmail(email) && password.length >= 6;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!isFormValid) return;

    setIsSubmitting(true);

    const { error } = await signIn(email, password);

    if (error) {
      setLoginError(error.message === "Invalid login credentials" ? "Email ou senha inválidos" : error.message);
      setIsSubmitting(false);
    } else {
      setShowLoadingScreen(true);
      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 1500);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) {
      setLoginError(error.message);
    } else {
      setSuccessMessage("Enviamos um link para redefinir sua senha. Verifique seu email.");
    }
    setIsSubmitting(false);
  };

  const resetToLogin = () => {
    setViewMode("login");
    setLoginError(null);
    setSuccessMessage(null);
  };

  // If user is logged in, redirect once (avoid loop with handleLogin's own navigate)
  useEffect(() => {
    if (user && !isLoading && !showLoadingScreen) {
      if (tempPasswordExpired) {
        // Handled by render below
        return;
      }
      if (passwordMustChange) {
        navigate("/change-password", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, isLoading, passwordMustChange, tempPasswordExpired]);

  // Show loading screen after successful login
  if (showLoadingScreen) {
    return <LoginLoading userName={profile?.full_name?.split(" ")[0]} />;
  }

  // Handle temp password expiration
  if (user && !isLoading && tempPasswordExpired) {
    return <TempPasswordExpired userEmail={user.email || ""} onSignOut={signOut} />;
  }

  if (user && !isLoading) {
    return <LoginLoading userName={profile?.full_name?.split(" ")[0]} />;
  }

  // Login screen for non-authenticated users
  return (
    <div className="h-screen flex bg-gradient-to-br from-background via-background to-muted/20 dark:from-background dark:via-muted/5 dark:to-background overflow-hidden">
      {/* Background with particles */}
      <FloatingParticles />

      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Back to Hub */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { window.location.href = "https://carbohub.com.br"; }}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Hub
        </Button>
      </motion.div>

      {/* LEFT SIDE - Branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 flex-col items-start justify-center pl-12 xl:pl-20 2xl:pl-28 pr-8 relative z-10"
      >
        <div className="max-w-2xl w-full">
          {/* Avatar Logo - Large with staggered animation */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
              delay: 0.1,
              duration: 0.8,
              ease: [0.34, 1.56, 0.64, 1],
              type: "spring",
              stiffness: 100,
            }}
            className="mb-8"
          >
            <motion.img
              src={logoAvatar}
              alt="Grupo Carbo"
              className="h-40 xl:h-52 2xl:h-64 w-auto drop-shadow-2xl"
              whileHover={{ scale: 1.02, rotate: 2 }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>

          {/* Title and subtitle with slide-in effect */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
            className="mb-8"
          >
            <motion.h1
              className="text-4xl xl:text-5xl 2xl:text-6xl font-bold text-foreground font-plex tracking-tight flex items-center gap-4 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              Carbo Controle
              <motion.span
                className="inline-flex items-center justify-center h-11 w-11 xl:h-14 xl:w-14 rounded-xl bg-gradient-to-br from-carbo-green to-carbo-blue shadow-lg shadow-carbo-green/30"
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.7, duration: 0.6, type: "spring", stiffness: 200 }}
                whileHover={{ rotate: 15, scale: 1.1 }}
              >
                <Zap className="h-6 w-6 xl:h-7 xl:w-7 text-white" />
              </motion.span>
            </motion.h1>
            <motion.p
              className="text-xl xl:text-2xl text-foreground font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              Sistema de Crescimento Operacional
            </motion.p>
          </motion.div>

          {/* Inspirational quote with fade-in from bottom */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mb-10"
          >
            <motion.p
              className="text-lg xl:text-xl text-muted-foreground leading-relaxed max-w-md border-l-4 border-carbo-green pl-5 italic"
              whileHover={{ x: 5 }}
              transition={{ duration: 0.2 }}
            >
              Cada clique carrega simplicidade, cada avanço traz felicidade, e cada dado revela a verdade.
            </motion.p>
          </motion.div>

          {/* Footer on left side for desktop */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="pt-6 border-t border-border/40"
          >
            <p className="text-base text-muted-foreground inline-flex items-center gap-2">
              <motion.span
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Globe className="h-5 w-5 text-carbo-green/70" />
              </motion.span>
              Uma plataforma Grupo Carbo. Juntos pelo crescimento sustentável.
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* RIGHT SIDE - Login Form */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12 xl:p-16 relative z-10 lg:bg-card/40 lg:backdrop-blur-md dark:lg:bg-card/60"
      >
        {/* Mobile branding (visible only on mobile) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="lg:hidden text-center mb-8"
        >
          <motion.img
            src={logoAvatar}
            alt="Grupo Carbo"
            className="h-24 w-auto mx-auto mb-4"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          />
          <motion.h1
            className="text-2xl font-bold text-foreground font-plex tracking-tight flex items-center justify-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Carbo Controle
            <motion.span
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-carbo-green to-carbo-blue shadow-md"
              initial={{ rotate: -90, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
            >
              <Zap className="h-4 w-4 text-white" />
            </motion.span>
          </motion.h1>
          <motion.p
            className="text-sm text-foreground font-medium mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Sistema de Crescimento Operacional
          </motion.p>
        </motion.div>

        {/* Card with animated views */}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 150 }}
            className="w-full max-w-md"
          >
            <Card className="w-full shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/30 dark:border-border/50 rounded-2xl overflow-hidden bg-card">
              <CardContent className="p-7 lg:p-8">
                {/* LOGIN VIEW */}
                {viewMode === "login" && (
                  <>
                    {/* Welcome message */}
                    <p className="text-center text-base text-foreground/80 mb-6 font-medium">
                      Seja bem-vindo ao sistema que conecta operações com crescimento.
                    </p>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-carbo-green" />
                      </div>
                    ) : (
                      <form onSubmit={handleLogin} className="space-y-4">
                        {loginError && (
                          <Alert variant="destructive" className="rounded-lg py-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm">{loginError}</AlertDescription>
                          </Alert>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                            E-mail
                          </Label>
                          <div className="relative">
                            <UserCircle
                              className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${
                                emailError
                                  ? "text-destructive"
                                  : email && isValidEmail(email)
                                    ? "text-carbo-green"
                                    : "text-muted-foreground"
                              }`}
                            />
                            <Input
                              id="email"
                              name="email"
                              type="email"
                              placeholder="seu@email.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onBlur={() => setEmailTouched(true)}
                              className={`h-12 pl-12 text-base rounded-xl transition-all bg-muted/30 border-2 ${
                                emailError
                                  ? "border-destructive focus:ring-destructive/20"
                                  : email && isValidEmail(email)
                                    ? "border-carbo-green/50 focus:border-carbo-green focus:ring-carbo-green/20"
                                    : "border-border/50 focus:border-carbo-green focus:ring-carbo-green/20"
                              }`}
                            />
                            {email && isValidEmail(email) && (
                              <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-carbo-green" />
                            )}
                          </div>
                          {emailError && (
                            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3" />
                              {emailError}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                            Senha
                          </Label>
                          <div className="relative">
                            <Lock
                              className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${
                                passwordError
                                  ? "text-destructive"
                                  : password.length >= 6
                                    ? "text-carbo-green"
                                    : "text-muted-foreground"
                              }`}
                            />
                            <Input
                              id="password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onBlur={() => setPasswordTouched(true)}
                              className={`h-12 pl-12 pr-12 text-base rounded-xl transition-all bg-muted/30 border-2 ${
                                passwordError
                                  ? "border-destructive focus:ring-destructive/20"
                                  : password.length >= 6
                                    ? "border-carbo-green/50 focus:border-carbo-green focus:ring-carbo-green/20"
                                    : "border-border/50 focus:border-carbo-green focus:ring-carbo-green/20"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                          {passwordError && (
                            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3" />
                              {passwordError}
                            </p>
                          )}
                        </div>

                        <Button
                          type="submit"
                          className="w-full h-13 carbo-gradient text-white hover:opacity-90 rounded-xl font-semibold text-base transition-all duration-200 hover:shadow-lg hover:shadow-carbo-green/25 group mt-4"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Entrando...
                            </>
                          ) : (
                            <>
                              Entrar na Plataforma
                              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </Button>

                        <div className="flex flex-col items-center gap-3 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode("forgot-password");
                              setLoginError(null);
                            }}
                            className="text-sm font-medium text-muted-foreground hover:text-carbo-green transition-colors"
                          >
                            Esqueci minha senha
                          </button>
                          <p className="text-sm text-foreground/70">
                            Ainda não tem acesso?{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setViewMode("request-access");
                                setLoginError(null);
                              }}
                              className="font-semibold text-carbo-green hover:text-carbo-blue transition-colors"
                            >
                              Solicite ao gestor.
                            </button>
                          </p>
                        </div>
                      </form>
                    )}
                  </>
                )}

                {/* FORGOT PASSWORD VIEW */}
                {viewMode === "forgot-password" && (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center mb-3">
                      <div className="h-14 w-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-carbo-green/10 to-carbo-blue/10 flex items-center justify-center">
                        <Mail className="h-7 w-7 text-carbo-green" />
                      </div>
                      <h2 className="text-xl font-semibold text-foreground">Recuperar Senha</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Digite seu email para receber um link de recuperação
                      </p>
                    </div>

                    {loginError && (
                      <Alert variant="destructive" className="rounded-xl py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">{loginError}</AlertDescription>
                      </Alert>
                    )}

                    {successMessage && (
                      <Alert className="border-carbo-green/50 bg-carbo-green/10 rounded-xl py-2">
                        <CheckCircle className="h-4 w-4 text-carbo-green" />
                        <AlertDescription className="text-sm text-carbo-green">{successMessage}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email" className="text-sm font-medium text-foreground">
                        E-mail
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="forgot-email"
                          name="email"
                          type="email"
                          placeholder="seu@email.com"
                          className="h-12 pl-11 text-base rounded-xl border-border focus:ring-2 focus:ring-carbo-green/20"
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 carbo-gradient text-white hover:opacity-90 rounded-xl font-semibold text-base"
                      disabled={isSubmitting || !!successMessage}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        "Enviar Link de Recuperação"
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={resetToLogin}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 pt-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar para o login
                    </button>
                  </form>
                )}

                {/* REQUEST ACCESS VIEW */}
                {viewMode === "request-access" && (
                  <div className="space-y-4">
                    <div className="text-center mb-3">
                      <div className="h-14 w-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-carbo-blue/10 to-carbo-green/10 flex items-center justify-center">
                        <UserCircle className="h-7 w-7 text-carbo-blue" />
                      </div>
                      <h2 className="text-xl font-semibold text-foreground">Solicitar Acesso</h2>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        Para criar uma conta, entre em contato com o gestor da sua equipe ou o administrador do sistema.
                      </p>
                    </div>

                    <div className="bg-muted/50 rounded-xl p-4">
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">Por que preciso de aprovação?</strong>
                        <br />O Carbo Controle é uma plataforma corporativa. Sua conta será configurada pelo gestor com as
                        permissões adequadas ao seu cargo.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={resetToLogin}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 pt-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar para o login
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Mobile footer */}
        <div className="lg:hidden mt-6 text-center">
          <p className="text-xs text-muted-foreground/60 inline-flex items-center gap-1">
            <Globe className="h-3 w-3" />
            Uma plataforma Grupo Carbo.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Index;
