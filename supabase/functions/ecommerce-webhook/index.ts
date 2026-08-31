import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import {
  getNuvemshopCreds, fetchNuvemshopOrder, mapNuvemshopOrder, enrichUnitsReal,
} from "../_shared/nuvemshop.ts";
// ⚠️ A tradução de status da Shopee vive em UM lugar só. Este arquivo tinha a
// sua própria tabela, e ela discordava da canônica justamente em `PROCESSED`.
import { statusDaShopee } from "../_shared/shopeePedido.ts";
import { linhasDaPayt } from "../_shared/paytPedido.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = "mercadolivre" | "amazon" | "tiktok" | "shopee" | "nuvemshop" | "payt";

interface NormalizedOrder {
  platform: Platform;
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;    // populated as quantity for now; updated when SKU catalog is wired
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;    // ISO timestamp
  raw: unknown;
}

// ─── Signature validators ─────────────────────────────────────────────────────

async function hmacSHA256(key: string, message: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const msgBytes = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  return encodeHex(new Uint8Array(sig));
}

async function validateMercadoLivre(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("ML_WEBHOOK_SECRET");
  // ⚠️ Ausência FECHA. Era `return true`, e como `ML_WEBHOOK_SECRET` não
  // aparece em nenhum outro ponto do projeto, este endpoint estava aberto.
  if (!secret) {
    console.error("[mercadolivre] ML_WEBHOOK_SECRET não configurado — recusando.");
    return false;
  }
  const xSig = req.headers.get("x-signature") ?? "";
  // ML sends: ts=<timestamp>,v1=<hmac>
  const parts = Object.fromEntries(xSig.split(",").map(s => s.split("=")));
  const dataId = new URL(req.url).searchParams.get("data.id") ?? "";
  const expected = await hmacSHA256(secret, `id:${dataId};request-id:${req.headers.get("x-request-id") ?? ""};ts:${parts.ts ?? ""}`);
  return expected === parts.v1;
}

/**
 * ⚠️ A versão anterior não validava NADA, nem com o ARN configurado.
 *
 *     const msg = JSON.parse(body);
 *     return msg.TopicArn === topicArn;
 *
 * `TopicArn` é um campo do CORPO — escrito por quem faz a requisição. Conferir
 * o corpo contra si mesmo é conferir a assinatura de um documento com a
 * assinatura que está no próprio documento. E `if (!topicArn) return true`
 * deixava a porta escancarada quando a variável não existia, que é o estado
 * atual: `AMAZON_SNS_TOPIC_ARN` não aparece em nenhum outro lugar do projeto.
 *
 * O que isso permite, concretamente: um POST anônimo em
 * `/ecommerce-webhook/amazon` com um `AmazonOrderId` real e `OrderStatus:
 * Shipped` grava `shipped` em `ecommerce_orders` → o gatilho preenche
 * `platform_order_number` → o CTE `plataforma` da esteira dá `avanco = 2` → o
 * card vai para `em_transito` → a `carbo_msg_fila` manda "seu pedido está a
 * caminho" no WhatsApp de um cliente de verdade. De quebra, `shipped` passa na
 * lista branca de venda e toca o som de venda para todo o time interno.
 *
 * ── Por que segredo na URL e não assinatura SNS ──────────────────────────
 *
 * Validar SNS de verdade exige buscar o `SigningCertURL`, extrair a chave
 * pública de um X.509 e verificar RSA sobre a string canônica. Sem biblioteca
 * de terceiro numa edge function, isso é código criptográfico escrito à mão
 * que eu não teria como testar contra um payload real da Amazon — e
 * criptografia não testada que RECUSA é pior que a ausência dela, porque
 * derruba o canal em silêncio.
 *
 * O segredo na URL registrada no SNS é o mesmo padrão que o resto do projeto
 * usa, é conferível numa linha, e fecha exatamente o buraco: só quem tem o
 * segredo consegue fazer a função escrever.
 */
