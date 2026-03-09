import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Clock, Mail, AlertTriangle } from "lucide-react";
import logoCarbo from "@/assets/logo-carbo.png";

interface TempPasswordExpiredProps {
  userEmail: string;
  onSignOut: () => void;
}

export function TempPasswordExpired({ userEmail, onSignOut }: TempPasswordExpiredProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleRequestNewPassword = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/change-password`,
      });

      if (error) throw error;

      setEmailSent(true);
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error("Erro ao enviar e-mail. Entre em contato com seu gestor.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await onSignOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-board-navy via-board-navy/95 to-board-navy/90 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={logoCarbo} alt="Carbo" className="h-12" />
          </div>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-board-navy">
            Senha Temporária Expirada
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Sua senha temporária expirou após 24 horas. Por segurança, você precisa solicitar uma nova senha para acessar a plataforma.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Por que isso aconteceu?</p>
                <p className="mt-1 text-amber-700">
                  Para garantir a segurança da sua conta, senhas temporárias são válidas por apenas 24 horas após a criação.
                </p>
              </div>
            </div>
          </div>

          {!emailSent ? (
            <>
              <Button
                onClick={handleRequestNewPassword}
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Solicitar Nova Senha
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Um e-mail será enviado para <strong>{userEmail}</strong> com instruções para criar uma nova senha.
              </p>
            </>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-sm text-emerald-800">
                  <p className="font-medium">E-mail enviado!</p>
                  <p className="mt-1 text-emerald-700">
                    Verifique sua caixa de entrada e siga as instruções para criar uma nova senha.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleSignOut}
            className="w-full"
          >
            Voltar para Login
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Se você não receber o e-mail, entre em contato com seu gestor para solicitar uma nova senha temporária.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
