// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-meta — a esteira fala pela API OFICIAL
//
// Lê `carbo_msg_fila` só onde `canal_envio = 'meta'` (as seis etapas da compra
// à entrega) e envia DIRETO para o Graph API. Recompra e carrinho continuam no
// `kanban-n8n`, pela Evolution.
//
// ── Por que direto, e não pelo n8n ───────────────────────────────────────────
//
// O ganho inteiro da API oficial é o `wamid` e o webhook que reporta
// sent → delivered → read → failed. Passando pelo n8n, o wamid fica lá e
// "enviado" continua significando "o POST foi aceito" — o mesmo sinal fraco do
// `pg_cron` marcando `succeeded` por ter postado, que já custou 25 h de
// sincronismo morto neste projeto.
//
// E separa os destinos de falha: n8n fora do ar deixa de parar a esteira.
//
// ── Divisão de trabalho ──────────────────────────────────────────────────────
//
//   banco            decide QUE houve movimentação (a PK (bling_id, etapa))
//   metaTemplate.ts  decide SE dá para montar a mensagem (regra pura, testada)
//   aqui             conversa com a Meta e registra o que aconteceu
//
// ── ⚠️ As travas ─────────────────────────────────────────────────────────────
//
// 1. A fila não entrega etapa `meta` sem `meta_status = 'APPROVED'`. Ligar o
//    `ativo` antes da aprovação produz NADA, em vez de uma rajada de 132001.
// 2. `ativo = false` em cada template: a chave geral continua sendo por etapa.
// 3. Variável obrigatória sem valor SEGURA o envio (linha `pendente`, que a
//    fila devolve na rodada seguinte). A Meta recusa parâmetro vazio, então a
//    alternativa não é "mandar torto" — é não mandar.
// 4. O registro é gravado ANTES da chamada. API que cai no meio deixa a linha
//    como erro e não volta para a fila: perder um aviso é ruim, mandar o mesmo
//    aviso duas vezes é pior.
// 5. TETO por rodada.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizarBR, montarPayload, ehTransitorio, detalheDoErro,
  type VarTemplate,
} from "../_shared/metaTemplate.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO  = Deno.env.get("CRON_SECRET") ?? "";
const TOKEN    = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
// ⚠️ O número NÃO é mais constante: desde 02/10/2026 o WABA tem TRÊS (serviço,
// CarboZé Clube/recompra e carrinho) e QUEM DECIDE É A ETAPA, pelo cadastro em
// `carbo_wa_numeros` — a `carbo_msg_fila` já traz o `numero_id` resolvido.
//
// Este valor fica só como RESERVA do modo de teste e de linha antiga sem
// número. Ele estava escrito em QUATRO edge functions com o mesmo literal:
// quatro cópias de um cadastro, que é exatamente o que a `carbo_wa_numeros`
// existe para acabar.
const PHONE_ID_SERVICO = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "1255756280958635";
const VERSAO   = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";

// Teto por rodada. O cron é de 1 minuto; 20 por rodada é muito acima do que a
// operação gera num dia e segura qualquer surpresa — mesmo teto do kanban-n8n.
const TETO = 20;
/**
 * ⚠️ Quantas linhas se LÊ da fila por rodada — separado do TETO de envios.
 *
 * Eram o mesmo número, e isso travou a recompra inteira no dia em que ela foi
 * ligada (05/10/2026): 28 avisos de `etiqueta` esperando um dado que ainda não
 * existia (linha `pendente`, que a fila devolve de propósito a cada rodada)
 * ocupavam as 20 vagas de TODA rodada, porque a esteira vem antes do comercial
 * na `prioridade`. A função lia os mesmos 20, segurava os 20, e as 321 ofertas
 * nunca chegavam à vez — com o cron marcando `succeeded` de minuto em minuto.
 *
 * Linha segurada não custa envio (não chama a Meta), então ela não pode gastar
 * vaga do teto. Lê-se fundo; o TETO conta só o que vai à Meta.
 *
 * ⚠️ 150, não "tudo": os telefones lidos vão numa consulta `.in(...)` que vira
 * URL, e 300 números já passam de 4 KB. 150 cobre com folga os travados de hoje
 * mais as 20 vagas — se um dia houver mais de 130 linhas seguradas ao mesmo
 * tempo, o defeito volta, e a resposta certa é olhar por que tanto está preso.
 */
const LEITURA = 150;
const PAUSA_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

