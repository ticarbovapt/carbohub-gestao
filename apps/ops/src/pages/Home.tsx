import { useNavigate } from "react-router-dom";
import {
  Factory, ArrowRight, AlertTriangle, MessageSquare, Package, Truck,
  Wrench, Loader2, CheckCircle2, Clock,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useConversations } from "@carbo/chat";
import { useOpsResumo, type BlocoEstado } from "@/hooks/useOpsResumo";
import { OPS_GROUPS } from "@/lib/opsNav";

// ─────────────────────────────────────────────────────────────────────────────
// Início do Carbo Ops — o que exige alguém hoje.
//
// Antes esta tela era um índice das próprias telas: o menu lateral já faz
// isso, e um índice não conta nada que quem abre o app não saiba. Agora ela
// responde "o que está me esperando" — fila de produção, estoque furado,
// remessa parada, OS do dia e conversa não lida.
//
// Financeiro NÃO entra: o domínio é do Carbo Finanças. Mostrar contas a
// pagar aqui criaria dois donos para o mesmo número.
//
// Regra que vale para TODOS os blocos: zero e falha de consulta não podem
// parecer a mesma coisa. Zero em "abaixo do mínimo" lê como estoque saudável;
// se foi erro, é mentira. Por isso cada bloco carrega o próprio estado.
// ─────────────────────────────────────────────────────────────────────────────

const fmtHora = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const msgErro = (e: unknown) =>
  e ? ((e as { message?: string })?.message ?? "Erro ao carregar") : null;

