import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/* ── "Nova versão disponível" ────────────────────────────────────────────────
 * No app da tela inicial não há barra de endereço nem "puxar para atualizar":
 * depois de um deploy a pessoa seguia na versão antiga até fechar o app de vez.
 *
 * Como sabe que mudou: o Vite dá NOME NOVO ao script principal a cada build
 * (`/assets/index-<hash>.js`). A faixa compara o script desta aba com o do
 * `index.html` no ar — de 5 em 5 min e ao voltar para o app. Diferente ⇒ faixa.
 *
 * ⚠️ Pede o HTML com `Accept: text/html`: o `sw.js` trata isso como navegação
 * (rede primeiro). Sem o cabeçalho ele responderia do CACHE e a faixa nunca
 * apareceria.
 * ⚠️ Em desenvolvimento não há script com hash: a faixa fica muda. Para ver,
 * `window.dispatchEvent(new Event("carbo:nova-versao"))`.
 * Em FLUXO, logo abaixo da tarja de status — nunca `fixed` (a lição da tarja).
 */
const INTERVALO = 5 * 60 * 1000;
const RE_SCRIPT = /<script[^>]*\ssrc="([^"]*\/assets\/[^"]+\.js)"/;

function scriptDestaAba(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  try { return s ? new URL(s.src, location.href).pathname : null; } catch { return null; }
}

async function scriptNoAr(): Promise<string | null> {
  const r = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" } });
  if (!r.ok) return null;
  const m = (await r.text()).match(RE_SCRIPT);
  try { return m ? new URL(m[1], location.href).pathname : null; } catch { return null; }
}

export function NovaVersao() {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    const atual = scriptDestaAba();
    let vivo = true;
    const conferir = async () => {
      if (!atual || document.visibilityState !== "visible") return;
      try {
        const noAr = await scriptNoAr();
        if (vivo && noAr && noAr !== atual) setNova(true);
      } catch { /* sem rede: confere na próxima */ }
    };
    const simular = () => setNova(true);
    const t = setInterval(conferir, INTERVALO);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    window.addEventListener("carbo:nova-versao", simular);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
      window.removeEventListener("carbo:nova-versao", simular);
    };
  }, []);

  if (!nova) return null;
  return (
    <div role="status" className="shrink-0 bg-carbo-green text-white">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2.5 px-3 py-2 sm:px-4">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">Nova versão disponível</span>
        <button type="button" onClick={() => location.reload()}
          className="shrink-0 rounded-md bg-white px-3 py-1 text-[13px] font-semibold text-carbo-green hover:bg-white/90">
          Atualizar
        </button>
      </div>
    </div>
  );
}
