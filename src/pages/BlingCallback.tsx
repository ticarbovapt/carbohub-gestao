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
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    console.log("[BlingCallback] URL params:", { code: code?.slice(0, 10) + "...", state, error });

    if (error) {
      setStatus("error");
      setMessage(`Bling retornou um erro: ${error}. Tente novamente.`);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado na URL. Verifique a configuração do redirect no Bling.");
      return;
    }

    const exchangeCode = async () => {
      try {
        console.log("[BlingCallback] Exchanging code for token...");
        const response = await supabase.functions.invoke("bling-auth", {
          body: { action: "callback", code },
        });

        console.log("[BlingCallback] Response:", JSON.stringify(response.data));

        if (response.error) {
          console.error("[BlingCallback] Invoke error:", response.error);
          throw new Error(response.error.message || "Erro ao chamar edge function");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Erro ao conectar");
        }

        setStatus("success");
        setMessage("Bling conectado com sucesso! Redirecionando...");

        setTimeout(() => {
          navigate("/integrations/bling");
        }, 2000);
      } catch (err: any) {
        console.error("[BlingCallback] Error:", err);
        setStatus("error");
        setMessage(err.message || "Erro ao conectar com o Bling");
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
