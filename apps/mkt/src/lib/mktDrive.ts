// Referência a arquivos do Google Drive por link (sem OAuth/API nesta fase).
// Extrai o fileId de vários formatos de URL do Drive/Docs e monta os links de
// abrir e de miniatura. A miniatura só aparece se o arquivo estiver
// compartilhado como "qualquer pessoa com o link".

export function isDriveUrl(url: string): boolean {
  return /(?:drive|docs)\.google\.com/i.test(url);
}

export function parseDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,      // /file/d/ID/view
    /\/d\/([a-zA-Z0-9_-]{10,})/,             // docs .../document/d/ID
    /[?&]id=([a-zA-Z0-9_-]{10,})/,           // ?id=ID / open?id=ID / uc?id=ID
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export const driveOpenUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;
export const driveThumbUrl = (fileId: string) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

/** Nome "chutado" a partir da URL (fallback quando o usuário não digita um). */
export function guessNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).slice(0, 120);
  } catch {
    return url.slice(0, 120);
  }
}
