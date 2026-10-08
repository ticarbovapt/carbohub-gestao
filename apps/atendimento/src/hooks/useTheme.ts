import { useEffect, useState } from "react";

type Theme = "light" | "dark";

// ─────────────────────────────────────────────────────────────────────────────
// Tema claro/escuro — UM só para o ecossistema inteiro.
//
// ⚠️ Antes era só `localStorage`, que é isolado por SUBDOMÍNIO: escolher claro
// no Atendimento não chegava ao Ops, e cada app lembrava o seu. Agora a
// escolha vai num cookie `domain=.carbohub.com.br` — a MESMA fronteira do SSO
// (`lib/sso.ts`) —, e todo app lê dali primeiro. O `localStorage` fica como
// reserva para localhost/preview, onde o cookie é host-only.
//
// ⚠️ Aba já aberta não recarrega sozinha: por isso o tema é RELIDO quando a
// aba volta ao foco. Sem isso, trocar no Ops e voltar à aba do Atendimento
// mostraria o tema velho até um F5.
//
// Arquivo IDÊNTICO nos oito apps. Editou um, copie para os outros.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = "carbo-theme";
const DOMINIO = ".carbohub.com.br";

function ehTema(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

function lerCookie(): Theme | null {
  const m = document.cookie.match(/(?:^|;\s*)carbo-theme=(light|dark)(?:;|$)/);
  return m ? (m[1] as Theme) : null;
}

function gravar(theme: Theme) {
  const noDominio = window.location.hostname.endsWith("carbohub.com.br");
  const dominio = noDominio ? `; domain=${DOMINIO}` : "";
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  // Um ano: é preferência, não sessão.
  document.cookie = `${CHAVE}=${theme}; path=/; max-age=31536000; SameSite=Lax${dominio}${seguro}`;
  try { localStorage.setItem(CHAVE, theme); } catch { /* modo privado */ }
}

function temaSalvo(): Theme | null {
  const c = lerCookie();
  if (c) return c;
  try {
    const l = localStorage.getItem(CHAVE);
    if (ehTema(l)) return l;
  } catch { /* modo privado */ }
  return null;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return temaSalvo()
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    gravar(theme);
  }, [theme]);

  // Trocou em outro app (outra aba)? Ao voltar, segue a escolha mais recente.
  useEffect(() => {
    const reler = () => {
      if (document.visibilityState === "hidden") return;
      const salvo = lerCookie();
      if (salvo) setTheme((atual) => (atual === salvo ? atual : salvo));
    };
    window.addEventListener("focus", reler);
    document.addEventListener("visibilitychange", reler);
    return () => {
      window.removeEventListener("focus", reler);
      document.removeEventListener("visibilitychange", reler);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return { theme, setTheme, toggleTheme };
}
