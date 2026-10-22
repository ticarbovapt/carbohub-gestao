// ─────────────────────────────────────────────────────────────────────────────
// Chamada à API v3 do Bling, com o motivo da RECUSA legível.
//
// O Bling explica a recusa no corpo (`error.description` / `error.fields`), e é
// esse texto que a tela tem de mostrar — "Bling 400" sozinho manda a pessoa
// procurar no lugar errado. 429 espera e repete (o Bling aceita ~3 req/s).
//
// ⚠️ Só faz a chamada. Token é de quem chama, e NINGUÉM renova token aqui:
// quem renova é o `bling-sync` (conta 1) e o `bling2-sync` (conta 2).
// ─────────────────────────────────────────────────────────────────────────────

export const BLING_API = "https://api.bling.com.br/Api/v3";

export class BlingRecusou extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export async function bling(token: string, metodo: string, caminho: string, corpo?: unknown, tentativa = 0): Promise<any> {
  const r = await fetch(`${BLING_API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 429 && tentativa < 4) {
    await dormir(1000 * 2 ** tentativa);
    return bling(token, metodo, caminho, corpo, tentativa + 1);
  }
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    let motivo = texto.slice(0, 400);
    try {
      const j = JSON.parse(texto);
      const campos = (j?.error?.fields ?? []).map((f: any) => f?.msg ?? f?.element).filter(Boolean).join("; ");
      motivo = [j?.error?.description ?? j?.error?.message, campos].filter(Boolean).join(" — ") || motivo;
    } catch { /* corpo não é JSON: fica o texto */ }
    throw new BlingRecusou(r.status, `Bling ${r.status} em ${metodo} ${caminho.split("?")[0]}: ${motivo}`);
  }
  if (!texto) return {};
  try { return JSON.parse(texto); } catch { return {}; }
}
