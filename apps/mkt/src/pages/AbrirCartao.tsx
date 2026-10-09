import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// /cartao/:cardId — o endereço que o SININHO usa. A notificação conhece o
// cartão, não o quadro; aqui se descobre o quadro e se abre o cartão nele.
// ⚠️ Existe porque o sininho mora nos oito apps e só sabe o id do cartão — um
// link montado com o quadro pararia de funcionar se o cartão mudasse de quadro.
export default function AbrirCartao() {
  const { cardId } = useParams();
  const [destino, setDestino] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (!cardId) return;
    (supabase as any).from("mkt_cards").select("board_id").eq("id", cardId).maybeSingle()
      .then((r: { data: { board_id: string } | null }) => {
        if (r.data?.board_id) setDestino(`/quadros/${r.data.board_id}?card=${cardId}`);
        else setErro(true);
      });
  }, [cardId]);
  if (destino) return <Navigate to={destino} replace />;
  if (erro) return (
    <div className="p-10 text-center text-sm text-muted-foreground">Este cartão não existe mais — pode ter sido excluído junto com o quadro.</div>
  );
  return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
