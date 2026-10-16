// ─────────────────────────────────────────────────────────────────────────────
// Pedido de acesso a curso do Carbo Academy — o aviso para o TI (16/10/2026).
//
// O banco (carbohub-produtos, `20261102120000`) grava em `public.notifications`
// uma linha `type = 'academy_acesso'` para cada pessoa com a flag `carbo_ti`,
// com `reference_id = '<user_id>:<curso_id>'` — a chave do pedido. Daqui saem:
//
//   sininho   clique abre a fila no app do TI   (`abrirFilaDoAcademy`)
//   toast     com Liberar / Negar               (`toastDoPedidoAcademy`)
//   celular   o push leva à MESMA fila           (`destino()` do carbo-push)
//
// ⚠️ UM arquivo para os oito apps, no molde do `StatusTarja`: o toast mora no
// `useLiveNotifications` de cada app (cópias), e se a regra estivesse lá seriam
// oito cópias de um botão que DECIDE acesso para divergir.
//
// ⚠️ Quem decide é o banco: `academy_decidir_acesso` recusa quem não tem a flag
// `carbo_ti`. O botão é conforto, não a trava — e por isso a recusa APARECE.
// ─────────────────────────────────────────────────────────────────────────────

export const ACADEMY_FILA_URL = "https://ti.carbohub.com.br/academy/acessos";

/** Cliente estrutural: os apps têm cópias próprias do supabase-js. */
interface ClienteComSchema {
  schema: (s: string) => { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
}

export function chaveDoPedido(referenceId: unknown): { userId: string; cursoId: string } | null {
  const [userId, cursoId] = String(referenceId ?? "").split(":");
  return userId && cursoId ? { userId, cursoId } : null;
}

/** O clique no sininho: a fila do TI — navegando, se já estiver nele. */
export function abrirFilaDoAcademy(navigate: (to: string) => void) {
  if (typeof window !== "undefined" && window.location.hostname.startsWith("ti.")) navigate("/academy/acessos");
  else window.location.href = ACADEMY_FILA_URL;
}

async function decidir(supabase: ClienteComSchema, referenceId: unknown, aprovar: boolean) {
  const chave = chaveDoPedido(referenceId);
  if (!chave) throw new Error("Pedido sem identificação — abra a fila do TI.");
  const { error } = await supabase.schema("produtos").rpc("academy_decidir_acesso", {
    p_user: chave.userId,
    p_curso: chave.cursoId,
    p_aprovar: aprovar,
    p_motivo: null,
  });
  if (error) throw new Error(error.message);
}

/**
 * As opções do toast — o app chama `toast(o.titulo, o.opcoes)` com o `sonner`
 * DELE (o pacote não depende do sonner, como não depende do supabase-js).
 *
 * ⚠️ Negar pelo toast vai SEM motivo; quem quer escrever o motivo nega pela
 * fila ("Abrir a fila" está no corpo do aviso, pelo sininho).
 * ⚠️ `depois` roda no sucesso E no erro: o gatilho do banco marca o aviso como
 * lido para todo o TI, e o sininho e o selo da fila precisam reler.
 */
export function toastDoPedidoAcademy(
  n: { title?: unknown; body?: unknown; reference_id?: unknown },
  ctx: {
    supabase: ClienteComSchema;
    ok: (msg: string) => void;
    erro: (msg: string) => void;
    depois?: () => void;
  },
) {
  const agir = (aprovar: boolean) => {
    decidir(ctx.supabase, n.reference_id, aprovar)
      .then(() => ctx.ok(aprovar ? "Acesso liberado" : "Acesso negado"))
      .catch((e: Error) => ctx.erro(`Não foi possível ${aprovar ? "liberar" : "negar"}: ${e.message}`))
      .finally(() => ctx.depois?.());
  };
  return {
    titulo: String(n.title ?? "🎓 Pedido de acesso ao Academy"),
    opcoes: {
      description: (n.body as string | null) ?? undefined,
      // Pedido espera decisão: 60 s e o X para fechar. Fechar não decide nada —
      // o aviso continua no sininho e o pedido, na fila.
      duration: 60_000,
      closeButton: true,
      action: { label: "Liberar", onClick: () => agir(true) },
      cancel: { label: "Negar", onClick: () => agir(false) },
      // ⚠️ Estilo INLINE: os oito apps montam o `Toaster` com opções
      // diferentes, e no padrão do sonner os dois botões saem BRANCOS e
      // iguais — "Negar" e "Liberar" lado a lado, um clique errado de
      // distância. Verde decide; contorno recusa.
      actionButtonStyle: { background: "#16a34a", color: "#fff", fontWeight: 600 },
      cancelButtonStyle: { background: "transparent", color: "inherit", border: "1px solid currentColor", opacity: 0.85 },
    },
  };
}
