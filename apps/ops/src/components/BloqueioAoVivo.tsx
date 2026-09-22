import { useEffect, useRef, useState } from "react";
import { ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { travarSaidaParaOHub, irParaOHubAgora } from "@/lib/sso";

/**
 * Derruba a pessoa NA HORA quando o acesso dela é bloqueado no Admin.
 *
 * ── Por que este componente existe ────────────────────────────────────────
 *
 * A trava é `auth.users.banned_until` (`20260999`) e ela é sólida — ninguém
 * ENTRA em app nenhum do ecossistema. O que ela não faz é **falar**: o GoTrue
 * só confere o banimento quando alguém bate na porta (login ou renovação de
 * token), e quem já está com a aba aberta não bate em porta nenhuma até o
 * access token expirar. Era essa a janela de até 1 h.
 *
 * `auth.users` não é publicada no Realtime, então o aviso sai de uma tabela
 * NOSSA: `carbo_usuario_bloqueio_log`, que a mesma função já escrevia no mesmo
 * instante do banimento (`20261000` a publicou e abriu a própria linha para
 * cada um). Uma tabela só para avisar seria uma segunda verdade sobre o mesmo
 * fato, e as duas divergiriam no dia em que uma falhasse.
 *
 * ⚠️ O SINAL NÃO SUBSTITUI A TRAVA. Realtime fora do ar ⇒ a aba cai na
 * renovação do token, como antes. O pior caso volta a ser o de ontem, nunca
 * "continua entrando" — aviso que falha ABERTO seria pior que aviso nenhum,
 * porque daria sensação de proteção.
 *
 * ── Três decisões que parecem detalhe e não são ───────────────────────────
 *
 * 1. ⚠️ **Monta ao lado do `<App />`, dentro do `AuthProvider`** (ver
 *    `main.tsx`), NUNCA dentro do `Layout` ou de uma rota. O `signOut` faz o
 *    app trocar para a tela de login; se este componente vivesse lá dentro,
 *    ele desmontaria junto e o aviso sumiria no mesmo instante em que aparece.
 *
 * 2. ⚠️ **Escuta `onAuthStateChange`, não o `useAuth()` do app.** Os sete apps
 *    têm `AuthContext` próprios e divergentes; amarrar a este arquivo um deles
 *    faria as sete cópias deixarem de ser idênticas. Assim ele não depende de
 *    nada além do cliente Supabase.
 *
 * 3. ⚠️ **A saída para o Hub é TRAVADA antes do `signOut`** (`travarSaidaParaOHub`
 *    em `lib/sso.ts`). Sem isso o aviso piscava e sumia: sem sessão, o
 *    `ProtectedRoute` manda a página inteira para o Hub e leva o aviso junto.
 *    A sessão, essa, morre na hora — é o que faz F5 e URL de outra tela
 *    caírem no login em vez de devolverem o sistema.
 *
 * 4. ⚠️ **Há uma rede de segurança na volta do foco.** Realtime não reentrega
 *    o que passou: aba dormindo, notebook fechado ou queda de rede perdem o
 *    evento PARA SEMPRE. Ao voltar o foco, o componente pergunta ao banco se a
 *    última linha da própria pessoa é `bloqueado`. Sem isso, "ao vivo"
 *    funcionaria só para quem estava olhando.
 */
export function BloqueioAoVivo() {
  const [bloqueado, setBloqueado] = useState(false);
  // `ref` e não estado: o `disparar` é chamado de dentro de callbacks do
  // Realtime, que não reagem a re-render. Estado aqui daria closure velha.
  const jaDisparou = useRef(false);

  function disparar() {
    if (jaDisparou.current) return;
    jaDisparou.current = true;

    // ⚠️ A ORDEM AQUI É A CORREÇÃO INTEIRA, e ela foi medida.
    //
    // Na primeira versão o aviso aparecia e SUMIA em seguida — *"apareceu a
    // mensagem e já redirecionou rapidão"*. O `signOut` deixa o app sem sessão,
    // o `ProtectedRoute` chama `goToHubLogin()` e a página inteira navega para
    // o Hub, levando junto o aviso. Nenhum truque de DOM resolveria:
    // `location.replace` destrói o documento.
    //
    // Travar ANTES do `signOut` é o que faz o aviso ficar até alguém ler. E a
    // trava não é só cosmética: ela não destrava, então o único caminho dali em
    // diante é o botão do próprio aviso.
    travarSaidaParaOHub();
    setBloqueado(true);

    // ⚠️ A sessão morre AGORA, não no clique do "Entendi". É isso que faz F5 e
    // URL de outra tela caírem no login em vez de devolverem o sistema — e
    // deixar a sessão viva "até clicar OK" daria exatamente a brecha que este
    // recurso existe para fechar.
    void supabase.auth.signOut();
  }

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let uidAtual: string | null = null;

    function desinscrever() {
      if (canal) { void supabase.removeChannel(canal); canal = null; }
      uidAtual = null;
    }

    function inscrever(uid: string) {
      if (uidAtual === uid) return;
      desinscrever();
      uidAtual = uid;
      canal = supabase
        .channel(`bloqueio:${uid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "carbo_usuario_bloqueio_log",
            // O filtro é do SERVIDOR. Sem ele, cada aba receberia o evento de
            // todo mundo e decidiria no cliente — que é o mesmo desenho que já
            // deu três toasts de venda depois de um F5.
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            // `desbloqueado` também chega aqui e NÃO pode derrubar ninguém —
            // seria o oposto exato do que a linha significa.
            if ((payload.new as { acao?: string })?.acao === "bloqueado") disparar();
          },
        )
        .subscribe();
    }

    async function conferirAgora() {
      if (jaDisparou.current) return;
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      inscrever(uid);
      // A rede de segurança: a ÚLTIMA linha decide. Ler só "existe algum
      // bloqueio?" derrubaria quem já foi desbloqueado, para sempre.
      const { data: ultima } = await (supabase as unknown as { from: (t: string) => any })
        .from("carbo_usuario_bloqueio_log")
        .select("acao")
        .eq("user_id", uid)
        .order("em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((ultima as { acao?: string } | null)?.acao === "bloqueado") disparar();
    }

    void conferirAgora();

    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      // ⚠️ Nada de chamar o Supabase DENTRO do callback: o cliente avisa que
      // isso trava. O `setTimeout(0)` tira a chamada da pilha do evento.
      if (evento === "SIGNED_OUT" || !sessao?.user) { desinscrever(); return; }
      setTimeout(() => void conferirAgora(), 0);
    });

    // Volta do foco e volta da aba — os dois, porque trocar de aba não dispara
    // `focus` em todo navegador, e minimizar não dispara `visibilitychange` em
    // todos os outros.
    const aoVoltar = () => { void conferirAgora(); };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
      desinscrever();
    };
  }, []);

  if (!bloqueado) return null;

  // ⚠️ Sem botão de fechar, e sem `onClick` no fundo. O único caminho é o
  // login. Um "X" aqui deixaria a pessoa de volta a uma tela que parece viva e
  // onde nada mais funciona — pior que a tela de login, porque não explica.
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-background p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
          <ShieldX className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Usuário bloqueado do sistema</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O seu acesso foi bloqueado e a sessão foi encerrada agora.
          Se você acha que isso é um engano, fale com o suporte.
        </p>
        {/* ⚠️ `irParaOHubAgora`, não `goToHubLogin`: a saída está TRAVADA desde
            o instante do bloqueio — é o que mantém este aviso na tela. Este
            botão é o único caminho que a atravessa, e é de propósito. */}
        <button
          type="button"
          onClick={() => irParaOHubAgora()}
          className="mt-5 w-full rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Entendi, ir para o login
        </button>
      </div>
    </div>
  );
}
