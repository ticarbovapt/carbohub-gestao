import { useEffect, useState } from "react";

// Banner "Instalar Carbo Hub" na tela inicial:
//  • Android/Chrome: usa o evento beforeinstallprompt (botão Instalar).
//  • iPhone/Safari: detecta iOS + não-standalone e mostra o tutorial
//    "Compartilhar → Adicionar à Tela de Início".
// Some se já instalado (standalone) ou se o usuário dispensar.
// Dependência-zero (sem libs) — mudança aditiva e segura no app vivo.

const DISMISS_KEY = "carbohub-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIOS() {
  const ua = window.navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOS = /Macintosh/i.test(ua) && "ontouchend" in window;
  return iOSDevice || iPadOS;
}

// Ícone de "compartilhar" do iOS (SVG inline, sem dependência).
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="inline align-text-bottom">
      <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export function InstallHub() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void>; userChoice: Promise<unknown> } | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as unknown as { prompt: () => Promise<void>; userChoice: Promise<unknown> });
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);

    if (isIOS()) { setIos(true); setShow(true); }

    const onInstalled = () => { setShow(false); localStorage.setItem(DISMISS_KEY, "1"); };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!deferred) return;
    try { await deferred.prompt(); await deferred.userChoice; } catch { /* ignora */ }
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-3">
      <div className="w-full max-w-md rounded-xl border bg-background p-3 shadow-lg">
        <div className="flex items-start gap-3">
          <img src="/favicon.png" alt="Carbo Hub" className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Instalar o Carbo Hub</p>
            {ios ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Toque em <ShareIcon /> <strong>Compartilhar</strong> e depois em{" "}
                <strong>Adicionar à Tela de Início</strong> <span aria-hidden>➕</span>.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">Acesso rápido na tela inicial, como um app.</p>
            )}
          </div>
          <button onClick={dismiss} className="shrink-0 text-lg leading-none text-muted-foreground hover:text-foreground" aria-label="Dispensar">×</button>
        </div>

        {!ios && deferred && (
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={dismiss} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Agora não</button>
            <button onClick={install} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">Instalar</button>
          </div>
        )}
      </div>
    </div>
  );
}
