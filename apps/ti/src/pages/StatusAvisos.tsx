import { useMemo, useState } from "react";
import { AlertTriangle, Activity, Wrench, Info, Megaphone, CheckCircle2, RotateCcw } from "lucide-react";
import { HUB_APPS, ADMIN_APP, type StatusSeveridade } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStatusAvisos, useCriarAviso, useAlternarAviso, type StatusAvisoLinha } from "@/hooks/useStatusAvisos";

/**
 * Onde o TI DECLARA que há instabilidade ou manutenção.
 *
 * ⚠️ Esta tela não cobre a queda do Supabase, e isso é por construção: ela
 * escreve no Supabase, e os apps leem de lá. Quem cobre aquele caso é a
 * detecção automática da própria tarja (`packages/shell/src/StatusTarja.tsx`),
 * que mede as chamadas e acende sozinha, sem perguntar nada a ninguém.
 *
 * ⚠️ A lista de apps sai de `HUB_APPS`, e não de uma lista escrita aqui. Lista
 * própria seria a oitava cópia do catálogo — app novo entraria no ecossistema
 * e ficaria fora do aviso, calado.
 */

const SEVERIDADES: { valor: StatusSeveridade; rotulo: string; ajuda: string; cor: string; Icone: typeof Info }[] = [
  { valor: "queda", rotulo: "Fora do ar", ajuda: "Não dá para trabalhar", cor: "bg-red-600", Icone: AlertTriangle },
  { valor: "instabilidade", rotulo: "Instabilidade", ajuda: "Lento ou falhando às vezes", cor: "bg-amber-500", Icone: Activity },
  { valor: "manutencao", rotulo: "Manutenção", ajuda: "Programada, com hora para acabar", cor: "bg-slate-700", Icone: Wrench },
  { valor: "info", rotulo: "Aviso", ajuda: "Informação, sem problema em curso", cor: "bg-sky-600", Icone: Info },
];

const CATALOGO = [...HUB_APPS, ADMIN_APP];

const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** `datetime-local` → ISO. Vazio vira null: "sem previsão" é resposta. */
function paraIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function StatusAvisos() {
  const { data: avisos, isLoading, error } = useStatusAvisos();
  const criar = useCriarAviso();
  const alternar = useAlternarAviso();

  const [severidade, setSeveridade] = useState<StatusSeveridade>("instabilidade");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [todos, setTodos] = useState(true);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [previsao, setPrevisao] = useState("");

  const ativos = useMemo(() => (avisos ?? []).filter((a) => a.ativo), [avisos]);
  const encerrados = useMemo(() => (avisos ?? []).filter((a) => !a.ativo), [avisos]);

  const podeEnviar = titulo.trim().length >= 3 && (todos || marcados.length > 0) && !criar.isPending;

  async function enviar() {
    if (!podeEnviar) return;
    await criar.mutateAsync({
      severidade,
      titulo: titulo.trim(),
      mensagem: mensagem.trim() || null,
      // ⚠️ Vazio = todos, e é o caso comum. Obrigar a marcar dez caixinhas
      // para o caso comum é como se esquece uma.
      apps: todos ? [] : marcados,
      previsao_fim: paraIso(previsao),
    });
    setTitulo("");
    setMensagem("");
    setPrevisao("");
    setMarcados([]);
    setTodos(true);
  }

  return (
    <div className="space-y-6">
      <CarboPageHeader
        icon={Megaphone}
        title="Avisos de status"
        description="A tarja que aparece no topo de todos os apps do ecossistema"
      />

      <CarboCard>
        <CarboCardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">O que está acontecendo</Label>
            <div className="grid gap-2 sm:grid-cols-4">
              {SEVERIDADES.map((s) => {
                const ativo = severidade === s.valor;
                return (
                  <button
                    key={s.valor}
                    type="button"
                    onClick={() => setSeveridade(s.valor)}
                    className={`rounded-lg border p-3 text-left transition ${
                      ativo ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded ${s.cor}`}>
                        <s.Icone className="h-3.5 w-3.5 text-white" />
                      </span>
                      <span className="text-sm font-medium">{s.rotulo}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.ajuda}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-titulo">Título (aparece em negrito na tarja)</Label>
              <Input
                id="st-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Emissão de nota fiscal indisponível"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="st-previsao">Previsão de normalização (opcional)</Label>
              <Input id="st-previsao" type="datetime-local" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
              {/* ⚠️ A tarja NÃO apaga sozinha nessa hora: manutenção que se
                  estende é quando o aviso mais importa. Quem apaga é o botão
                  "Encerrar", abaixo. */}
              <p className="mt-1 text-xs text-muted-foreground">
                É só informação. A tarja não some sozinha nessa hora — ela some quando você encerrar.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="st-msg">Detalhe (opcional)</Label>
            <Textarea
              id="st-msg"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={2}
              placeholder="Ex.: o Bling está fora do ar. Os pedidos continuam sendo registrados e serão faturados quando voltar."
              maxLength={400}
            />
          </div>

          <div>
            <Label className="mb-2 block">Em quais apps</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTodos(true);
                  setMarcados([]);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  todos ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                }`}
              >
                Todos os apps
              </button>
              {CATALOGO.map((a) => {
                const on = !todos && marcados.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      setTodos(false);
                      setMarcados((m) => (m.includes(a.key) ? m.filter((k) => k !== a.key) : [...m, a.key]));
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          {criar.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Não deu para publicar: {(criar.error as Error).message}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={enviar} disabled={!podeEnviar}>
              {criar.isPending ? "Publicando…" : "Publicar a tarja"}
            </Button>
          </div>
        </CarboCardContent>
      </CarboCard>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não deu para ler os avisos: {(error as Error).message}
        </p>
      )}

      <Secao titulo="No ar agora" linhas={ativos} vazio="Nenhuma tarja no ar." carregando={isLoading}>
        {(a) => (
          <Button size="sm" variant="outline" onClick={() => alternar.mutate({ id: a.id, ativo: false })}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Encerrar
          </Button>
        )}
      </Secao>

      <Secao titulo="Histórico" linhas={encerrados} vazio="Nada encerrado ainda." carregando={isLoading}>
        {(a) => (
          <Button size="sm" variant="ghost" onClick={() => alternar.mutate({ id: a.id, ativo: true })}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reabrir
          </Button>
        )}
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  linhas,
  vazio,
  carregando,
  children,
}: {
  titulo: string;
  linhas: StatusAvisoLinha[];
  vazio: string;
  carregando: boolean;
  children: (a: StatusAvisoLinha) => React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{titulo}</h2>
      <CarboCard>
        <CarboCardContent className="p-0">
          {carregando ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{vazio}</p>
          ) : (
            <ul className="divide-y divide-border">
              {linhas.map((a) => {
                const s = SEVERIDADES.find((x) => x.valor === a.severidade) ?? SEVERIDADES[3];
                const nomes = (a.apps ?? []).length
                  ? (a.apps ?? []).map((k) => CATALOGO.find((c) => c.key === k)?.name ?? k).join(", ")
                  : "todos os apps";
                return (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${s.cor}`}>
                      <s.Icone className="h-3.5 w-3.5 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.titulo}</p>
                      {a.mensagem && <p className="text-sm text-muted-foreground">{a.mensagem}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.rotulo} · {nomes} · início {dt(a.inicio_em)}
                        {a.previsao_fim ? ` · previsão ${dt(a.previsao_fim)}` : ""}
                        {a.encerrado_em ? ` · encerrado ${dt(a.encerrado_em)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0">{children(a)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </CarboCardContent>
      </CarboCard>
    </section>
  );
}
