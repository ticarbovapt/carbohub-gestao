// ─────────────────────────────────────────────────────────────────────────────
// evolution-instancia — conectar / desconectar o WhatsApp que envia os avisos
//
// PROVISÓRIA por decisão do dono: existe enquanto o disparo for pela Evolution
// API. Quando migrar para a API oficial da Meta, esta função e o card da tela
// somem juntos — por isso ela é autocontida e não escreve em tabela nenhuma.
//
// ── Por que é um proxy, e não uma chamada direta do navegador ───────────────
//
// A `apikey` da Evolution dá acesso total à instância: ler conversa, enviar
// mensagem em nome da empresa, derrubar a conexão. Chamar a Evolution do front
// colocaria essa chave no bundle, visível para qualquer pessoa com o DevTools
// aberto — e num app que roda em seis domínios.
//
// Então o navegador fala com esta função, ela fala com a Evolution, e a chave
// nunca sai do servidor.
//
// ⚠️ Esta função é publicada COM verificação de JWT, ao contrário das outras
// (rastreio-sync, kanban-n8n, webhooks). Aquelas são chamadas por máquina e se
// defendem com segredo próprio; esta é chamada por gente logada, e derrubar o
// WhatsApp da empresa não pode depender de um segredo que anda na URL.
// ─────────────────────────────────────────────────────────────────────────────

const BASE      = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/+$/, "");
const APIKEY    = Deno.env.get("EVOLUTION_APIKEY") ?? "";
const INSTANCIA = Deno.env.get("EVOLUTION_INSTANCE") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json", ...cors },
  });
}

async function chamar(caminho: string, metodo = "GET"): Promise<{ ok: boolean; status: number; corpo: any }> {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "apikey": APIKEY, "Content-Type": "application/json" },
  });
  const texto = await res.text();
  let corpo: unknown = texto;
  try { corpo = JSON.parse(texto); } catch { /* algumas rotas devolvem texto */ }
  return { ok: res.ok, status: res.status, corpo };
}

/**
 * Estado da conexão, normalizado.
 *
 * A Evolution mudou o formato entre versões — o estado já veio em
 * `instance.state`, em `state` e na raiz. Aceitar os três custa nada e evita a
 * tela dizer "desconhecido" numa atualização do servidor.
 */
// deno-lint-ignore no-explicit-any
function lerEstado(c: any): string {
  const bruto = c?.instance?.state ?? c?.state ?? c?.instance?.status ?? c?.status ?? "";
  const s = String(bruto).toLowerCase();
  if (s === "open" || s === "connected") return "conectado";
  if (s === "connecting" || s === "qrcode" || s === "pairing") return "conectando";
  if (s === "close" || s === "closed" || s === "disconnected") return "desconectado";
  return s || "desconhecido";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!BASE || !APIKEY || !INSTANCIA) {
    return json({
      erro: "Faltam credenciais da Evolution.",
      como_resolver: "Supabase > Edge Functions > Secrets: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE",
      faltando: [
        !BASE && "EVOLUTION_URL", !APIKEY && "EVOLUTION_APIKEY", !INSTANCIA && "EVOLUTION_INSTANCE",
      ].filter(Boolean),
    }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const acao = String(body?.acao ?? "status");

  try {
    // ── Estado da conexão ────────────────────────────────────────────────
    if (acao === "status") {
      const r = await chamar(`/instance/connectionState/${INSTANCIA}`);
      // 404 significa instância inexistente — é informação, não falha.
      if (r.status === 404) {
        return json({ estado: "inexistente", instancia: INSTANCIA, detalhe: r.corpo });
      }
      if (!r.ok) return json({ erro: `Evolution ${r.status}`, detalhe: r.corpo }, 502);

      // O número conectado só aparece na listagem, não no estado.
      let numero: string | null = null;
      const lista = await chamar(`/instance/fetchInstances?instanceName=${encodeURIComponent(INSTANCIA)}`);
      if (lista.ok) {
        const arr = Array.isArray(lista.corpo) ? lista.corpo : [lista.corpo];
        // deno-lint-ignore no-explicit-any
        const i: any = arr[0]?.instance ?? arr[0];
        const bruto = i?.owner ?? i?.ownerJid ?? i?.number ?? null;
        numero = bruto ? String(bruto).split("@")[0] : null;
      }
      return json({ estado: lerEstado(r.corpo), instancia: INSTANCIA, numero });
    }

    // ── QR Code para parear ──────────────────────────────────────────────
    //
    // ⚠️ O QR expira em torno de 40 segundos e a Evolution gera um novo a cada
    // chamada. A tela precisa renovar sozinha; ler um QR vencido dá "erro ao
    // conectar" no celular, que parece problema de credencial e não é.
    if (acao === "conectar") {
      const r = await chamar(`/instance/connect/${INSTANCIA}`);
      if (!r.ok) return json({ erro: `Evolution ${r.status}`, detalhe: r.corpo }, 502);
      const c = r.corpo ?? {};
      const base64 = c?.base64 ?? c?.qrcode?.base64 ?? null;
      return json({
        // Já vem pronto para <img src>; algumas versões mandam sem o prefixo.
        qr: base64 ? (String(base64).startsWith("data:") ? base64 : `data:image/png;base64,${base64}`) : null,
        codigo_pareamento: c?.pairingCode ?? c?.qrcode?.pairingCode ?? null,
        estado: lerEstado(c),
      });
    }

    // ── Desconectar (mantém a instância, só desloga o número) ────────────
    if (acao === "desconectar") {
      const r = await chamar(`/instance/logout/${INSTANCIA}`, "DELETE");
      if (!r.ok) return json({ erro: `Evolution ${r.status}`, detalhe: r.corpo }, 502);
      return json({ ok: true, estado: "desconectado", detalhe: r.corpo });
    }

    // ── Reiniciar (quando fica preso em "conectando") ────────────────────
    if (acao === "reiniciar") {
      const r = await chamar(`/instance/restart/${INSTANCIA}`, "POST");
      if (!r.ok) return json({ erro: `Evolution ${r.status}`, detalhe: r.corpo }, 502);
      return json({ ok: true, detalhe: r.corpo });
    }

    return json({ erro: `ação desconhecida: ${acao}`, aceitas: ["status", "conectar", "desconectar", "reiniciar"] }, 400);
  } catch (e) {
    console.error("[evolution-instancia]", acao, e);
    return json({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
