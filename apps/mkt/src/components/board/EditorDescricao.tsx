import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Link2, Quote, Code, Minus, ChevronDown, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMOJI } from "@/lib/textoRico";
import { pedirTexto } from "@carbo/shell";

// ─────────────────────────────────────────────────────────────────────────────
// Editor VISUAL da descrição, como o do Trello: o que se vê é o que fica.
//
// ⚠️ O que se GRAVA continua sendo MARKDOWN — é o formato do que veio do
// Trello e o que o `TextoRico` desenha no cartão e nos comentários. O editor
// só troca a forma de escrever; trocar o formato gravado obrigaria a converter
// as 500 descrições importadas e a ensinar o `TextoRico` a ler outra coisa.
// ⚠️ Por isso só entra no editor o que o markdown sabe guardar: SUBLINHADO
// fica de fora (markdown não tem), senão a pessoa sublinha, salva, reabre e o
// sublinhado sumiu — calado.
// ⚠️ "M↓" alterna para o texto cru, como no Trello: é a saída para qualquer
// coisa que o editor visual não represente bem.
// ─────────────────────────────────────────────────────────────────────────────

// `:white_check_mark:` do Trello vira o emoji de verdade ao abrir — no editor
// visual o código cru apareceria como texto, e seria gravado assim de volta.
const comEmoji = (md: string) => md.replace(/:([a-z0-9_+-]+):/g, (m, k) => EMOJI[k] ?? m);

export function EditorDescricao({ inicial, onSalvar, onCancelar }: {
  inicial: string; onSalvar: (md: string) => void; onCancelar: () => void;
}) {
  const [cru, setCru] = useState(false);
  const [texto, setTexto] = useState(() => comEmoji(inicial));
  const [menuTitulo, setMenuTitulo] = useState(false);
  const tituloRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer", target: "_blank" } },
      }),
      Markdown,
      Placeholder.configure({ placeholder: "Adicione uma descrição mais detalhada…" }),
    ],
    content: comEmoji(inicial),
    contentType: "markdown",
    autofocus: "end",
    editorProps: { attributes: { class: "mkt-editor focus:outline-none min-h-[160px] px-3 py-2.5 text-sm" } },
  });

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      b: e.isActive("bold"), i: e.isActive("italic"), s: e.isActive("strike"),
      ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), q: e.isActive("blockquote"),
      code: e.isActive("codeBlock"), link: e.isActive("link"),
      nivel: [1, 2, 3].find((n) => e.isActive("heading", { level: n })) ?? 0,
      podeDesfazer: e.can().undo(), podeRefazer: e.can().redo(),
    } : null,
  });

  useEffect(() => {
    if (!menuTitulo) return;
    const fora = (ev: MouseEvent) => { if (!tituloRef.current?.contains(ev.target as Node)) setMenuTitulo(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menuTitulo]);

  if (!editor) return null;

  const alternarCru = () => {
    if (cru) editor.commands.setContent(texto, { contentType: "markdown" });
    else setTexto(editor.getMarkdown());
    setCru(!cru);
  };
  const salvar = () => onSalvar((cru ? texto : editor.getMarkdown()).trim());
  const linkar = async () => {
    const atual = editor.getAttributes("link").href as string | undefined;
    const url = await pedirTexto({ titulo: atual ? "Editar link" : "Inserir link", rotulo: "Endereço (vazio remove o link)", valorInicial: atual ?? "https://", confirmar: "Aplicar" });
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    if (editor.state.selection.empty && !atual) {
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  };

  const Bt = ({ on, ativo, titulo, children }: { on: () => void; ativo?: boolean; titulo: string; children: React.ReactNode }) => (
    <button type="button" title={titulo} disabled={cru} onMouseDown={(e) => e.preventDefault()} onClick={on}
      className={`h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none ${ativo ? "bg-muted text-foreground" : ""}`}>
      {children}
    </button>
  );
  const ROTULO_NIVEL = ["Texto normal", "Título 1", "Título 2", "Título 3"];

  return (
    <div className="space-y-2">
      <div className="rounded-[var(--input-radius)] border border-primary/60 ring-2 ring-primary/20 bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
          <div className="relative" ref={tituloRef}>
            <button type="button" disabled={cru} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenuTitulo((v) => !v)}
              className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title="Estilo do texto">
              Tt <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {menuTitulo && (
              <div className="absolute z-30 mt-1 w-44 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] py-1">
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} type="button" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (n === 0) editor.chain().focus().setParagraph().run();
                      else editor.chain().focus().toggleHeading({ level: n as 1 | 2 | 3 }).run();
                      setMenuTitulo(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-muted ${estado?.nivel === n ? "text-primary" : "text-foreground"} ${n === 1 ? "text-lg font-bold" : n === 2 ? "text-base font-bold" : n === 3 ? "text-sm font-semibold" : "text-sm"}`}>
                    {ROTULO_NIVEL[n]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bt titulo="Negrito (Ctrl+B)" ativo={estado?.b} on={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Bt>
          <Bt titulo="Itálico (Ctrl+I)" ativo={estado?.i} on={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Bt>
          <Bt titulo="Riscado" ativo={estado?.s} on={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Bt>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bt titulo="Lista com marcadores" ativo={estado?.ul} on={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Bt>
          <Bt titulo="Lista numerada" ativo={estado?.ol} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Bt>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bt titulo="Link (Ctrl+K)" ativo={estado?.link} on={linkar}><Link2 className="h-4 w-4" /></Bt>
          <Bt titulo="Citação" ativo={estado?.q} on={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Bt>
          <Bt titulo="Bloco de código" ativo={estado?.code} on={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="h-4 w-4" /></Bt>
          <Bt titulo="Linha divisória" on={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Bt>
          <span className="flex-1" />
          <Bt titulo="Desfazer (Ctrl+Z)" on={() => editor.chain().focus().undo().run()}><Undo2 className={`h-4 w-4 ${estado?.podeDesfazer ? "" : "opacity-40"}`} /></Bt>
          <Bt titulo="Refazer (Ctrl+Shift+Z)" on={() => editor.chain().focus().redo().run()}><Redo2 className={`h-4 w-4 ${estado?.podeRefazer ? "" : "opacity-40"}`} /></Bt>
          <button type="button" onClick={alternarCru} title={cru ? "Voltar ao editor visual" : "Editar como Markdown"}
            className={`h-8 px-2 rounded-md text-xs font-bold ${cru ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            M↓
          </button>
        </div>
        {cru ? (
          <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={12}
            className="block w-full min-h-[160px] bg-transparent px-3 py-2.5 text-sm font-mono resize-y focus:outline-none" />
        ) : (
          <div className="max-h-[55vh] overflow-y-auto"
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); linkar(); } }}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <Button size="sm" onClick={salvar}>Salvar</Button>
        <button type="button" onClick={onCancelar} className="h-8 px-3 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Descartar alterações</button>
      </div>
    </div>
  );
}
