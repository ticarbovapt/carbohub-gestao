import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, WifiOff, Wrench, X, Activity } from "lucide-react";

/**
 * Tarja de status — a faixa no topo que avisa que o sistema está instável.
 *
 * Pedido do dono do processo em 28/09/2026, depois de uma queda em que os apps
 * ficaram girando sem explicação: *"ja sobe a tarja vermelha em cima em todos
 * os apps falando que há instabilidade … evitava das pessoas virem perguntar,
 * abrir ticket"*.
 *
 * ── SÃO DUAS TARJAS, e a separação é a decisão central ────────────────────
 *
 * ```
 * Supabase fora        → tarja AUTOMÁTICA   mede sozinha, não lê nada
 * resto (Bling fora,   → tarja DECLARADA    carbo_status_aviso, escrita no TI
 *   manutenção, lentidão)
 * ```
 *
 * ⚠️ O aviso declarado mora no próprio Supabase — é o único lugar que a tela
 * do TI escreve e os sete apps leem. Logo ele **não aparece quando o Supabase
 * está fora**, que é justamente a queda mais provável. É por isso que a
 * detecção automática existe, e por isso ela não pergunta nada a ninguém.
 * Aviso que depende do que ele anuncia é aviso que falha calado — a mesma
 * lição do `BloqueioAoVivo`, onde o sinal do Realtime NÃO substitui a trava.
 *
 * ── Quatro coisas que parecem detalhe e não são ───────────────────────────
 *
 * 1. ⚠️ **"A minha internet caiu" e "o sistema caiu" têm a MESMA cara**, e
 *    acusar o sistema no primeiro caso é pior que não avisar nada: manda gente
 *    abrir ticket contra um sistema que está de pé. Por isso, quando a sonda
 *    do Supabase falha, uma SEGUNDA sonda bate no endereço do PRÓPRIO app
 *    (a Vercel, outro provedor). As duas falhando = é a rede de quem olha, e
 *    a tarja diz isso, em cinza. Só a do Supabase falhando = é o sistema.
 *
 * 2. ⚠️ **Duas falhas seguidas para acender, UMA resposta para apagar.** Um
 *    pico de rede de 3 s não pode pintar sete apps de vermelho; e, passado o
 *    problema, a tarja tem de sumir na primeira boa notícia. Errar para "some
 *    cedo demais" é barato, errar para "fica vermelho sem motivo" ensina o
 *    time a ignorar a tarja — a doença do sininho com 70 itens não lidos.
 *
 * 3. ⚠️ **A tarja SOBREPÕE, não empurra o layout.** Empurrar exigiria mexer no
 *    cabeçalho `sticky top-0` dos sete apps, que é justamente o tipo de
 *    alteração replicada que diverge em silêncio. Em troca ela é recolhível: o
 *    X a reduz a um chip, guardado por id do aviso em `sessionStorage` — aviso
 *    novo (ou aba nova) volta a aparecer inteiro.
 *
 * 4. ⚠️ **Realtime NÃO é o único caminho.** Ele acende sem espera, mas há
 *    também uma releitura periódica e outra na volta do foco: Realtime fora do
 *    ar não pode ser o motivo de o aviso não aparecer.
 */

export type StatusSeveridade = "info" | "instabilidade" | "queda" | "manutencao";

export interface StatusAviso {
  id: string;
  ativo: boolean;
  severidade: StatusSeveridade;
  titulo: string;
  mensagem: string | null;
  /** Vazio = todos os apps. */
  apps: string[] | null;
  inicio_em: string;
  previsao_fim: string | null;
}

/** O mínimo que a tarja usa do cliente — o app passa o dele, como no switcher. */
export interface SupabaseLite {
  from: (tabela: string) => any;
  channel: (nome: string) => any;
  removeChannel: (canal: any) => void;
}

export interface StatusTarjaProps {
  supabase: SupabaseLite;
  /**
   * Chave deste app no catálogo `HUB_APPS` (`ti`, `ops`, `crm`…). É o que a
   * lista `apps` do aviso filtra, e é o MESMO vocabulário que a tela do TI
   * usa para montar as caixinhas — uma lista só, sem cópia para divergir.
   *
   * ⚠️ Vem escrita em cada `main.tsx`, e não de `appKeyAtual()`, porque
   * aquela devolve `null` fora de produção: em dev a tarja ficaria muda.
   */
  app: string;
  /**
   * URL do projeto Supabase — a sonda automática bate aqui. Omitido, sai do
   * próprio cliente (`supabaseUrl`), que é o valor que o app já usa.
   */
  supabaseUrl?: string;
  /** Endereço da página pública de status (link "detalhes"). */
  statusUrl?: string;
}

const RELEITURA_MS = 60_000;
const SONDA_MS = 45_000;
const SONDA_TIMEOUT_MS = 8_000;
/** Acima disto, duas vezes seguidas, é lentidão — não queda. */
const LENTO_MS = 3_500;

