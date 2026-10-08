import { useMemo } from "react";
import { GraduationCap, Check, X, Search, Undo2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { confirmar, pedirTexto, useParamUrl } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useAcademyAcessos, useDecidirAcesso, origemDoPedido,
  type AcessoStatus, type PedidoAcesso,
} from "@/hooks/useAcademyAcessos";

/**
 * Carbo Academy — quem pode assistir a cada curso (08/10/2026).
 *
 * Pedido do dono do processo: a pessoa clica em "Solicitar acesso" no curso
 * e o TI libera aqui. Vale para TODO MUNDO (inclusive o time interno) e para
 * TODO curso — muita gente é de fora, e o material é interno do Grupo Carbo.
 *
 * ⚠️ A trava é o BANCO (`academy_vejo_curso` no `carbohub-produtos`): sem
 * aprovação, aula, vídeo e PDF são recusados lá. Esta tela só decide.
 *
 * ⚠️ Recusar quem estava APROVADO é revogar: a pessoa perde o acesso na hora
 * e vê o curso de novo com "Pedir de novo". Nada é apagado — progresso e
 * certificado ficam, e voltam a valer se o acesso for devolvido.
 */

const ABAS: { valor: AcessoStatus | "todos"; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "aprovado", rotulo: "Liberados" },
  { valor: "recusado", rotulo: "Recusados" },
  { valor: "todos", rotulo: "Todos" },
];

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export default function AcademyAcessos() {
  const { data: pedidos = [], isLoading, error } = useAcademyAcessos();
  const [aba, setAba] = useParamUrl("status", "pendente");
  const [busca, setBusca] = useParamUrl("q", "", { replace: true });

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: pedidos.length };
    for (const p of pedidos) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pedidos]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pedidos.filter((p) =>
      (aba === "todos" || p.status === aba) &&
      (!termo || [p.nome, p.email, p.curso_titulo, origemDoPedido(p)]
        .some((t) => (t ?? "").toLowerCase().includes(termo))),
    );
  }, [pedidos, aba, busca]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <CarboPageHeader
        title="Carbo Academy — acessos"
        description="Quem pediu para assistir a cada curso. Só depois da liberação as aulas, os vídeos e os PDFs abrem."
        icon={GraduationCap}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              type="button"
              onClick={() => setAba(a.valor === "pendente" ? null : a.valor)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors",
                aba === a.valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {a.rotulo}
              <span className={cn(
                "rounded-full px-1.5 text-xs",
                a.valor === "pendente" && (contagem.pendente ?? 0) > 0 ? "bg-primary text-primary-foreground" : "bg-background/60",
              )}>
                {contagem[a.valor] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value || null)}
            placeholder="Pessoa, e-mail ou curso"
            className="pl-9"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          Não foi possível ler os pedidos: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />)}</div>
      ) : lista.length === 0 ? (
        <CarboEmptyState
          icon={aba === "pendente" ? ShieldCheck : GraduationCap}
          title={aba === "pendente" ? "Nenhum pedido esperando" : "Nada por aqui"}
          description={aba === "pendente"
            ? "Quando alguém pedir acesso a um curso do Carbo Academy, o pedido aparece aqui."
            : busca ? "Nenhum pedido bate com a busca." : "Ainda não há pedidos nesta situação."}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {lista.map((p) => <Linha key={`${p.user_id}:${p.curso_id}`} p={p} />)}
        </div>
      )}
    </div>
  );
}

function Linha({ p }: { p: PedidoAcesso }) {
  const decidir = useDecidirAcesso();

  const aprovar = () =>
    decidir.mutate(
      { userId: p.user_id, cursoId: p.curso_id, aprovar: true },
      {
        onSuccess: () => toast.success(`${p.nome.split(" ")[0]} já pode assistir "${p.curso_titulo}"`),
        onError: (e) => toast.error("Não foi possível liberar", { description: (e as Error).message }),
      },
    );

  const recusar = async () => {
    const revogar = p.status === "aprovado";
    const motivo = await pedirTexto({
      titulo: revogar ? `Tirar o acesso de ${p.nome}?` : `Recusar o pedido de ${p.nome}?`,
      mensagem: revogar
        ? "A pessoa deixa de abrir as aulas na hora. O progresso e o certificado ficam guardados."
        : "A pessoa vê o motivo no curso e pode pedir de novo.",
      rotulo: "Motivo (aparece para a pessoa)",
      placeholder: "Opcional",
      confirmar: revogar ? "Tirar acesso" : "Recusar",
      perigo: true,
    });
    if (motivo === null) return;
    decidir.mutate(
      { userId: p.user_id, cursoId: p.curso_id, aprovar: false, motivo },
      {
        onSuccess: () => toast.success(revogar ? "Acesso retirado" : "Pedido recusado"),
        onError: (e) => toast.error("Não foi possível registrar", { description: (e as Error).message }),
      },
    );
  };

  const devolver = async () => {
    if (!(await confirmar({ titulo: `Liberar "${p.curso_titulo}" para ${p.nome}?`, confirmar: "Liberar" }))) return;
    aprovar();
  };

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (p.nome || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {origemDoPedido(p)}{p.email ? ` · ${p.email}` : ""}
          </p>
        </div>
      </div>

      <div className="min-w-0 sm:w-64">
        <p className="truncate text-sm font-medium">{p.curso_titulo}</p>
        <p className="text-xs text-muted-foreground">
          {p.status === "pendente"
            ? `Pediu em ${quando(p.pedido_em)}`
            : `${p.status === "aprovado" ? "Liberado" : "Recusado"} em ${quando(p.decidido_em)}${p.decidido_por ? ` por ${p.decidido_por}` : ""}`}
        </p>
        {p.status === "recusado" && p.motivo && (
          <p className="truncate text-xs text-muted-foreground" title={p.motivo}>Motivo: {p.motivo}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        {p.status === "pendente" && (
          <>
            <Button size="sm" onClick={aprovar} disabled={decidir.isPending}>
              <Check className="mr-1 h-4 w-4" /> Liberar
            </Button>
            <Button size="sm" variant="outline" onClick={recusar} disabled={decidir.isPending}>
              <X className="mr-1 h-4 w-4" /> Recusar
            </Button>
          </>
        )}
        {p.status === "aprovado" && (
          <Button size="sm" variant="outline" onClick={recusar} disabled={decidir.isPending}>
            <X className="mr-1 h-4 w-4" /> Tirar acesso
          </Button>
        )}
        {p.status === "recusado" && (
          <Button size="sm" variant="outline" onClick={devolver} disabled={decidir.isPending}>
            <Undo2 className="mr-1 h-4 w-4" /> Liberar
          </Button>
        )}
      </div>
    </div>
  );
}
