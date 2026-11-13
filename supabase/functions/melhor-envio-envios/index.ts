// ─────────────────────────────────────────────────────────────────────────────
// melhor-envio-envios — FASE 1: o espelho dos envios, sem passar pelo Bling
//
// O `rastreio-sync` monta a fila a partir de `bling2_esteira where rastreio is
// not null`: ele só rastreia envio cujo código o BLING já conhece. Etiqueta
// gerada no painel do Melhor Envio nasce fora do Bling e nunca entra na fila —
// o envio existe, está pago, às vezes já foi postado, e a esteira mostra
// "NF emitida".
//
// ⚠️ O dado já era baixado e jogado fora: o `mapearPedidosME()` do rastreio-sync
// lista `/api/v2/me/orders` toda rodada e descarta o que não casa com a esteira.
// Esta função lista a mesma coisa e GUARDA tudo, independente do Bling.
//
// ── O que ela NÃO faz ────────────────────────────────────────────────────────
//
//   não concilia   (Fase 2 — e a heurística vai SUGERIR, não decidir)
//   não escreve na Nuvemshop  (Fase 3)
//   não muda nada no Melhor Envio
//
// Só GET. Mesmo um bug aqui não compra nem cancela etiqueta — e o token deve
// ser criado com escopo de leitura apenas, que é a proteção que importa.
//
// ── ⚠️ Sobre os campos que eu NÃO conheço ───────────────────────────────────
//
// O `rastreio-sync` já provou em produção: `id`, `tracking`, `self_tracking`,
// `protocol`, `melhorenvio_tracking`, `invoice.key`, `service.name`,
// `service.company.name`, `service.company.tracking_link`, `delivery_max` e os
// carimbos (`generated_at`, `posted_at`, `delivered_at`, `canceled_at`,
// `expired_at`).
//
// O resto — destinatário, CPF, CEP, valor e o número do pedido da loja — eu
// NÃO confirmei contra a API. Por isso: toda extração tenta vários caminhos, o
// payload inteiro vai para `raw`, e existe `?ensaio=1`, que lê da produção e
// MOSTRA sem gravar. Rode o ensaio primeiro e confira a amostra: é assim que se
// descobre o nome real de um campo, em vez de deduzir e gravar nulo em silêncio.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMelhorEnvioToken, MELHOR_ENVIO_BASE, MELHOR_ENVIO_UA } from "../_shared/melhorEnvio.ts";
// ⚠️ A extração de campos mora num módulo PURO (sem Deno, sem fetch) porque é
// nela que estão os campos que eu não confirmei contra a API — e é ela que os
// testes cobrem. Dentro do Deno.serve, testá-la exigiria subir uma função.
import { paraLinha, data as dataME, txt } from "../_shared/melhorEnvioParse.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO = Deno.env.get("CRON_SECRET") ?? "";

const POR_PAGINA = 50;
const MAX_PAGINAS = 10;          // teto: 500 envios por rodada
// ⚠️ Pausa entre páginas. O Melhor Envio limita por minuto, e dez chamadas
// coladas é a receita para levar 429 justamente na rodada em que a operação
// está cheia. 350ms é o mesmo respiro que o `rastreio-sync` já usa.
const PAUSA_MS = 350;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── RECONFERÊNCIA: o envio que saiu da listagem continua andando ─────────────
//
// ⚠️ A listagem lê as 500 etiquetas MAIS RECENTES (10 × 50). Com ~100 envios
// por dia isso cobre 4–5 dias: etiqueta gerada há uma semana já não aparece
// nela, e o `posted_at`/`delivered_at` que chega DEPOIS nunca era gravado. A
// esteira lê esses carimbos daqui (`melhorenvio_envio_vigente`), então o card
// ficava em "Etiqueta" com o cliente já com o produto na mão — 667 em 13/11/2026.
//
// Aqui: todo envio ainda EM ABERTO no espelho (gerado, sem entrega, sem
// cancelamento, sem vencimento) que a listagem desta rodada não trouxe é
// reconsultado pelo `/shipment/tracking`, em lotes. Os mais antigos de conferir
// primeiro (`atualizado_em`), então a fila roda: com 300 por rodada de 15 min,
// mil envios abertos são vistos todos em ~1 h.
//
// ⚠️ Só PREENCHE carimbo, nunca apaga: resposta sem o campo não é "deixou de
// ser postado". Mesma regra do `coalesce(planilha, banco)`.
const RECONFERIR_MAX = 300;
const LOTE_TRACKING = 100;
const CARIMBOS = [
  ["postado_em", "posted_at"],
  ["entregue_em", "delivered_at"],
  ["cancelado_em", "canceled_at"],
  ["expirado_em", "expired_at"],
] as const;

