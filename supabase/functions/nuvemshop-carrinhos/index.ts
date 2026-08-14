// ─────────────────────────────────────────────────────────────────────────────
// nuvemshop-carrinhos — o espelho dos checkouts abandonados
//
// Terceira pipeline da esteira: quem encheu o carrinho, chegou no checkout e
// não terminou. Só a loja própria tem isso — Mercado Livre e Amazon fazem a
// própria recuperação e não expõem o contato de quem abandonou.
//
// ── O que esta função faz, e o que ela NÃO faz ───────────────────────────────
//
//   faz       lê `/checkouts` da Nuvemshop e espelha em `nuvemshop_carrinhos`
//   não faz   decidir quem recebe mensagem, quando, ou se já recebeu
//
// Quem decide é o banco: a view `carbo_carrinho_pipeline` calcula a coluna e a
// `carbo_msg_fila` decide o vencimento. Aqui não há uma linha sequer sobre
// janelas ou disparo — de propósito. Regra de envio em dois lugares é regra que
// diverge, e divergir aqui é mandar WhatsApp duplicado para quem não é cliente.
//
// ── ⚠️ Sobre o formato do que a API devolve ──────────────────────────────────
//
// A Nuvemshop espalha o contato do comprador por vários campos conforme o
// checkout usado (convidado, cadastrado, com cobrança separada) — o mesmo
// problema que o `dadosDoCliente` do `_shared/nuvemshop.ts` já resolve para
// pedidos. Aqui é pior: no carrinho abandonado a pessoa muitas vezes preencheu
// SÓ o e-mail, porque o telefone é pedido num passo posterior do checkout.
//
// Por isso: (a) toda extração tem cadeia de fallback, (b) o payload inteiro é
// guardado em `raw`, e (c) existe `?ensaio=1`, que busca e MOSTRA sem gravar
// nada. Rode o ensaio antes de ligar qualquer texto — é o único jeito honesto
// de saber quantos carrinhos desta loja têm telefone de verdade.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNuvemshopCreds, NUVEMSHOP_API, NUVEMSHOP_UA } from "../_shared/nuvemshop.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO = Deno.env.get("CRON_SECRET") ?? "";

// Quanto tempo para trás olhar. 7 dias cobre com folga a maior janela da
// pipeline (3ª mensagem + prazo de desistência); ler mais que isso é reprocessar
// carrinho que já está decidido.
const DIAS = 7;
const MAX_PAGINAS = 10;   // teto de segurança: 500 carrinhos por rodada

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

const limpo = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/**
 * Contato de quem abandonou.
 *
 * ⚠️ Cadeia de fallback pelo mesmo motivo do `dadosDoCliente` dos pedidos: a
 * plataforma põe o dado em lugares diferentes conforme o comprador estar
 * logado, ser convidado, ou ter endereço de cobrança separado. Aceitar todos
 * custa nada; aceitar um só produz carrinho "sem telefone" que na verdade tem.
 */
function contato(c: any) {
  return {
    cliente: limpo(c?.contact_name) ?? limpo(c?.customer?.name)
          ?? limpo(c?.billing_name) ?? limpo(c?.shipping_name) ?? null,
    telefone: limpo(c?.contact_phone) ?? limpo(c?.customer?.phone)
           ?? limpo(c?.billing_phone) ?? limpo(c?.shipping_address?.phone) ?? null,
    email: limpo(c?.contact_email) ?? limpo(c?.customer?.email)
        ?? limpo(c?.billing_address?.email) ?? null,
  };
}

/**
 * O que tem no carrinho, em uma linha legível.
 *
 * Vai para a mensagem (`{{produtos}}`) e para o card. Não é enfeite: "você
 * esqueceu algo no carrinho" é genérico o bastante para parecer disparo
 * automático de qualquer loja; "seu CarboZé 100ml ×2" é a prova de que a
 * mensagem é sobre a escolha daquela pessoa.
 *
 * Três itens no máximo — o resto vira "+N". WhatsApp com lista longa vira
 * parede de texto e ninguém lê até o link, que é a única coisa que importa.
 */
function descreverProdutos(c: any): { texto: string | null; itens: number } {
  const ps: any[] = Array.isArray(c?.products) ? c.products : [];
  if (ps.length === 0) return { texto: null, itens: 0 };

  const itens = ps.reduce((s, p) => s + (Number(p?.quantity) || 0), 0);
  const nome = (p: any) =>
    limpo(p?.name) ?? limpo(p?.product_name) ?? limpo(p?.sku) ?? "item";
  const linha = (p: any) => {
    const q = Number(p?.quantity) || 1;
    return q > 1 ? `${nome(p)} ×${q}` : nome(p);
  };

  const mostra = ps.slice(0, 3).map(linha).join(" · ");
  const resto  = ps.length - 3;
  return { texto: resto > 0 ? `${mostra} +${resto}` : mostra, itens };
}

/** Cabeçalhos da API. Manda os dois nomes de auth, como o `_shared` faz. */
function headers(token: string): HeadersInit {
  return {
    "Authentication": `bearer ${token}`,
    "Authorization":  `bearer ${token}`,
    "User-Agent":     NUVEMSHOP_UA,
    "Content-Type":   "application/json",
  };
}