type Automatico = null | "queda" | "lentidao" | "rede_local";

// ── a sonda ────────────────────────────────────────────────────────────────

async function alcanca(url: string, sinal: AbortSignal): Promise<number | null> {
  const t0 = Date.now();
  try {
    // ⚠️ `no-store` e cache-buster: resposta de cache provaria só que o
    // navegador guardou algo ontem, não que o servidor está de pé hoje.
    await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${t0}`, {
      method: "HEAD",
      cache: "no-store",
      signal: sinal,
    });
    // ⚠️ O STATUS não é olhado de propósito. A sonda do Supabase vai sem
    // `apikey` e volta 401 — o que se quer saber é se o servidor RESPONDE,
    // não se ele autoriza. Exigir 2xx acenderia a tarja com o sistema de pé.
    return Date.now() - t0;
  } catch {
    return null;
  }
}

// ── aparência ──────────────────────────────────────────────────────────────

interface Cara {
  fundo: string;
  Icone: typeof AlertTriangle;
}

const CARAS: Record<StatusSeveridade, Cara> = {
  queda: { fundo: "bg-red-600", Icone: AlertTriangle },
  instabilidade: { fundo: "bg-amber-500", Icone: Activity },
  manutencao: { fundo: "bg-slate-700", Icone: Wrench },
  info: { fundo: "bg-sky-600", Icone: Info },
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── componente ─────────────────────────────────────────────────────────────

export function StatusTarja({ supabase, app, supabaseUrl, statusUrl }: StatusTarjaProps) {
  const base = (supabaseUrl || (supabase as any)?.supabaseUrl || "").replace(/\/+$/, "");
  const [declarado, setDeclarado] = useState<StatusAviso | null>(null);
  const [automatico, setAutomatico] = useState<Automatico>(null);
  const [recolhido, setRecolhido] = useState(false);

  // `ref` e não estado: as sondas rodam dentro de timers e de listeners, que
  // não reagem a re-render — estado aqui daria closure velha, como no
  // `BloqueioAoVivo`.
  const falhas = useRef(0);
  const lentas = useRef(0);

  // ── aviso declarado ──────────────────────────────────────────────────────
  const ler = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("carbo_status_aviso")
        .select("id, ativo, severidade, titulo, mensagem, apps, inicio_em, previsao_fim")
        .eq("ativo", true)
        .order("inicio_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      const lista: StatusAviso[] = (data ?? []) as StatusAviso[];
      // Lista vazia = todos os apps (ver o comentário da coluna na migração).
      const meu = lista.find((a) => !a.apps?.length || a.apps.includes(app)) ?? null;
      setDeclarado(meu);
    } catch {
      // ⚠️ Falha de leitura NÃO apaga a tarja nem acende nada: quem responde
      // "o sistema está fora?" é a sonda, que não depende do banco. Inventar
      // um estado aqui seria a ausência disfarçada de resposta.
    }
  }, [supabase, app]);

  useEffect(() => {
    ler();
    const t = setInterval(ler, RELEITURA_MS);
    const naVolta = () => ler();
    window.addEventListener("focus", naVolta);
    document.addEventListener("visibilitychange", naVolta);

    let canal: any = null;
    try {
      canal = supabase
        .channel("carbo-status-aviso")
        .on("postgres_changes", { event: "*", schema: "public", table: "carbo_status_aviso" }, () => ler())
        .subscribe();
    } catch {
      // Realtime indisponível não pode tirar a tarja do ar — a releitura basta.
    }

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", naVolta);
      document.removeEventListener("visibilitychange", naVolta);
      if (canal) {
        try {
          supabase.removeChannel(canal);
        } catch {
          /* nada a fazer */
        }
      }
    };
  }, [ler, supabase]);

  // ── detecção automática ──────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;

    // ⚠️ Sem endereço não há sonda — e ela fica CALADA, nunca acende. Uma
    // tarja vermelha por falta de configuração é pior que tarja nenhuma.
    if (!base) return;

    async function sondar() {
      if (!vivo) return;

      // O navegador já sabe de um caso: sem rede nenhuma.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        falhas.current = 0;
        lentas.current = 0;
        setAutomatico("rede_local");
        return;
      }

      const ctrl = new AbortController();
      const corte = setTimeout(() => ctrl.abort(), SONDA_TIMEOUT_MS);
      const ms = await alcanca(`${base}/rest/v1/`, ctrl.signal);
      clearTimeout(corte);
      if (!vivo) return;

      if (ms === null) {
        // ⚠️ Antes de acusar o sistema, pergunte se é a rede de quem olha: a
        // segunda sonda bate no endereço DESTE app, que é outro provedor.
        const c2 = new AbortController();
        const corte2 = setTimeout(() => c2.abort(), SONDA_TIMEOUT_MS);
        const proprio = await alcanca(`${window.location.origin}/favicon.ico`, c2.signal);
        clearTimeout(corte2);
        if (!vivo) return;

        if (proprio === null) {
          falhas.current = 0;
          lentas.current = 0;
          setAutomatico("rede_local");
          return;
        }

        falhas.current += 1;
        lentas.current = 0;
        // Duas seguidas: um pico de rede não pinta sete apps de vermelho.
        if (falhas.current >= 2) setAutomatico("queda");
        return;
      }

      // Respondeu. Uma boa notícia já apaga — ver a decisão 2 no topo.
      falhas.current = 0;
      if (ms > LENTO_MS) {
        lentas.current += 1;
        if (lentas.current >= 2) setAutomatico("lentidao");
      } else {
        lentas.current = 0;
        setAutomatico(null);
      }
    }

    sondar();
    const t = setInterval(sondar, SONDA_MS);
    const naVolta = () => sondar();
    window.addEventListener("focus", naVolta);
    window.addEventListener("online", naVolta);
    window.addEventListener("offline", naVolta);

    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener("focus", naVolta);
      window.removeEventListener("online", naVolta);
      window.removeEventListener("offline", naVolta);
    };
  }, [base]);

  // ── o que mostrar ────────────────────────────────────────────────────────
  // ⚠️ O automático VENCE o declarado: "o sistema não responde agora" é mais
  // urgente que "haverá manutenção às 22h", e mostrar os dois empilhados
  // roubaria o topo da tela inteira.
  let severidade: StatusSeveridade | null = null;
  let titulo = "";
  let mensagem: string | null = null;
  let chave = "";

  if (automatico === "rede_local") {
    severidade = null; // tratado à parte (cinza, e não acusa o sistema)
    chave = "auto:rede_local";
  } else if (automatico === "queda") {
    severidade = "queda";
    titulo = "O sistema não está respondendo";
    mensagem = "Estamos sem conexão com o servidor. A equipe de TI já é avisada automaticamente — não é preciso abrir chamado.";
    chave = "auto:queda";
  } else if (automatico === "lentidao") {
    severidade = "instabilidade";
    titulo = "Sistema lento agora";
    mensagem = "As respostas do servidor estão demorando mais que o normal. Pode ser preciso esperar alguns segundos por tela.";
    chave = "auto:lentidao";
  } else if (declarado) {
    severidade = declarado.severidade;
    titulo = declarado.titulo;
    mensagem = declarado.mensagem;
    chave = `aviso:${declarado.id}`;
  }

  const temAlgo = automatico === "rede_local" || severidade !== null;

  // Recolhimento por aviso e por aba: aviso novo volta a aparecer inteiro.
  useEffect(() => {
    if (!chave) return;
    try {
      setRecolhido(sessionStorage.getItem(`carbo-status-recolhido`) === chave);
    } catch {
      setRecolhido(false);
    }
  }, [chave]);

  if (!temAlgo) return null;

  function recolher() {
    setRecolhido(true);
    try {
      sessionStorage.setItem("carbo-status-recolhido", chave);
    } catch {
      /* navegador sem storage: recolhe só nesta montagem */
    }
  }

  const rede = automatico === "rede_local";
  const cara = rede ? { fundo: "bg-slate-600", Icone: WifiOff } : CARAS[severidade!];
  const Icone = cara.Icone;

  if (recolhido) {
    return (
      <button
        type="button"
        onClick={() => {
          setRecolhido(false);
          try {
            sessionStorage.removeItem("carbo-status-recolhido");
          } catch {
            /* nada a fazer */
          }
        }}
        className={`fixed right-3 top-3 z-[9999] flex items-center gap-1.5 rounded-full ${cara.fundo} px-3 py-1.5 text-xs font-medium text-white shadow-lg`}
        title="Ver o aviso de status"
      >
        <Icone className="h-3.5 w-3.5" />
        {rede ? "Sem internet" : "Aviso do sistema"}
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[9999] ${cara.fundo} text-white shadow-md`}
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5 px-3 py-2 sm:px-4">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="font-semibold">
            {rede ? "Você está sem conexão com a internet" : titulo}
          </span>
          {(rede || mensagem) && (
            <span className="ml-1.5 opacity-90">
              {rede
                ? "O sistema pode estar funcionando normalmente — o que não responde é a sua rede."
                : mensagem}
            </span>
          )}
          {!rede && declarado && !automatico && declarado.previsao_fim && (
            <span className="ml-1.5 opacity-90">
              Previsão de normalização: {quando(declarado.previsao_fim)}.
            </span>
          )}
          {!rede && statusUrl && (
            <a
              href={statusUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 whitespace-nowrap underline underline-offset-2 opacity-90 hover:opacity-100"
            >
              detalhes
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={recolher}
          className="-mr-1 shrink-0 rounded p-1 opacity-80 transition hover:bg-white/15 hover:opacity-100"
          title="Recolher o aviso"
          aria-label="Recolher o aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
