import { useMemo, useState } from "react";
import {
  AlertTriangle, Activity, Wrench, Info, Megaphone, CheckCircle2, RotateCcw,
  Clock, ShieldCheck, Send, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { HUB_APPS, ADMIN_APP, type StatusSeveridade } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
 *
 * ⚠️ A PRÉ-VISUALIZAÇÃO não é enfeite. Quem publica não consegue ver a própria
 * tarja antes de ela chegar em sete apps ao mesmo tempo, e o texto sai errado
 * exatamente quando mais gente está olhando. Ela é montada com as MESMAS
 * classes do `StatusTarja` — mudou lá, mude aqui.
 */

interface SevOpcao {
  valor: StatusSeveridade;
  rotulo: string;
  ajuda: string;
  /** Classes do tile quando selecionado, no molde dos filtros do BugReports. */
  selecionado: string;
  /** Fundo da tarja — igual ao `StatusTarja`. */
  tarja: string;
  Icone: typeof Info;
  badge: "destructive" | "warning" | "secondary" | "info";
}

const SEVERIDADES: SevOpcao[] = [
  { valor: "queda", rotulo: "Fora do ar", ajuda: "Não dá para trabalhar",
    selecionado: "border-destructive bg-destructive/10 text-destructive",
    tarja: "bg-red-600", Icone: AlertTriangle, badge: "destructive" },
  { valor: "instabilidade", rotulo: "Instabilidade", ajuda: "Lento ou falhando às vezes",
    selecionado: "border-amber-500 bg-amber-500/10 text-amber-500",
    tarja: "bg-amber-500", Icone: Activity, badge: "warning" },
  { valor: "manutencao", rotulo: "Manutenção", ajuda: "Programada, com hora para acabar",
    selecionado: "border-slate-400 bg-slate-400/10 text-slate-600 dark:text-slate-300",
    tarja: "bg-slate-700", Icone: Wrench, badge: "secondary" },
  { valor: "info", rotulo: "Aviso", ajuda: "Informação, sem problema em curso",
    selecionado: "border-carbo-blue bg-carbo-blue/10 text-carbo-blue",
    tarja: "bg-sky-600", Icone: Info, badge: "info" },
];

const CATALOGO = [...HUB_APPS, ADMIN_APP];
const sev = (v: string) => SEVERIDADES.find((s) => s.valor === v) ?? SEVERIDADES[3];

const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** `YYYY-MM-DDTHH:MM` (o que o DateTimePicker emite) → ISO. Vazio vira null. */
function paraIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const nomeApp = (k: string) => CATALOGO.find((c) => c.key === k)?.name ?? k;
const listaApps = (apps: string[] | null) =>
  apps?.length ? apps.map(nomeApp).join(", ") : "todos os apps";

// ── blocos ─────────────────────────────────────────────────────────────────

/** O molde de card do app: h3 + ícone verde + hint, com slot de ação. */
function Bloco({
  icon: Icone, title, hint, action, children, className = "p-4",
}: {
  icon: typeof Info; title: string; hint?: string;
  action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <CarboCard>
      <CarboCardContent className={className}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Icone className="h-4 w-4 text-carbo-green shrink-0" /> {title}
            </h3>
            {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
          </div>
          {action}
        </div>
        {children}
      </CarboCardContent>
    </CarboCard>
  );
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
  // ⚠️ Quanto tempo a tarja VERDE fica depois do "Encerrar". É do TI, e não
  // uma constante no código: incidente de 5 min e de meio dia não pedem a
  // mesma permanência. 0 = some na hora do clique.
  const [verdeMin, setVerdeMin] = useState(30);
  const [verdeTexto, setVerdeTexto] = useState("");

  const ativos = useMemo(() => (avisos ?? []).filter((a) => a.ativo), [avisos]);
  const encerrados = useMemo(() => (avisos ?? []).filter((a) => !a.ativo), [avisos]);

  const s = sev(severidade);
  const podeEnviar = titulo.trim().length >= 3 && (todos || marcados.length > 0) && !criar.isPending;

  async function enviar() {
    if (!podeEnviar) return;
    try {
      await criar.mutateAsync({
        severidade,
        titulo: titulo.trim(),
        mensagem: mensagem.trim() || null,
        // ⚠️ Vazio = todos, e é o caso comum. Obrigar a marcar dez caixinhas
        // para o caso comum é como se esquece uma.
        apps: todos ? [] : marcados,
        previsao_fim: paraIso(previsao),
        normalizado_minutos: Math.max(0, Math.min(1440, Math.round(verdeMin) || 0)),
        normalizado_texto: verdeTexto.trim() || null,
      });
      toast.success("Tarja publicada", {
        description: `Já está no topo de ${todos ? "todos os apps" : listaApps(marcados)}.`,
      });
      setTitulo("");
      setMensagem("");
      setPrevisao("");
      setVerdeMin(30);
      setVerdeTexto("");
      setMarcados([]);
      setTodos(true);
    } catch (e) {
      toast.error("Não deu para publicar", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    }
  }

  function encerrar(a: StatusAvisoLinha) {
    alternar.mutate(
      { id: a.id, ativo: false },
      {
        onSuccess: () =>
          toast.success("Aviso encerrado", {
            description: (a.normalizado_minutos ?? 0) > 0
              ? `A tarja fica verde por mais ${a.normalizado_minutos} min.`
              : "A tarja saiu do ar agora.",
          }),
        onError: (e) => toast.error("Não deu para encerrar", { description: (e as Error).message }),
      },
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-5xl mx-auto">
        <CarboPageHeader
          title="Avisos de status"
          description="A tarja que aparece no topo de todos os apps do ecossistema"
          icon={Megaphone}
        />

        {error && (
          <CarboCard>
            <CarboCardContent className="p-4 flex items-start gap-2.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Não deu para ler os avisos: {(error as Error).message}</span>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* ── o que está no ar ─────────────────────────────────────────── */}
        <Bloco
          icon={ativos.length ? Activity : ShieldCheck}
          title={ativos.length ? `No ar agora (${ativos.length})` : "Nada no ar"}
          hint={
            ativos.length
              ? "Enquanto estiver aqui, a tarja aparece para todo mundo."
              : "Nenhuma tarja declarada. A detecção automática continua medindo sozinha."
          }
          className={ativos.length ? "p-4" : "p-4"}
        >
          {isLoading ? (
            <div className="h-16 rounded-xl bg-muted/40 animate-pulse" />
          ) : ativos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tudo tranquilo. Publique um aviso abaixo quando algo estiver fora do ar ou em manutenção.
            </p>
          ) : (
            <div className="space-y-2">
              {ativos.map((a) => (
                <LinhaAviso key={a.id} a={a}>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => encerrar(a)}
                    disabled={alternar.isPending}>
                    <CheckCircle2 className="h-3 w-3" /> Encerrar
                  </Button>
                </LinhaAviso>
              ))}
            </div>
          )}
        </Bloco>

        {/* ── publicar ─────────────────────────────────────────────────── */}
        <Bloco
          icon={Send}
          title="Publicar um aviso"
          hint="Ele entra no topo dos apps em segundos, para todo mundo que estiver com a tela aberta."
          className="p-4 space-y-4"
        >
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">O que está acontecendo</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {SEVERIDADES.map((o) => {
                  const on = severidade === o.valor;
                  return (
                    <button
                      key={o.valor}
                      type="button"
                      onClick={() => setSeveridade(o.valor)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        on ? o.selecionado : "border-input text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <o.Icone className="h-4 w-4 shrink-0" /> {o.rotulo}
                      </span>
                      <span className="mt-0.5 block text-[11px] opacity-80">{o.ajuda}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="st-titulo">Título</Label>
                <Input
                  id="st-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Emissão de nota fiscal indisponível"
                  maxLength={120}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Aparece em negrito na tarja.</p>
              </div>
              <div>
                <Label>Previsão de normalização</Label>
                <DateTimePicker
                  value={previsao}
                  onChange={setPrevisao}
                  placeholder="Sem previsão"
                  minHour={0}
                  maxHour={23}
                />
                {/* ⚠️ A tarja NÃO apaga sozinha nessa hora: manutenção que se
                    estende é quando o aviso mais importa. Quem apaga é o
                    "Encerrar", na seção de cima. */}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Opcional, e é só informação — a tarja não some sozinha nessa hora.
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="st-msg">Detalhe</Label>
              <Textarea
                id="st-msg"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={2}
                placeholder="Ex.: o Bling está fora do ar. Os pedidos continuam sendo registrados e serão faturados quando voltar."
                maxLength={400}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Opcional. Dizer o que ainda funciona evita metade das perguntas.
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Em quais apps</Label>
              <div className="flex flex-wrap gap-1.5">
                <Chip ativo={todos} onClick={() => { setTodos(true); setMarcados([]); }}>
                  Todos os apps
                </Chip>
                {CATALOGO.map((a) => (
                  <Chip
                    key={a.key}
                    ativo={!todos && marcados.includes(a.key)}
                    onClick={() => {
                      setTodos(false);
                      setMarcados((m) => (m.includes(a.key) ? m.filter((k) => k !== a.key) : [...m, a.key]));
                    }}
                  >
                    {a.name}
                  </Chip>
                ))}
              </div>
              {!todos && marcados.length === 0 && (
                <p className="mt-1.5 text-[11px] text-amber-500">Escolha ao menos um app, ou volte para "Todos".</p>
              )}
            </div>

            {/* ── quando encerrar ───────────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-carbo-green shrink-0" /> Quando você encerrar
              </h4>
              <p className="mt-0.5 mb-3 text-[11px] text-muted-foreground">
                A tarja não some na hora: ela fica <span className="text-emerald-500 font-medium">verde</span>,
                dizendo que normalizou. Quem passou a manhã travado precisa ler isso — senão continua
                desconfiando e abre o chamado que a tarja existia para evitar.
              </p>
              <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
                <div>
                  <Label htmlFor="st-verde-min">Verde por (min)</Label>
                  <Input id="st-verde-min" type="number" min={0} max={1440}
                    value={verdeMin} onChange={(e) => setVerdeMin(Number(e.target.value))} />
                  <p className="mt-1 text-[11px] text-muted-foreground">0 = some no clique.</p>
                </div>
                <div>
                  <Label htmlFor="st-verde-txt">Texto do verde</Label>
                  <Input id="st-verde-txt" value={verdeTexto} onChange={(e) => setVerdeTexto(e.target.value)}
                    placeholder='Vazio usa: O problema "…" foi resolvido e o sistema voltou ao normal.'
                    maxLength={240} />
                </div>
              </div>
            </div>

            {/* ── pré-visualização ──────────────────────────────────────── */}
            <div>
              <Label className="mb-2 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Como vai aparecer
              </Label>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className={`${s.tarja} text-white`}>
                  <div className="flex items-start gap-2.5 px-3 py-2">
                    <s.Icone className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="font-semibold">{titulo.trim() || "Título do aviso"}</span>
                      {mensagem.trim() && <span className="ml-1.5 opacity-90">{mensagem.trim()}</span>}
                      {previsao && (
                        <span className="ml-1.5 opacity-90">
                          Previsão de normalização: {dt(paraIso(previsao))}.
                        </span>
                      )}
                      <span className="ml-2 underline underline-offset-2 opacity-90">detalhes</span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sem botão de fechar, de propósito: aviso que se esconde volta a virar pergunta no chat.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <p className="text-[11px] text-muted-foreground">
                {todos ? "Vai para todos os apps." : `Vai para: ${listaApps(marcados)}.`}
              </p>
              <Button onClick={enviar} disabled={!podeEnviar} className="gap-1.5">
                <Send className="h-4 w-4" />
                {criar.isPending ? "Publicando…" : "Publicar a tarja"}
              </Button>
            </div>
          </div>
        </Bloco>

        {/* ── histórico ────────────────────────────────────────────────── */}
        <Bloco
          icon={RotateCcw}
          title="Histórico"
          hint="Aviso encerrado não é apagado — ele é a prova de que o sistema esteve fora."
        >
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}
            </div>
          ) : encerrados.length === 0 ? (
            <CarboEmptyState
              icon={ShieldCheck}
              title="Nada encerrado ainda"
              description="Quando você encerrar um aviso, ele fica guardado aqui com a hora de início e de fim."
            />
          ) : (
            <div className="space-y-2">
              {encerrados.map((a) => (
                <LinhaAviso key={a.id} a={a}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                    onClick={() => alternar.mutate({ id: a.id, ativo: true })}
                    disabled={alternar.isPending}>
                    <RotateCcw className="h-3 w-3" /> Reabrir
                  </Button>
                </LinhaAviso>
              ))}
            </div>
          )}
        </Bloco>
      </div>
    </div>
  );
}

// ── pedaços ────────────────────────────────────────────────────────────────

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        ativo ? "border-carbo-green bg-carbo-green/10 text-carbo-green" : "border-input text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function LinhaAviso({ a, children }: { a: StatusAvisoLinha; children: React.ReactNode }) {
  const o = sev(a.severidade);
  // ⚠️ `flex-wrap` + largura MÍNIMA no texto: no celular o botão de ação
  // espremia a coluna do meio a ~140px e a mensagem saía com duas palavras por
  // linha. Assim ele desce para a linha de baixo em vez de estrangular o
  // texto, que é a informação.
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card/50 p-3">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${o.tarja}`}>
        <o.Icone className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="min-w-[11rem] flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{a.titulo}</p>
          <CarboBadge variant={o.badge} size="sm">{o.rotulo}</CarboBadge>
        </div>
        {a.mensagem && <p className="text-xs text-muted-foreground mt-0.5">{a.mensagem}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {listaApps(a.apps)} · início {dt(a.inicio_em)}
          {a.previsao_fim ? ` · previsão ${dt(a.previsao_fim)}` : ""}
          {a.encerrado_em ? ` · encerrado ${dt(a.encerrado_em)}` : ""}
          {a.ativo && (a.normalizado_minutos ?? 0) > 0
            ? ` · ao encerrar, verde por ${a.normalizado_minutos} min`
            : ""}
        </p>
      </div>
      <div className="shrink-0 ml-auto">{children}</div>
    </div>
  );
}
