import { Fragment, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Texto rico das DESCRIÇÕES e COMENTÁRIOS dos cartões — o markdown do Trello.
//
// Existe porque o quadro importado do Trello chegou ilegível: a descrição é
// markdown (títulos, negrito, listas, citações, `---`) e os links vêm no
// formato do Trello, `[url](url "smartCard-inline")` — a MESMA URL duas vezes
// e um título técnico. Mostrado cru, um cartão com seis links virava uma
// parede de colchetes.
//
// ⚠️ Sem `dangerouslySetInnerHTML` e sem biblioteca: o texto vira ELEMENTOS
// React, então HTML digitado num cartão aparece como texto e nunca executa.
// ⚠️ Link SEM rótulo próprio (o texto é a própria URL) ganha um nome legível
// pelo destino ("Planilha Google", "Pasta no Drive"…); a URL completa fica no
// `title`, para quem passa o mouse.
// ─────────────────────────────────────────────────────────────────────────────

const EMOJI: Record<string, string> = {
  white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌", warning: "⚠️", rocket: "🚀",
  movie_camera: "🎥", fire: "🔥", star: "⭐", pushpin: "📌", calendar: "📅", point_right: "👉",
  tada: "🎉", eyes: "👀", bulb: "💡", memo: "📝", link: "🔗", camera: "📷", red_circle: "🔴",
  green_circle: "🟢", yellow_circle: "🟡", clock: "🕒", hourglass: "⏳", dart: "🎯", paperclip: "📎",
};

export function rotuloDoLink(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    const p = u.pathname;
    if (h === "docs.google.com") {
      if (p.startsWith("/spreadsheets")) return "Planilha Google";
      if (p.startsWith("/document")) return "Documento Google";
      if (p.startsWith("/presentation")) return "Apresentação Google";
      if (p.startsWith("/forms")) return "Formulário Google";
    }
    if (h === "drive.google.com") return p.includes("/folders/") ? "Pasta no Drive" : "Arquivo no Drive";
    if (h.endsWith("instagram.com")) return "Instagram";
    if (h === "youtu.be" || h.endsWith("youtube.com")) return "YouTube";
    if (h.endsWith("tiktok.com")) return "TikTok";
    if (h === "trello.com") return p.includes("/attachments/") ? "Anexo no Trello" : "Cartão do Trello";
    if (h.endsWith("canva.com")) return "Canva";
    if (h.endsWith("figma.com")) return "Figma";
    const caminho = p.length > 1 ? p.slice(0, 24) + (p.length > 24 ? "…" : "") : "";
    return h + caminho;
  } catch {
    return url;
  }
}

function Link({ url, texto }: { url: string; texto: string }) {
  const proprio = texto && texto.trim() !== url.trim() && !/^https?:\/\//.test(texto.trim());
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url}
      onClick={(e) => e.stopPropagation()}
      className="text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent break-words">
      {proprio ? inline(texto) : rotuloDoLink(url)}
    </a>
  );
}