/** Bloco com estado próprio: carregando, erro, vazio ou conteúdo. */
function Bloco({
  titulo, icon: Icon, cor, estado, onClick, children, vazio,
}: {
  titulo: string;
  // `style` no tipo porque a cor do bloco vem de variável, não de classe
  // Tailwind — classe dinâmica não sobrevive ao purge do build.
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  cor: string;
  estado: BlocoEstado;
  onClick?: () => void;
  children: React.ReactNode;
  /** Mostrado quando carregou bem e não há nada pendente. */
  vazio?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4 min-w-0">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />
      <button onClick={onClick} disabled={!onClick}
        className="w-full flex items-center justify-between gap-2 mb-3 group disabled:cursor-default">
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0" style={{ color: cor }} />
          <span className="font-semibold text-sm truncate">{titulo}</span>
        </span>
        {onClick && <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>

      {estado.carregando ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando…
        </div>
      ) : estado.erro ? (
        // A falha aparece no lugar do número. Um bloco zerado por erro diria
        // "está tudo em ordem" justamente quando não dá para saber.
        <div className="flex items-start gap-1.5 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{estado.erro}</span>
        </div>
      ) : vazio ? (
        <div className="flex items-center gap-1.5 py-3 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-carbo-green" /> {vazio}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Num({ valor, label, alerta }: { valor: number | string; label: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xl font-bold tabular-nums leading-none ${alerta ? "text-amber-500" : ""}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-1 truncate" title={label}>{label}</p>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { producao, suprimentos, logistica, campo } = useOpsResumo();
  const { data: conversas = [], isLoading: chatLoading, error: chatErro } = useConversations();

  const naoLidas = conversas.filter((c) => c.unread > 0);
  const totalNaoLidas = naoLidas.reduce((n, c) => n + c.unread, 0);

  // Só o que exige ação hoje. Vazia, a faixa some — faixa de alerta
  // permanente vira decoração e para de ser lida.
  const urgencias = [
    suprimentos.zerados > 0 && {
      txt: `${suprimentos.zerados} ${suprimentos.zerados === 1 ? "produto zerado" : "produtos zerados"} em algum hub`,
      to: "/estoque",
    },
    producao.bloqueadas > 0 && {
      txt: `${producao.bloqueadas} ${producao.bloqueadas === 1 ? "OP bloqueada" : "OPs bloqueadas"}`,
      to: "/producao/ordens",
    },
    campo.atrasadas > 0 && { txt: `${campo.atrasadas} OS com data vencida`, to: "/campo/os" },
  ].filter(Boolean) as { txt: string; to: string }[];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Carbo Ops" description="O que está esperando por você hoje" icon={Factory} />

        {urgencias.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              {urgencias.map((u) => (
                <button key={u.txt} onClick={() => navigate(u.to)}
                  className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors">
                  {u.txt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* ── Chat ─────────────────────────────────────────────────── */}
          <Bloco
            titulo={totalNaoLidas > 0 ? `Carbo Chat · ${totalNaoLidas} não lidas` : "Carbo Chat"}
            icon={MessageSquare} cor="#3b82f6"
            estado={{ carregando: chatLoading, erro: msgErro(chatErro) }}
            onClick={() => navigate("/chat")}
            vazio={!chatLoading && !chatErro && conversas.length === 0 ? "nenhuma conversa" : undefined}
          >
            <div className="space-y-1.5">
              {/* Não lidas primeiro; sem nenhuma, as mais recentes — a home
                  serve para saber se perdi algo, não só o que está vermelho. */}
              {(naoLidas.length > 0 ? naoLidas : conversas).slice(0, 4).map((c) => (
                <button key={c.channel.id} onClick={() => navigate("/chat")}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors min-w-0">
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate">{c.title}</span>
                      {c.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-carbo-green px-1.5 text-[10px] font-bold text-black">
                          {c.unread}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.lastSenderName ? `${c.lastSenderName}: ` : ""}{c.lastBody ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtHora(c.lastAt)}</span>
                </button>
              ))}
            </div>
          </Bloco>

          {/* ── Produção ─────────────────────────────────────────────── */}
          <Bloco titulo="Produção" icon={Factory} cor="#22c55e" estado={producao}
            onClick={() => navigate("/producao/ordens")}
            vazio={producao.abertas === 0 ? "nenhuma OP em aberto" : undefined}>
            <div className="grid grid-cols-3 gap-2">
              <Num valor={producao.abertas} label="OPs em aberto" />
              <Num valor={producao.emChao} label="no chão de fábrica" />
              <Num valor={producao.esperando} label="esperando alguém" alerta={producao.esperando > 0} />
            </div>
            {producao.atrasadas > 0 && (
              <p className="mt-2.5 flex items-center gap-1 text-[11px] text-amber-500">
                <Clock className="h-3 w-3" /> {producao.atrasadas} com data de necessidade vencida
              </p>
            )}
          </Bloco>

          {/* ── Estoque ──────────────────────────────────────────────── */}
          <Bloco titulo="Estoque" icon={Package} cor="#f59e0b" estado={suprimentos}
            onClick={() => navigate("/estoque")}
            vazio={suprimentos.zerados + suprimentos.abaixo === 0 ? "tudo acima do mínimo" : undefined}>
            <div className="grid grid-cols-2 gap-2">
              <Num valor={suprimentos.zerados} label="zerados em algum hub" alerta={suprimentos.zerados > 0} />
              <Num valor={suprimentos.abaixo} label="abaixo do mínimo" alerta={suprimentos.abaixo > 0} />
            </div>
            {suprimentos.criticos.length > 0 && (
              <div className="mt-2.5 space-y-1">
                {/* Nome do produto, não só a contagem: "3 abaixo do mínimo" não
                    diz se dá para produzir hoje; "Aditivo X: 0 de 200" diz. */}
                {suprimentos.criticos.slice(0, 3).map((c) => (
                  <p key={c.nome + c.hub} className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                    <span className="truncate text-muted-foreground" title={c.nome}>{c.nome}</span>
                    <span className="shrink-0 tabular-nums text-amber-500">
                      {c.qtd} / {c.min} <span className="text-muted-foreground">({c.hub.toUpperCase()})</span>
                    </span>
                  </p>
                ))}
              </div>
            )}
          </Bloco>

          {/* ── Logística ────────────────────────────────────────────── */}
          <Bloco titulo="Logística" icon={Truck} cor="#06b6d4" estado={logistica}
            onClick={() => navigate("/logistica")}
            vazio={logistica.aSeparar + logistica.separando + logistica.prontas + logistica.emTransporte === 0
              ? "nenhuma remessa em aberto" : undefined}>
            <div className="grid grid-cols-4 gap-2">
              <Num valor={logistica.aSeparar} label="a separar" alerta={logistica.aSeparar > 0} />
              <Num valor={logistica.separando} label="separando" />
              <Num valor={logistica.prontas} label="prontas" />
              <Num valor={logistica.emTransporte} label="em trânsito" />
            </div>
          </Bloco>

          {/* ── Operação de campo ────────────────────────────────────── */}
          <Bloco titulo="Operação de campo" icon={Wrench} cor="#a78bfa" estado={campo}
            onClick={() => navigate("/campo/os")}
            vazio={campo.abertas === 0 ? "nenhuma OS em aberto" : undefined}>
            <div className="grid grid-cols-3 gap-2">
              <Num valor={campo.hoje} label="agendadas hoje" alerta={campo.hoje > 0} />
              <Num valor={campo.semana} label="próximos 7 dias" />
              <Num valor={campo.abertas} label="em aberto" />
            </div>
            {(campo.atrasadas > 0 || campo.semData > 0) && (
              <p className="mt-2.5 text-[11px] text-muted-foreground">
                {campo.atrasadas > 0 && <span className="text-amber-500">{campo.atrasadas} com data vencida</span>}
                {campo.atrasadas > 0 && campo.semData > 0 && " · "}
                {/* OS sem data não aparece em agenda nenhuma — some da vista
                    sem estar resolvida, que é o pior tipo de pendência. */}
                {campo.semData > 0 && `${campo.semData} sem data prevista`}
              </p>
            )}
          </Bloco>
        </div>

        {/* Atalhos no fim e recolhidos: o menu lateral já navega, e era o
            índice ocupando a tela inteira que fazia a home não dizer nada. */}
        <details className="rounded-2xl border border-border bg-board-surface/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            Todas as telas do Ops
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 px-4 pb-4">
            {OPS_GROUPS.flatMap((g) =>
              g.items.map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-w-0">
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              )),
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
