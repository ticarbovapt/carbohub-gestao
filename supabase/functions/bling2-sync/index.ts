// ═══════════════════════════════════════════════════════════════════════════
// bling2-sync — espelho COMPLETO da segunda conta Bling
//
// Puxa produtos, variações, estoque, contatos, vendedores, pedidos de venda
// (+ itens), NF-e, contas a pagar, contas a receber e pedidos de compra.
//
// ── O que esta função NÃO faz (de propósito) ──────────────────────────────
// • Não escreve em NENHUMA tabela fora de `bling2_*`. O `bling-sync` tem uma
//   fase `bridge` que cria pedido em `carboze_orders`, casa NF com pedido e
//   joga contas em `purchase_payables`/`receivables`/`purchase_orders`. Nada
//   disso existe aqui: Bling 2 é espelho, não fonte de faturamento.
// • Não cria pedido no Bling (`create_order`). Emissão continua só na conta 1.
//
// Uma varredura por "bling_" (sem o 2) neste arquivo tem de voltar VAZIA fora
// dos comentários — é a conferência mais rápida de que o isolamento está de pé.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://financas.carbohub.com.br",
  "https://finance.carbohub.com.br",
  "https://carbohub-fin.vercel.app",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname.endsWith(".carbohub.com.br") || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

// Renova antes de expirar de fato — 5 min de folga.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
// A API do Bling aceita 3 req/s. 350ms entre chamadas fica logo abaixo do teto.
const RATE_MS = 350;

type Admin = ReturnType<typeof createClient>;
type SyncResult = { synced: number; failed: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

// Data que o Bling manda como texto ('AAAA-MM-DD' ou 'AAAA-MM-DD HH:MM:SS')
// para coluna `date`. String vazia vira null — Postgres rejeita '' em date.
function toDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


// ── Token ──────────────────────────────────────────────────────────────────

async function refreshToken(
  admin: Admin, integration: any, clientId: string, clientSecret: string
): Promise<{ token: string; error?: string }> {
  console.log("[bling2-sync] renovando token da integração", integration.id);
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });

  const data = await resp.json();

  if (!resp.ok || data.error) {
    console.error("[bling2-sync] refresh FALHOU:", JSON.stringify(data));
    await admin.from("bling2_integration").update({ is_active: false }).eq("id", integration.id);
    return {
      token: "",
      error: `Refresh do Bling 2 falhou: ${data.error_description || data.error || "desconhecido"}. Reconecte.`,
    };
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000);
  await admin.from("bling2_integration").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt.toISOString(),
    updated_at: nowIso(),
  }).eq("id", integration.id);

  return { token: data.access_token };
}

async function getValidToken(
  admin: Admin, clientId: string, clientSecret: string, forceRefresh = false
): Promise<{ token: string; error?: string }> {
  // ⚠️ `.maybeSingle()` com order+limit, NÃO `.single()`. O `bling-sync` usa
  // `.single()` e quebra inteiro (PGRST116) se houver mais de uma linha ativa
  // — cenário que uma reconexão mal terminada cria sozinha. Aqui a mais
  // recente vence e o sync segue.
  const { data: integration } = await admin
    .from("bling2_integration")
    .select("*")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return { token: "", error: "Bling 2 não conectado. Conecte em /integracoes/bling2." };
  }

  const expiresAt = new Date(integration.expires_at as string);
  const now = new Date();
  const expirou = expiresAt < now;
  const expirando = expiresAt.getTime() - now.getTime() < REFRESH_BUFFER_MS;

  if (forceRefresh || expirou || expirando) {
    return refreshToken(admin, integration, clientId, clientSecret);
  }
  return { token: integration.access_token as string };
}


// ── Chamada à API ──────────────────────────────────────────────────────────

async function blingFetch(
  token: string, endpoint: string, page = 1, limit = 100, _retries = 0
): Promise<any> {
  const MAX_RETRIES = 5;
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BLING_API_BASE}${endpoint}${sep}pagina=${page}&limite=${limit}`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (resp.status === 429) {
    if (_retries >= MAX_RETRIES) {
      throw new Error(`Bling API rate limit exceeded after ${MAX_RETRIES} retries for ${endpoint}`);
    }
    const wait = Math.min(1000 * Math.pow(2, _retries), 10000);
    console.log(`[bling2-sync] 429 em ${endpoint}, tentativa ${_retries + 1}/${MAX_RETRIES} em ${wait}ms`);
    await sleep(wait);
    return blingFetch(token, endpoint, page, limit, _retries + 1);
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Bling API error ${resp.status}: ${JSON.stringify(err)}`);
  }

  return resp.json();
}

// Percorre um endpoint paginado e entrega os registros em lotes.
//
// `maxPages` existe para as rodadas incrementais: se o Bling ignorar o filtro
// de data que mandamos, sem teto a rodada de 30 em 30 minutos varreria o
// histórico inteiro. Quando o teto é atingido, avisa no log — teto silencioso
// se parece com "acabou", e não é.
async function paginar(
  token: string, endpoint: string, aoLote: (registros: any[]) => Promise<void>,
  maxPages = 0
): Promise<void> {
  let page = 1;
  while (true) {
    const data = await blingFetch(token, endpoint, page, 100);
    const registros: any[] = data.data || [];
    if (!registros.length) return;
    await aoLote(registros);
    await sleep(RATE_MS);
    if (registros.length < 100) return;
    if (maxPages && page >= maxPages) {
      console.warn(`[bling2-sync] TETO de ${maxPages} páginas atingido em ${endpoint} — ` +
        `ainda havia mais. Se isso repetir, o filtro de data não está sendo aplicado.`);
      return;
    }
    page++;
  }
}

// ── Janela das rodadas incrementais ───────────────────────────────────────
// 7 dias: cobre com folga qualquer atraso de emissão ou queda de cron do fim
// de semana. Janela curta demais (1 dia) perderia nota emitida com data
// retroativa; longa demais devolve o custo que a rodada incremental existe
// para evitar.
const JANELA_DIAS = 7;