interface LinhaFila {
  bling_id: number; etapa: string; titulo: string; atraso_min: number;
  telefone: string | null; nome: string | null;
  canal_envio: string; meta_template_nome: string | null;
  meta_idioma: string | null; meta_variaveis: VarTemplate[] | null;
  meta_botao_url_de: string | null; meta_status: string | null;
  [k: string]: unknown;
}

/** Uma chamada ao Graph, com repetição só no que é transitório. */
async function enviar(body: Record<string, unknown>, phoneId?: string | null) {
  // ⚠️ A reserva é o número de SERVIÇO, não um erro: linha de fila antiga pode
  // chegar sem `numero_id`, e recusar ali pararia o aviso de entrega por causa
  // de uma coluna nova. Quem FECHA sem número é o cadastro (`n.ativo` no WHERE
  // da view), que é onde a decisão cabe.
  const url = `https://graph.facebook.com/${VERSAO}/${phoneId || PHONE_ID_SERVICO}/messages`;
  let ultima: { status: number; json: any } = { status: 0, json: null };

  for (let tentativa = 0; tentativa <= 2; tentativa++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const corpo = await res.json().catch(() => ({}));
    ultima = { status: res.status, json: corpo };
    if (res.ok) return ultima;

    const codigo = corpo?.error?.code as number | undefined;
    if (ehTransitorio(res.status, codigo) && tentativa < 2) {
      // Espera crescente com ruído: duas mensagens que baterem no mesmo rate
      // limit não devem voltar juntas e bater de novo.
      await dormir(2 ** tentativa * 1000 + Math.random() * 500);
      continue;
    }
    return ultima;
  }
  return ultima;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  // FECHA quando o segredo não existe. Aqui vale dobrado: a forma errada
  // abriria uma função que manda WhatsApp para a base de clientes.
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({ error: "CRON_SECRET não está configurado neste projeto." }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  // Ensaio: monta o payload EXATO e devolve, sem enviar e sem gravar. É com ele
  // que se compara o que sai daqui com os exemplos aprovados na Meta.
  const ensaio = url.searchParams.get("ensaio") === "1";

  // ── Teste de fumaça ─────────────────────────────────────────────────────
  //
  // ⚠️ O ensaio para ANTES de falar com a Meta — de propósito, para não gastar
  // mensagem nem depender do token. O efeito colateral é que ele não prova o
  // token, e um token errado só apareceria no primeiro envio a um cliente.
  //
  // Este modo manda `hello_world` (o template que a Meta já entrega aprovado em
  // toda conta) para um número escolhido, sem tocar na fila nem no log. É a
  // única coisa aqui que envia sem passar pela `carbo_msg_fila`, e por isso é
  // limitada a ESSE template: mesmo com o segredo em mãos, o mais que se
  // consegue é um "Hello World".
  const teste = url.searchParams.get("teste");
  if (teste) {
    const numero = normalizarBR(teste);
    if (!numero) return json({ error: `número inválido: ${teste}` }, 400);
    if (!TOKEN) {
      return json({
        error: "Falta o secret WHATSAPP_ACCESS_TOKEN.",
        como_resolver: "Supabase > Edge Functions > Secrets > WHATSAPP_ACCESS_TOKEN.",
      }, 500);
    }
    // ⚠️ `&numero_id=` existe para PROVAR que um número novo fala ANTES de
    // ligar a etapa dele. Sem isso, a primeira mensagem pelo CarboZé Clube
    // seria uma oferta real para um cliente real — e descobrir ali que o
    // número não está registrado é descobrir tarde.
    const phoneTeste = url.searchParams.get("numero_id") || PHONE_ID_SERVICO;

    // ── `&etapa=` — a mensagem DE VERDADE, para UM número ────────────────
    //
    // Pedido do dono do processo em 02/10/2026: *"quero enviar a primeira
    // mensagem para meu número pessoal para a tela desbloquear aqui para eu
    // dar o treinamento ao time de atendimento"*.
    //
    // ⚠️ `hello_world` NÃO serve para isso: o time precisa ver o que o CLIENTE
    // vê, e precisa de uma conversa de verdade na caixa do Clube para treinar
    // a resposta com o link. Um teste que não parece com o real treina para o
    // que não vai acontecer.
    //
    // ⚠️ E ele passa pelo `montarPayload` REAL, não por um corpo montado à
    // mão: é assim que este modo também testa as variáveis nomeadas, o
    // `fallback` e o idioma. Teste que usa outro caminho que o da produção
    // prova o caminho errado.
    //
    // ⚠️ A TRAVA CONTINUA SENDO FORTE: só template que existe em
    // `carbo_msg_templates` E está `APPROVED`. Mesmo com o segredo em mãos, o
    // mais que se consegue é mandar uma mensagem NOSSA, já aprovada, para um
    // número por vez — nunca texto livre, nunca template arbitrário.
    const etapaTeste = url.searchParams.get("etapa");
    if (etapaTeste) {
      const { data: tpl } = await supabase.from("carbo_msg_templates")
        // ⚠️ `texto` ESTAVA FALTANDO AQUI, e o balão foi gravado VAZIO — "aviso
        // automático" sem uma linha de mensagem. Campo que a função passou a
        // LER tem de atravessar o `select`; é a mesma família do `map` do
        // `Vendas.tsx` que descartava `discount_amount`.
        .select("etapa, texto, meta_template_nome, meta_idioma, meta_variaveis, meta_status, meta_botao_url_de, numero_id")
        .eq("etapa", etapaTeste).maybeSingle();

      if (!tpl) return json({ error: `etapa desconhecida: ${etapaTeste}` }, 400);
      if (tpl.meta_status !== "APPROVED" || !tpl.meta_template_nome) {
        return json({
          error: `a etapa ${etapaTeste} não tem template aprovado na Meta`,
          meta_status: tpl.meta_status, meta_template_nome: tpl.meta_template_nome,
        }, 400);
      }

      // O nome de quem recebe vem do `&nome=`, porque não há pedido nenhum por
      // trás de um teste — e `primeiro_nome` é a variável do `recompra_lembrete`.
      const nomeTeste = url.searchParams.get("nome") || "Lucas Padilha";
      const linhaFalsa: Record<string, unknown> = {
        nome: nomeTeste,
        primeiro_nome: String(nomeTeste).trim().split(" ")[0],
      };
      // ⚠️ O CARRINHO pede três variáveis que não existem sem um checkout por
      // trás — e sem elas o teste seria recusado com "faltam variáveis", que
      // está certo para a fila e errado para treinar. Os exemplos são COERENTES
      // entre si (o kit, o preço e o link do MESMO kit a preço cheio), para o
      // clique levar ao que a mensagem diz. `&produtos=`, `&valor=` e `&link=`
      // trocam qualquer um. Valor de exemplo aqui é seguro: este modo nunca
      // grava em `carbo_msg_envios`, então não ocupa a vaga de carrinho nenhum.
      if (etapaTeste.startsWith("carrinho_")) {
        linhaFalsa.produtos = url.searchParams.get("produtos") || "CarboZé Kit 5 Frascos 100ml";
        linhaFalsa.valor = url.searchParams.get("valor") || "149";
        linhaFalsa.link_carrinho = url.searchParams.get("link") || "https://payt.site/gGCmnnL";
      }
      const m = montarPayload(
        numero, tpl.meta_template_nome, tpl.meta_idioma ?? "pt_BR",
        (tpl.meta_variaveis ?? []) as any, linhaFalsa, tpl.meta_botao_url_de,
      );
      // ⚠️ Variável obrigatória faltando SEGURA, e diz qual. É a mesma regra da
      // fila — a Meta recusa parâmetro vazio com 132000, e mandar assim seria
      // treinar o time com um erro.
      if (m.faltando.length) {
        return json({ error: "faltam variáveis", faltando: m.faltando }, 400);
      }
      // ⚠️ O número sai do CADASTRO da etapa, não do `&numero_id=`: a mensagem
      // de teste tem de chegar pelo MESMO número por onde a de verdade vai
      // chegar, senão o treinamento acontece numa caixa e a operação em outra.
      const rr = await enviar(m.body, tpl.numero_id || phoneTeste);
      const okk = rr.status >= 200 && rr.status < 300;
      const wamidTeste = rr.json?.messages?.[0]?.id ?? null;
      const waIdTeste  = rr.json?.contacts?.[0]?.wa_id ?? numero;

      // ── A mensagem enviada PRECISA aparecer na conversa ──────────────────
      //
      // ⚠️ Sem isto a tela mostrava a conversa com a RESPOSTA do cliente e sem
      // a oferta que a provocou — e treinar o time numa conversa a que falta o
      // que NÓS dissemos é treinar para ler pela metade. O dono do processo
      // apontou no primeiro teste: *"ao enviar já tem que gerar a conversa aqui
      // dos clientes, já com a mensagem que foi enviada que é o template"*.
      //
      // ⚠️ VAI PARA `carbo_wa_mensagens`, NUNCA para `carbo_msg_envios`. A PK
      // daquela é `(bling_id, etapa)` — "uma mensagem por etapa por pedido,
      // PARA SEMPRE" —, então um teste precisaria inventar um `bling_id`, e o
      // inventado BLOQUEARIA o envio real daquele pedido mais tarde. Teste que
      // consome a vaga do que ele está testando é pior que teste nenhum.
      //
      // No envio de VERDADE o balão vem do outro ramo da `carbo_wa_conversas`
      // (`carbo_msg_envios`), que o laço da fila grava com wamid, wa_id e
      // `numero_id`. São duas origens para a mesma linha do tempo, e isso já
      // era assim antes desta mudança.
      if (okk && wamidTeste) {
        // O texto renderizado sai do MESMO `valores` que montou o envio — e
        // não de uma segunda substituição aqui, que divergiria no dia em que
        // alguém mudasse o formato de uma variável.
        let textoRenderizado = String(tpl.texto ?? "");
        for (const [chave, valor] of Object.entries(m.valores ?? {})) {
          textoRenderizado = textoRenderizado.split(`{{${chave}}}`).join(valor);
        }
        // ⚠️ TEXTO VAZIO NÃO VIRA BALÃO MUDO. `carbo_msg_templates.texto` é o
        // espelho de conferência do que a Meta aprovou; se ele estiver em
        // branco, gravar assim produz exatamente o defeito que isto conserta —
        // um balão sem mensagem, que se lê como "o sistema perdeu o conteúdo".
        // Melhor dizer o que falta.
        if (!textoRenderizado.trim()) {
          return json({
            ok: false, etapa: etapaTeste, wamid: wamidTeste,
            erro: "A mensagem FOI enviada ao cliente, mas `carbo_msg_templates.texto` está vazio para esta etapa — o balão ficaria sem conteúdo na tela.",
            como_resolver: "Preencha o `texto` da etapa com o corpo aprovado na Meta (ele é espelho de conferência, não é o que sai) e dispare de novo.",
          }, 500);
        }
        const { error: erroMsg } = await supabase.from("carbo_wa_mensagens").upsert({
          wamid: wamidTeste,
          wa_id: waIdTeste,
          numero_id: tpl.numero_id || phoneTeste,
          direcao: "saida",
          tipo: "template",
          texto: textoRenderizado,
          // ⚠️ `sobre_a_etapa` NÃO EXISTE em `carbo_wa_mensagens` — ela é
          // DERIVADA na `carbo_wa_conversas`, a partir de `carbo_msg_envios`
          // pelos `lateral`. Eu a escrevi aqui achando que era coluna, e o
          // `42703` não apareceria na tela: o insert falhava, o `console.error`
          // engolia, e o balão simplesmente não era gravado. Coluna suposta é
          // a mesma doença de perguntar à migração em vez de ao banco.
          //
          // Consequência aceita: no TESTE o rótulo fica "aviso automático", sem
          // o nome da etapa. No envio REAL o balão vem do outro ramo da view
          // (`carbo_msg_envios`, que TEM `etapa`) e sai "automático · recompra".
          ocorrido_em: new Date().toISOString(),
          payload: m.body,
        }, { onConflict: "wamid" });
        // ⚠️ Falha aqui NÃO é silenciosa: a mensagem foi para o cliente e a
        // tela ficaria sem ela, que é exatamente o defeito que isto conserta.
        // ⚠️ E a falha passa a APARECER na resposta, não só no console. Foi o
        // `console.error` que escondeu o `42703` acima: a chamada devolvia
        // `ok: true` e a conversa ficava sem o balão, com tudo parecendo certo.
        if (erroMsg) {
          return json({
            ok: false, etapa: etapaTeste, wamid: wamidTeste,
            erro: "A mensagem FOI enviada ao cliente, mas não consegui gravá-la na conversa.",
            detalhe: erroMsg.message,
          }, 500);
        }
      }

      return json({
        ok: okk, modo: "mensagem REAL para um número", etapa: etapaTeste,
        template: tpl.meta_template_nome, numero_id: tpl.numero_id,
        para: numero, status: rr.status,
        wamid: wamidTeste,
        wa_id: rr.json?.contacts?.[0]?.wa_id ?? null,
        erro: okk ? null : detalheDoErro(rr.json),
        // ⚠️ A conversa JÁ aparece (o balão do template foi gravado), mas o
        // CAMPO DE RESPOSTA só libera quando o cliente escrever: a janela de
        // 24 h da Meta abre com a mensagem DELE, não com a nossa. São duas
        // coisas diferentes, e confundi-las faz alguém achar que a tela quebrou.
        nota: okk
          ? "O balão do template já está na conversa. O campo de resposta só libera quando o cliente RESPONDER — a janela de 24 h abre com a mensagem dele, não com a nossa."
          : null,
      }, 200);
    }

    const r = await enviar({
      messaging_product: "whatsapp", recipient_type: "individual",
      to: numero, type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    }, phoneTeste);
    const ok = r.status >= 200 && r.status < 300;
    return json({
      ok, teste: numero, status: r.status,
      wamid: r.json?.messages?.[0]?.id ?? null,
      // O wa_id é a informação que interessa aqui: se ele voltar diferente do
      // que mandamos, é o 9º dígito, e é ELE que vale nos próximos envios.
      wa_id: r.json?.contacts?.[0]?.wa_id ?? null,
      ...(ok ? {} : { erro: detalheDoErro(r.json), codigo: r.json?.error?.code ?? null }),
    }, ok ? 200 : 502);
  }

  // ⚠️ A fila vem ANTES da checagem do token, de propósito. Sem nada a enviar,
  // não há configuração faltando: há nada a fazer. Ao contrário, isto devolveria
  // 500 a cada minuto por falta de um secret que ainda não é necessário — 1440
  // falhas por dia num lugar que ninguém abre.
  const { data: fila, error } = await supabase
    .from("carbo_msg_fila").select("*")
    .eq("canal_envio", "meta")
    .order("prioridade", { ascending: true })
    .limit(LEITURA);
  if (error) return json({ error: `fila: ${error.message}` }, 500);
  if (!fila?.length) return json({ ok: true, fila: 0, nota: "nada a avisar pela Meta" });

  if (!TOKEN) {
    return json({
      error: "Há mensagens na fila da Meta, mas falta o secret WHATSAPP_ACCESS_TOKEN.",
      fila: fila.length,
      como_resolver: "Supabase > Edge Functions > Secrets > WHATSAPP_ACCESS_TOKEN = token permanente do usuário do sistema.",
    }, 500);
  }

  const agora = Date.now();
  const resultados: unknown[] = [];
  let enviados = 0, falhas = 0, adiados = 0, semFone = 0, segurados = 0;
  // Quantas chegaram à Meta (ou chegariam, no ensaio). É ISTO que o TETO mede.
  let tentativas = 0;

  // ── O número que o WhatsApp usa, não o que está no cadastro ─────────────
  //
  // ⚠️ Medido no primeiro teste: mandamos 5584987346304 e a Meta respondeu
  // `wa_id: 558487346304` — o mesmo assinante, sem o 9. No Brasil o 9º dígito
  // varia por DDD e por idade do cadastro, e a Meta normalmente resolve — mas
  // quando não resolve o retorno é 131026 ("número não tem WhatsApp") para um
  // número que tem, e a mensagem se perde com cara de cadastro errado.
  //
  // Então: se já falamos com esta pessoa antes, usamos o número que a PLATAFORMA
  // confirmou. Uma consulta para a rodada inteira, não uma por mensagem.
  const numeros = (fila as LinhaFila[])
    .map((l) => normalizarBR(l.telefone)).filter((n): n is string => !!n);
  const conhecidos = new Map<string, string>();
  if (numeros.length) {
    const { data: antigos } = await supabase
      .from("carbo_msg_envios").select("telefone,wa_id")
      .in("telefone", numeros).not("wa_id", "is", null);
    for (const a of antigos ?? []) {
      if (a.telefone && a.wa_id) conhecidos.set(String(a.telefone), String(a.wa_id));
    }
  }

  // ── A oferta é para a PESSOA, não para o pedido ─────────────────────────
  //
  // ⚠️ A régua de recompra tem uma linha por PEDIDO entregue, e a fila herda
  // isso. Medido em 05/10/2026, ao ligar: 321 ofertas para 296 pessoas — 25
  // receberiam a MESMA mensagem duas vezes, provavelmente no mesmo minuto, o
  // que lê como robô desgovernado e queima o número do Clube.
  //
  // A trava mora aqui, no ENVIO, e não na view: é o único lugar que sabe o que
  // JÁ SAIU nesta rodada (as duas linhas da mesma pessoa podem vir no mesmo
  // lote) e o que saiu em rodadas anteriores. A segunda vira `ignorado` com o
  // motivo escrito — fica auditável e o card dela anda para "Ofertado", que é
  // verdade: a pessoa foi ofertada, pelo outro pedido.
  //
  // ⚠️ Guarda o PEDIDO de cada oferta, não só o telefone, por causa do
  // `pendente`: oferta que a Meta devolveu com instabilidade volta à fila e é
  // tentada de novo. Ela tem de BLOQUEAR o outro pedido da mesma pessoa (senão
  // sai a do outro agora e a pendente depois — duas), e não pode bloquear a si
  // mesma (senão a nova tentativa vira "mesma pessoa" e nunca sai).
  const ofertadosRecompra = new Map<string, Set<number>>();
  const marcarOfertado = (fone: string, bling: number) => {
    const s = ofertadosRecompra.get(fone) ?? new Set<number>();
    s.add(bling);
    ofertadosRecompra.set(fone, s);
  };
  if (numeros.length && (fila as LinhaFila[]).some((l) => l.etapa === "recompra")) {
    const { data: jaRecompra } = await supabase
      .from("carbo_msg_envios").select("telefone, bling_id")
      .eq("etapa", "recompra").in("telefone", numeros)
      .in("status", ["enviado", "entregue", "lido", "erro", "pendente"]);
    for (const r of jaRecompra ?? []) {
      if (r.telefone) marcarOfertado(String(r.telefone), Number(r.bling_id));
    }
  }
  const outroPedidoJaOfertado = (fone: string, bling: number) =>
    [...(ofertadosRecompra.get(fone) ?? [])].some((b) => b !== bling);

  for (const l of fila as LinhaFila[]) {
    if (tentativas >= TETO) break;
    const normalizado = normalizarBR(l.telefone);
    const numero = normalizado ? (conhecidos.get(normalizado) ?? normalizado) : null;

    if (!numero) {
      semFone++;
      if (!ensaio) {
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "ignorado", canal: "meta",
          numero_id: (l as any).numero_id ?? null,
          motivo: `telefone inválido: ${l.telefone ?? "vazio"}`,
          telefone: l.telefone, enviado_em: new Date().toISOString(),
        });
      } else {
        resultados.push({ bling_id: l.bling_id, etapa: l.etapa,
                          decisao: "ignoraria — telefone inválido", telefone: l.telefone });
      }
      continue;
    }

    const montado = montarPayload(
      numero,
      String(l.meta_template_nome ?? ""),
      String(l.meta_idioma ?? "pt_BR"),
      (l.meta_variaveis ?? []) as VarTemplate[],
      l as unknown as Record<string, unknown>,
      l.meta_botao_url_de,
    );

    // ── Falta variável obrigatória: SEGURA, não manda torto ─────────────────
    //
    // ⚠️ `pendente` de propósito. A fila devolve a linha `pendente` na rodada
    // seguinte — é o mesmo mecanismo que faz o `atraso_min` funcionar. Gravar
    // 'erro' aqui tiraria o pedido da fila para sempre por causa de um dado que
    // chega dez minutos depois.
    if (!montado.body) {
      segurados++;
      if (!ensaio) {
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "pendente", canal: "meta",
          numero_id: (l as any).numero_id ?? null,
          motivo: `esperando: ${montado.faltando.join(", ")}`,
          telefone: normalizado,
        });
      }
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa,
                        decisao: "esperaria", faltando: montado.faltando });
      continue;
    }

    // ── O atraso do template (pós-entrega são 180 min) ──────────────────────
    if (l.atraso_min > 0 && !ensaio) {
      const { data: ja } = await supabase.from("carbo_msg_envios")
        .select("detectado_em").eq("bling_id", l.bling_id).eq("etapa", l.etapa).maybeSingle();
      if (!ja) {
        adiados++;
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "pendente", canal: "meta",
          numero_id: (l as any).numero_id ?? null,
          motivo: `aguardando ${l.atraso_min} min do template`, telefone: normalizado,
        });
        continue;
      }
      if (agora < new Date(ja.detectado_em).getTime() + l.atraso_min * 60_000) {
        adiados++; continue;
      }
    }

    if (l.etapa === "recompra" && normalizado
        && outroPedidoJaOfertado(normalizado, Number(l.bling_id))) {
      if (!ensaio) {
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "ignorado", canal: "meta",
          numero_id: (l as any).numero_id ?? null,
          motivo: "mesma pessoa já recebeu a oferta de recompra por outro pedido",
          telefone: normalizado, enviado_em: new Date().toISOString(),
        });
      }
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa,
                        decisao: "ignorada — a pessoa já recebeu a oferta" });
      continue;
    }
    if (l.etapa === "recompra" && normalizado) marcarOfertado(normalizado, Number(l.bling_id));

    tentativas++;
    if (ensaio) {
      resultados.push({
        bling_id: l.bling_id, etapa: l.etapa, template: l.meta_template_nome,
        para: numero, valores: montado.valores, payload: montado.body,
      });
      continue;
    }

    // ── Grava a intenção ANTES de chamar ────────────────────────────────────
    await supabase.from("carbo_msg_envios").upsert({
      bling_id: l.bling_id, etapa: l.etapa, status: "erro", canal: "meta",
      numero_id: (l as any).numero_id ?? null,
      motivo: "envio iniciado", telefone: normalizado, payload: montado.body,
    });

    try {
      // ⚠️ O número vem da FILA, que o resolve pelo cadastro da etapa. Decidir
      // aqui seria a quinta cópia da mesma pergunta.
      const { status, json: resposta } = await enviar(
        montado.body, (l as any).numero_id as string | null,
      );
      const ok = status >= 200 && status < 300;
      const wamid = resposta?.messages?.[0]?.id ?? null;
      // ⚠️ O `wa_id` é o número REAL na base do WhatsApp, e pode ser diferente
      // do que mandamos: no Brasil o 9º dígito varia por DDD e por idade do
      // cadastro. Guardar só o que enviamos é guardar o endereço que digitamos
      // em vez do que o carteiro usou.
      const waId = resposta?.contacts?.[0]?.wa_id ?? null;
      const codigo = resposta?.error?.code ?? null;
      // ⚠️ Temporário que sobreviveu às novas tentativas DENTRO da chamada
      // não é definitivo. `falhou` tira a linha da fila para sempre; `pendente`
      // a devolve na próxima rodada. Sem isto, um minuto ruim da Meta virava
      // "esta pessoa nunca recebe" (15 ofertas da recompra, 05/10/2026).
      const temporario = !ok && ehTransitorio(status, codigo);

      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, canal: "meta",
        // ⚠️ POR QUAL NÚMERO saiu. Sem isto a `carbo_wa_conversas` não consegue
        // pôr a mensagem na caixa certa — e a resposta do cliente cairia na
        // conversa do outro número.
        numero_id: (l as any).numero_id ?? null,
        // `falhou` e não `erro`: a Meta respondeu, e o que ela disse está no
        // código. `erro` fica para o que nem chegou lá.
        status: ok ? "enviado" : temporario ? "pendente" : "falhou",
        motivo: ok ? null
          : temporario ? `meta ${codigo ?? status} — instabilidade da Meta, tenta de novo na próxima rodada`
          : `meta ${codigo ?? status}`,
        telefone: normalizado, wamid, wa_id: waId,
        erro_codigo: ok ? null : codigo,
        erro_detalhe: ok ? null : detalheDoErro(resposta),
        payload: montado.body, resposta,
        enviado_em: new Date().toISOString(),
      });

      if (ok) enviados++; else falhas++;
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa, status, wamid,
                        ...(ok ? {} : { erro: detalheDoErro(resposta) }) });
    } catch (e) {
      falhas++;
      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, status: "erro", canal: "meta",
        numero_id: (l as any).numero_id ?? null,
        motivo: String((e as Error)?.message ?? e).slice(0, 300),
        telefone: normalizado, payload: montado.body,
        enviado_em: new Date().toISOString(),
      });
    }

    await dormir(PAUSA_MS);
  }

  const resumo = {
    ok: true, ensaio, fila: fila.length,
    enviados, falhas, adiados, segurados, sem_telefone: semFone,
    ...(ensaio ? { faria: resultados } : { resultados }),
  };
  console.log("[whatsapp-meta]", JSON.stringify({ ...resumo, faria: undefined }));
  return json(resumo);
});