// Padrões de linha, em ordem de prioridade. O primeiro que casar mais cedo no
// texto vence; o que vem antes vira texto puro.
const PADROES: { re: RegExp; f: (m: RegExpExecArray) => ReactNode }[] = [
  { re: /!?\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/, f: (m) => <Link url={m[2]} texto={m[1]} /> },
  { re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/, f: (m) => <Link url={m[0]} texto="" /> },
  { re: /\*\*([^*]+?)\*\*|__([^_]+?)__/, f: (m) => <strong className="font-semibold">{inline(m[1] ?? m[2])}</strong> },
  { re: /~~([^~]+?)~~/, f: (m) => <s className="opacity-70">{inline(m[1])}</s> },
  { re: /\*([^*\s][^*]*?)\*/, f: (m) => <em>{inline(m[1])}</em> },
  { re: /`([^`]+)`/, f: (m) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{m[1]}</code> },
  { re: /:([a-z0-9_+-]+):/, f: (m) => EMOJI[m[1]] ?? m[0] },
];

function inline(texto: string): ReactNode {
  const out: ReactNode[] = [];
  let resto = texto.replace(/‌/g, "");
  let k = 0;
  while (resto) {
    let melhor: { i: number; m: RegExpExecArray; p: (typeof PADROES)[number] } | null = null;
    for (const p of PADROES) {
      const m = p.re.exec(resto);
      if (m && (!melhor || m.index < melhor.i)) melhor = { i: m.index, m, p };
    }
    if (!melhor) { out.push(resto); break; }
    if (melhor.i > 0) out.push(resto.slice(0, melhor.i));
    out.push(<Fragment key={k++}>{melhor.p.f(melhor.m)}</Fragment>);
    resto = resto.slice(melhor.i + melhor.m[0].length);
  }
  return out;
}

type Bloco =
  | { t: "p"; linhas: string[] }
  | { t: "h"; n: number; texto: string }
  | { t: "hr" }
  | { t: "q"; linhas: string[] }
  | { t: "lista"; ordenada: boolean; itens: { nivel: number; texto: string; marca?: boolean | null }[] };

function blocos(texto: string): Bloco[] {
  const out: Bloco[] = [];
  const ult = () => out[out.length - 1];
  for (const bruta of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const linha = bruta.replace(/\s+$/, "");
    if (!linha.trim()) { out.push({ t: "p", linhas: [] }); continue; }
    let m: RegExpMatchArray | null;
    if ((m = linha.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) { out.push({ t: "h", n: m[1].length, texto: m[2].replace(/\s#+$/, "") }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(linha)) { out.push({ t: "hr" }); continue; }
    if ((m = linha.match(/^\s*>\s?(.*)$/))) {
      const b = ult();
      if (b?.t === "q") b.linhas.push(m[1]); else out.push({ t: "q", linhas: [m[1]] });
      continue;
    }
    if ((m = linha.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      const ordenada = /\d/.test(m[2]);
      const nivel = Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2));
      let item = m[3];
      let marca: boolean | null = null;
      const cb = item.match(/^\[([ xX])\]\s+(.*)$/);
      if (cb) { marca = cb[1] !== " "; item = cb[2]; }
      const b = ult();
      if (b?.t === "lista" && b.ordenada === ordenada) b.itens.push({ nivel, texto: item, marca });
      else out.push({ t: "lista", ordenada, itens: [{ nivel, texto: item, marca }] });
      continue;
    }
    const b = ult();
    if (b?.t === "p" && b.linhas.length > 0) b.linhas.push(linha);
    else out.push({ t: "p", linhas: [linha] });
  }
  return out.filter((b) => !(b.t === "p" && b.linhas.length === 0));
}

const TAM_TITULO = ["text-base", "text-[0.95rem]", "text-sm", "text-sm", "text-sm", "text-sm"];

export function TextoRico({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <div className={`space-y-2 break-words [overflow-wrap:anywhere] ${className}`}>
      {blocos(texto).map((b, i) => {
        if (b.t === "h") return <p key={i} className={`${TAM_TITULO[b.n - 1]} font-semibold text-foreground pt-1`}>{inline(b.texto)}</p>;
        if (b.t === "hr") return <hr key={i} className="border-border" />;
        if (b.t === "q") {
          return (
            <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground">
              {b.linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}
            </blockquote>
          );
        }
        if (b.t === "lista") {
          return (
            <ul key={i} className="space-y-0.5">
              {b.itens.map((it, j) => (
                <li key={j} className="flex gap-2" style={{ paddingLeft: it.nivel * 16 }}>
                  <span className="text-muted-foreground shrink-0 select-none">
                    {it.marca === true ? "☑" : it.marca === false ? "☐" : b.ordenada ? `${j + 1}.` : "•"}
                  </span>
                  <span className={it.marca ? "line-through opacity-70" : ""}>{inline(it.texto)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{b.linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