// ⚠️ +1 dia de margem, medido — não suposto.
//
// Na primeira execução real (2026-08-03) a rodada trouxe 44 notas enquanto a
// janela tinha 48. As 4 faltantes eram as de 2026-07-27 — exatamente o dia da
// borda (hoje − 7) —, todas VÁLIDAS ("Emitida DANFE", com valor), não
// canceladas. Ou seja: o Bling aplica `dataEmissaoInicial` de forma
// EXCLUSIVA, devolvendo só a partir do dia seguinte.
//
// Sem esta margem a janela efetiva é 6 dias, não 7, e ninguém perceberia: o
// buraco fica na ponta mais velha, que a rodada completa diária cobre. O
// prejuízo seria só no dia em que o cron ficasse fora do ar por uma semana —
// justamente quando a folga precisa existir.
const MARGEM_BORDA_DIAS = 1;

function dataDeCorte(dias = JANELA_DIAS): string {
  const total = dias + MARGEM_BORDA_DIAS;
  return new Date(Date.now() - total * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

// Confere se o filtro de data pegou. Se a maioria do primeiro lote é mais
// velha que a janela, o Bling ignorou o parâmetro — e aí a rodada incremental
// vira uma varredura truncada do histórico, que é PIOR que não rodar: parece
// que sincronizou e não olhou o que interessa.
function alertaFiltroIgnorado(rotulo: string, datas: (string | null)[], corte: string) {
  const validas = datas.filter(Boolean) as string[];
  if (validas.length < 10) return;                     // amostra pequena não conclui nada
  const velhas = validas.filter((d) => d < corte).length;
  if (velhas > validas.length / 2) {
    console.warn(`[bling2-sync] ${rotulo}: ${velhas}/${validas.length} registros do 1º lote são ` +
      `anteriores a ${corte}. O Bling parece estar IGNORANDO o filtro de data — a rodada ` +
      `completa diária continua cobrindo, mas a incremental está gastando à toa.`);
  }
}

// ── Lojas vistas nesta rodada ─────────────────────────────────────────────
//
// Toda loja que aparece num pedido ou numa NF é cadastrada em `bling2_lojas`
// com nome VAZIO, para alguém batizar.
//
// É o ponto inteiro do desenho. Se o de-para fosse uma lista fixa no código,
// no dia em que a Shopee for conectada os pedidos dela cairiam num "outros"
// ou num traço — e o relatório de faturamento por canal ficaria com um canal
// faltando, sem nada indicando isso. Com o auto-cadastro, aparece uma linha
// "(sem nome)" na tela, impossível de não ver.
//
// `ignoreDuplicates` para não sobrescrever o nome já preenchido à mão.
async function registrarLojas(
  admin: Admin, vistas: Map<number, number | null>
): Promise<void> {
  if (!vistas.size) return;
  const linhas = [...vistas.entries()].map(([id, un]) => ({
    bling_id: id,
    unidade_negocio_id: un,
  }));
  const { error } = await admin
    .from("bling2_lojas")
    .upsert(linhas, { onConflict: "bling_id", ignoreDuplicates: true });
  if (error) console.error("[bling2-sync] registro de lojas falhou:", error);
}

// Coleta o par (loja, unidade de negócio) de um registro do Bling.
function anotarLoja(vistas: Map<number, number | null>, r: any): void {
  const id = r?.loja?.id;
  if (id == null) return;
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  // loja 0 = venda sem canal (balcão/manual). Vale cadastrar: some do
  // relatório se ficar de fora, e "venda direta" é uma resposta legítima.
  vistas.set(n, Number(r.loja?.unidadeNegocio?.id) || null);
}

async function fecharLog(admin: Admin, logId: string, r: SyncResult) {
  await admin.from("bling2_sync_log")
    .update({ records_synced: r.synced, records_failed: r.failed })
    .eq("id", logId);
}


// ── Produtos ───────────────────────────────────────────────────────────────

async function syncProducts(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;

  await paginar(token, "/produtos", async (produtos) => {
    for (const p of produtos) {
      try {
        // `estoque_*` fica FORA do upsert de propósito: quem preenche é o
        // sync de estoque (/estoques). Mandar aqui apagaria o saldo a cada
        // rodada de produtos — mesma armadilha que a NF-e tem com valor/CNPJ.
        const { error } = await admin.from("bling2_products").upsert({
          bling_id: p.id,
          nome: p.nome || "",
          codigo: p.codigo || null,
          preco: toNum(p.preco) ?? 0,
          tipo: p.tipo || null,
          situacao: p.situacao || null,
          formato: p.formato || null,
          unidade: p.unidade || null,
          peso_liquido: toNum(p.pesoLiquido),
          peso_bruto: toNum(p.pesoBruto),
          gtin: p.gtin || null,
          gtin_embalagem: p.gtinEmbalagem || null,
          raw_data: p,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        if (error) throw error;
        synced++;
      } catch (e) {
        console.error("[bling2-sync] produto falhou:", e);
        failed++;
      }
    }
  });

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Variações (só produtos formato 'V') ────────────────────────────────────

async function syncVariacoes(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  const { data: comVariacao } = await admin
    .from("bling2_products").select("bling_id").eq("formato", "V");

  if (!comVariacao?.length) {
    await fecharLog(admin, logId, { synced: 0, failed: 0 });
    return { synced: 0, failed: 0 };
  }

  let synced = 0, failed = 0;
  for (const prod of comVariacao) {
    try {
      const data = await blingFetch(token, `/produtos/${prod.bling_id}/variacoes`, 1, 100);
      for (const v of (data.data || [])) {
        await admin.from("bling2_product_variations").upsert({
          bling_product_id: prod.bling_id,
          bling_variacao_id: v.id,
          nome: v.nome || null,
          codigo: v.codigo || null,
          preco: toNum(v.preco),
          estoque_atual: toNum(v.estoque?.saldoVirtualTotal) ?? 0,
          raw_data: v,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_product_id,bling_variacao_id" });
        synced++;
      }
      await sleep(RATE_MS);
    } catch (e) {
      console.error(`[bling2-sync] variações do produto ${prod.bling_id} falharam:`, e);
      failed++;
    }
  }

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Estoque (lotes de 40 ids) ──────────────────────────────────────────────

async function syncStock(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  const { data: produtos } = await admin.from("bling2_products").select("bling_id");
  if (!produtos?.length) {
    console.log("[bling2-sync] sem produtos — rode 'products' primeiro.");
    await fecharLog(admin, logId, { synced: 0, failed: 0 });
    return { synced: 0, failed: 0 };
  }

  const ids = produtos.map((p: any) => p.bling_id);
  const LOTE = 40;
  let synced = 0, failed = 0;
  let ultimoErro = "";

  // ── Qual é o endpoint de saldo, afinal ──────────────────────────────────
  // O Bling 1 usa `/estoques?idsProdutos=`. Na primeira execução do Bling 2
  // esse caminho falhou para os 6 produtos, e a documentação da v3 também
  // descreve `/estoques/saldos?idsProdutos[]=`. Em vez de adivinhar qual é o
  // certo, tentamos o primeiro e, se ele falhar, o segundo — e registramos no
  // log QUAL funcionou. Uma chamada extra só no caminho de erro.
  const CAMINHOS = [
    (lote: number[]) => `/estoques?idsProdutos=${lote.join(",")}`,
    (lote: number[]) => `/estoques/saldos?${lote.map((id) => `idsProdutos[]=${id}`).join("&")}`,
  ];
  let caminhoBom = -1;   // fixa no primeiro que responder, para não repetir a tentativa

  const buscarSaldos = async (lote: number[]): Promise<any[]> => {
    const tentar = caminhoBom >= 0 ? [caminhoBom] : CAMINHOS.map((_, i) => i);
    for (const i of tentar) {
      try {
        const data = await blingFetch(token, CAMINHOS[i](lote), 1, 100);
        if (caminhoBom < 0) {
          caminhoBom = i;
          console.log(`[bling2-sync] estoque: endpoint que respondeu = ${CAMINHOS[i]([0])}`);
        }
        return data.data || [];
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        console.error(`[bling2-sync] estoque via ${CAMINHOS[i]([0])} falhou:`, ultimoErro);
      }
    }
    throw new Error(ultimoErro || "estoque: nenhum endpoint respondeu");
  };

  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    try {
      for (const est of (await buscarSaldos(lote))) {
        const produtoId = est.produto?.id;
        if (!produtoId) continue;
        try {
          await admin.from("bling2_products").update({
            estoque_atual: toNum(est.saldoFisico) ?? 0,
            estoque_reservado: toNum(est.saldoVirtualReservado) ?? 0,
            estoque_synced_at: nowIso(),
          }).eq("bling_id", produtoId);
          synced++;
        } catch (e) {
          console.error("[bling2-sync] estoque do produto", produtoId, "falhou:", e);
          failed++;
        }
      }
    } catch (e) {
      console.error("[bling2-sync] lote de estoque falhou:", e);
      failed += lote.length;
    }
    await sleep(RATE_MS);
  }

  // Falhou TUDO? Então isto não é "completed com 0" — é falha, e o log tem de
  // dizer isso com o motivo. Foi assim que a primeira execução marcou
  // `completed` com 0 sincronizados e 6 falhas, e a tela mostrou sucesso.
  if (synced === 0 && failed > 0) {
    throw new Error(`estoque: nenhum dos ${failed} produtos foi atualizado. Último erro: ${ultimoErro || "desconhecido"}`);
  }

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Contatos ───────────────────────────────────────────────────────────────

async function syncContacts(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;

  // Passo 1 — todos os contatos.
  await paginar(token, "/contatos", async (contatos) => {
    for (const c of contatos) {
      try {
        // `is_supplier` / `is_client` / `tipo_contato` ficam de fora: são
        // definidos nos passos 2 e 3, e mandá-los aqui zeraria a marcação da
        // rodada anterior a cada sync.
        const { error } = await admin.from("bling2_contacts").upsert({
          bling_id: c.id,
          nome: c.nome || "",
          fantasia: c.fantasia || null,
          tipo_pessoa: c.tipoPessoa || null,
          cpf_cnpj: c.numeroDocumento || null,
          ie: c.ie || null,
          email: c.email || null,
          telefone: c.telefone || null,
          celular: c.celular || null,
          situacao: c.situacao || null,
          raw_data: c,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        if (error) throw error;
        synced++;
      } catch (e) {
        console.error("[bling2-sync] contato falhou:", e);
        failed++;
      }
    }
  });

  // Passos 2 e 3 — marcação por tipo. O Bling só entrega isso em listagem
  // filtrada; o registro do contato não traz o tipo.
  const marcar = async (filtro: string, patch: Record<string, unknown>) => {
    const ids: number[] = [];
    try {
      await paginar(token, `/contatos?tipoContato=${filtro}`, async (rows) => {
        for (const c of rows) ids.push(Number(c.id));
      });
    } catch (e) {
      console.error(`[bling2-sync] listagem tipoContato=${filtro} falhou:`, e);
      return 0;
    }
    for (let i = 0; i < ids.length; i += 100) {
      await admin.from("bling2_contacts")
        .update({ ...patch, updated_at: nowIso() })
        .in("bling_id", ids.slice(i, i + 100));
    }
    return ids.length;
  };

  const fornecedores = await marcar("F", { is_supplier: true, tipo_contato: "Fornecedor" });
  const clientes     = await marcar("C", { is_client: true });
  console.log(`[bling2-sync] contatos marcados: ${fornecedores} fornecedores, ${clientes} clientes`);

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Vendedores ─────────────────────────────────────────────────────────────

async function syncVendedores(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;

  await paginar(token, "/vendedores", async (vendedores) => {
    for (const v of vendedores) {
      try {
        await admin.from("bling2_vendedores").upsert({
          bling_id: v.id,
          // O /vendedores devolve o nome dentro de `contato` em boa parte das
          // contas; o campo solto é o fallback.
          nome: v.contato?.nome || v.nome || "",
          email: v.contato?.email || v.email || null,
          comissao_percentual: toNum(v.comissao?.percentual ?? v.comissao),
          situacao: v.situacao != null ? String(v.situacao) : null,
          raw_data: v,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        synced++;
      } catch (e) {
        console.error("[bling2-sync] vendedor falhou:", e);
        failed++;
      }
    }
  });

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Pedidos de venda (lista) ───────────────────────────────────────────────

// Um pedido da LISTAGEM. Compartilhado pela rodada completa e pela incremental
// — se as duas gravassem por caminhos diferentes, uma poderia ganhar um campo
// e a outra não, e o pedido mudaria de conteúdo conforme quem o tocou por
// último.
async function upsertPedidoDaLista(admin: Admin, o: any): Promise<void> {
  const contato = o.contato || {};
  const situacao = o.situacao || {};
  // `items` e `observacoes` NÃO entram aqui: a listagem do Bling não os traz,
  // e mandar null a cada rodada apagaria o que o `order_details` preencheu.
  // Foi exatamente esse apagão que deixou 38 pedidos do Bling 1 sem item.
  const { error } = await admin.from("bling2_orders").upsert({
    bling_id: o.id,
    numero: o.numero != null ? String(o.numero) : null,
    numero_loja: o.numeroLoja || null,
    data: o.data || null,
    data_saida: o.dataSaida || null,
    data_prevista: o.dataPrevista || null,
    total_produtos: toNum(o.totalProdutos) ?? 0,
    total_desconto: toNum(o.totalDesconto) ?? 0,
    total_frete: toNum(o.totalFrete) ?? 0,
    total: toNum(o.total) ?? 0,
    situacao_id: situacao.id ?? null,
    situacao_valor: situacao.valor != null ? String(situacao.valor) : null,
    contato_id: contato.id ?? null,
    contato_nome: contato.nome || null,
    vendedor_id: o.vendedor?.id ?? null,
    loja_id: o.loja?.id ?? null,
    unidade_negocio_id: o.loja?.unidadeNegocio?.id ?? null,
    raw_data: o,
    synced_at: nowIso(),
    updated_at: nowIso(),
  }, { onConflict: "bling_id" });
  if (error) throw error;
}

async function syncOrders(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;
  const lojas = new Map<number, number | null>();

  await paginar(token, "/pedidos/vendas", async (pedidos) => {
    for (const o of pedidos) {
      anotarLoja(lojas, o);
      try { await upsertPedidoDaLista(admin, o); synced++; }
      catch (e) { console.error("[bling2-sync] pedido falhou:", e); failed++; }
    }
  });

  await registrarLojas(admin, lojas);
  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}

// ── Pedidos recentes — rodada de alta frequência ──────────────────────────
// Só a listagem filtrada por data. Sem nada que varra a tabela inteira.
async function syncOrdersRecente(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  const corte = dataDeCorte();
  let synced = 0, failed = 0, primeiroLote = true;
  const lojas = new Map<number, number | null>();

  await paginar(token, `/pedidos/vendas?dataInicial=${corte}`, async (pedidos) => {
    if (primeiroLote) {
      alertaFiltroIgnorado("pedidos", pedidos.map((o: any) => toDate(o.data)), corte);
      primeiroLote = false;
    }
    for (const o of pedidos) {
      anotarLoja(lojas, o);
      try { await upsertPedidoDaLista(admin, o); synced++; }
      catch (e) { console.error("[bling2-sync] pedido recente falhou:", e); failed++; }
    }
  }, 5);

  await registrarLojas(admin, lojas);                                            // teto: 500 pedidos por rodada

  console.log(`[bling2-sync] pedidos recentes (desde ${corte}): ${synced} ok, ${failed} falhas`);
  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Itens dos pedidos (detalhe, 1 chamada por pedido) ──────────────────────

async function syncOrderDetails(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  // Teto por execução: cada pedido é uma chamada + 350ms. Sem teto, a função
  // morre no tempo limite e o log fica preso em 'running'. O cron vai
  // completando em rodadas — por isso o teto, e não a lista inteira.
  const TETO = 200;
  const { data: pedidos } = await admin
    .from("bling2_orders")
    .select("bling_id")
    .is("items", null)
    .order("data", { ascending: false })
    .limit(TETO);

  if (!pedidos?.length) {
    await fecharLog(admin, logId, { synced: 0, failed: 0 });
    return { synced: 0, failed: 0 };
  }

  let synced = 0, failed = 0;
  for (const p of pedidos) {
    try {
      const detail = await blingFetch(token, `/pedidos/vendas/${p.bling_id}`, 1, 1);
      const d = detail.data || {};
      await admin.from("bling2_orders").update({
        // `[]` e não null quando o pedido não tem item: null significa "ainda
        // não busquei" e faria este pedido voltar para a fila para sempre.
        items: d.itens || [],
        observacoes: d.observacoes || d.observacoesInternas || null,
        // ⚠️ `raw_detalhe`, NÃO `raw_data`.
        //
        // `raw_data` pertence à listagem, que roda a cada 30 min e sobrescreve.
        // Enquanto o detalhe era gravado ali, ele durava até a próxima rodada:
        // uma chamada de API por pedido, buscando transporte, etiqueta e
        // endereço de entrega — tudo descartado minutos depois. Nenhuma linha
        // da tabela tinha `itens` dentro do raw_data.
        //
        // É o mesmo apagão que `items`/`observacoes` já evitavam ao ficar de
        // fora do upsert da lista; o raw_data tinha ficado sem essa proteção.
        raw_detalhe: d,
        updated_at: nowIso(),
      }).eq("bling_id", p.bling_id);
      synced++;
    } catch (e) {
      console.error(`[bling2-sync] detalhe do pedido ${p.bling_id} falhou:`, e);
      failed++;
    }
    await sleep(RATE_MS);
  }

  const { count: faltando } = await admin
    .from("bling2_orders").select("id", { count: "exact", head: true }).is("items", null);
  console.log(`[bling2-sync] detalhes: ${synced} ok, ${failed} falhas, ${faltando ?? "?"} pendentes`);

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── NF-e ───────────────────────────────────────────────────────────────────

const NFE_SITUACAO_LABELS: Record<string, string> = {
  "1": "Pendente", "2": "Cancelada", "3": "Aguardando recibo", "4": "Rejeitada",
  "5": "Autorizada", "6": "Emitida DANFE", "7": "Registrada",
  "8": "Aguardando protocolo", "9": "Denegada", "10": "Consulta situação",
  "11": "Bloqueada",
};

function nfeSituacaoLabel(situacao: unknown): string | null {
  if (situacao == null) return null;
  const raw = typeof situacao === "object"
    ? (situacao as any).valor ?? (situacao as any).id
    : situacao;
  if (raw == null) return null;
  const key = String(raw);
  if (!/^\d+$/.test(key)) return key;           // já veio texto
  return NFE_SITUACAO_LABELS[key] || `Situação ${key}`;
}

function extractContatoDoc(contato: any): string | null {
  if (!contato) return null;
  return contato.numeroDocumento || contato.cpfCnpj || contato.cnpj || contato.cpf || null;
}

function extractValorNota(d: any): number | null {
  return toNum(d?.valorNota ?? d?.valorTotal ?? d?.valor ?? d?.total);
}

// Uma NF da LISTAGEM. Compartilhado pela rodada completa e pela incremental.
async function upsertNfeDaLista(admin: Admin, nf: any): Promise<void> {
  // valor_total e contato_cnpj ficam de fora: a LISTA do Bling não os traz.
  // Mandá-los aqui apagaria, a cada rodada, o que o detalhe já preencheu.
  const { error } = await admin.from("bling2_nfe").upsert({
    bling_id: nf.id,
    numero: nf.numero != null ? String(nf.numero) : null,
    serie: nf.serie != null ? String(nf.serie) : null,
    chave_acesso: nf.chaveAcesso || null,
    data_emissao: toDate(nf.dataEmissao),
    contato_nome: nf.contato?.nome || null,
    // O canal de venda vem na PRÓPRIA nota — é o ícone colorido que a tela do
    // Bling mostra ao lado de cada NF. Sem isto, R$ 34 mil de faturamento
    // viram um bolo só, sem saber o que é Shopee, Mercado Livre ou balcão.
    loja_id: nf.loja?.id ?? null,
    unidade_negocio_id: nf.loja?.unidadeNegocio?.id ?? null,
    situacao: nfeSituacaoLabel(nf.situacao),
    xml_url: nf.xml || null,
    pdf_url: nf.pdf || null,
    raw_data: nf,
    synced_at: nowIso(),
    updated_at: nowIso(),
  }, { onConflict: "bling_id" });
  if (error) throw error;
}

// Busca o detalhe de uma NF e grava valor, CNPJ, situação e links.
// Devolve true se gravou.
async function detalharNfe(admin: Admin, token: string, nf: any): Promise<boolean> {
  const detail = await blingFetch(token, `/nfe/${nf.bling_id}`, 1, 1);
  const d = detail.data || {};
  const upd: Record<string, unknown> = { raw_data: d, updated_at: nowIso() };

  const valor = extractValorNota(d);
  const cnpj  = extractContatoDoc(d.contato);
  const situ  = nfeSituacaoLabel(d.situacao);
  // 0 é valor legítimo (NF de remessa) e precisa ser gravado — se ficasse
  // null, esta NF voltaria à fila de detalhe em toda execução, para sempre.
  if (valor != null) upd.valor_total = valor;
  if (cnpj) upd.contato_cnpj = cnpj;
  if (situ) upd.situacao = situ;
  if (d.contato?.nome) upd.contato_nome = d.contato.nome;
  if (d.chaveAcesso) upd.chave_acesso = d.chaveAcesso;
  if (d.observacoes || d.informacoesAdicionais) {
    upd.informacoes_adicionais = d.informacoesAdicionais || d.observacoes;
  }
  const pdf = d.pdf || d.linkPDF || d.linkPdf || d.linkDanfe || d.danfe || null;
  if (pdf) upd.pdf_url = pdf;
  if (d.xml) upd.xml_url = d.xml;

  await admin.from("bling2_nfe").update(upd).eq("id", nf.id);
  return true;
}

// ── NF-e recentes — rodada de alta frequência ─────────────────────────────
//
// É a rodada que faz a NF da venda on-line aparecer em minutos, e não no dia
// seguinte. Faz DUAS coisas e mais nada: lista a janela e detalha o que veio
// dela sem valor.
//
// ⚠️ O que ela deliberadamente NÃO faz, e o motivo:
//
// • O passo das "NFs sumidas" (nota cancelada some do /nfe) compara
//   `synced_at` contra o início da rodada, sobre a tabela INTEIRA. Numa
//   rodada que só toca a janela recente, TODO o histórico ficaria para trás e
//   entraria na fila de reconsulta — 40 chamadas por execução, a cada meia
//   hora, para sempre, sem achar nada. Cancelamento continua sendo detectado
//   pela rodada completa diária.
// • O backfill de detalhe de histórico, pelo mesmo motivo: é varredura de
//   tabela cheia e não tem o que fazer numa rodada de 30 em 30 minutos.
async function syncNFeRecente(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  const corte = dataDeCorte();
  const inicioDaRodada = nowIso();
  let synced = 0, failed = 0, primeiroLote = true;
  const lojasR = new Map<number, number | null>();

  await paginar(token, `/nfe?dataEmissaoInicial=${corte}`, async (nfes) => {
    if (primeiroLote) {
      alertaFiltroIgnorado("NF-e", nfes.map((n: any) => toDate(n.dataEmissao)), corte);
      primeiroLote = false;
    }
    for (const nf of nfes) {
      anotarLoja(lojasR, nf);
      try { await upsertNfeDaLista(admin, nf); synced++; }
      catch (e) { console.error("[bling2-sync] NF-e recente falhou:", e); failed++; }
    }
  }, 5);

  await registrarLojas(admin, lojasR);                                            // teto: 500 notas por rodada

  // ── Cancelamento, DENTRO da janela ──────────────────────────────────────
  //
  // O Bling não devolve nota cancelada na listagem: ela simplesmente some. Se
  // a nota some e a gente não repara, ela fica marcada como válida para
  // sempre — e continua somando no faturamento por canal. Nota de R$ 16.800
  // cancelada é metade do faturamento do mês virando ficção.
  //
  // Antes isso só era detectado pela rodada completa das 14:30: até 24h
  // contando venda que não existe.
  //
  // ⚠️ O que torna isto barato — e o motivo de eu ter deixado de fora antes —
  // é o `gte(data_emissao, corte)`. Sem esse filtro, a comparação por
  // `synced_at` roda contra a tabela INTEIRA e todo o histórico parece ter
  // "sumido" a cada rodada: 20 reconsultas inúteis a cada 30 minutos, para
  // sempre. Com a janela, o candidato é só a nota recente que a listagem
  // desta rodada NÃO trouxe — tipicamente zero, ou a que acabou de ser
  // cancelada.
  try {
    const { data: sumidas } = await admin
      .from("bling2_nfe")
      .select("id, bling_id, numero, situacao")
      .gte("data_emissao", corte)
      .lt("synced_at", inicioDaRodada)
      // Nota já sabidamente inválida não precisa ser reconsultada de novo —
      // é o que faz isto convergir em vez de repetir para sempre.
      .not("situacao", "in", '("Cancelada","Denegada","Rejeitada","Bloqueada")')
      .order("data_emissao", { ascending: false })
      .limit(20);

    for (const nf of semvalorSeguro(sumidas)) {
      try {
        const detail = await blingFetch(token, `/nfe/${nf.bling_id}`, 1, 1);
        const situ = nfeSituacaoLabel(detail.data?.situacao);
        if (situ && situ !== nf.situacao) {
          console.log(`[bling2-sync] NF ${nf.numero}: ${nf.situacao} → ${situ} (sumiu da listagem)`);
        }
        await admin.from("bling2_nfe").update({
          situacao: situ ?? nf.situacao,
          raw_data: detail.data || {},
          synced_at: nowIso(),
          updated_at: nowIso(),
        }).eq("id", nf.id);
      } catch (e) {
        // Nota que o Bling não devolve nem por id pode ter sido excluída de
        // vez. Não é falha do sync.
        console.error(`[bling2-sync] recheque da NF ${nf.numero} falhou:`, e);
      }
      await sleep(RATE_MS);
    }
    if (sumidas?.length) console.log(`[bling2-sync] rechecadas ${sumidas.length} notas da janela`);
  } catch (e) {
    // Recheque é complemento: falhar aqui não invalida a listagem acima.
    console.error("[bling2-sync] recheque de cancelamento falhou:", e);
  }

  // Detalhe só do que está DENTRO da janela e ainda sem valor. É aqui que a
  // nota ganha valor, CNPJ e o link do DANFE.
  const { data: semvalor } = await admin
    .from("bling2_nfe")
    .select("id, bling_id")
    .is("valor_total", null)
    .gte("data_emissao", corte)
    .order("data_emissao", { ascending: false })
    .limit(40);

  let detalhadas = 0;
  for (const nf of (semvalorSeguro(semvalor))) {
    try { await detalharNfe(admin, token, nf); detalhadas++; }
    catch (e) {
      console.error(`[bling2-sync] detalhe recente da NF ${nf.bling_id} falhou:`, e);
      failed++;
    }
    await sleep(RATE_MS);
  }

  console.log(`[bling2-sync] NF-e recentes (desde ${corte}): ${synced} listadas, ` +
    `${detalhadas} detalhadas, ${failed} falhas`);
  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}

// `select` do supabase-js devolve null em erro; sem isto o `for..of` estoura.
function semvalorSeguro(rows: any): any[] {
  return Array.isArray(rows) ? rows : [];
}

async function syncNFe(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;
  const inicioDaRodada = nowIso();

  // Passo 1 — a listagem.
  const lojas = new Map<number, number | null>();
  await paginar(token, "/nfe", async (nfes) => {
    for (const nf of nfes) {
      anotarLoja(lojas, nf);
      try { await upsertNfeDaLista(admin, nf); synced++; }
      catch (e) { console.error("[bling2-sync] NF-e falhou:", e); failed++; }
    }
  });
  await registrarLojas(admin, lojas);

  // Passo 2 — as que SUMIRAM da listagem.
  //
  // ⚠️ O endpoint /nfe NÃO devolve nota cancelada: ela simplesmente some. Sem
  // este passo, a situação congela no último valor visto ("Emitida DANFE") e
  // uma nota cancelada continua parecendo válida para sempre. O detalhe
  // (/nfe/{id}) funciona para nota cancelada.
  //
  // O filtro de situação é o que faz isto convergir: nota já sabidamente
  // inválida não precisa ser reconsultada de novo, todo santo dia.
  try {
    const { data: sumidas } = await admin
      .from("bling2_nfe")
      .select("id, bling_id, numero, situacao")
      .lt("synced_at", inicioDaRodada)
      .not("situacao", "in", '("Cancelada","Denegada","Rejeitada","Bloqueada")')
      .order("synced_at", { ascending: false })
      .limit(20);   // ver TETOS abaixo

    for (const nf of (sumidas || [])) {
      try {
        const detail = await blingFetch(token, `/nfe/${nf.bling_id}`, 1, 1);
        const d = detail.data || {};
        const situ = nfeSituacaoLabel(d.situacao);
        if (situ && situ !== nf.situacao) {
          console.log(`[bling2-sync] NF ${nf.numero}: ${nf.situacao} → ${situ} (sumiu da lista)`);
        }
        await admin.from("bling2_nfe").update({
          situacao: situ ?? nf.situacao,
          raw_data: d,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }).eq("id", nf.id);
        synced++;
      } catch (e) {
        console.error(`[bling2-sync] detalhe da NF sumida ${nf.numero} falhou:`, e);
      }
      await sleep(RATE_MS);
    }
  } catch (e) {
    console.error("[bling2-sync] etapa de NFs sumidas falhou:", e);
  }

  // Passo 3 — detalhe das NFs sem valor. Valor total e CNPJ só existem no
  // detalhe. Teto de 120 por execução para caber no tempo da função.
  const { data: semDetalhe } = await admin
    .from("bling2_nfe")
    .select("id, bling_id")
    .is("valor_total", null)
    .order("data_emissao", { ascending: false })
    // ── TETOS: por que 40, e não 120 ──────────────────────────────────────
    // A conta de tempo que eu tinha feito estava errada: contei só os 350ms de
    // pausa entre chamadas e esqueci a latência da própria API. Cada detalhe
    // custa ~1s de verdade, não 350ms. Com 120 + 40 da etapa das sumidas, a
    // rodada passava dos 150s do edge function e MORRIA — sem nunca fechar o
    // log, que ficava preso em `running` para sempre.
    //
    // 40 detalhes + 20 sumidas ≈ 60s, com folga. O que sobra vai na próxima
    // rodada: as notas do dia já chegam pela incremental de :15/:45, então a
    // completa não precisa ter pressa com o histórico.
    .limit(40);

  let enriquecidas = 0;
  for (const nf of semvalorSeguro(semDetalhe)) {
    try { await detalharNfe(admin, token, nf); enriquecidas++; }
    catch (e) {
      console.error(`[bling2-sync] detalhe da NF ${nf.bling_id} falhou:`, e);
      failed++;
    }
    await sleep(RATE_MS);
  }
  if (enriquecidas) console.log(`[bling2-sync] NF-e detalhadas: ${enriquecidas}`);

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Contas a pagar / receber ───────────────────────────────────────────────
//
// ⚠️ Diferença deliberada em relação ao Bling 1: lá estas contas caem em
// `purchase_payables` / `receivables`, que são as tabelas OPERACIONAIS do
// financeiro. Aqui ficam em espelho próprio. Se caíssem lá, o fluxo de caixa
// passaria a somar as duas empresas sem ninguém ter pedido.

// Cache de nome por id — /contas/* costuma trazer o contato só com id.
function criarResolvedorDeNome(admin: Admin) {
  const cache = new Map<number, string | null>();
  return async (conta: any, rotuloVazio: string): Promise<{ id: number | null; nome: string }> => {
    const id = Number(
      conta.contato?.id ?? conta.fornecedor?.id ?? conta.cliente?.id ?? 0
    ) || null;
    const direto = conta.contato?.nome || conta.fornecedor?.nome
      || conta.cliente?.nome || conta.contato?.fantasia;
    if (direto) return { id, nome: String(direto) };
    if (id) {
      if (!cache.has(id)) {
        const { data: c } = await admin
          .from("bling2_contacts").select("nome, fantasia").eq("bling_id", id).maybeSingle();
        cache.set(id, (c?.nome as string) || (c?.fantasia as string) || null);
      }
      const nome = cache.get(id);
      if (nome) return { id, nome };
    }
    return { id, nome: rotuloVazio };
  };
}

async function syncContasPagar(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;
  const resolver = criarResolvedorDeNome(admin);

  await paginar(token, "/contas/pagar", async (contas) => {
    for (const c of contas) {
      try {
        const { id, nome } = await resolver(c, "Fornecedor não identificado");
        await admin.from("bling2_contas_pagar").upsert({
          bling_id: c.id,
          numero: String(c.numeroDocumento || c.numero || c.id),
          fornecedor_id: id,
          fornecedor: nome,
          valor: toNum(c.valor ?? c.valorTotal) ?? 0,
          saldo: toNum(c.saldo),
          vencimento: toDate(c.vencimento || c.dataVencimento),
          data_emissao: toDate(c.dataEmissao || c.data),
          data_pagamento: toDate(c.dataPagamento || c.dataBaixa),
          // Situação guardada CRUA (o código do Bling). Traduzir aqui criaria
          // um segundo vocabulário de status para manter; a tela traduz.
          situacao: c.situacao != null ? String(c.situacao) : null,
          historico: c.historico || c.observacoes || null,
          raw_data: c,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        synced++;
      } catch (e) {
        console.error("[bling2-sync] conta a pagar falhou:", e);
        failed++;
      }
    }
  });

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}

async function syncContasReceber(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;
  const resolver = criarResolvedorDeNome(admin);

  await paginar(token, "/contas/receber", async (contas) => {
    for (const c of contas) {
      try {
        const { id, nome } = await resolver(c, "Cliente não identificado");
        await admin.from("bling2_contas_receber").upsert({
          bling_id: c.id,
          numero: String(c.numeroDocumento || c.numero || c.id),
          cliente_id: id,
          cliente: nome,
          valor: toNum(c.valor ?? c.valorTotal) ?? 0,
          saldo: toNum(c.saldo),
          vencimento: toDate(c.vencimento || c.dataVencimento),
          data_emissao: toDate(c.dataEmissao || c.data),
          data_pagamento: toDate(c.dataPagamento || c.dataBaixa),
          situacao: c.situacao != null ? String(c.situacao) : null,
          historico: c.historico || c.observacoes || null,
          raw_data: c,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        synced++;
      } catch (e) {
        console.error("[bling2-sync] conta a receber falhou:", e);
        failed++;
      }
    }
  });

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Pedidos de compra ──────────────────────────────────────────────────────

async function syncPedidosCompra(admin: Admin, token: string, logId: string): Promise<SyncResult> {
  let synced = 0, failed = 0;

  await paginar(token, "/pedidos/compras", async (pedidos) => {
    for (const p of pedidos) {
      try {
        const forn = p.fornecedor || p.contato || {};
        await admin.from("bling2_pedidos_compra").upsert({
          bling_id: p.id,
          numero: p.numero != null ? String(p.numero) : String(p.id),
          fornecedor_id: forn.id ?? null,
          fornecedor: forn.nome || forn.fantasia || "Fornecedor não identificado",
          fornecedor_documento: forn.numeroDocumento || null,
          total: toNum(p.total ?? p.totalProdutos) ?? 0,
          data: toDate(p.data),
          data_prevista: toDate(p.dataPrevista),
          situacao: p.situacao != null
            ? String(typeof p.situacao === "object" ? (p.situacao.valor ?? p.situacao.id) : p.situacao)
            : null,
          items: p.itens || p.items || [],
          raw_data: p,
          synced_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: "bling_id" });
        synced++;
      } catch (e) {
        console.error("[bling2-sync] pedido de compra falhou:", e);
        failed++;
      }
    }
  });

  await fecharLog(admin, logId, { synced, failed });
  return { synced, failed };
}


// ── Roteamento ─────────────────────────────────────────────────────────────

const SYNCS: Record<string, (a: Admin, t: string, l: string) => Promise<SyncResult>> = {
  products: syncProducts,
  variacoes: syncVariacoes,
  stock: syncStock,
  contacts: syncContacts,
  vendedores: syncVendedores,
  orders: syncOrders,
  order_details: syncOrderDetails,
  nfe: syncNFe,
  contas_pagar: syncContasPagar,
  contas_receber: syncContasReceber,
  pedidos_compra: syncPedidosCompra,
  // Rodadas incrementais (alta frequência). Ficam FORA do "all": rodar as duas
  // versões na mesma passada seria trabalho repetido.
  orders_recente: syncOrdersRecente,
  nfe_recente: syncNFeRecente,
};

// Ordem importa: `variacoes` e `stock` leem `bling2_products`; contas leem
// `bling2_contacts` para resolver nome; `order_details` lê `bling2_orders`.
const ORDEM = [
  "products", "variacoes", "stock", "contacts", "vendedores",
  "orders", "order_details", "nfe",
  "contas_pagar", "contas_receber", "pedidos_compra",
];

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("BLING2_CLIENT_ID")!;
    const clientSecret = Deno.env.get("BLING2_CLIENT_SECRET")!;

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Cron entra pelo segredo; usuário entra pelo JWT.
    const cronSecret = req.headers.get("X-Cron-Secret");
    const expectedCron = Deno.env.get("CRON_SECRET");
    const isCron = !!(cronSecret && expectedCron && cronSecret === expectedCron);

    let user: any = null;
    if (!isCron) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing authorization" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { data: { user: u }, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (error || !u) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      user = u;
    }

    const body = await req.json().catch(() => ({}));
    const entity = body.entity as string | undefined;

    if (!entity) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Informe entity. Aceitos: all, ${ORDEM.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aRodar = entity === "all" ? ORDEM : [entity];
    const desconhecida = aRodar.find((e) => !SYNCS[e]);
    if (desconhecida) {
      return new Response(
        JSON.stringify({ success: false, error: `Entity desconhecida: ${desconhecida}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let { token, error: tokenError } = await getValidToken(admin, clientId, clientSecret);
    if (tokenError || !token) {
      return new Response(
        JSON.stringify({ success: false, error: tokenError || "Sem token válido" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 401 no meio da rodada = token morreu depois do check. Renova à força e
    // repete UMA vez; o token novo vale para as entidades seguintes também.
    const rodarComRetry = async (
      nome: string, fn: (a: Admin, t: string, l: string) => Promise<SyncResult>, logId: string
    ): Promise<SyncResult> => {
      try {
        return await fn(admin, token!, logId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("error 401") || msg.includes("invalid_token")) {
          console.log(`[bling2-sync] 401 em ${nome}, renovando token e repetindo...`);
          const novo = await getValidToken(admin, clientId, clientSecret, true);
          if (novo.error || !novo.token) throw new Error(novo.error || "Renovação falhou após 401");
          token = novo.token;
          return await fn(admin, novo.token, logId);
        }
        throw e;
      }
    };

    // ── Rodadas que morreram sem fechar o log ───────────────────────────────
    // Quando a function estoura o tempo, ela some no meio: a linha fica em
    // `running` para sempre e a tela mostra um spinner eterno. Aconteceu duas
    // vezes com o `nfe` na primeira execução. Nenhuma rodada honesta passa de
    // 3 minutos, então o que estiver `running` há mais de 10 é cadáver.
    await admin.from("bling2_sync_log")
      .update({
        status: "failed",
        error_message: "sem retorno — a função provavelmente estourou o tempo",
        finished_at: nowIso(),
      })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const results: Record<string, unknown> = {};

    for (const nome of aRodar) {
      const { data: logEntry } = await admin
        .from("bling2_sync_log")
        .insert({ entity_type: nome, status: "running", triggered_by: user?.id || null })
        .select("id")
        .single();
      const logId = logEntry?.id || "";

      try {
        const result = await rodarComRetry(nome, SYNCS[nome], logId);
        // ⚠️ Zero sucessos com pelo menos uma falha NÃO é "completed". Na
        // primeira execução o `stock` gravou completed com 0 sincronizados e 6
        // falhas — a tela mostrou sucesso enquanto nenhum produto tinha saldo.
        // Status que mente é pior que erro: ninguém vai olhar.
        const tudoFalhou = result.synced === 0 && result.failed > 0;
        await admin.from("bling2_sync_log").update({
          status: tudoFalhou ? "failed" : "completed",
          records_synced: result.synced,
          records_failed: result.failed,
          error_message: tudoFalhou
            ? `nenhum dos ${result.failed} registros foi gravado — veja os logs da function`
            : null,
          finished_at: nowIso(),
        }).eq("id", logId);
        results[nome] = result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        console.error(`[bling2-sync] ${nome} FALHOU:`, msg);
        await admin.from("bling2_sync_log").update({
          status: "failed", error_message: msg, finished_at: nowIso(),
        }).eq("id", logId);
        results[nome] = { error: msg };
        // Segue para a próxima entidade: uma falhar não pode derrubar o resto.
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("[bling2-sync] erro:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});
