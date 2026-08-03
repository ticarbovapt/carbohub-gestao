import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

// Retorno do OAuth da SEGUNDA conta Bling. Rota separada da do Bling 1 de
// propósito: o Bling exige que a redirect_uri cadastrada no app seja idêntica
// à enviada, e são dois apps diferentes. Compartilhar a rota faria o code de
// uma conta ser trocado com as credenciais da outra.
export default function Bling2Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando ao Bling 2...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`O Bling retornou um erro: ${error}. Tente novamente.`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado na URL.");
      return;
    }

    (async () => {
      try {
        const response = await supabase.functions.invoke("bling2-auth", {
          body: { action: "callback", code },
        });
        if (response.error) throw new Error(response.error.message || "Erro ao chamar a função");
        if (!response.data?.success) throw new Error(response.data?.error || "Erro ao conectar");

        setStatus("success");
        setMessage("Bling 2 conectado! Redirecionando...");
        setTimeout(() => navigate("/integracoes/bling2"), 1800);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "Erro ao conectar com o Bling 2");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && <Loader2 className="h-12 w-12 animate-spin text-carbo-green mx-auto" />}
        {status === "success" && <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />}
        {status === "error" && <XCircle className="h-12 w-12 text-red-500 mx-auto" />}
        <h2 className="text-xl font-semibold">{message}</h2>
        {status === "error" && (
          <button onClick={() => navigate("/integracoes/bling2")} className="text-carbo-green hover:underline">
            Voltar para a integração
          </button>
        )}
      </div>
    </div>
  );
}
