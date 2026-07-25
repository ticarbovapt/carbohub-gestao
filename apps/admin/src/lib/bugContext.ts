import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Apoio ao reporte de bug: contexto automático + anexo de print.
// ⚠️ ARQUIVO PADRONIZADO — idêntico nos 6 apps (crm/ops/admin/financas/mkt/ti).
// ─────────────────────────────────────────────────────────────────────────────

export interface BugAttachment {
  path: string;
  name: string;
  size: number;
}

/** Tudo que dá pra saber sem perguntar nada a quem reporta. */
export function captureClientContext(): Record<string, unknown> {
  try {
    return {
      path: location.pathname,
      href: location.href,
      ua: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      occurred_at: new Date().toISOString(),
    };
  } catch {
    return {};
  }
}

/**
 * Reduz a imagem antes de subir (máx. 1600px, JPEG 0.8). Print de tela cheia
 * costuma passar de 2 MB; assim cai pra algumas centenas de KB.
 */
export function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Sobe os prints pro bucket privado. A pasta é o id do usuário (exigência da policy). */
export async function uploadBugAttachments(files: File[], userId: string): Promise<BugAttachment[]> {
  const out: BugAttachment[] = [];
  for (const f of files) {
    try {
      const blob = await compressImage(f);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("bug-attachments")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      out.push({ path, name: f.name || "print.jpg", size: blob.size });
    } catch {
      // Anexo é opcional: se um falhar, o reporte segue sem ele.
    }
  }
  return out;
}

/** URL assinada pra ver o anexo (o bucket é privado). */
export async function signedAttachmentUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from("bug-attachments").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