async function reconferir(
  cabecalhos: Record<string, string>, base: string, vistos: Set<string>, ensaio: boolean,
) {
  const res = {
    em_aberto_lidos: 0, consultados: 0, mudaram: 0,
    postados: 0, entregues: 0, cancelados: 0, vencidos: 0,
    erro: null as string | null,
  };
  // Janela DECLARADA e ordenada (os mais antigos de conferir): não é lista
  // que se mostra como "tudo" — o resto vem nas rodadas seguintes.
  const { data, error } = await supabase
    .from("melhorenvio_envios")
    .select("me_id,status_me,postado_em,entregue_em,cancelado_em,expirado_em")
    .not("gerado_em", "is", null)
    .is("entregue_em", null).is("cancelado_em", null).is("expirado_em", null)
    .order("atualizado_em", { ascending: true }).order("me_id")
    .limit(RECONFERIR_MAX + vistos.size);
  if (error) { res.erro = `leitura: ${error.message}`; return res; }
  const alvos = (data ?? []).filter((r) => !vistos.has(String(r.me_id))).slice(0, RECONFERIR_MAX);
  res.em_aberto_lidos = alvos.length;

  const agora = new Date().toISOString();
  for (let i = 0; i < alvos.length; i += LOTE_TRACKING) {
    const lote = alvos.slice(i, i + LOTE_TRACKING);
    const r = await fetch(`${base}/api/v2/me/shipment/tracking`, {
      method: "POST", headers: cabecalhos,
      body: JSON.stringify({ orders: lote.map((l) => String(l.me_id)) }),
    });
    if (!r.ok) {
      // 429/5xx: para aqui e tenta na próxima rodada. Quem não foi consultado
      // não ganha `atualizado_em`, então continua no topo da fila.
      res.erro = `tracking HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`;
      break;
    }
    const bruto = (await r.json().catch(() => ({}))) as Record<string, any>;
    for (const atual of lote) {
      const d = bruto?.[String(atual.me_id)];
      if (!d) {
        // O ME não devolveu este id: anda a vez dele mesmo assim, senão o
        // mesmo envio mudo ocuparia o topo da fila para sempre.
        if (!ensaio) {
          await supabase.from("melhorenvio_envios")
            .update({ atualizado_em: agora }).eq("me_id", atual.me_id);
        }
        continue;
      }
      res.consultados++;
      const patch: Record<string, string | null> = {};
      for (const [coluna, campo] of CARIMBOS) {
        const novo = dataME(d?.[campo]);
        if (novo && !(atual as any)[coluna]) patch[coluna] = novo;
      }
      const status = txt(d?.status);
      if (status && status !== atual.status_me) patch.status_me = status;
      if (Object.keys(patch).length) {
        res.mudaram++;
        if (patch.postado_em) res.postados++;
        if (patch.entregue_em) res.entregues++;
        if (patch.cancelado_em) res.cancelados++;
        if (patch.expirado_em) res.vencidos++;
      }
      if (ensaio) continue;
      // `atualizado_em` anda SEMPRE: é ele que faz a fila girar. Sem isso os
      // mesmos 300 (os parados de verdade) voltariam toda rodada.
      const { error: e } = await supabase.from("melhorenvio_envios")
        .update({ ...patch, atualizado_em: agora }).eq("me_id", atual.me_id);
      if (e) { res.erro = `gravação: ${e.message}`; return res; }
    }
    await dormir(PAUSA_MS);
  }
  return res;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  // ⚠️ FECHA quando o segredo não existe. A forma errada (`if (SEGREDO && ...)`)
  // ABRE a função quando o secret some — e este projeto já perdeu o CRON_SECRET
  // uma vez. 500 para configuração ausente, 401 para segredo errado: juntar os
  // dois faz a falha nossa se disfarçar de chamada indevida.
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({
      error: "CRON_SECRET não está configurado neste projeto.",
      como_resolver: "Supabase > Edge Functions > Secrets: criar CRON_SECRET.",
    }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  const ensaio = url.searchParams.get("ensaio") === "1";
  const paginas = Math.min(Number(url.searchParams.get("paginas") ?? MAX_PAGINAS) || MAX_PAGINAS,
                           MAX_PAGINAS);

  const token = await getMelhorEnvioToken(supabase);
  if (!token) {
    return json({
      error: "Sem token do Melhor Envio.",
      como_resolver: "Rode a função melhor-envio-auth uma vez, ou defina MELHOR_ENVIO_TOKEN.",
    }, 500);
  }

  const base = MELHOR_ENVIO_BASE();
  const cabecalhos = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": MELHOR_ENVIO_UA,
  };

  const brutos: any[] = [];
  let erro: string | null = null;

  for (let p = 1; p <= paginas; p++) {
    const res = await fetch(`${base}/api/v2/me/orders?page=${p}&per_page=${POR_PAGINA}`,
                            { headers: cabecalhos });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      // 429 é rate limit e não é falha nossa: para de paginar, grava o que veio
      // e reporta. Perder a rodada inteira por causa da página 7 seria pior.
      erro = `orders HTTP ${res.status} (página ${p}): ${corpo.slice(0, 300)}`;
      break;
    }
    const j = await res.json();
    const lista = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    if (!lista.length) break;
    brutos.push(...lista);
    if (lista.length < POR_PAGINA) break;      // última página
    await dormir(PAUSA_MS);
  }

  // ⚠️ `(o) => paraLinha(o)`, NUNCA `.map(paraLinha)`.
  //
  // `Array.map` passa TRÊS argumentos (valor, índice, array). Passar a função
  // direto entrega o ÍNDICE no segundo parâmetro — que aqui é o `agora: Date`.
  // O primeiro elemento recebe `0`, e `agora.toISOString()` estoura.
  //
  // Custou um 500 genérico ("Internal Server Error", sem corpo): a promessa
  // rejeita fora do nosso try, então nem o JSON de erro sai. Parece função que
  // não subiu.
  const linhas = brutos.map((o) => paraLinha(o)).filter((l) => l.me_id !== "");

  const ativos = linhas.filter((l) => !l.cancelado_em && !l.expirado_em);
  const resumo = {
    ok: true,
    ensaio,
    ambiente: base.includes("sandbox") ? "sandbox" : "producao",
    encontrados: linhas.length,
    ativos: ativos.length,
    // ⚠️ Estes quatro são o objetivo da Fase 1: eles decidem quanto da Fase 2
    // é casamento automático e quanto é confirmação humana.
    com_pedido_loja: ativos.filter((l) => l.pedido_loja).length,
    // ⚠️ A porta EXATA: o id interno do Bling, vindo do link da tag. Quando ela
    // existe, não há casamento nem ambiguidade — é o mesmo id da esteira.
    com_bling_id:    ativos.filter((l) => l.bling_id_ref).length,
    com_nf:          ativos.filter((l) => l.nf_chave).length,
    com_cpf:         ativos.filter((l) => l.destinatario_doc).length,
    sem_porta_nenhuma: ativos.filter(
      (l) => !l.pedido_loja && !l.nf_chave && !l.destinatario_doc).length,
    com_codigo: ativos.filter((l) => l.tracking || l.self_tracking).length,
    ...(erro ? { aviso: erro } : {}),
  };

  const vistos = new Set(linhas.map((l) => l.me_id));

  if (ensaio) {
    return json({
      ...resumo,
      // O que a reconferência MUDARIA, sem gravar nada.
      reconferencia: await reconferir(cabecalhos, base, vistos, true),
      // Sem o `raw` nos primeiros, para a resposta ser legível...
      amostra: linhas.slice(0, 5).map(({ raw: _r, ...l }) => l),
      // ...mas UM payload inteiro, que é o que permite achar o nome real de um
      // campo que eu não adivinhei (o pedido da loja, principalmente).
      payload_completo_de_um: brutos[0] ?? null,
    });
  }

  if (erro && linhas.length === 0) return json({ ...resumo, ok: false }, 502);

  // ⚠️ Upsert por `me_id`. O mesmo envio volta em toda rodada enquanto estiver
  // na listagem, e é assim que `posted_at` e `delivered_at` chegam depois.
  //
  // `visto_em` fica FORA do payload de propósito: ele é o "quando vimos pela
  // primeira vez" e o default cuida disso. Mandá-lo aqui reescreveria a
  // primeira vez a cada rodada, e o dado deixaria de existir — o mesmo erro que
  // o `synced_at` de `ecommerce_orders` cometeu e que atrapalhou um
  // diagnóstico esta semana.
  //
  // ⚠️ E as colunas de VÍNCULO também ficam fora: quem as preenche é a Fase 2
  // (e a confirmação humana). Incluí-las aqui apagaria, a cada 15 minutos, o
  // trabalho de quem conciliou à mão.
  const { error } = await supabase
    .from("melhorenvio_envios")
    .upsert(linhas, { onConflict: "me_id" });

  if (error) return json({ ...resumo, ok: false, error: error.message }, 500);

  // Depois do upsert, e nunca no lugar dele: a reconferência só cuida de quem
  // a listagem desta rodada NÃO trouxe.
  const reconferencia = await reconferir(cabecalhos, base, vistos, false);
  const saida = { ...resumo, reconferencia };
  console.log("[melhor-envio-envios]", JSON.stringify(saida));
  return json(saida);
});