/** Lista os checkouts abandonados desde `desde`, paginado. */
async function buscarCarrinhos(
  token: string, storeId: string, desde: Date,
): Promise<{ lista: any[]; erro: string | null }> {
  const out: any[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const params = new URLSearchParams({
      created_at_min: desde.toISOString(),
      per_page: "50",
      page: String(page),
    });
    const res = await fetch(`${NUVEMSHOP_API}/${storeId}/checkouts?${params}`, {
      headers: headers(token),
    });

    // ⚠️ 401/403 aqui quase sempre é ESCOPO, não token vencido: o app precisa
    // da permissão de leitura de pedidos/clientes para enxergar checkout
    // abandonado, e um app antigo pode ter sido autorizado sem ela. Devolver o
    // status junto evita a caçada ao "token expirado" que não expirou.
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return {
        lista: out,
        erro: `checkouts HTTP ${res.status} (página ${page}): ${corpo.slice(0, 300)}`,
      };
    }

    const lote = await res.json();
    if (!Array.isArray(lote) || lote.length === 0) break;
    out.push(...lote);
    if (lote.length < 50) break;
  }
  return { lista: out, erro: null };
}

function paraLinha(c: any) {
  const { cliente, telefone, email } = contato(c);
  const { texto: produtos, itens } = descreverProdutos(c);

  return {
    checkout_id: Number(c?.id),
    token: limpo(c?.token),
    abandonado_em: c?.created_at
      ? new Date(c.created_at).toISOString()
      : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    // A plataforma dizendo que o checkout virou pedido. É o FATO da
    // recuperação; a view ainda cruza por e-mail como rede de segurança, porque
    // nem toda loja recebe este campo preenchido.
    completado_em: c?.completed_at ? new Date(c.completed_at).toISOString() : null,
    cliente,
    telefone,
    email,
    total: Number(c?.total ?? 0),
    moeda: limpo(c?.currency),
    itens,
    produtos,
    // ⚠️ A URL que RESTAURA o carrinho. Sem ela a mensagem é só um lembrete de
    // que a pessoa desistiu — ela teria de reabrir a loja e refazer a escolha,
    // que é o atrito que a fez abandonar.
    link: limpo(c?.abandoned_checkout_url) ?? limpo(c?.checkout_url) ?? null,
    raw: c,
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  // ⚠️ FECHA quando o segredo não existe. A forma errada (`if (SEGREDO && ...)`)
  // ABRE a função quando o secret some — e este projeto já perdeu o CRON_SECRET
  // uma vez. As duas recusas são separadas: 401 é problema de quem chama, 500 é
  // problema nosso, e juntar as duas faz a falha de configuração se disfarçar
  // de chamada indevida.
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({
      error: "CRON_SECRET não está configurado neste projeto.",
      como_resolver: "Supabase > Edge Functions > Secrets: criar CRON_SECRET.",
    }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  // Busca e MOSTRA, sem gravar. Rode isto antes de ligar qualquer texto: é como
  // se descobre quantos carrinhos desta loja têm telefone de verdade.
  const ensaio = url.searchParams.get("ensaio") === "1";

  const creds = await getNuvemshopCreds(supabase);
  if (!creds) {
    return json({
      error: "Nuvemshop não conectada (sem token em system_tokens id='nuvemshop').",
    }, 500);
  }

  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);
  const { lista, erro } = await buscarCarrinhos(creds.accessToken, creds.storeId, desde);

  // Erro de API com lista vazia é falha; com lista parcial, grava o que veio e
  // reporta — perder a rodada inteira por causa da página 7 seria pior.
  if (erro && lista.length === 0) return json({ error: erro }, 502);

  const linhas = lista
    .map(paraLinha)
    .filter((l) => Number.isFinite(l.checkout_id) && l.checkout_id > 0);

  const comFone  = linhas.filter((l) => l.telefone).length;
  const comLink  = linhas.filter((l) => l.link).length;
  const fechados = linhas.filter((l) => l.completado_em).length;

  const resumo = {
    ok: true,
    ensaio,
    desde: desde.toISOString(),
    encontrados: linhas.length,
    com_telefone: comFone,
    com_link: comLink,
    ja_concluidos: fechados,
    ...(erro ? { aviso: erro } : {}),
  };

  if (ensaio) {
    return json({
      ...resumo,
      // Sem o `raw`: o payload inteiro de 50 carrinhos é ilegível, e o que se
      // quer conferir no ensaio é se os campos que a pipeline usa vieram.
      amostra: linhas.slice(0, 5).map(({ raw: _raw, ...l }) => l),
    });
  }

  // ⚠️ Upsert por `checkout_id`, nunca insert. O mesmo carrinho volta em toda
  // rodada enquanto estiver dentro da janela de 7 dias, e é assim que
  // `completado_em` chega quando a pessoa finaliza — a linha precisa ser
  // ATUALIZADA, não duplicada nem ignorada.
  //
  // `visto_em` fica de fora da lista de colunas de propósito: ele é o "quando
  // vimos pela primeira vez" e o default cuida disso. Mandá-lo aqui reescreveria
  // a primeira vez a cada 15 minutos, e o dado deixaria de existir.
  const { error } = await supabase
    .from("nuvemshop_carrinhos")
    .upsert(linhas, { onConflict: "checkout_id" });

  if (error) return json({ ...resumo, ok: false, error: error.message }, 500);

  console.log("[nuvemshop-carrinhos]", JSON.stringify(resumo));
  return json(resumo);
});