async function validateAmazon(req: Request, _body: string): Promise<boolean> {
  const segredo = Deno.env.get("AMAZON_WEBHOOK_SECRET") ?? "";
  if (!segredo) {
    console.error(
      "[amazon] AMAZON_WEBHOOK_SECRET não configurado. " +
      "Cadastre o secret e registre a URL no SNS com ?secret=<valor>.",
    );
    return false;   // ⚠️ ausência FECHA
  }
  const url = new URL(req.url);
  const informado = req.headers.get("X-Webhook-Secret") ?? url.searchParams.get("secret");
  return informado === segredo;
}

async function validateTikTok(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("TIKTOK_APP_SECRET");
  // ⚠️ Ausência FECHA. O TikTok não está em uso; se um dia entrar, o secret é
  // parte de ligar o canal, não um detalhe a lembrar depois.
  if (!secret) {
    console.error("[tiktok] TIKTOK_APP_SECRET não configurado — recusando.");
    return false;
  }
  const timestamp = req.headers.get("x-tts-timestamp") ?? "";
  const received  = req.headers.get("x-tts-signature") ?? "";
  const expected  = await hmacSHA256(secret, timestamp + body);
  return expected === received;
}

/**
 * ⚠️ AUSÊNCIA DE SEGREDO FECHA, não abre.
 *
 * Antes era `if (!key) return true` — sem `SHOPEE_PARTNER_KEY` configurada,
 * QUALQUER POST nesta URL virava pedido no nosso banco. É o padrão que o
 * CLAUDE.md marca como obrigatório e é o inverso do que estava aqui:
 *
 *     if (!SEGREDO || informado !== SEGREDO) return 401;   // certo
 *     if (SEGREDO && informado !== SEGREDO) return 401;    // ERRADO
 *
 * O `CRON_SECRET` já sumiu uma vez neste projeto. Naquela vez a ausência
 * TRAVOU tudo — 25 h de sincronismo morto, que é o modo seguro. Na forma acima
 * ela abriria, e pedido falso entrando em `ecommerce_orders` alimenta a esteira,
 * a fila de WhatsApp e o faturamento do painel.
 *
 * ⚠️ Só a Shopee foi trocada agora, de propósito. As outras três já recebem
 * tráfego real: virar a chave nelas sem antes conferir se o secret existe em
 * produção derrubaria a entrada de pedidos das lojas que estão vendendo. Medir
 * primeiro, virar depois — está anotado no fim do arquivo.
 */
async function validateShopee(req: Request, body: string): Promise<boolean> {
  const key = (Deno.env.get("SHOPEE_PARTNER_KEY") ?? "").trim() || undefined;
  if (!key) {
    console.error("[shopee] SHOPEE_PARTNER_KEY ausente no servidor — webhook RECUSADO.");
    return false;
  }
  const partnerId = (Deno.env.get("SHOPEE_PARTNER_ID") ?? "").trim();
  // ⚠️ A Shopee assina a URL que ELA conhece — a que está cadastrada no painel
  // do parceiro. `new URL(req.url).pathname` é o caminho como chegou aqui, e se
  // houver proxy/rewrite no meio os dois divergem e a assinatura nunca bate.
  const path      = new URL(req.url).pathname;
  const timestamp = req.headers.get("x-shopee-timestamp") ?? "";
  const auth      = req.headers.get("Authorization") ?? "";
  const baseStr   = `${partnerId}${path}${timestamp}`;
  const expected  = await hmacSHA256(key, baseStr);
  if (auth !== expected) {
    console.warn(`[shopee] Assinatura não confere. path=${path} ts=${timestamp}`);
  }
  return auth === expected;
}

