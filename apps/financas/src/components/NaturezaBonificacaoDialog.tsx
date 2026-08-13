import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Gift, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Escolher a natureza de operação da bonificação.
//
// ⚠️ Existe porque o id da natureza não está em lugar óbvio no Bling — o
// caminho manual é abrir o cadastro e ler o número na URL. Pedir isso a quem
// emite nota é garantir que a configuração nunca seja feita, e sem ela a
// remessa de bonificação simplesmente não é criada.
//
// ⚠️ A lista vem do Bling, mas a ESCOLHA é de gente. Casar por nome ("a que
// contém bonificação") seria adivinhar qual natureza fiscal usar, e errar aqui
// emite nota errada sem nenhum aviso — a nota sai, e a conta aparece no fim do
// mês. Um clique consciente custa menos.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  functions: { invoke: (n: string, o?: any) => Promise<{ data: any; error: any }> };
};

interface Natureza {
  id: number;
  descricao: string;
  padrao?: boolean | null;
  situacao?: number | null;
}

export function NaturezaBonificacaoDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  // ⚠️ Natureza é cadastro de CADA conta: o id da matriz não existe na filial.
  // Configurar uma e supor a outra emitiria a remessa com natureza inválida —
  // ou, pior, com uma natureza que existe mas é outra coisa.
  const [conta, setConta] = useState<1 | 2>(1);
  const chave = conta === 1 ? "bling1_natureza_bonificacao_id" : "bling2_natureza_bonificacao_id";

  const { data: atual } = useQuery({
    queryKey: ["config-fiscal", "natureza-bonificacao", conta],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db.from("carbo_config_fiscal")
        .select("valor").eq("chave", chave).maybeSingle();
      if (error) throw error;
      return data?.valor ?? null;
    },
  });

  const { data: naturezas, isLoading, error } = useQuery({
    enabled: open,
    queryKey: ["bling", "naturezas", conta],
    // Cadastro fiscal muda raramente; buscar a cada abertura é chamada de API à toa.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Natureza[]> => {
      const { data, error } = await db.functions.invoke("bling-sync", {
        body: { entity: "naturezas", conta },
      });
      if (error) throw new Error("Não consegui falar com o Bling. Tente de novo.");
      if (data?.success === false) throw new Error(data.error || "Erro ao listar naturezas");
      return (data?.naturezas ?? []) as Natureza[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await db.from("carbo_config_fiscal")
        .update({ valor: String(id), updated_at: new Date().toISOString() })
        .eq("chave", chave);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-fiscal"] });
      toast.success("Natureza salva. Pedidos com bonificação já podem ser enviados.");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = (naturezas ?? []).filter((n) =>
    !busca.trim() || n.descricao.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-carbo-green" /> Natureza da bonificação
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Escolha a natureza que o Bling deve usar na nota de remessa de brinde —
          normalmente <strong>"Remessa em bonificação, doação ou brinde"</strong>.
          É ela que faz a nota sair sem imposto sobre o produto dado.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {([[1, "Matriz"], [2, "Filial SP"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setConta(v)}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                conta === v ? "border-carbo-green bg-carbo-green/10 font-medium" : "hover:bg-muted"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <Input placeholder="Filtrar..." value={busca} onChange={(e) => setBusca(e.target.value)}
          className="h-9" />

        <div className="max-h-[320px] overflow-y-auto border rounded-lg divide-y">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando no Bling...
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p>{(error as Error).message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se persistir, a conexão com o Bling pode ter expirado — reconecte em
                  Configurações e tente de novo.
                </p>
              </div>
            </div>
          ) : lista.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Nenhuma natureza encontrada.
            </p>
          ) : (
            lista.map((n) => {
              const escolhida = atual === String(n.id);
              return (
                <button key={n.id} type="button"
                  onClick={() => salvar.mutate(n.id)}
                  disabled={salvar.isPending}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                    escolhida ? "bg-carbo-green/10" : "hover:bg-muted"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{n.descricao}</p>
                    <p className="text-[11px] text-muted-foreground">ID {n.id}</p>
                  </div>
                  {escolhida && <Check className="h-4 w-4 text-carbo-green shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <span className="text-[11px] text-muted-foreground mr-auto">
            {atual ? `Configurada: ID ${atual}` : "Ainda não configurada"}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
