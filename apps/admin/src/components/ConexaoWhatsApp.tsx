import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Smartphone, QrCode, LogOut, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";

/**
 * Conexão do WhatsApp que envia os avisos (Evolution API).
 *
 * ⚠️ PROVISÓRIO por decisão do dono: existe enquanto o disparo for pela
 * Evolution. Quando migrar para a API oficial da Meta, este componente e a
 * função `evolution-instancia` somem juntos — por isso está tudo num arquivo
 * só, sem tabela e sem rota própria.
 *
 * A chave da Evolution NÃO passa por aqui: o navegador fala com a edge
 * function, que fala com a Evolution. Aquela chave envia mensagem em nome da
 * empresa e lê conversas; no bundle do front ela ficaria visível para qualquer
 * um com o DevTools aberto.
 */

interface Estado {
  estado: string; instancia?: string; numero?: string | null;
  erro?: string; como_resolver?: string; faltando?: string[];
}

async function chamar(acao: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke("evolution-instancia", {
    body: { acao },
  });
  if (error) throw new Error(error.message);
  return data;
}

const APARENCIA: Record<string, { cor: string; icone: JSX.Element; texto: string }> = {
  conectado:    { cor: "text-emerald-500", icone: <CheckCircle2 className="h-4 w-4" />, texto: "Conectado" },
  conectando:   { cor: "text-amber-500",   icone: <Loader2 className="h-4 w-4 animate-spin" />, texto: "Conectando…" },
  desconectado: { cor: "text-red-500",     icone: <XCircle className="h-4 w-4" />, texto: "Desconectado" },
  inexistente:  { cor: "text-red-500",     icone: <AlertTriangle className="h-4 w-4" />, texto: "Instância não existe" },
};

const fmtFone = (v?: string | null) => {
  const d = (v ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v ?? "—";
};

export function ConexaoWhatsApp() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [pareamento, setPareamento] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["evolution-status"],
    queryFn: () => chamar("status") as Promise<Estado>,
    // Enquanto o QR está na tela, olhar de perto: assim que o celular parear,
    // o card troca sozinho para "Conectado" e o QR some.
    refetchInterval: qr ? 4_000 : 60_000,
  });

  const estado = status.data?.estado ?? "";
  const ap = APARENCIA[estado];

  // Pareou: some com o QR sem o usuário precisar fechar nada.
  useEffect(() => {
    if (estado === "conectado" && qr) {
      setQr(null); setPareamento(null);
      toast.success("WhatsApp conectado");
    }
  }, [estado, qr]);

  const conectar = useMutation({
    mutationFn: () => chamar("conectar"),
    onSuccess: (d) => {
      setQr(d?.qr ?? null);
      setPareamento(d?.codigo_pareamento ?? null);
      if (!d?.qr && !d?.codigo_pareamento) toast.error("A Evolution não devolveu QR — tente reiniciar a instância");
    },
    onError: (e) => toast.error(`Não consegui gerar o QR: ${(e as Error).message}`),
  });

  // ⚠️ O QR da Evolution expira em ~40s. Sem renovar, quem demora a pegar o
  // celular lê um código vencido e o WhatsApp diz "não foi possível conectar" —
  // que parece problema de credencial e não é.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => conectar.mutate(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  const desconectar = useMutation({
    mutationFn: () => chamar("desconectar"),
    onSuccess: () => {
      toast.success("Número desconectado");
      setQr(null);
      qc.invalidateQueries({ queryKey: ["evolution-status"] });
    },
    onError: (e) => toast.error(`Não consegui desconectar: ${(e as Error).message}`),
  });

  const reiniciar = useMutation({
    mutationFn: () => chamar("reiniciar"),
    onSuccess: () => {
      toast.success("Instância reiniciada");
      qc.invalidateQueries({ queryKey: ["evolution-status"] });
    },
    onError: (e) => toast.error(`Não consegui reiniciar: ${(e as Error).message}`),
  });

  const faltaConfig = Boolean(status.data?.faltando?.length);

  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4 text-carbo-green" />
              WhatsApp que envia os avisos
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Provisório, enquanto o disparo for pela Evolution API.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {status.isLoading ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> verificando…
              </span>
            ) : ap ? (
              <span className={`flex items-center gap-1.5 text-xs font-medium ${ap.cor}`}>
                {ap.icone} {ap.texto}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{estado || "sem resposta"}</span>
            )}
            {status.data?.numero && (
              <span className="font-mono text-xs text-muted-foreground">
                {fmtFone(status.data.numero)}
              </span>
            )}
          </div>
        </div>

        {faltaConfig && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              Faltam secrets nas Edge Functions:{" "}
              <code>{status.data?.faltando?.join(", ")}</code>. Sem eles esta seção
              não consegue falar com a Evolution — as mensagens em si continuam
              indo pelo n8n.
            </span>
          </div>
        )}

        {!faltaConfig && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {estado !== "conectado" && (
                <Button size="sm" className="h-8 gap-1.5"
                        disabled={conectar.isPending}
                        onClick={() => conectar.mutate()}>
                  {conectar.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <QrCode className="h-3.5 w-3.5" />}
                  {qr ? "Gerar novo QR" : "Conectar número"}
                </Button>
              )}
              {estado === "conectado" && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5"
                        disabled={desconectar.isPending}
                        onClick={() => {
                          if (!confirm("Desconectar o WhatsApp? Os avisos automáticos param de sair até outro número ser conectado.")) return;
                          desconectar.mutate();
                        }}>
                  {desconectar.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <LogOut className="h-3.5 w-3.5" />}
                  Desconectar
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5"
                      disabled={reiniciar.isPending}
                      onClick={() => reiniciar.mutate()}>
                {reiniciar.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Reiniciar instância
              </Button>
            </div>

            {qr && (
              <div className="mt-3 flex flex-col items-start gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
                <img src={qr} alt="QR Code do WhatsApp"
                     className="h-44 w-44 shrink-0 rounded bg-white p-1.5" />
                <div className="min-w-0 text-xs">
                  <p className="font-medium">Como conectar</p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-muted-foreground">
                    <li>Abra o WhatsApp no celular</li>
                    <li>Toque em <strong>Aparelhos conectados</strong></li>
                    <li>Toque em <strong>Conectar um aparelho</strong></li>
                    <li>Aponte a câmera para este código</li>
                  </ol>
                  {pareamento && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Ou digite o código: <span className="font-mono font-semibold text-foreground">{pareamento}</span>
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    O código se renova sozinho a cada 30 segundos — ele expira rápido,
                    e ler um vencido faz o celular dizer “não foi possível conectar”.
                  </p>
                </div>
              </div>
            )}

            {estado === "desconectado" && !qr && (
              <p className="mt-3 text-[11px] text-amber-500">
                Nenhum número conectado — os avisos automáticos não estão saindo.
              </p>
            )}
          </>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}