async function validateNuvemshop(req: Request, body: string): Promise<boolean> {
  // Nuvemshop assina o corpo com HMAC-SHA256 usando o client_secret do app.
  const secret = Deno.env.get("NUVEMSHOP_CLIENT_SECRET");
  // ⚠️ Ausência FECHA. O "ainda em setup" do comentário antigo virou permanente
  // — é assim que provisório vira definitivo. Este é o de MENOR risco dos três:
  // o mesmo secret é usado pelo `nuvemshop-auth`, então ele existe.
  if (!secret) {
    console.error("[nuvemshop] NUVEMSHOP_CLIENT_SECRET não configurado — recusando.");
    return false;
  }
  const received = req.headers.get("x-linkedstore-hmac-sha256") ?? "";
  const expected = await hmacSHA256(secret, body);
  return received === expected;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

async function normalizeNuvemshop(body: unknown, _platform: Platform): Promise<NormalizedOrder[]> {
  // Webhook da Nuvemshop manda só { store_id, event, id }. Buscamos o pedido
  // completo na API (token não expira) e montamos as linhas — mesmo order_id
  // que o sync usa, então o upsert é idempotente (sem dedução em dobro).
  const b = body as Record<string, unknown>;
  const orderId = b.id;
  if (!orderId) return [];

  const creds = await getNuvemshopCreds(supabase);
  if (!creds) {
    console.warn("[nuvemshop] Loja não conectada — webhook ignorado");
    return [];
  }
  const order = await fetchNuvemshopOrder(creds.accessToken, creds.storeId, orderId as string | number);
  if (!order) return [];
  const rows = await enrichUnitsReal(supabase, mapNuvemshopOrder(order, "webhook"));
  // ⚠️ Ver a nota gêmea no ecommerce-sync: o número do pedido é atribuído aqui
  // para que publicar só esta função baste — o painel do Supabase não leva o
  // arquivo `_shared` junto.
  const numeroDaLoja = (order as any)?.number != null ? String((order as any).number) : null;
  for (const r of rows as any[]) r.platform_order_number = numeroDaLoja;
  return rows as unknown as NormalizedOrder[];
}

// ⚠️ ML e Amazon: a NOTIFICAÇÃO NÃO VIRA LINHA DE PEDIDO.
//
// As duas plataformas mandam só um aviso ("o pedido X mudou"), sem itens, sem
// valor e sem SKU — o detalhe se busca por API depois. As versões anteriores
// gravavam mesmo assim uma linha de reserva com `quantity: 1`, `units_real: 1`
// e `total: 0`, esperando que o sync a completasse.
//
// Ele não completa, e não tinha como: a chave do upsert é (platform, order_id),
// e as duas pontas montam `order_id` de formas diferentes —
//
//   ML       webhook  "https://api.mercadolibre.com/orders/2000…"  (o `resource`)
//            sync     "2000…-<item_id>"
//   Amazon   webhook  "701-1234567-1234567"
//            sync     "701-1234567-1234567-<OrderItemId>"
//
// — então a linha do aviso nunca é sobrescrita. Ela fica para sempre, ao lado
// da linha real, valendo 1 unidade a R$ 0,00 em TODA contagem que soma
// `quantity`/`units_real`. E no ML ela é pior ainda: `ecommerce_pedido_raiz`
// corta no primeiro hífen, e uma URL não colapsa em nada — vira um PEDIDO a
// mais na contagem, além da unidade.
//
// Perder até 5 min de latência (o `ecommerce-sync-5min` traz o pedido de
// verdade, com itens, SKU e valor) é muito melhor que uma venda fantasma
// permanente em todo painel. Quem tem o dado é a API, não o aviso.
function normalizeMercadoLivre(_body: unknown, _platform: Platform): NormalizedOrder[] {
  return [];
}

function normalizeAmazon(_body: unknown, _platform: Platform): NormalizedOrder[] {
  return [];
}

// ─── PayT ────────────────────────────────────────────────────────────────────
//
// ⚠️ A PayT NÃO assina o postback. Não há HMAC, não há header de autenticação.
// A única prova de origem é o campo `integration_key` DENTRO do corpo — a
// "Chave única" que o painel gera para cada postback cadastrado.
//
// Isso é fraco sozinho, e o desenho compensa somando camadas: TLS obrigatório
// (a função só atende https), o caminho da URL não é adivinhável, e a chave é
// comparada em tempo constante para não vazar por timing.
//
// ⚠️ Ausência FECHA, como manda a regra da casa: sem `PAYT_INTEGRATION_KEYS`
// cadastrado, recusa. Aqui isso importa mais que nos outros canais — quem
// acertasse a URL poderia INVENTAR vendas, e sem API de consulta não haveria
// com o que conferir.
function comparaConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// deno-lint-ignore require-await
async function validatePayt(_req: Request, body: string): Promise<boolean> {
  // Uma chave por postback cadastrado (Venda, Recorrência, Pague após receber),
  // separadas por vírgula.
  const cru = Deno.env.get("PAYT_INTEGRATION_KEYS") ?? "";
  const chaves = cru.split(",").map((k) => k.trim()).filter(Boolean);
  if (chaves.length === 0) {
    console.error("[payt] PAYT_INTEGRATION_KEYS não configurado — recusando.");
    return false;
  }
  let recebida = "";
  try {
    recebida = String((JSON.parse(body) as Record<string, unknown>)?.integration_key ?? "");
  } catch {
    return false;
  }
  if (!recebida) return false;
  return chaves.some((k) => comparaConstante(recebida, k));
}

async function normalizePayt(body: unknown, _platform: Platform): Promise<NormalizedOrder[]> {
  const { linhas, motivo } = linhasDaPayt(body);

  // ⚠️ O CRU PRIMEIRO, e sempre — inclusive quando não vira pedido nenhum.
  //
  // A PayT não tem endpoint de consulta: postback perdido é venda que nunca
  // entra, e não há de onde buscar depois. Este INSERT é a única prova de que o
  // evento chegou, e é dele que se reprocessa quando o parser mudar.
  //
  // O `on conflict do nothing` sobre o hash do corpo é a idempotência: a PayT
  // reenvia o mesmo evento, e reenvio é comportamento normal, não erro.
  const b = (body ?? {}) as Record<string, unknown>;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const hash = encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    const { error } = await supabase.from("payt_eventos").upsert({
      body_hash: hash,
      corpo: body,
      status: b.status != null ? String(b.status) : null,
      tipo: b.type != null ? String(b.type) : null,
      transaction_id: b.transaction_id != null ? String(b.transaction_id) : null,
      cart_id: b.cart_id != null ? String(b.cart_id) : null,
      eh_teste: b.test === true,
      processado_em: new Date().toISOString(),
      resultado: motivo,
    }, { onConflict: "body_hash", ignoreDuplicates: true });
    if (error) console.error("[payt] falhou gravar o cru:", error.message);
  } catch (e) {
    // ⚠️ Falhar aqui NÃO derruba a ingestão: perder o pedido é pior que perder
    // a cópia dele. O erro fica no log da função.
    console.error("[payt] erro ao gravar o cru:", String(e));
  }

  if (linhas.length === 0) console.log(`[payt] sem pedido: ${motivo}`);
  return linhas as unknown as NormalizedOrder[];
}

