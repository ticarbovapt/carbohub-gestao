import { useCallback, useRef, useState } from "react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// IA do Trello interno (D7) — reaproveita a Edge Function `ai-chat` já usada
// pelo CarboHub (provider no gateway; segredo LOVABLE_API_KEY só no Supabase).
// Aqui só montamos {system,user} e consumimos o stream SSE, acumulando o texto
// (com callback opcional pra ir preenchendo o campo ao vivo). Envia o JWT da
// sessão → acesso só pra internos autenticados.
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

export interface GenerateArgs {
  system: string;
  user: string;
  onChunk?: (fullTextSoFar: string) => void;
}

export function useMktAI() {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async ({ system, user, onChunk }: GenerateArgs): Promise<string> => {
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Token da sessão (SSO) → só internos autenticados chamam a IA.
    // Fallback pra anon key se (por algum motivo) não houver sessão — o gateway
    // ainda exige um JWT válido no Authorization.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token ?? SUPABASE_PUBLISHABLE_KEY;

    let acc = "";
    const push = (chunk: string) => { acc += chunk; onChunk?.(acc); };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 429) throw new Error("Limite de requisições de IA excedido. Tente novamente em breve.");
        if (resp.status === 402) throw new Error("Créditos de IA insuficientes.");
        throw new Error((err as { error?: string }).error || `Erro ${resp.status} na IA`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      const consumeLine = (raw: string) => {
        let line = raw;
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") return;
        if (!line.startsWith("data: ")) return;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") { done = true; return; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) push(content);
        } catch { /* fragmento incompleto — ignora, vem no próximo chunk */ }
      };

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          consumeLine(line);
          if (done) break;
        }
      }
      // Flush final
      if (buffer.trim()) for (const raw of buffer.split("\n")) consumeLine(raw);

      return acc.trim();
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => { abortRef.current?.abort(); setLoading(false); }, []);

  return { generate, loading, stop };
}
