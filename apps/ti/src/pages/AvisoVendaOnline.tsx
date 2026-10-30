import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Search, Loader2, Crown, AlertTriangle } from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useOrgLabels } from "@/hooks/useTeamMembers";

// ─────────────────────────────────────────────────────────────────────────────
// Quem recebe o aviso de venda ON-LINE (sininho, som, toast e celular).
//
// Pedido do dono do processo em 19/10/2026: com 500+ vendas por semana o aviso
// ia para o time inteiro, e isso deixou de fazer sentido. Agora só recebe quem
// alguém LIGA aqui. A marca "Head" é a AJUDA para escolher, nunca a regra —
// ser head não liga ninguém sozinho.
//
// ⚠️ A venda INTERNA ("🎉 Nova venda!", do /vender) não passa por aqui: ela
// continua indo para o time interno como antes.
// ⚠️ A lista e o interruptor são duas RPCs (`20261111`), que exigem a flag do
// Admin. A tabela não tem policy: ninguém lê quem recebe pelo PostgREST.
// ─────────────────────────────────────────────────────────────────────────────

interface Pessoa {
  id: string;
  nome: string | null;
  avatar_url: string | null;
  departamento: string | null;
  funcao: string | null;
  departamento_2: string | null;
  funcao_2: string | null;
  e_head: boolean;
  recebe: boolean;
  ligado_em: string | null;
  ligado_por_nome: string | null;
  desligado_em: string | null;
  desligado_por_nome: string | null;
}

const CHAVE = ["aviso_venda_online"] as const;
type Ver = "recebem" | "heads" | "todos";

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

// `embutido`: a lista mora na aba "Vendas online" da tela Notificações, sem
// o próprio título.
export default function AvisoVendaOnline({ embutido = false }: { embutido?: boolean }) {
  const qc = useQueryClient();
  const { data: labels } = useOrgLabels();
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [verUrl, setVer] = useParamUrl("ver", "recebem");
  const ver: Ver = verUrl === "heads" || verUrl === "todos" ? verUrl : "recebem";

  const { data: pessoas = [], isLoading, error } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("carbo_aviso_venda_online_lista" as never);
      if (error) throw error;
      return (data ?? []) as unknown as Pessoa[];
    },
  });

  // Muda NO CLIQUE; errou no banco, desfaz e diz.
  const definir = useMutation({
    mutationFn: async ({ id, recebe }: { id: string; recebe: boolean }) => {
      const { error } = await supabase.rpc("carbo_aviso_venda_online_definir" as never,
        { p_user: id, p_recebe: recebe } as never);
      if (error) throw error;
    },
    onMutate: async ({ id, recebe }) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<Pessoa[]>(CHAVE);
      qc.setQueryData<Pessoa[]>(CHAVE, (l) => l?.map((p) => (p.id === id ? { ...p, recebe } : p)));
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CHAVE, ctx.antes);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    },
    onSuccess: (_d, { recebe }) => {
      toast.success(recebe ? "Passa a receber a venda on-line." : "Deixa de receber a venda on-line.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });

  const deptName = (k?: string | null) => (k ? labels?.deptLabel[k] ?? k : null);
  const fnName = (d?: string | null, f?: string | null) => (f ? labels?.fnLabel[`${d}:${f}`] ?? f : null);
  const cargo = (p: Pessoa) =>
    [
      [fnName(p.departamento, p.funcao), deptName(p.departamento)].filter(Boolean).join(" · "),
      p.funcao_2 ? [fnName(p.departamento_2, p.funcao_2), deptName(p.departamento_2)].filter(Boolean).join(" · ") : null,
    ].filter(Boolean).join("  +  ");

  const contagem = useMemo(() => ({
    recebem: pessoas.filter((p) => p.recebe).length,
    heads: pessoas.filter((p) => p.e_head).length,
    todos: pessoas.length,
  }), [pessoas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) => {
      if (ver === "recebem" && !p.recebe) return false;
      if (ver === "heads" && !p.e_head) return false;
      return !q || (p.nome ?? "").toLowerCase().includes(q);
    });
  }, [pessoas, busca, ver]);

  const abas: { id: Ver; label: string }[] = [
    { id: "recebem", label: "Recebem" },
    { id: "heads", label: "Heads" },
    { id: "todos", label: "Todo o time" },
  ];

  return (
    <main className={embutido ? "space-y-6" : "mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6"}>
      {!embutido && (
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BellRing className="h-6 w-6 text-primary" /> Quem recebe a venda on-line
        </h1>
      )}

      {!isLoading && !error && contagem.recebem === 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <span>Ninguém está ligado: nenhum aviso de venda on-line é entregue.</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setVer(a.id)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                ver === a.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label} <span className="tabular-nums text-muted-foreground">{contagem[a.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      <section className="rounded-2xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          // ⚠️ Falha de consulta não vira "ninguém recebe": diz o erro do banco.
          <div className="px-6 py-10 text-center text-sm text-destructive">
            Não foi possível carregar a lista: {error instanceof Error ? error.message : String(error)}
          </div>
        ) : lista.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <BellRing className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">
              {ver === "recebem" && !busca ? "Ninguém recebe a venda on-line ainda" : "Ninguém encontrado"}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {lista.map((p) => {
              const quando = p.recebe
                ? p.ligado_em && `Ligado ${p.ligado_por_nome ? `por ${p.ligado_por_nome} ` : ""}em ${dataCurta(p.ligado_em)}`
                : p.desligado_em && `Desligado ${p.desligado_por_nome ? `por ${p.desligado_por_nome} ` : ""}em ${dataCurta(p.desligado_em)}`;
              return (
                <label key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-muted/30">
                  <ProfileAvatar userId={p.id} avatarUrl={p.avatar_url} fullName={p.nome} size={40} className="ring-1 ring-border" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="min-w-0 break-words">{p.nome ?? "—"}</span>
                      {p.e_head && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <Crown className="h-3 w-3" /> Head
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{cargo(p) || "—"}</p>
                    {quando && <p className="text-[11px] text-muted-foreground/80 truncate">{quando}</p>}
                  </div>
                  <Switch
                    checked={p.recebe}
                    disabled={definir.isPending && definir.variables?.id === p.id}
                    onCheckedChange={(v) => definir.mutate({ id: p.id, recebe: v })}
                    aria-label={`${p.nome ?? "Pessoa"} recebe a venda on-line`}
                  />
                </label>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