function normalizeTikTok(body: unknown, platform: Platform): NormalizedOrder[] {
  const b = body as Record<string, unknown>;
  const orders: NormalizedOrder[] = [];
  const data = (b.data as Record<string, unknown>) ?? b;
  const orderId = String(data.order_id ?? b.order_id ?? "");
  if (!orderId) return [];
  const lineItems = (data.line_items as unknown[]) ?? [];
  if (lineItems.length === 0) {
    orders.push({
      platform,
      order_id:     orderId,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   0,
      total:        Number(data.payment_info?.original_total_product_price ?? 0) / 100000,
      status:       String(data.status ?? "pending").toLowerCase(),
      ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
      raw:          body,
    });
  } else {
    for (const item of lineItems as Record<string, unknown>[]) {
      orders.push({
        platform,
        order_id:     `${orderId}-${item.id ?? item.sku_id}`,
        product_sku:  String(item.seller_sku ?? ""),
        product_name: String(item.product_name ?? ""),
        quantity:     Number(item.quantity ?? 1),
        units_real:   Number(item.quantity ?? 1), // updated by cron when SKU catalog is wired
        unit_price:   Number(item.sale_price ?? 0) / 100000,
        total:        Number(item.sale_price ?? 0) / 100000 * Number(item.quantity ?? 1),
        status:       String(data.status ?? "pending").toLowerCase(),
        ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
        raw:          item,
      });
    }
  }
  return orders;
}

