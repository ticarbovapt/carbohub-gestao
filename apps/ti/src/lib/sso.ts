// ─────────────────────────────────────────────────────────────────────────────
// SSO do ecossistema Carbo — login ÚNICO entre os subdomínios *.carbohub.com.br.
//
// ⚠️ ARQUIVO PADRONIZADO: deve ser IDÊNTICO em carbohub-landing, apps/admin e
// apps/crm. Se mudar aqui, replique nos outros. (ver TODO antigo em supabase.ts)
//
// Como funciona: a sessão do Supabase é gravada num COOKIE com
// domain=.carbohub.com.br (em vez de localStorage, que é isolado por
// subdomínio). Assim, logar em carbohub.com.br vale para admin./sales./ops./etc.
// Em dev/preview (localhost, *.vercel.app) cai para cookie host-only (standalone).
// ─────────────────────────────────────────────────────────────────────────────

export const HUB_URL = "https://carbohub.com.br";

// MESMA chave nos 3 apps — é o que permite um app ler a sessão escrita por outro.
export const AUTH_STORAGE_KEY = "carbo-sso-auth";

const PARENT_DOMAIN = ".carbohub.com.br";
const MAX_CHUNK = 3200; // margem segura sob o limite de ~4KB por cookie
const ONE_YEAR = 60 * 60 * 24 * 365;

export function isCarbohubDomain(): boolean {
  return typeof location !== "undefined" && location.hostname.endsWith("carbohub.com.br");
}

function cookieAttrs(maxAge: number): string {
  const domain = isCarbohubDomain() ? `; domain=${PARENT_DOMAIN}` : "";
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; path=/; max-age=${maxAge}; SameSite=Lax${domain}${secure}`;
}

function writeCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}${cookieAttrs(maxAge)}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return m ? m[1] : null;
}

// Storage cross-subdomínio com chunking (a sessão pode passar de 4KB num cookie).
export const crossSubdomainStorage = {
  getItem(key: string): string | null {
    const count = readCookie(`${key}.n`);
    if (count) {
      let enc = "";
      for (let i = 0; i < Number(count); i++) {
        const part = readCookie(`${key}.${i}`);
        if (part === null) return null;
        enc += part;
      }
      return decodeURIComponent(enc);
    }
    const single = readCookie(key);
    return single === null ? null : decodeURIComponent(single);
  },
  setItem(key: string, value: string): void {
    crossSubdomainStorage.removeItem(key);
    const enc = encodeURIComponent(value);
    if (enc.length <= MAX_CHUNK) {
      writeCookie(key, enc, ONE_YEAR);
      return;
    }
    const n = Math.ceil(enc.length / MAX_CHUNK);
    writeCookie(`${key}.n`, String(n), ONE_YEAR);
    for (let i = 0; i < n; i++) {
      writeCookie(`${key}.${i}`, enc.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK), ONE_YEAR);
    }
  },
  removeItem(key: string): void {
    const count = readCookie(`${key}.n`);
    if (count) {
      for (let i = 0; i < Number(count); i++) writeCookie(`${key}.${i}`, "", 0);
      writeCookie(`${key}.n`, "", 0);
    }
    writeCookie(key, "", 0);
  },
};

/** Manda o usuário não-logado para o login único do Hub (apenas em produção). */
export function goToHubLogin(): void {
  if (typeof location !== "undefined") location.replace(HUB_URL);
}
