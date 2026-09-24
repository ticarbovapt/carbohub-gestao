// ═══════════════════════════════════════════════════════════════════════════
// NFS-e Nacional (ADN) — FASE 0: a SONDA
//
// Pedido do dono do processo em 23/09/2026: trazer o Portal Nacional da NFS-e
// para dentro do sistema, no Finanças, "igual com o Bling".
//
// ⚠️ ESTA FUNÇÃO SÓ LÊ. Não grava linha nenhuma, em tabela nenhuma. Ela existe
// para responder UMA pergunta antes de qualquer tabela ou tela existir:
//
//     as notas da empresa estão MESMO no ADN?
//
// Município que não aderiu ao sistema nacional emite no sistema próprio, e
// essas notas podem simplesmente não estar aqui. Criar tabela, cron e tela
// primeiro seria construir em cima de um poço vazio — e descobrir isso depois
// de a tela estar no ar é a doença mais cara deste repo.
//
// A sonda também é o que define o ESQUEMA: só depois de ver o documento real é
// que dá para escrever as colunas sem adivinhar.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ NÃO É WEBHOOK — é NSU, e a diferença muda o desenho
//
// O Bling empurra evento. O ADN não: ele guarda uma fila por interessado e
// entrega por NSU (Número Sequencial Único). Você pede `GET /dfe/{NSU}` e ele
// devolve o que veio DEPOIS daquele número. Quem guarda o último lido é a
// gente — mesmo padrão do `last_synced_at` do Mercado Livre.
//
// E um endereço só serve para os DOIS casos pedidos: o ADN distribui o que o
// CNPJ é emitente, tomador OU intermediário. Não são duas integrações.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ A AUTENTICAÇÃO É O CERTIFICADO, não uma chave de API
//
// mTLS com certificado ICP-Brasil A1. O Deno faz isso com
// `Deno.createHttpClient({ cert, key })`, e isso FUNCIONA em Edge Function —
// a limitação conhecida (`Deno.startTls` descartar cert/key) é só para conexão
// Postgres, não para chamada HTTPS.
//
// Os dois PEM moram em secrets. ⚠️ A chave privada vai SEM senha, porque o Deno
// não abre chave cifrada — o que torna `NFSE_KEY_PEM` o segredo mais sensível
// do projeto: quem o tem assina documento fiscal no CNPJ da empresa.
//
// ⚠️ AUSÊNCIA FECHA, nos dois sentidos: sem `CRON_SECRET` a função recusa (500,
// problema nosso) e sem os PEM ela recusa também, dizendo QUAL falta. Nunca
// tenta sem certificado — a falha do ADN nesse caso é genérica e mandaria
// procurar no lugar errado.
//
// Uso:
//   curl -s "https://<projeto>.supabase.co/functions/v1/nfse-nacional?secret=<CRON_SECRET>&nsu=0"
//   &ambiente=restrita   → produção restrita (notas de TESTE)
//   &ambiente=producao   → produção (o padrão; é onde estão as notas reais)
//   &caminho=…           → sobrescreve a rota, para sondar variação sem deploy
//   &abrir=1             → descompacta os `ArquivoXml` do lote e devolve o XML
//   &so=<n>              → com `abrir`, devolve só esse NSU (o lote inteiro é grande)
//   &ingerir=1           → FASE 2: puxa do último NSU gravado em diante e GRAVA
//
// ⚠️ `ingerir=1` é o ÚNICO modo que escreve. Sem ele a função continua sendo a
// sonda de leitura — e é assim que dá para investigar o ADN em produção sem
// mexer no log fiscal.
//
// ⚠️ O `abrir` existe porque o `ArquivoXml` é GZip+Base64 e uma linha dessas tem
// milhares de caracteres: copiá-la para fora e descompactar do outro lado
// corrompe o payload em silêncio (o cabeçalho gzip sobrevive, o primeiro bloco
// deflate não). Descompactar AQUI é o mesmo código que a ingestão vai usar.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASES: Record<string, string> = {
  // Endereços do Sistema Nacional NFS-e. `restrita` é o ambiente de homologação
  // do gov.br: ele responde, mas só tem nota de TESTE — não serve para
  // responder "as nossas notas estão lá?".
  producao: "https://adn.nfse.gov.br",
  restrita: "https://adn.producaorestrita.nfse.gov.br",
};