function normalizeShopee(body: unknown, platform: Platform): NormalizedOrder[] {
  const b = body as Record<string, unknown>;
  if (b.code !== 0) return []; // error notification
  const data = b.data as Record<string, unknown>;
  const orderId = String(data?.ordersn ?? "");
  if (!orderId) return [];
  const items = (data?.item_list as Record<string, unknown>[]) ?? [];
  if (items.length === 0) {
    return [{
      platform,
      order_id:     orderId,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   0,
      total:        Number(data.total_amount ?? 0),
      status:       normalizeShopeeStatus(String(data.status ?? "")),
      ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
      raw:          body,
    }];
  }
  return items.map((item, i) => ({
    platform,
    // ⚠️ O MESMO sufixo do `ecommerce-sync` (`_shared/shopeePedido.ts`):
    // `item_id-model_id`. Antes aqui era só `item_id`, e chave diferente para o
    // mesmo item significa DUAS LINHAS em `ecommerce_orders` — o webhook grava
    // uma, o cron grava outra, e o upsert `(platform, order_id)` não deduplica
    // porque as chaves não coincidem.
    //
    // A contagem de pedidos até sobreviveria (`ecommerce_pedido_raiz` colapsa
    // as duas na mesma raiz), mas RECEITA e UNIDADES somam linha a linha:
    // faturamento dobrado da Shopee, sem erro nenhum. É exatamente o furo que a
    // 20260855 fechou, reaberto por um caminho que ninguém comparou.
    //
    // E o `model_id` no sufixo não é detalhe: o mesmo produto em duas variações
    // (tamanho, cor) tem `item_id` igual e `model_id` diferente — só com
    // `item_id` as duas variações colidiriam numa linha só.
    order_id:     `${orderId}-${item.item_id ?? i}-${item.model_id ?? 0}`,
    // ⚠️ `model_sku` PRIMEIRO, e `null` quando não há nenhum dos dois — as duas
    // coisas alinham este caminho com o do sync (`_shared/shopeePedido.ts`),
    // que já fazia assim.
    //
    // A ordem importa porque anúncio com variação guarda o SKU útil no MODELO:
    // ler só `item_sku` traz o código do anúncio-pai, igual para tamanhos
    // diferentes — e o mapa resolveria a variação errada.
    //
    // E `""` não é `null`: o gatilho de estoque guarda com `IS NULL`, que a
    // string vazia ATRAVESSA, e a tela agrupa com `??`, então o vazio vira uma
    // categoria de SKU em branco em vez de cair no "Sem SKU". Ausência tem de
    // se declarar ausência.
    product_sku:  (item.model_sku ? String(item.model_sku) : null) ??
                  (item.item_sku ? String(item.item_sku) : null),
    product_name: String(item.item_name ?? ""),
    quantity:     Number(item.model_quantity_purchased ?? 1),
    units_real:   Number(item.model_quantity_purchased ?? 1),
    unit_price:   Number(item.model_discounted_price ?? 0),
    total:        Number(item.model_discounted_price ?? 0) * Number(item.model_quantity_purchased ?? 1),
    status:       normalizeShopeeStatus(String(data.status ?? "")),
    ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
    raw:          item,
  }));
}

