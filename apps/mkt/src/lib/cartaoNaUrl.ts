import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// O cartão aberto mora no endereço (`?card=`), para F5 e link reabrirem nele.
//
// ⚠️ O `?card=` vai SÓ na entrada do histórico que o PRÓPRIO cartão cria
// (`FecharComVoltar`, dentro do diálogo), nunca na da página por baixo. Assim
// fechar — pelo X ou pelo Voltar — volta a uma entrada SEM o parâmetro, e um F5
// depois de fechar não reabre nada. Se o parâmetro fosse para a entrada da
// página, fechar deixaria o endereço dizendo "cartão aberto" com ele fechado.
// ⚠️ Por isso a escrita é `history.replaceState` mantendo o `state`: é nele que
// mora a marca do `FecharComVoltar`, e o `replace` do roteador a apagaria — o
// diálogo deixaria de saber que aquela entrada é dele.
// ─────────────────────────────────────────────────────────────────────────────

/** Na PÁGINA: ao montar, abre o cartão do endereço e tira o parâmetro da entrada da página. */
export function useCartaoDaUrl(abrir: (cardId: string, anexoId: string | null) => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const card = params.get("card");
    if (!card) return;
    abrir(card, params.get("anexo"));
    const p = new URLSearchParams(window.location.search);
    p.delete("card"); p.delete("anexo");
    setParams(p, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** No CARTÃO: grava `?card=` na entrada do histórico que o diálogo acabou de criar. */
export function useCartaoNoEndereco(cardId: string) {
  useEffect(() => {
    // Depois do `pushState` do FecharComVoltar (efeito do filho, mesmo commit).
    const t = window.setTimeout(() => {
      const u = new URL(window.location.href);
      if (u.searchParams.get("card") === cardId) return;
      u.searchParams.set("card", cardId);
      u.searchParams.delete("anexo");
      window.history.replaceState(window.history.state, "", u.toString());
    }, 0);
    return () => window.clearTimeout(t);
  }, [cardId]);
}
