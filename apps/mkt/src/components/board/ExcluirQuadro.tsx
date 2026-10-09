import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pedirTexto } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/mktArquivos";
import type { Board } from "@/hooks/useBoards";

// ─────────────────────────────────────────────────────────────────────────────
// Excluir um quadro pela tela — antes, só por SQL.
//
// ⚠️ É DEFINITIVO, então a confirmação é DIGITAR o nome do quadro: um clique
// por engano não pode levar o histórico inteiro de uma campanha.
// ⚠️ Os ARQUIVOS saem do bucket antes da linha: a cascata do banco tira
//    cartões, comentários e anexos, mas nunca os objetos do Storage — eles
//    ficariam pagando espaço, sem tela nenhuma que os mostre.
// ⚠️ RECUSA quando outro quadro ESPELHA um cartão deste: a FK do espelho é
//    ON DELETE CASCADE, e excluir aqui sumiria com o cartão de lá, calado.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

export function ExcluirQuadro({ board }: { board: Board }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);

  const excluir = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setOcupado(true);
    try {
      const r = await db.rpc("mkt_quadro_para_excluir", { p_board: board.id });
      if (r.error) throw new Error(r.error.message);
      const { cartoes, espelhos_fora, arquivos } = r.data as { cartoes: number; espelhos_fora: number; arquivos: string[] };
      if (espelhos_fora > 0) {
        toast.error(`Não dá para excluir: ${espelhos_fora} cartão(ões) de OUTROS quadros espelham cartões deste, e sumiriam junto. Remova os espelhos primeiro.`, { duration: 9000 });
        return;
      }
      const digitado = await pedirTexto({
        titulo: `Excluir o quadro "${board.title}"?`,
        mensagem: `Isto é definitivo: ${cartoes} cartão(ões), com comentários, checklists e ${arquivos.length} arquivo(s), são apagados do sistema. Para confirmar, digite o nome do quadro.`,
        rotulo: "Nome do quadro", placeholder: board.title, obrigatorio: true, confirmar: "Excluir quadro", perigo: true,
      });
      if (digitado === null) return;
      if (digitado.trim().toLowerCase() !== board.title.trim().toLowerCase()) {
        toast.error("O nome digitado não confere — nada foi excluído.");
        return;
      }
      const aviso = toast.loading(`Excluindo "${board.title}"…`);
      for (let i = 0; i < arquivos.length; i += 100) {
        const rm = await supabase.storage.from(BUCKET).remove(arquivos.slice(i, i + 100));
        if (rm.error) { toast.dismiss(aviso); throw new Error(`arquivos: ${rm.error.message}`); }
      }
      const del = await db.from("mkt_boards").delete().eq("id", board.id);
      toast.dismiss(aviso);
      if (del.error) throw new Error(del.error.message);
      toast.success(`Quadro "${board.title}" excluído.`);
      qc.invalidateQueries({ queryKey: ["mkt", "boards"] });
    } catch (err) {
      toast.error(`Não excluiu: ${(err as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button type="button" onClick={excluir} disabled={ocupado} title="Excluir quadro"
      className="absolute top-2 right-2 z-10 h-7 w-7 inline-flex items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive hover:bg-destructive/10 transition max-sm:opacity-100">
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
