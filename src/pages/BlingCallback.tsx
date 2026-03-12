import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function BlingCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando ao Bling...");

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado. Tente novamente.");
      return;
    }

    const exchangeCode = async () => {
      try {
        const response = await supabase.functions.invoke("bling-auth", {
          body: { action: "callback", code },
        });

        if (response.error || !response.data?.success) {
          throw new Error(response.data?.error || response.error?.message || "Erro ao conectar");
        }

        setStatus("success");
        setMessage("Bling conectado com sucesso! Redirecionando...");

        setTimeout(() => {
          navigate("/integrations/bling");
        }, 2000);
      } catch (error: any) {
        console.error("Bling callback error:", error);
        setStatus("error");
        setMessage(error.message || "Erro ao conectar com o Bling");
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <Loader2 className="h-12 w-12 animate-spin text-carbo-green mx-auto" />
        )}
        {status === "success" && (
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        )}
        {status === "error" && (
          <XCircle className="h-12 w-12 text-red-500 mx-auto" />
        )}
        <h2 className="text-xl font-semibold">{message}</h2>
        {status === "error" && (
          <button
            onClick={() => navigate("/integrations/bling")}
            className="text-carbo-green hover:underline"
          >
            Voltar para integrações
          </button>
        )}
      </div>
    </div>
  );
}
