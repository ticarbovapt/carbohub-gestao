// ─────────────────────────────────────────────────────────────────────────────
// waMidiaCofre — a mídia do WhatsApp guardada NO NOSSO storage (23/11/2026)
//
// A Meta guarda a mídia por ~30 dias (medido: arquivo de 17 dias já não abria)
// e o sistema só guardava o `media_id`. Comprovante de pagamento, NF e foto de
// avaria sumiam do histórico — e cada abertura buscava tudo de novo na Meta.
//
// Daqui em diante o arquivo fica no bucket PRIVADO `wa-midia`, no caminho
// `m/<media_id>`, por TRÊS caminhos que se somam:
//   · o webhook guarda o que o cliente manda, no instante em que chega;
//   · o `whatsapp-midia` guarda o que nós mandamos, no instante do envio;
//   · o `whatsapp-midia-baixar` guarda o que ainda não estava guardado na
//     primeira vez que alguém abre (o histórico de antes desta mudança).
// Quem LÊ é sempre o `whatsapp-midia-baixar`: cofre primeiro, Meta depois.
//
// ⚠️ Guardar é SEMPRE melhor-esforço: falhar aqui nunca derruba o webhook nem
// o envio. O pior caso é o de antes — o arquivo continua na Meta por 30 dias.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any

export const BUCKET = "wa-midia";
export const caminhoDaMidia = (mediaId: string) => `m/${mediaId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export type Baixada =
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; expirada: boolean; detalhe: string };

/**
 * A Meta diz "não existe" de dois jeitos: 404, ou 400 com `code: 100` e o texto
 * "Unsupported get request. Object with ID … does not exist". O segundo chegava
 * CRU na tela, em inglês. Os dois são a retenção vencida.
 */
export function ehMidiaExpirada(status: number, erro: any): boolean {
  if (status === 404) return true;
  const msg = String(erro?.message ?? "");
  return erro?.code === 100 || /does not exist|Unsupported get request/i.test(msg);
}

export const TEXTO_EXPIRADA =
  "Mídia expirada no WhatsApp — ela não foi guardada antes de vencer (a Meta guarda por cerca de 30 dias).";

/** Busca o arquivo na Meta (duas chamadas com o token). */
export async function baixarDaMeta(mediaId: string, token: string, versao: string): Promise<Baixada> {
  try {
    const r1 = await fetch(`https://graph.facebook.com/${versao}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const meta = await r1.json().catch(() => ({}));
    if (!r1.ok || !meta?.url) {
      const expirada = ehMidiaExpirada(r1.status, meta?.error);
      return {
        ok: false, expirada,
        detalhe: expirada ? TEXTO_EXPIRADA : `A Meta não entregou o arquivo (HTTP ${r1.status}).`,
      };
    }
    const r2 = await fetch(String(meta.url), { headers: { "Authorization": `Bearer ${token}` } });
    if (!r2.ok) return { ok: false, expirada: false, detalhe: `Download na Meta falhou (HTTP ${r2.status}).` };
    const bytes = new Uint8Array(await r2.arrayBuffer());
    return { ok: true, bytes, mime: String(meta.mime_type ?? "application/octet-stream") };
  } catch (e) {
    return { ok: false, expirada: false, detalhe: `Sem resposta da Meta: ${String((e as Error)?.message ?? e)}` };
  }
}

/** Guarda no cofre. Nunca lança: devolve se deu certo. */
export async function guardarNoCofre(supabase: any, mediaId: string, bytes: Uint8Array | Blob, mime: string): Promise<boolean> {
  try {
    const corpo = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
    const { error } = await supabase.storage.from(BUCKET)
      .upload(caminhoDaMidia(mediaId), corpo, { contentType: mime || "application/octet-stream", upsert: true });
    if (error) { console.error("[cofre] guardar", mediaId, error.message); return false; }
    return true;
  } catch (e) {
    console.error("[cofre] guardar", mediaId, String((e as Error)?.message ?? e));
    return false;
  }
}

/** Lê do cofre; `null` quando não está lá (ou o cofre falhou). */
export async function lerDoCofre(supabase: any, mediaId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(caminhoDaMidia(mediaId));
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Busca na Meta e guarda — o caminho do webhook. Nunca lança. */
export async function buscarEGuardar(supabase: any, mediaId: string, token: string, versao: string): Promise<void> {
  const b = await baixarDaMeta(mediaId, token, versao);
  if (!b.ok) { console.error("[cofre] buscar", mediaId, b.detalhe); return; }
  await guardarNoCofre(supabase, mediaId, b.bytes, b.mime);
}
