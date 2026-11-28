// Tabela que vira CARTÕES quando não cabe — e só quando não cabe.
//
// O defeito que isto resolve: tabela larga dentro de tela estreita (celular, ou
// notebook com a barra lateral aberta — 1024 de janela são ~730 de conteúdo)
// cortava as últimas colunas atrás de uma rolagem lateral que ninguém acha.
// O Sales resolveu à mão, tela a tela, juntando colunas. Aqui a regra é uma só:
//
//   a tabela CABE na caixa  → continua tabela, como sempre foi
//   a tabela NÃO cabe       → cada linha vira um cartão "rótulo · valor"
//
// ⚠️ Quem decide é a LARGURA DA CAIXA, não a da janela: o breakpoint `md:` olha
// a janela e erra com a barra lateral aberta. A medida é feita no modo TABELA
// (tira o atributo, lê, devolve) dentro do mesmo quadro — o navegador não pinta
// no meio, então não pisca.
// ⚠️ O rótulo de cada célula sai do cabeçalho (`thead`), respeitando `colSpan`.
// Linha com célula larga (vazio, grupo, detalhe expandido) vira cartão inteiro.
// ⚠️ O visual mora no `index.css` de cada app (bloco "Tabela que vira cartões");
// sem ele o atributo não muda nada e a tabela segue rolando de lado.
// ⚠️ Ordenar clicando no cabeçalho só existe no modo tabela (o cabeçalho some
// nos cartões) — o mesmo acordo do Sales.
import * as React from "react";

const ATTR = "data-tabela-cartao";

function rotular(caixa: HTMLElement) {
  for (const tabela of Array.from(caixa.querySelectorAll("table"))) {
    // Tabela aninhada é da célula de outra; só a de fora ganha rótulos.
    if (tabela.parentElement?.closest("table") && caixa.contains(tabela.parentElement.closest("table"))) continue;
    const linhasCab = tabela.tHead?.rows;
    const cab = linhasCab && linhasCab.length ? linhasCab[linhasCab.length - 1] : null;
    const rotulos: string[] = [];
    if (cab) {
      for (const th of Array.from(cab.cells)) {
        const t = (th.textContent ?? "").replace(/\s+/g, " ").trim();
        for (let i = 0; i < Math.max(1, th.colSpan); i++) rotulos.push(i === 0 ? t : "");
      }
    }
    const corpos = [...Array.from(tabela.tBodies), ...(tabela.tFoot ? [tabela.tFoot] : [])];
    for (const corpo of corpos) {
      for (const tr of Array.from(corpo.rows)) {
        let col = 0;
        const celulas = Array.from(tr.cells);
        const larga = celulas.some((c) => c.colSpan > 1 && celulas.length <= 2);
        tr.toggleAttribute("data-cartao-largo", larga);
        celulas.forEach((td, i) => {
          // Célula só de botões (Ações) não leva rótulo: os ícones já dizem.
          const soBotoes = !(td.textContent ?? "").trim() && !!td.querySelector("button, a, input");
          const r = (td.colSpan > 1 && larga) || soBotoes ? "" : rotulos[col] ?? "";
          if (td.getAttribute("data-rotulo") !== r) td.setAttribute("data-rotulo", r);
          td.toggleAttribute("data-cartao-titulo", i === 0 && !larga);
          // Coluna que a própria tela esconde (`hidden md:table-cell`) continua
          // escondida no cartão — medido no modo tabela, quando isto roda.
          if (td.className.includes("hidden")) td.toggleAttribute("data-cartao-oculto", getComputedStyle(td).display === "none");
          col += Math.max(1, td.colSpan);
        });
      }
    }
  }
}

/** Liga o comportamento numa caixa que contém a `<table>`. */
export function useTabelaAdaptavel(ref: { current: HTMLElement | null }, ativo = true) {
  React.useLayoutEffect(() => {
    const caixa = ref.current;
    if (!caixa || !ativo || typeof ResizeObserver === "undefined") return;
    let quadro = 0;
    const avaliar = () => {
      quadro = 0;
      const tabela = caixa.querySelector("table");
      if (!tabela) return;
      const larg = caixa.clientWidth;
      if (!larg) return; // escondida (aba fechada): decide quando aparecer
      caixa.removeAttribute(ATTR);
      rotular(caixa);
      const naoCabe = tabela.scrollWidth > larg + 1;
      if (naoCabe) caixa.setAttribute(ATTR, "");
    };
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(avaliar); };
    avaliar();
    const ro = new ResizeObserver(agendar);
    ro.observe(caixa);
    const mo = new MutationObserver(agendar);
    mo.observe(caixa, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); if (quadro) cancelAnimationFrame(quadro); caixa.removeAttribute(ATTR); };
  }, [ref, ativo]);
}

/** A caixa pronta: troque `<div className="overflow-x-auto"><table>` por isto.
 * ⚠️ Tipos ESTRUTURAIS (sem `forwardRef`/`HTMLAttributes` do React): os apps têm
 * cópias próprias de `@types/react`, e o tipo nominal falharia neles. */
export function CaixaTabela({ cartao = true, ...props }: { cartao?: boolean; className?: string; children?: unknown; [k: string]: unknown }) {
  const interno = React.useRef<HTMLDivElement | null>(null);
  useTabelaAdaptavel(interno, cartao);
  return React.createElement("div", { ...props, ref: interno } as never);
}
