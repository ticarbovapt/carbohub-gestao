import type { ReactNode } from "react";

// Formatação estilo WhatsApp no corpo da mensagem:
//   *negrito*  _itálico_  ~tachado~  `mono`  ```bloco```
// Suporta aninhamento (ex.: _*negrito itálico*_). Sem lib.
interface Rule { re: RegExp; tag: "b" | "i" | "s" | "code" | "pre"; recurse: boolean }
const RULES: Rule[] = [
  { re: /```([\s\S]+?)```/, tag: "pre", recurse: false },
  { re: /`([^`\n]+?)`/, tag: "code", recurse: false },
  { re: /\*(?=\S)([\s\S]*?\S|\S)\*/, tag: "b", recurse: true },
  { re: /_(?=\S)([\s\S]*?\S|\S)_/, tag: "i", recurse: true },
  { re: /~(?=\S)([\s\S]*?\S|\S)~/, tag: "s", recurse: true },
];

function wrap(tag: Rule["tag"], children: ReactNode, key: string): ReactNode {
  switch (tag) {
    case "b": return <strong key={key} className="font-semibold">{children}</strong>;
    case "i": return <em key={key} className="italic">{children}</em>;
    case "s": return <span key={key} className="line-through">{children}</span>;
    case "code": return <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em] dark:bg-white/15">{children}</code>;
    case "pre": return <code key={key} className="my-1 block whitespace-pre-wrap rounded bg-black/10 p-2 font-mono text-[0.85em] dark:bg-white/15">{children}</code>;
  }
}

let counter = 0;
function parse(text: string): ReactNode[] {
  let best: { rule: Rule; m: RegExpExecArray } | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.m.index)) best = { rule, m };
  }
  if (!best) return text ? [text] : [];
  const { rule, m } = best;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const node = wrap(rule.tag, rule.recurse ? parse(m[1]) : m[1], "f" + counter++);
  return [...parse(before), node, ...parse(after)];
}

export function renderRich(text: string): ReactNode {
  counter = 0;
  return parse(text);
}

// Versão texto puro (sem marcadores) para prévias na lista/toast.
export function richToPlain(t: string): string {
  return t
    .replace(/```([\s\S]+?)```/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1")
    .replace(/\*(?=\S)([\s\S]*?\S|\S)\*/g, "$1")
    .replace(/_(?=\S)([\s\S]*?\S|\S)_/g, "$1")
    .replace(/~(?=\S)([\s\S]*?\S|\S)~/g, "$1");
}
