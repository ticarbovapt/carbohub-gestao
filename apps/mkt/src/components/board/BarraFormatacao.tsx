import { Bold, Italic, Strikethrough, Code, List, Link2 } from "lucide-react";
import { pedirTexto } from "@carbo/shell";

// Barra de formatação do COMENTÁRIO. Escreve MARKDOWN no próprio texto — o
// mesmo formato da descrição e dos comentários importados, que o `TextoRico`
// já desenha. Editor visual aqui (como o da descrição) seria um segundo editor
// num campo de uma linha; a barra resolve o "não sei o atalho".
// ⚠️ Itálico é `*x*`, não `_x_`: é o que o `TextoRico` reconhece.

type Ref = React.RefObject<HTMLTextAreaElement>;

function envolver(ref: Ref, valor: string, onChange: (v: string) => void, antes: string, depois = antes, vazio = "texto") {
  const el = ref.current;
  const ini = el?.selectionStart ?? valor.length;
  const fim = el?.selectionEnd ?? valor.length;
  const sel = valor.slice(ini, fim) || vazio;
  onChange(valor.slice(0, ini) + antes + sel + depois + valor.slice(fim));
  requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(ini + antes.length, ini + antes.length + sel.length); } });
}

function lista(ref: Ref, valor: string, onChange: (v: string) => void) {
  const el = ref.current;
  const ini = el?.selectionStart ?? valor.length;
  const fim = el?.selectionEnd ?? valor.length;
  // Do começo da linha da seleção até o fim dela: cada linha vira item.
  const a = valor.lastIndexOf("\n", ini - 1) + 1;
  const trecho = valor.slice(a, fim) || "";
  const novo = (trecho || "item").split("\n").map((l) => (l.startsWith("- ") ? l : `- ${l}`)).join("\n");
  onChange(valor.slice(0, a) + novo + valor.slice(fim));
  requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(a + novo.length, a + novo.length); } });
}

export function BarraFormatacao({ inputRef, valor, onChange }: { inputRef: Ref; valor: string; onChange: (v: string) => void }) {
  const btn = "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted";
  // onMouseDown + preventDefault: o clique não tira o foco do campo, senão a
  // seleção que o botão vai formatar se perde antes de ele rodar.
  const segura = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" title="Negrito" className={btn} onMouseDown={segura} onClick={() => envolver(inputRef, valor, onChange, "**")}><Bold className="h-3.5 w-3.5" /></button>
      <button type="button" title="Itálico" className={btn} onMouseDown={segura} onClick={() => envolver(inputRef, valor, onChange, "*")}><Italic className="h-3.5 w-3.5" /></button>
      <button type="button" title="Tachado" className={btn} onMouseDown={segura} onClick={() => envolver(inputRef, valor, onChange, "~~")}><Strikethrough className="h-3.5 w-3.5" /></button>
      <button type="button" title="Código" className={btn} onMouseDown={segura} onClick={() => envolver(inputRef, valor, onChange, "`", "`", "código")}><Code className="h-3.5 w-3.5" /></button>
      <button type="button" title="Lista" className={btn} onMouseDown={segura} onClick={() => lista(inputRef, valor, onChange)}><List className="h-3.5 w-3.5" /></button>
      <button type="button" title="Link" className={btn} onMouseDown={segura} onClick={async () => {
        const el = inputRef.current;
        const ini = el?.selectionStart ?? valor.length, fim = el?.selectionEnd ?? valor.length;
        const url = await pedirTexto({ titulo: "Inserir link", rotulo: "Endereço (https://…)", obrigatorio: true, confirmar: "Inserir" });
        if (!url?.trim()) return;
        const texto = valor.slice(ini, fim) || url.trim();
        onChange(valor.slice(0, ini) + `[${texto}](${url.trim()})` + valor.slice(fim));
        requestAnimationFrame(() => el?.focus());
      }}><Link2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}