// GZip+Base64 → texto. `DecompressionStream` é nativo do Deno; não há
// dependência externa para instalar, e é o mesmo caminho que a ingestão usará.
async function abrirGzipB64(b64: string): Promise<string> {
  const limpo = b64.replace(/\s+/g, "");
  const bin = Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
  const fluxo = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(fluxo).text();
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 2 — a ingestão
//
// ⚠️ O ADN entrega por NSU e NÃO tem webhook: ele guarda uma fila por
// interessado e devolve o que veio DEPOIS do número pedido. Quem guarda o
// último lido é a gente — e aqui isso é `max(nsu)` do próprio log, nunca uma
// coluna à parte que possa divergir dele.
//
// ⚠️ PAGINAÇÃO COM TETO, e o teto não é medo de loop infinito. O ADN pune
// consulta repetida sem documento novo ("consumo indevido"), e a fila tem anos
// de histórico: a primeira rodada percorreria centenas de lotes de uma vez,
// exatamente o que faz um serviço fiscal fechar a porta. Com o teto ela avança
// um pedaço por hora e se completa sozinha nas rodadas seguintes — que é a
// mesma propriedade que torna a rodada interrompida segura de repetir.
// ═══════════════════════════════════════════════════════════════════════════
const MAX_LOTES = 20;

async function ingerir(base: string, ambiente: string, cli: Deno.HttpClient) {
  const urlSb = Deno.env.get("SUPABASE_URL");
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!urlSb || !chave) {
    // Ausência FECHA: sem service role não há gravação, e tentar assim mesmo
    // acabaria em RLS recusando linha a linha — erro que se lê como "o ADN não
    // mandou nada", que é o diagnóstico errado.
    return json({ ok: false, erro: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes" }, 500);
  }
  const sb = createClient(urlSb, chave, { auth: { persistSession: false } });

  const t0 = Date.now();
  let nsu = 0;
  // ⚠️ Declarado FORA do try: no caminho de falha o log precisa dizer de ONDE
  // a rodada partiu. Na primeira rodada real ele ficou dentro, e a linha saiu
  // com `nsu_antes = nsu_depois = 762` — uma rodada que trouxe 762 documentos
  // registrada como se não tivesse andado.
  let nsuInicial = 0;
  let lotes = 0, gravados = 0, repetidos = 0, malformados = 0;
  let status = "";
  let erro: string | null = null;

  try {
    const { data: ultimo, error: eNsu } = await sb.rpc("carbo_nfse_ultimo_nsu", {
      p_ambiente: ambiente,
    });
    if (eNsu) throw new Error(`carbo_nfse_ultimo_nsu: ${eNsu.message}`);
    nsu = Number(ultimo ?? 0);
    nsuInicial = nsu;

    while (lotes < MAX_LOTES) {
      const alvo = `${base}/contribuintes/DFe/${nsu}`;
      const res = await fetch(alvo, { client: cli, headers: { Accept: "application/json" } });
      const texto = await res.text();
      let corpo: Record<string, unknown> = {};
      try { corpo = JSON.parse(texto); } catch { /* fica vazio */ }

      // ⚠️ O ADN responde HTTP **404** quando não há mais documento — o fim
      // NORMAL da fila, não uma falha. Medido na primeira rodada real: ela
      // trouxe 762 documentos e terminou com `ok: false` e um 502.
      //
      // Tratar isso como erro é caro de um jeito específico: são 24 linhas de
      // erro por dia num log que existe justamente para ser olhado quando algo
      // quebra. Erro que aparece todo dia sem nada estar errado é o mecanismo
      // que fez o `CRON_SECRET` ausente passar 25 h despercebido.
      //
      // E o que separa os dois NÃO é o status HTTP, é o corpo: o próprio 404
      // vem com `NENHUM_DOCUMENTO_LOCALIZADO` / `E2220`. Um 404 sem isso
      // continua sendo erro — seria o endereço do ADN tendo mudado.
      const semDocumento =
        String(corpo?.StatusProcessamento ?? "") === "NENHUM_DOCUMENTO_LOCALIZADO" ||
        (Array.isArray((corpo as { Erros?: { Codigo?: string }[] })?.Erros) &&
          (corpo as { Erros: { Codigo?: string }[] }).Erros.some((x) => x?.Codigo === "E2220"));
      if (semDocumento) { status = "FIM_DA_FILA"; break; }

      if (!res.ok) {
        // ⚠️ Para a rodada e DIZ o corpo. `return []` mudo aqui repetiria o
        // defeito do `pullMercadoLivre`: falha de API ficando idêntica a
        // "não havia documento".
        throw new Error(`ADN ${res.status} em ${alvo}: ${texto.slice(0, 400)}`);
      }
      status = String(corpo?.StatusProcessamento ?? "");

      const lote = Array.isArray(corpo?.LoteDFe) ? corpo.LoteDFe : [];
      if (lote.length === 0) break;

      // Descompacta aqui: o banco recebe o XML já legível. Guardar o GZip
      // obrigaria toda consulta a saber descompactar, e a view não sabe.
      for (const doc of lote) {
        if (typeof doc?.ArquivoXml === "string") {
          try {
            doc.ArquivoXml = await abrirGzipB64(doc.ArquivoXml);
          } catch (e) {
            // ⚠️ NÃO derruba o lote e NÃO descarta o documento: entra com o
            // conteúdo cru e o banco o marca `xml_ok = false`. Descartar
            // perderia o documento para sempre, porque o NSU avança.
            doc._gzip_erro = String(e);
          }
        }
      }

      const { data: r, error: eGrav } = await sb.rpc("carbo_nfse_gravar_lote", {
        p_lote: lote,
        p_ambiente: ambiente,
      });
      if (eGrav) throw new Error(`carbo_nfse_gravar_lote: ${eGrav.message}`);
      const linha = Array.isArray(r) ? r[0] : r;
      gravados += Number(linha?.gravados ?? 0);
      repetidos += Number(linha?.repetidos ?? 0);
      malformados += Number(linha?.malformados ?? 0);
      lotes++;

      // ⚠️ O próximo NSU sai do MAIOR do lote, não de `nsu + lote.length`: o
      // ADN pula números (documento que não é nosso consome NSU da fila
      // geral), e somar o tamanho travaria o ponteiro antes do buraco — a
      // integração pararia de avançar sem erro nenhum.
      const maior = Math.max(...lote.map((d: Record<string, unknown>) => Number(d?.NSU ?? 0)));
      if (!Number.isFinite(maior) || maior <= nsu) break;
      nsu = maior;
    }

    await sb.from("carbo_nfse_sync_log").insert({
      ambiente, nsu_antes: nsuInicial, nsu_depois: nsu, lotes,
      gravados, repetidos, malformados, status, ms: Date.now() - t0,
    });
    return json({ ok: true, ambiente, nsu_antes: nsuInicial, nsu_depois: nsu,
                  lotes, gravados, repetidos, malformados, status,
                  ms: Date.now() - t0 });
  } catch (e) {
    erro = String(e);
    // ⚠️ A falha também vira LINHA. Sem isso, rodada que morre no meio deixa
    // o mesmo rastro de uma rodada sem documento — e o `pg_cron` marca
    // `succeeded` nos dois casos, porque o sucesso dele é ter POSTADO.
    await sb.from("carbo_nfse_sync_log").insert({
      ambiente, nsu_antes: nsuInicial, nsu_depois: nsu, lotes,
      gravados, repetidos, malformados, status, erro, ms: Date.now() - t0,
    });
    return json({ ok: false, ambiente, nsu, lotes, gravados, erro }, 502);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Portaria ──────────────────────────────────────────────────────────────
  // ⚠️ Ausência FECHA. 500 para segredo ausente (problema nosso), 401 para
  // segredo errado (problema de quem chama). Um 401 para os dois faz falha de
  // configuração se disfarçar de chamada indevida — foi esse disfarce que já
  // custou um dia de diagnóstico neste projeto.
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo) {
    console.error("[nfse-nacional] CRON_SECRET ausente no servidor");
    return json({ ok: false, erro: "CRON_SECRET ausente no servidor" }, 500);
  }
  const informado = req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  if (informado !== segredo) return json({ ok: false, erro: "nao autorizado" }, 401);

  // ── O certificado ─────────────────────────────────────────────────────────
  const cert = Deno.env.get("NFSE_CERT_PEM");
  const key = Deno.env.get("NFSE_KEY_PEM");
  const faltando = [!cert && "NFSE_CERT_PEM", !key && "NFSE_KEY_PEM"].filter(Boolean);
  if (faltando.length) {
    // Dizer QUAL falta, e não só "faltou certificado": são dois secrets e colar
    // um e esquecer o outro é o engano natural.
    return json({
      ok: false,
      erro: `Secret ausente: ${faltando.join(", ")}`,
      dica: "Supabase → Edge Functions → Secrets. O conteúdo INTEIRO do PEM, com as linhas BEGIN/END.",
    }, 500);
  }
  // ⚠️ Chave cifrada é um erro CALADO no Deno — o handshake falha com uma
  // mensagem de TLS genérica, e o diagnóstico vai parar no ADN em vez de aqui.
  if (/ENCRYPTED/i.test(key!)) {
    return json({
      ok: false,
      erro: "NFSE_KEY_PEM está com senha (ENCRYPTED PRIVATE KEY).",
      dica: "Refaça com `openssl pkcs12 -in cert.pfx -nocerts -nodes -out key.pem` — é o -nodes que tira a senha.",
    }, 500);
  }

  const ambiente = url.searchParams.get("ambiente") === "restrita" ? "restrita" : "producao";
  const base = BASES[ambiente];
  const nsu = url.searchParams.get("nsu") ?? "0";

  // ── &danfse=<chave> — CAÇA ao endereço do PDF ────────────────────────────
  //
  // ⚠️ O DANFSE NÃO está no ADN, e isso foi medido em 24/09/2026:
  //   /contribuintes/DANFSE/<chave>  → 404  (o serviço respondeu: rota não existe)
  //   /danfse/<chave>                → 503  ("No server is available") — veio do
  //                                          GATEWAY, ou seja, nem há backend
  //                                          registrado nesse prefixo.
  // Dois desfechos DIFERENTES, e a diferença é a informação: o segundo não é
  // "rota errada", é "host errado".
  //
  // Este modo tenta os candidatos conhecidos do sistema nacional numa chamada
  // só e devolve o status de cada um — em vez de um deploy por tentativa.
  //
  // ⚠️ A LISTA DE HOSTS É FECHADA, e isso não é zelo: esta função apresenta o
  // CERTIFICADO A1 DA EMPRESA em cada requisição. Um `&host=` livre a
  // transformaria num proxy que assina, no CNPJ da Carbo, contra qualquer
  // servidor que alguém escolher.
  if (url.searchParams.has("danfse")) {
    const chave = (url.searchParams.get("danfse") ?? "").replace(/\D/g, "");
    if (chave.length !== 50) {
      return json({ ok: false, erro: "chave de acesso deve ter 50 dígitos", recebido: chave.length }, 400);
    }
    const candidatos = [
      `https://sefin.nfse.gov.br/sefinnacional/danfse/${chave}`,
      `https://adn.nfse.gov.br/contribuintes/danfse/${chave}`,
      `https://adn.nfse.gov.br/contribuintes/DFe/danfse/${chave}`,
      `https://www.nfse.gov.br/danfse/${chave}`,
    ];
    let cli: Deno.HttpClient;
    try {
      cli = Deno.createHttpClient({ cert, key });
    } catch (e) {
      return json({ ok: false, etapa: "createHttpClient", erro: String(e) }, 500);
    }
    const achados: unknown[] = [];
    try {
      for (const alvo of candidatos) {
        const t = Date.now();
        try {
          const r = await fetch(alvo, { client: cli, headers: { Accept: "application/pdf,*/*" } });
          const tipo = r.headers.get("content-type") ?? "";
          // ⚠️ NÃO baixa o corpo inteiro: um PDF de vários MB no JSON da
          // resposta só atrapalha. O que responde "é o PDF?" é o
          // content-type mais o tamanho, não o conteúdo.
          const bruto = await r.arrayBuffer();
          achados.push({
            alvo, http: r.status, tipo, bytes: bruto.byteLength, ms: Date.now() - t,
            e_pdf: tipo.includes("pdf") || (bruto.byteLength > 4 &&
              new TextDecoder().decode(new Uint8Array(bruto.slice(0, 4))) === "%PDF"),
          });
        } catch (e) {
          // Falha de rede/TLS num candidato NÃO derruba os outros: "este host
          // não existe" e "este caminho não existe" são respostas diferentes.
          achados.push({ alvo, erro: String(e), ms: Date.now() - t });
        }
      }
    } finally {
      try { cli.close(); } catch { /* nada a fazer */ }
    }
    return json({ ok: true, chave, candidatos: achados });
  }

  // ── &ingerir=1 — a FASE 2: puxa por NSU e grava ──────────────────────────
  if (url.searchParams.get("ingerir") === "1") {
    let cli: Deno.HttpClient;
    try {
      cli = Deno.createHttpClient({ cert, key });
    } catch (e) {
      return json({ ok: false, etapa: "createHttpClient", erro: String(e) }, 500);
    }
    try {
      return await ingerir(base, ambiente, cli);
    } finally {
      try { cli.close(); } catch { /* nada a fazer */ }
    }
  }

  // ⚠️ O caminho é `/contribuintes/DFe/{NSU}`, com o `DFe` em maiúsculas.
  //
  // A primeira versão chamava `/dfe/{NSU}` — escrito de memória — e levou 404.
  // O 404 foi o desfecho BOM: veio em 46 ms, com status HTTP, o que só
  // acontece depois do handshake TLS. Ou seja, ele provou que o certificado
  // funciona e isolou o problema no caminho. Fosse o certificado, a falha
  // seria de TLS e não teria status nenhum.
  //
  // `caminho` fica sobrescrevível pela query de propósito: sondar variação de
  // endereço não pode exigir um deploy por tentativa.
  const caminho = url.searchParams.get("caminho") ?? `contribuintes/DFe/${nsu}`;

  let cliente: Deno.HttpClient;
  try {
    cliente = Deno.createHttpClient({ cert, key });
  } catch (e) {
    return json({
      ok: false,
      etapa: "createHttpClient",
      erro: String(e),
      dica: "PEM malformado. Confira se o cert.pem tem BEGIN CERTIFICATE e o key.pem tem BEGIN PRIVATE KEY.",
    }, 500);
  }

  const alvo = `${base}/${caminho.replace(/^\/+/, "")}`;
  try {
    const t0 = Date.now();
    const res = await fetch(alvo, {
      client: cliente,
      headers: { Accept: "application/json" },
    });
    const texto = await res.text();
    const ms = Date.now() - t0;

    // ⚠️ Devolve o corpo CRU, sem interpretar. A sonda existe para eu ver o
    // formato real; "interpretar" aqui seria inventar o esquema a partir do que
    // eu ACHO que vem, que é exatamente o que ela veio evitar.
    let corpo: unknown = texto;
    try { corpo = JSON.parse(texto); } catch { /* fica como texto */ }

    // ── &abrir=1 — descompacta o XML de cada documento do lote ───────────────
    // ⚠️ Substitui o `ArquivoXml` pelo XML aberto em vez de acrescentar campo:
    // devolver os dois dobraria o tamanho da resposta sem acrescentar nada.
    // Erro de um documento NÃO derruba os outros — ele vira `_erro` naquela
    // linha, porque "um documento estranho" e "o lote inteiro falhou" são
    // diagnósticos diferentes e misturá-los manda procurar no lugar errado.
    if (url.searchParams.get("abrir") === "1" && corpo && typeof corpo === "object") {
      const so = url.searchParams.get("so");
      const lote = (corpo as Record<string, unknown>).LoteDFe;
      if (Array.isArray(lote)) {
        const filtrado = so ? lote.filter((d) => String(d?.NSU) === so) : lote;
        for (const doc of filtrado) {
          if (!doc || typeof doc !== "object") continue;
          const b64 = (doc as Record<string, unknown>).ArquivoXml;
          if (typeof b64 !== "string") continue;
          try {
            (doc as Record<string, unknown>).ArquivoXml = await abrirGzipB64(b64);
          } catch (e) {
            (doc as Record<string, unknown>).ArquivoXml = null;
            (doc as Record<string, unknown>)._erro = String(e);
          }
        }
        (corpo as Record<string, unknown>).LoteDFe = filtrado;
      }
    }

    return json({
      ok: res.ok,
      ambiente,
      alvo,
      http: res.status,
      ms,
      // 200 com lote vazio e 404 significam coisas DIFERENTES: o primeiro é
      // "conectou e não há nada depois deste NSU", o segundo é "este caminho
      // não existe". Misturá-los mandaria procurar no lugar errado.
      leitura: res.status === 200
        ? "conectou e o ADN respondeu — veja `corpo` para o conteúdo"
        : res.status === 403
          ? "certificado recusado ou CNPJ sem cadastro no sistema nacional"
          : res.status === 404
            ? "caminho não encontrado — o endereço do ADN pode ter mudado"
            : "resposta inesperada — veja `corpo`",
      corpo,
    }, 200);
  } catch (e) {
    // ⚠️ Falha de TLS cai aqui, e é o caso mais provável de configuração errada.
    return json({
      ok: false,
      etapa: "fetch",
      ambiente,
      alvo,
      erro: String(e),
      dica: "Erro de TLS costuma ser certificado vencido, do CNPJ errado, ou par cert/key trocado.",
    }, 502);
  } finally {
    try { cliente.close(); } catch { /* nada a fazer */ }
  }
});