/**
 * ⚠️ DELEGA para a regra única, em `_shared/shopeePedido.ts`.
 *
 * Havia duas tabelas de status para a MESMA plataforma, e elas discordavam no
 * ponto mais caro: aqui `PROCESSED` virava `shipped`; lá, `paid`. `PROCESSED`
 * é pago com a etiqueta ainda não coletada — anunciar "seu pedido está a
 * caminho" nesse momento é mentira no celular do cliente.
 *
 * Pior: com as duas linhas duplicadas do defeito acima, o CTE `plataforma` da
 * esteira usa `max(avanco)` — o otimista ganhava sempre, e o card avançava
 * pela linha errada.
 *
 * Esta tabela também ignorava `RETRY_SHIP`, `INVOICE_PENDING`,
 * `TO_CONFIRM_RECEIVE` e `TO_RETURN`, que caíam no `pending` do default: um
 * pedido ENTREGUE aguardando confirmação do comprador voltava a "pendente".
 */
function normalizeShopeeStatus(s: string): string {
  return statusDaShopee(s);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract platform from URL: /ecommerce-webhook/<platform>
  const url      = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const platform = segments[segments.length - 1] as Platform;

  if (!["mercadolivre", "amazon", "tiktok", "shopee", "nuvemshop", "payt"].includes(platform)) {
    return new Response("Unknown platform", { status: 400 });
  }

  const body = await req.text();

  // Validate signature
  const validators: Record<Platform, (r: Request, b: string) => Promise<boolean>> = {
    mercadolivre: validateMercadoLivre,
    amazon:       validateAmazon,
    tiktok:       validateTikTok,
    shopee:       validateShopee,
    nuvemshop:    validateNuvemshop,
    payt:         validatePayt,
  };

  // ── Modo de observação ────────────────────────────────────────────────────
  //
  // ⚠️ Existe para tornar possível FECHAR sem apagar um canal por engano.
  //
  // Três validadores ainda têm `if (!secret) return true` — ausência ABRE, que
  // é o oposto da regra da casa. Virar as três de uma vez às cegas é apostar
  // que os segredos estão cadastrados em produção; errar significa recusar
  // pedido de verdade, e o sintoma seria "as vendas pararam de aparecer" sem
  // erro em lugar nenhum.
  //
  // Com `WEBHOOK_OBSERVAR=1` a recusa é REGISTRADA e a requisição passa. Roda-se
  // assim por um dia, lê-se o log, e só então tira-se a variável. Depois de
  // tirada, recusa é recusa.
  //
  // ⚠️ O padrão é FECHADO: a variável precisa ser cadastrada de propósito para
  // afrouxar, e some quando alguém a remove. Nunca o contrário.
  const OBSERVAR = Deno.env.get("WEBHOOK_OBSERVAR") === "1";

  // ⚠️ A PORTA ABERTA SE ANUNCIA, mesmo quando nada é recusado.
  //
  // Até aqui o modo de observação só deixava rastro QUANDO havia uma recusa. Se
  // todos os segredos estivessem certos — que é exatamente o estado em que se
  // deve fechar — a variável ficava ligada produzindo silêncio absoluto, e
  // silêncio é indistinguível de "já foi removida".
  //
  // Ou seja: o sinal aparecia só no caso em que a pessoa ainda NÃO devia fechar,
  // e sumia justamente no caso em que ela DEVIA. É o incentivo invertido, e é
  // assim que provisório vira definitivo — o próprio comentário abaixo avisa
  // disso, e mesmo assim não havia como responder "está ligado?" sem abrir o
  // painel do Supabase.
  //
  // Agora `grep PORTA_ABERTA` nos logs responde em segundos, e a resposta existe
  // mesmo num dia sem nenhuma recusa.
  if (OBSERVAR) {
    console.warn(
      `[${platform}] PORTA_ABERTA — WEBHOOK_OBSERVAR=1: assinatura inválida NÃO recusa. ` +
      `Provisório de diagnóstico; remova o secret e faça deploy para fechar.`,
    );
  }

  const valid = await validators[platform](req, body);
  if (!valid) {
    if (OBSERVAR) {
      // Um formato fácil de achar no log: `grep RECUSARIA`.
      console.error(
        `[${platform}] RECUSARIA (WEBHOOK_OBSERVAR=1, passando assim mesmo) ` +
        `— corpo: ${body.slice(0, 400)}`,
      );
    } else {
      console.error(`[${platform}] recusado: assinatura/segredo inválido ou ausente`);
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Normalize to common schema (alguns normalizers são async — ex.: nuvemshop)
  const normalizers: Record<Platform, (b: unknown, p: Platform) => NormalizedOrder[] | Promise<NormalizedOrder[]>> = {
    mercadolivre: normalizeMercadoLivre,
    amazon:       normalizeAmazon,
    tiktok:       normalizeTikTok,
    shopee:       normalizeShopee,
    nuvemshop:    normalizeNuvemshop,
    payt:         normalizePayt,
  };

  const orders = await normalizers[platform](parsed, platform);

  if (orders.length === 0) {
    // Acknowledge but nothing to store (e.g. non-order event)
    return new Response(JSON.stringify({ ok: true, stored: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("ecommerce_orders")
    .upsert(orders, { onConflict: "platform,order_id" });

  if (error) {
    console.error(`[${platform}] DB error:`, error.message);
    return new Response("Internal error", { status: 500 });
  }

  console.log(`[${platform}] Stored ${orders.length} order(s)`);
  return new Response(JSON.stringify({ ok: true, stored: orders.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ COMO LIGAR ISTO SEM DERRUBAR UM CANAL
// ═══════════════════════════════════════════════════════════════════════════
//
// Os cinco validadores agora FECHAM quando o segredo não existe. Antes, três
// deles (`mercadolivre`, `amazon`, `nuvemshop`) tinham `if (!secret) return
// true` — sem segredo configurado, aceitavam qualquer POST.
//
// Isso não foi trocado antes por um motivo concreto e correto: os três recebem
// tráfego real. Se o segredo não estiver cadastrado em produção — que é
// justamente o cenário em que o buraco existe —, fechar derruba a entrada de
// pedido das lojas que estão vendendo. Trocar falha de segurança por loja
// parada é piorar o problema.
//
// O `WEBHOOK_OBSERVAR` existe para desfazer esse impasse:
//
//   1. Cadastre `WEBHOOK_OBSERVAR=1` nos secrets e faça o deploy.
//      Nada é recusado. Toda recusa que ACONTECERIA vira uma linha de log
//      começando com `RECUSARIA`, com os primeiros 400 caracteres do corpo.
//
//   2. Deixe rodar um dia inteiro e leia os logs:
//        · nenhuma linha `RECUSARIA`  → todos os segredos estão certos, pode
//          seguir para o passo 3 sem risco;
//        · linhas de uma plataforma   → o segredo dela falta ou está errado.
//          Cadastre/corrija ANTES de fechar, senão os pedidos dela param.
//
//   3. REMOVA `WEBHOOK_OBSERVAR` e faça deploy de novo. A partir daí recusa é
//      recusa, e um POST forjado não escreve mais nada.
//
// ⚠️ Não deixe o passo 1 virar permanente. O "ainda em setup" do comentário
// antigo do `validateNuvemshop` ficou no ar por meses — é assim que provisório
// vira definitivo. Se `WEBHOOK_OBSERVAR` estiver cadastrado, a porta está
// aberta, com a diferença de que agora ela avisa.
//
// ── Sobre a Amazon, em particular ────────────────────────────────────────
//
// A validação dela NÃO é assinatura SNS: é segredo na URL registrada no painel
// do SNS (`?secret=<valor>` ou o header `X-Webhook-Secret`). Cadastre
// `AMAZON_WEBHOOK_SECRET` e registre a URL com ele. Verificar a assinatura SNS
// de verdade exigiria buscar o certificado, extrair a chave pública do X.509 e
// conferir RSA sobre a string canônica — código criptográfico à mão, sem teste
// contra payload real. O que estava lá antes conferia o `TopicArn` do CORPO,
// que é escrito por quem chama: não validava nada.
