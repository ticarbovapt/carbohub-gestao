import { useState } from "react";
import { toast } from "sonner";
import { X, Plus, Trash2, BarChart3 } from "lucide-react";
import { useCreatePoll } from "../hooks";

// Criação de enquete pelo compositor: pergunta + opções, única/múltipla,
// anônima/aberta, prazo opcional. Envia via chat_poll_create (RPC).
export function PollDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const create = useCreatePoll(channelId);
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  const [multipla, setMultipla] = useState(false);
  const [anonima, setAnonima] = useState(false);
  const [comPrazo, setComPrazo] = useState(false);
  const [prazo, setPrazo] = useState("");

  const validas = opcoes.map((o) => o.trim()).filter(Boolean);
  const podeCriar = pergunta.trim().length > 0 && validas.length >= 2 && !create.isPending;

  function setOpcao(i: number, v: string) {
    setOpcoes((prev) => prev.map((o, j) => (j === i ? v : o)));
  }
  function addOpcao() { if (opcoes.length < 12) setOpcoes((prev) => [...prev, ""]); }
  function delOpcao(i: number) { setOpcoes((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i))); }

  async function submit() {
    if (!podeCriar) return;
    if (comPrazo && prazo && new Date(prazo).getTime() <= Date.now()) {
      toast.error("O prazo precisa ser no futuro."); return;
    }
    try {
      await create.mutateAsync({
        pergunta: pergunta.trim(),
        opcoes: validas,
        multipla, anonima,
        expiraEm: comPrazo && prazo ? new Date(prazo).toISOString() : null,
      });
      toast.success("Enquete criada");
      onClose();
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível criar a enquete");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" /> Nova enquete</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Pergunta</label>
            <textarea autoFocus value={pergunta} onChange={(e) => setPergunta(e.target.value)} rows={2}
              placeholder="Ex.: Onde vamos almoçar sexta?"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Opções</label>
            <div className="space-y-2">
              {opcoes.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} onChange={(e) => setOpcao(i, e.target.value)} placeholder={`Opção ${i + 1}`}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {opcoes.length > 2 && (
                    <button onClick={() => delOpcao(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remover opção">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {opcoes.length < 12 && (
              <button onClick={addOpcao} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Adicionar opção
              </button>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center justify-between text-sm">
              <span>Permitir múltipla escolha</span>
              <input type="checkbox" checked={multipla} onChange={(e) => setMultipla(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Voto anônimo <span className="text-xs text-muted-foreground">(esconde quem votou)</span></span>
              <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Definir prazo</span>
              <input type="checkbox" checked={comPrazo} onChange={(e) => setComPrazo(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
            {comPrazo && (
              <input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={submit} disabled={!podeCriar}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {create.isPending ? "Criando…" : "Criar enquete"}
          </button>
        </div>
      </div>
    </div>
  );
}
