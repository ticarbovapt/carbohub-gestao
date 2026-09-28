import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, WifiOff, Wrench, Activity, CheckCircle2 } from "lucide-react";

/**
 * Tarja de status — a faixa que avisa que o sistema está instável.
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
 * ── Cinco coisas que parecem detalhe e não são ────────────────────────────
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
 * 3. ⚠️ **Ela fica ABAIXO do cabeçalho, em fluxo — não sobreposta.** A
 *    primeira versão era `fixed` no topo e cobria a TopBar dos sete apps; o
 *    dono do processo apontou no mesmo dia. Como o Layout de todos eles é
 *    `h-screen flex flex-col`, basta montá-la logo após o `<TopBar/>`: ela
 *    ocupa a própria altura e o corpo encolhe sozinho. **Nada de `fixed`,
 *    nada de `padding-top` no `body`** — empurrar por fora exigiria mexer no
 *    `sticky top-0` de cada cabeçalho, que é o tipo de alteração replicada
 *    que diverge em silêncio.
 *
 * 4. ⚠️ **NÃO dá para fechar**, e isso é decisão do dono do processo. Aviso de
 *    indisponibilidade que a pessoa esconde volta a produzir exatamente o que
 *    ele existe para evitar: a pergunta no chat e o ticket. Quem tira a tarja
 *    é o TI, encerrando o aviso — ou o próprio sistema, voltando a responder.
 *
 * 5. ⚠️ **Encerrar não apaga na hora: vira VERDE por um tempo.** "Sumiu a
 *    tarja" e "nunca houve tarja" são indistinguíveis para quem chega depois,
 *    e quem passou a manhã travado precisa ler que normalizou — senão
 *    continua desconfiando do sistema (e abrindo ticket). Quanto tempo o
 *    verde fica é do TI (`normalizado_minutos`), porque só ele sabe se o
 *    incidente foi de cinco minutos ou de meio dia.
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
  encerrado_em: string | null;
  /** Por quantos minutos, depois de encerrado, a tarja VERDE continua no ar. */
  normalizado_minutos: number | null;
  /** Texto do verde. Vazio usa o padrão. */
  normalizado_texto: string | null;
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
   * ⚠️ Vem escrita em cada Layout, e não de `appKeyAtual()`, porque aquela
   * devolve `null` fora de produção: em dev a tarja ficaria muda.
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

const CARAS: Record<StatusSeveridade, { fundo: string; Icone: typeof Info }> = {
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

/**
 * O aviso encerrado ainda está na janela do VERDE?
 *
 * ⚠️ A conta é feita AQUI, e não só na policy do banco, porque o TI enxerga o
 * histórico inteiro (duas policies de SELECT que somam). Sem esta conta, quem
 * é do TI veria a tarja verde de um incidente de semanas atrás.
 */
function noVerde(a: StatusAviso, agora: number): boolean {
  if (a.ativo || !a.encerrado_em) return false;
  const min = a.normalizado_minutos ?? 0;
  if (min <= 0) return false;
  const fim = new Date(a.encerrado_em).getTime() + min * 60_000;
  return Number.isFinite(fim) && agora < fim;
}

// ── componente ─────────────────────────────────────────────────────────────

export function StatusTarja({ supabase, app, supabaseUrl, statusUrl }: StatusTarjaProps) {
  const base = (supabaseUrl || (supabase as any)?.supabaseUrl || "").replace(/\/+$/, "");

  const [avisos, setAvisos] = useState<StatusAviso[]>([]);
  const [automatico, setAutomatico] = useState<Automatico>(null);
  // ⚠️ Relógio próprio: a janela do verde fecha com o TEMPO, sem nenhum evento
  // do banco para disparar um re-render. Sem isto a tarja verde ficaria no ar
  // até alguém dar F5 — e o prazo que o TI escolheu não valeria nada.
  const [agora, setAgora] = useState(() => Date.now());

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
        .select(
          "id, ativo, severidade, titulo, mensagem, apps, inicio_em, previsao_fim, encerrado_em, normalizado_minutos, normalizado_texto",
        )
        .order("inicio_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      setAvisos((data ?? []) as StatusAviso[]);
    } catch {
      // ⚠️ Falha de leitura NÃO apaga a tarja nem acende nada: quem responde
      // "o sistema está fora?" é a sonda, que não depende do banco. Inventar
      // um estado aqui seria a ausência disfarçada de resposta.
    }
  }, [supabase]);

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

  // O relógio do verde.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

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
  // Lista vazia de `apps` = todos (ver o comentário da coluna na migração).
  const meu = (a: StatusAviso) => !a.apps?.length || a.apps.includes(app);
  const declarado = avisos.find((a) => a.ativo && meu(a)) ?? null;
  // ⚠️ Só entra no verde se NÃO houver aviso ativo: incidente novo aberto
  // antes de o verde do anterior expirar não pode aparecer como "normalizado".
  const verde = declarado ? null : (avisos.find((a) => meu(a) && noVerde(a, agora)) ?? null);

  // ⚠️ O automático VENCE o declarado: "o sistema não responde agora" é mais
  // urgente que "haverá manutenção às 22h", e mostrar os dois empilhados
  // roubaria o topo da tela inteira. E vence o verde com ainda mais razão:
  // dizer "normalizou" enquanto nada responde seria mentir na cara de quem lê.
  let fundo = "";
  let Icone = Info;
  let titulo = "";
  let mensagem: string | null = null;
  let rodape: string | null = null;

  if (automatico === "rede_local") {
    fundo = "bg-slate-600";
    Icone = WifiOff;
    titulo = "Você está sem conexão com a internet";
    mensagem = "O sistema pode estar funcionando normalmente — o que não responde é a sua rede.";
  } else if (automatico === "queda") {
    fundo = CARAS.queda.fundo;
    Icone = CARAS.queda.Icone;
    titulo = "O sistema não está respondendo";
    mensagem = "Estamos sem conexão com o servidor. A equipe de TI já é avisada automaticamente — não é preciso abrir chamado.";
  } else if (automatico === "lentidao") {
    fundo = CARAS.instabilidade.fundo;
    Icone = CARAS.instabilidade.Icone;
    titulo = "Sistema lento agora";
    mensagem = "As respostas do servidor estão demorando mais que o normal. Pode ser preciso esperar alguns segundos por tela.";
  } else if (declarado) {
    const cara = CARAS[declarado.severidade] ?? CARAS.info;
    fundo = cara.fundo;
    Icone = cara.Icone;
    titulo = declarado.titulo;
    mensagem = declarado.mensagem;
    if (declarado.previsao_fim) rodape = `Previsão de normalização: ${quando(declarado.previsao_fim)}.`;
  } else if (verde) {
    fundo = "bg-emerald-600";
    Icone = CheckCircle2;
    titulo = "Tudo normalizado";
    mensagem =
      verde.normalizado_texto?.trim() ||
      `O problema "${verde.titulo}" foi resolvido e o sistema voltou ao normal.`;
    rodape = `Normalizado às ${quando(verde.encerrado_em)}.`;
  } else {
    return null;
  }

  return (
    <div role="status" aria-live="polite" className={`shrink-0 ${fundo} text-white`}>
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5 px-3 py-2 sm:px-4">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="font-semibold">{titulo}</span>
          {mensagem && <span className="ml-1.5 opacity-90">{mensagem}</span>}
          {rodape && <span className="ml-1.5 opacity-90">{rodape}</span>}
          {statusUrl && automatico !== "rede_local" && (
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
        {/* ⚠️ Sem botão de fechar, de propósito — ver a decisão 4 no topo. */}
      </div>
    </div>
  );
}
