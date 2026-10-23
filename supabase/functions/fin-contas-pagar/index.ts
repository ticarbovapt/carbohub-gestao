// ─────────────────────────────────────────────────────────────────────────────
// fin-contas-pagar — a conta a pagar E a receber NASCEM no Finanças e são
// criadas NO BLING (matriz = conta 1, filial = conta 2), e só depois aparecem
// aqui. O nome ficou "pagar" por história; `tipo` no corpo diz qual ("pagar"
// quando ausente — o que a tela antiga mandava).
//
//   acao "opcoes"       portadores (contas financeiras) do Bling, com os mais usados primeiro
//   acao "cadastros"    formas de pagamento (com juros/multa), categorias e vendedores
//   acao "fornecedores" busca no cadastro de contatos daquela conta (nome, fantasia, CNPJ)
//   acao "criar"        uma conta por parcela, no Bling, e o espelho na hora
//   acao "excluir"      só conta criada AQUI e ainda em aberto lá
//   { ensaio: true }    SQL Editor (X-Cron-Secret): lê os portadores e mostra o
//                        corpo que SERIA enviado — não escreve em lugar nenhum
//
// ⚠️ O BLING PRIMEIRO, e o id dele é a identidade. A linha daqui nasce com o
// `bling_id` que o Bling devolveu (source = 'bling'), e o espelho a atualiza em
// vez de criar outra. Criar aqui e mandar depois daria título em dobro na
// primeira rodada do espelho, calado.
// ⚠️ O espelho também é escrito NA HORA (`bling_contas_pagar` /
// `bling2_contas_pagar`). Sem isso, o aplicador dos 10 min da matriz leria
// "não está mais no Bling" e CANCELARIA a conta que acabou de nascer.
// ⚠️ Parcelada = N contas de ocorrência única. Se a 3ª de 5 for recusada, as
// duas que já nasceram no Bling são EXCLUÍDAS de volta: ou todas, ou nenhuma.
// ⚠️ Liga por CADASTRO (`fin_contas_pagar_config`, por conta), que nasce
// DESLIGADO. Desligado, nada sai daqui.
// ⚠️ NUNCA renova token: matriz perto de vencer pede ao `bling-sync` (o único
// que renova a conta 1); filial perto de vencer pede para tentar em 1 minuto
// (quem renova a conta 2 é o `bling2-sync`, de minuto em minuto).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bling, BlingRecusou, dormir } from "../_shared/blingApi.ts";
import {
  camposNaoGuardados, corpoContaPagar, diaBrasilia, erroDaContaNova, type ContaPagarNova, type TipoConta,
} from "../_shared/blingContasRegra.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const MARGEM_TOKEN_MS = 90 * 1000;
const PAUSA_MS = 350;

type Conta = 1 | 2;
type Db = ReturnType<typeof createClient>;
const INTEGRACAO: Record<Conta, string> = { 1: "bling_integration", 2: "bling2_integration" };
const CONTATOS: Record<Conta, string> = { 1: "bling_contacts", 2: "bling2_contacts" };
const NOME_EMPRESA: Record<Conta, string> = { 1: "matriz", 2: "filial" };
/** O espelho de cada conta e tipo — é dele que sai o "mais usados primeiro". */
const ESPELHO: Record<Conta, Record<TipoConta, string>> = {
  1: { pagar: "bling_contas_pagar", receber: "bling_contas_receber" },
  2: { pagar: "bling2_contas_pagar", receber: "bling2_contas_receber" },
};

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const ok = /^https:\/\/([a-z0-9-]+\.)*carbohub\.com\.br$/.test(o) || /^http:\/\/localhost:\d+$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : "https://finance.carbohub.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function lerToken(db: Db, conta: Conta) {
  const { data } = await db.from(INTEGRACAO[conta]).select("access_token, expires_at")
    .eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle();
  return data as { access_token: string; expires_at: string } | null;
}

/** O token, SÓ LIDO. Matriz perto de vencer: pede ao bling-sync (o único que renova a conta 1). */
async function tokenValido(db: Db, conta: Conta, auth: string | null): Promise<string> {
  let integ = await lerToken(db, conta);
  const perto = (i: typeof integ) => !!i && new Date(i.expires_at).getTime() - Date.now() < MARGEM_TOKEN_MS;
  if (perto(integ) && conta === 1 && auth) {
    await fetch(`${URL_SB}/functions/v1/bling-sync`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "naturezas" }),   // a ação mais leve: só serve para o token ser renovado
    }).catch(() => null);
    integ = await lerToken(db, conta);
  }
  if (!integ?.access_token) throw new Error(`Sem integração ativa com o Bling da ${NOME_EMPRESA[conta]}.`);
  if (perto(integ)) throw new Error(`O token do Bling da ${NOME_EMPRESA[conta]} está sendo renovado — tente de novo em 1 minuto.`);
  return integ.access_token;
}

/** Os portadores (contas financeiras) do Bling, os mais usados primeiro. */
async function opcoes(db: Db, token: string, conta: Conta) {
  const usos = new Map<number, number>();
  if (conta === 1) {
    // Mais usados = o que o histórico da matriz diz (o detalhe traz o portador).
    for (let de = 0; ; de += 1000) {
      const { data } = await db.from("bling_contas_pagar").select("portador:detalhe->portador->>id")
        .not("detalhe", "is", null).order("bling_id").range(de, de + 999);
      for (const r of (data ?? []) as any[]) {
        const id = Number(r.portador);
        if (id > 0) usos.set(id, (usos.get(id) ?? 0) + 1);
      }
      if (!data || data.length < 1000) break;
    }
  }
  let lidos: any[] = [];
  let erro: string | null = null;
  try {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = (await bling(token, "GET", `/contas-contabeis?pagina=${pagina}&limite=100`))?.data ?? [];
      lidos.push(...r);
      if (r.length < 100) break;
      await dormir(PAUSA_MS);
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    lidos = [];
  }
  const nomes = new Map<number, string>();
  for (const p of lidos) {
    const id = Number(p?.id);
    if (id > 0) nomes.set(id, String(p?.descricao ?? p?.nome ?? `Conta ${id}`));
  }
  // Sem a lista do Bling, os usados aparecem pelo id — nunca some a opção.
  const ids = new Set<number>([...nomes.keys(), ...usos.keys()]);
  const portadores = [...ids].map((id) => ({ id, nome: nomes.get(id) ?? `Conta ${id}`, usos: usos.get(id) ?? 0 }))
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome, "pt-BR"));
  return { portadores, erro_portadores: erro, chaves_do_bling: lidos[0] ? Object.keys(lidos[0]) : [] };
}

/** Quantas contas do espelho usam cada id de `campo` no detalhe (forma, categoria, vendedor). */
async function usosNoEspelho(db: Db, tabela: string, campo: string): Promise<Map<number, number>> {
  const usos = new Map<number, number>();
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await db.from(tabela).select(`x:detalhe->${campo}->>id`)
      .not("detalhe", "is", null).order("bling_id").range(de, de + 999);
    if (error) break;   // sem espelho legível: a lista sai sem a ordem de uso, nunca some
    for (const r of (data ?? []) as any[]) {
      const id = Number(r.x);
      if (id > 0) usos.set(id, (usos.get(id) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  return usos;
}

async function lerPaginas(token: string, caminho: string, max = 10): Promise<any[]> {
  const out: any[] = [];
  for (let pagina = 1; pagina <= max; pagina++) {
    const sep = caminho.includes("?") ? "&" : "?";
    const r = (await bling(token, "GET", `${caminho}${sep}pagina=${pagina}&limite=100`))?.data ?? [];
    out.push(...r);
    if (r.length < 100) break;
    await dormir(PAUSA_MS);
  }
  return out;
}

const porUso = <T extends { nome: string; usos: number }>(a: T, b: T) => b.usos - a.usos || a.nome.localeCompare(b.nome, "pt-BR");

/**
 * Os cadastros do formulário do Bling: formas de pagamento (com juros mensal e
 * multa, que são DA FORMA, não da conta), categorias e — no receber —
 * vendedores. Cada um numa tentativa à parte: um que falhe some da lista com o
 * motivo, sem derrubar os outros.
 */
async function cadastros(db: Db, token: string, conta: Conta, tipo: TipoConta) {
  const espelho = ESPELHO[conta][tipo];
  const erros: Record<string, string> = {};
  const censo: Record<string, unknown> = {};
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

  let formas: { id: number; nome: string; usos: number; juros: number | null; multa: number | null; padrao: boolean }[] = [];
  try {
    const usos = await usosNoEspelho(db, espelho, "formaPagamento");
    formas = (await lerPaginas(token, "/formas-pagamentos", 5))
      .filter((f) => f?.situacao === undefined || Number(f.situacao) === 1)
      .map((f) => ({
        id: Number(f.id), nome: String(f.descricao ?? `Forma ${f.id}`), usos: usos.get(Number(f.id)) ?? 0,
        juros: f.juros == null ? null : Number(f.juros), multa: f.multa == null ? null : Number(f.multa),
        padrao: Number(f.padrao) > 0,
      }))
      .filter((f) => f.id > 0).sort(porUso);
  } catch (e) { erros.formas = motivo(e); }

  await dormir(PAUSA_MS);
  let categorias: { id: number; nome: string; usos: number; tipo: number | null }[] = [];
  try {
    const usos = await usosNoEspelho(db, espelho, "categoria");
    const todas = await lerPaginas(token, "/categorias/receitas-despesas", 10);
    const nomes = new Map<number, string>(todas.map((c) => [Number(c.id), String(c.descricao ?? "")]));
    const lista = todas
      .filter((c) => c?.situacao === undefined || Number(c.situacao) !== 0)
      .map((c) => {
        const pai = Number(c.idCategoriaPai) > 0 ? nomes.get(Number(c.idCategoriaPai)) : null;
        return {
          id: Number(c.id), nome: pai ? `${pai} › ${c.descricao}` : String(c.descricao ?? `Categoria ${c.id}`),
          usos: usos.get(Number(c.id)) ?? 0, tipo: c.tipo == null ? null : Number(c.tipo),
        };
      })
      .filter((c) => c.id > 0);
    // ⚠️ O código de `tipo` (receita/despesa) não está medido. Em vez de supor,
    // pergunta-se ao ESPELHO: o tipo mais comum entre as categorias que esta
    // empresa JÁ usa neste lado. Sem uso nenhum, vai a lista inteira.
    const conta_tipos = new Map<number, number>();
    for (const c of lista) if (c.usos > 0 && c.tipo != null) conta_tipos.set(c.tipo, (conta_tipos.get(c.tipo) ?? 0) + c.usos);
    const provavel = [...conta_tipos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    categorias = lista.filter((c) => provavel == null || c.usos > 0 || c.tipo === provavel || c.tipo === 3).sort(porUso);
  } catch (e) { erros.categorias = motivo(e); }

  let vendedores: { id: number; nome: string; usos: number }[] = [];
  if (tipo === "receber") {
    await dormir(PAUSA_MS);
    try {
      const usos = await usosNoEspelho(db, espelho, "vendedor");
      const crus = await lerPaginas(token, "/vendedores", 5);
      // ⚠️ O valor de `situacao` do vendedor não está medido: a 1ª versão só
      // aceitava "A" e a matriz voltou VAZIA, sem erro. Hoje só sai quem o
      // Bling diz, com todas as letras, que está inativo ou excluído — e o
      // censo vai junto para o ensaio mostrar o que veio.
      censo.vendedores = {
        lidos: crus.length,
        situacoes: [...new Set(crus.map((v) => String(v?.contato?.situacao ?? v?.situacao ?? "∅")))],
        chaves: [...new Set(crus.flatMap((v) => Object.keys(v ?? {})))],
      };
      vendedores = crus
        .map((v) => ({ id: Number(v.id), nome: String(v?.contato?.nome ?? `Vendedor ${v.id}`), usos: usos.get(Number(v.id)) ?? 0,
                       situacao: String(v?.contato?.situacao ?? v?.situacao ?? "").toUpperCase() }))
        .filter((v) => v.id > 0 && v.situacao !== "I" && v.situacao !== "E")
        .map(({ situacao: _s, ...v }) => v)
        .sort(porUso);
    } catch (e) { erros.vendedores = motivo(e); }
  }
  return { formas, categorias, vendedores, erros, censo };
}

async function buscarFornecedores(db: Db, conta: Conta, q: string) {
  const termo = q.replace(/[,()*%\\]/g, " ").trim();
  if (termo.length < 2) return [];
  const digitos = termo.replace(/\D/g, "");
  const colunas = "bling_id, nome, fantasia, cpf_cnpj";
  if (digitos.length >= 5 && digitos.length === termo.replace(/[\s./-]/g, "").length) {
    // ⚠️ O CNPJ vem formatado de jeitos diferentes: o `%` entre cada dígito casa
    // ponto, barra e traço no BANCO; a conferência exata (só dígitos, nos DOIS
    // lados) é aqui, porque o padrão também casaria dígitos espalhados.
    const { data, error } = await db.from(CONTATOS[conta]).select(colunas)
      .ilike("cpf_cnpj", `%${digitos.split("").join("%")}%`).limit(200);
    if (error) throw new Error(`buscar fornecedor: ${error.message}`);
    return ((data ?? []) as any[]).filter((c) => String(c.cpf_cnpj ?? "").replace(/\D/g, "").includes(digitos)).slice(0, 20);
  }
  const { data, error } = await db.from(CONTATOS[conta]).select(colunas)
    .or(`nome.ilike.%${termo}%,fantasia.ilike.%${termo}%`).order("nome").limit(20);
  if (error) throw new Error(`buscar fornecedor: ${error.message}`);
  return (data ?? []) as any[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
  if (req.method !== "POST") return json({ ok: false, mensagem: "Use POST" }, 405);
  const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

  // ── Ensaio (SQL Editor, X-Cron-Secret): só lê ────────────────────────────
  const segredo = req.headers.get("x-cron-secret");
  if (segredo != null) {
    const marcador = "fin-contas-pagar-ensaio";
    if (!CRON_SECRET) return json({ marcador, ok: false, mensagem: "CRON_SECRET ausente no servidor." }, 500);
    if (segredo !== CRON_SECRET) return json({ marcador, ok: false, mensagem: "não autorizado" }, 401);
    const saida: Record<string, unknown> = { marcador, escreveu: false };
    for (const conta of [1, 2] as Conta[]) {
      try {
        const token = await tokenValido(db, conta, null);
        const o = await opcoes(db, token, conta);
        const { data: um } = await db.from(CONTATOS[conta]).select("bling_id, nome").not("nome", "is", null).limit(1).maybeSingle();
        const exemplo: ContaPagarNova = {
          contatoId: Number(um?.bling_id ?? 0), portadorId: o.portadores[0]?.id ?? null,
          historico: "TESTE CarboHub", numeroDocumento: null, parcelas: [{ vencimento: diaBrasilia(null), valor: 1 }],
        };
        await dormir(PAUSA_MS);
        const cad = await cadastros(db, token, conta, "receber");
        saida[NOME_EMPRESA[conta]] = {
          formas: cad.formas.slice(0, 15), categorias: cad.categorias.slice(0, 15), total_categorias: cad.categorias.length,
          vendedores: cad.vendedores.slice(0, 15), censo_cadastros: cad.censo, erros_cadastros: cad.erros,
          portadores: o.portadores.slice(0, 20), total_portadores: o.portadores.length,
          erro_portadores: o.erro_portadores, chaves_do_bling: o.chaves_do_bling,
          enviaria: { metodo: "POST", caminho: "/contas/pagar", corpo: corpoContaPagar(exemplo, 0, diaBrasilia(null)), fornecedor: um?.nome },
        };
      } catch (e) {
        saida[NOME_EMPRESA[conta]] = { erro: e instanceof Error ? e.message : String(e) };
      }
    }
    return json({ ...saida, ok: true });
  }

  // ── Gente ─────────────────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, mensagem: "Faça login." }, 401);
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await comoUsuario.auth.getUser(auth.slice(7));
  if (!u?.user) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
  const { data: pode, error: ePode } = await comoUsuario.rpc("carbo_tem_app", { p_flags: ["carbo_financas"] });
  if (ePode || pode !== true) return json({ ok: false, mensagem: "Contas a pagar são do Finanças: você não tem o app." }, 403);

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const acao = String(b.acao ?? "");
  const conta = Number(b.conta) as Conta;
  if (![1, 2].includes(conta)) return json({ ok: false, mensagem: "Diga a empresa (conta 1 = matriz, 2 = filial)." }, 400);
  // Ausente = "pagar": é o que a tela antiga mandava (sem o campo).
  const tipo: TipoConta = b.tipo === "receber" ? "receber" : "pagar";
  if (b.tipo != null && b.tipo !== "pagar" && b.tipo !== "receber") return json({ ok: false, mensagem: "Tipo inválido (pagar ou receber)." }, 400);

  // As contas (portadores) são só LEITURA, e o diálogo de baixa as usa mesmo com
  // "criar conta a pagar" desligado — por isso respondem antes do interruptor.
  if (acao === "opcoes") {
    try { return json({ ok: true, ...(await opcoes(db, await tokenValido(db, conta, auth), conta)) }); }
    catch (e) { return json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) }); }
  }

  if (acao === "cadastros") {
    try { return json({ ok: true, ...(await cadastros(db, await tokenValido(db, conta, auth), conta, tipo)) }); }
    catch (e) { return json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) }); }
  }

  const { data: cfg, error: eCfg } = await db.from("fin_contas_pagar_config").select("ativo").eq("conta", conta).maybeSingle();
  if (eCfg) return json({ ok: false, mensagem: `Configuração ilegível: ${eCfg.message}` }, 500);
  // ⚠️ O MESMO interruptor por empresa vale para pagar e receber: "lançar no
  // Bling desta empresa" é uma decisão só.
  if (!cfg?.ativo) return json({ ok: false, pulado: "desligado", mensagem: `Lançar conta no Bling da ${NOME_EMPRESA[conta]} ainda está desligado.` }, 409);

  try {
    if (acao === "fornecedores" || acao === "contatos") {
      return json({ ok: true, fornecedores: await buscarFornecedores(db, conta, String(b.q ?? "")) });
    }

    const { data: perfil } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
    const quem = (perfil?.full_name as string | null)?.trim() || null;
    // ⚠️ `tipo` no log é da 20261134. Antes do SQL o insert com ele falha, e o
    // log é a PROVA que libera o "Excluir" — então repete sem a coluna.
    const registrar = async (linhas: Record<string, unknown>[]) => {
      const base = linhas.map((l) => ({ conta, user_id: u.user.id, user_nome: quem, ...l }));
      const { error } = await db.from("fin_contas_pagar_log").insert(base.map((l) => ({ ...l, tipo })));
      if (error) await db.from("fin_contas_pagar_log").insert(base);
    };

    if (acao === "criar") {
      const hoje = diaBrasilia(null);
      const idOuNulo = (x: unknown) => (Number(x) > 0 ? Number(x) : null);
      const nova: ContaPagarNova = {
        contatoId: Number(b.contato_id),
        portadorId: idOuNulo(b.portador_id),
        historico: String(b.historico ?? ""),
        numeroDocumento: b.numero_documento ? String(b.numero_documento) : null,
        parcelas: Array.isArray(b.parcelas)
          ? (b.parcelas as any[]).map((p) => ({ vencimento: String(p?.vencimento ?? ""), valor: Number(p?.valor) }))
          : [],
        emissao: b.emissao ? String(b.emissao) : null,
        competencia: b.competencia ? String(b.competencia) : null,
        formaPagamentoId: idOuNulo(b.forma_pagamento_id),
        categoriaId: idOuNulo(b.categoria_id),
        vendedorId: idOuNulo(b.vendedor_id),
      };
      const erro = erroDaContaNova(nova, hoje, tipo);
      if (erro) return json({ ok: false, mensagem: erro }, 400);

      // O contato tem de existir no cadastro DAQUELA conta (as duas numeram do zero).
      const { data: contato } = await db.from(CONTATOS[conta]).select("bling_id, nome, fantasia, cpf_cnpj")
        .eq("bling_id", nova.contatoId).maybeSingle();
      if (!contato) return json({ ok: false, mensagem: `${tipo === "receber" ? "Cliente" : "Fornecedor"} não encontrado no cadastro desta empresa no Bling.` }, 400);
      const nome = (contato.nome as string) || (contato.fantasia as string) || (tipo === "receber" ? "Cliente" : "Fornecedor");

      const token = await tokenValido(db, conta, auth);
      const lote = crypto.randomUUID();
      const criados: { id: number; corpo: Record<string, unknown> }[] = [];
      try {
        for (let i = 0; i < nova.parcelas.length; i++) {
          if (i > 0) await dormir(PAUSA_MS);
          const corpo = corpoContaPagar(nova, i, hoje, tipo);
          const r = await bling(token, "POST", `/contas/${tipo}`, corpo);
          const id = Number(r?.data?.id ?? r?.id);
          if (!(id > 0)) throw new Error(`O Bling respondeu sem o id da conta: ${JSON.stringify(r).slice(0, 200)}`);
          criados.push({ id, corpo });
        }
      } catch (e) {
        // Ou todas, ou nenhuma: as que já nasceram lá são excluídas de volta.
        const sobraram: number[] = [];
        for (const c of criados) {
          try { await dormir(PAUSA_MS); await bling(token, "DELETE", `/contas/${tipo}/${c.id}`); }
          catch { sobraram.push(c.id); }
        }
        const m = e instanceof Error ? e.message : String(e);
        await registrar([{ acao: "criar", ok: false, lote, mensagem: m, contato_id: nova.contatoId,
                           valor: nova.parcelas.reduce((s, p) => s + p.valor, 0) }]);
        return json({
          ok: false,
          mensagem: sobraram.length
            ? `${m} — e ${sobraram.length} parcela(s) que já tinham sido criadas NÃO puderam ser excluídas no Bling (ids ${sobraram.join(", ")}): exclua lá.`
            : criados.length ? `${m} — as ${criados.length} parcela(s) já criadas foram desfeitas no Bling.` : m,
        });
      }

      // ⚠️ Relê cada conta: o detalhe vai para o espelho (o que o Bling DE FATO
      // guardou), e o que ele não guardou é dito na tela — ele ignora calado.
      const detalhes = new Map<number, any>();
      const naoGuardou = new Set<string>();
      for (const c of criados) {
        try {
          await dormir(PAUSA_MS);
          const d = (await bling(token, "GET", `/contas/${tipo}/${c.id}`))?.data ?? null;
          if (d) { detalhes.set(c.id, d); for (const f of camposNaoGuardados(c.corpo, d)) naoGuardou.add(f); }
        } catch { /* sem o detalhe, o espelho de 10 min o traz */ }
      }
      const avisoCampos = naoGuardou.size
        ? `O Bling não guardou: ${[...naoGuardou].join(", ")} — confira a conta lá.` : undefined;

      const agora = new Date().toISOString();
      const total = criados.length;
      const doc = contato.cpf_cnpj ? String(contato.cpf_cnpj).replace(/\D/g, "") : null;
      const det = (id: number) => detalhes.get(id) ?? null;
      let locais: any[] = [];
      let erroAqui: string | null = null;

      if (conta === 1) {
        const espelho = criados.map((c) => ({
          bling_id: c.id, situacao: "1", valor: c.corpo.valor, saldo: c.corpo.valor, vencimento: c.corpo.vencimento,
          data_emissao: c.corpo.dataEmissao, numero: (c.corpo.numeroDocumento as string) ?? null, contato_id: nova.contatoId,
          contato_nome: nome, contato_documento: doc, historico: c.corpo.historico, listagem: c.corpo, visto_em: agora,
          detalhe: det(c.id), detalhe_em: det(c.id) ? agora : null,
        }));
        const { error: eE } = await db.from(ESPELHO[1][tipo]).upsert(espelho, { onConflict: "bling_id" });
        if (tipo === "pagar") {
          const linhas = criados.map((c, i) => ({
            source: "bling", bling_id: c.id, bling_numero: (c.corpo.numeroDocumento as string) ?? null,
            supplier_name: nome, amount: c.corpo.valor, due_date: c.corpo.vencimento, status: "programado",
            currency: "BRL", notes: c.corpo.historico, bling_raw: c.corpo, parcela: i + 1, parcelas_total: total,
            criado_aqui_por: u.user.id, criado_aqui_nome: quem,
          }));
          const { data, error: eL } = await db.from("purchase_payables").upsert(linhas, { onConflict: "bling_id" }).select("*");
          locais = data ?? [];
          erroAqui = (eE ?? eL)?.message ?? null;
        } else {
          // ⚠️ `receivables` tem índice único PARCIAL em bling_id: upsert por ele
          // não acha a restrição. O id acabou de nascer no Bling — é insert.
          const linhas = criados.map((c, i) => ({
            source: "bling", bling_id: c.id, bling_numero: (c.corpo.numeroDocumento as string) ?? null,
            customer_name: nome, amount: c.corpo.valor, currency: "BRL", due_date: c.corpo.vencimento,
            status: "programado", notes: c.corpo.historico, bling_raw: c.corpo, empresa: "matriz", documento: doc,
            parcela: i + 1, parcelas_total: total, criado_aqui_por: u.user.id, criado_aqui_nome: quem,
          }));
          let { data, error: eL } = await db.from("receivables").insert(linhas).select("*");
          if (eL && /criado_aqui/.test(eL.message)) {
            // Banco antes da 20261134: sem "quem criou" (o log continua sendo a prova).
            ({ data, error: eL } = await db.from("receivables")
              .insert(linhas.map(({ criado_aqui_por: _a, criado_aqui_nome: _b, ...l }) => l)).select("*"));
          }
          locais = data ?? [];
          erroAqui = (eE ?? eL)?.message ?? null;
        }
      } else {
        const colNome = tipo === "receber" ? "cliente" : "fornecedor";
        const colId = tipo === "receber" ? "cliente_id" : "fornecedor_id";
        const linhas = criados.map((c) => ({
          bling_id: c.id, numero: (c.corpo.numeroDocumento as string) ?? String(c.id), [colId]: nova.contatoId,
          [colNome]: nome, valor: c.corpo.valor, saldo: c.corpo.valor, vencimento: c.corpo.vencimento, data_emissao: c.corpo.dataEmissao,
          situacao: "1", historico: c.corpo.historico, raw_data: c.corpo, synced_at: agora, updated_at: agora,
          detalhe: det(c.id), detalhe_em: det(c.id) ? agora : null,
          // Quem criou: pagar desde a 20261132, receber desde a 20261134.
          cb_criado_por: u.user.id, cb_criado_nome: quem,
        }));
        let { data, error: eL } = await db.from(ESPELHO[2][tipo]).upsert(linhas, { onConflict: "bling_id" }).select("*");
        if (eL && /cb_criado/.test(eL.message)) {
          ({ data, error: eL } = await db.from(ESPELHO[2][tipo])
            .upsert(linhas.map(({ cb_criado_por: _a, cb_criado_nome: _b, ...l }) => l), { onConflict: "bling_id" }).select("*"));
        }
        locais = data ?? [];
        erroAqui = eL?.message ?? null;
      }

      await registrar(criados.map((c) => ({ acao: "criar", ok: true, lote, bling_id: c.id, contato_id: nova.contatoId,
        valor: c.corpo.valor, vencimento: c.corpo.vencimento, mensagem: erroAqui ? `criada no Bling; aqui: ${erroAqui}` : "criada no Bling" })));
      if (erroAqui) {
        // O Bling tem as contas; o espelho de 10 min as traz mesmo assim. A tela diz.
        return json({ ok: true, ids: criados.map((c) => c.id), locais, aviso: [`Criada(s) no Bling. A tela leva até 10 min para mostrar: ${erroAqui}`, avisoCampos].filter(Boolean).join(" ") });
      }
      return json({
        ok: true, ids: criados.map((c) => c.id), locais, aviso: avisoCampos,
        mensagem: total > 1 ? `${total} parcelas lançadas no Bling.` : "Conta lançada no Bling.",
      });
    }

    if (acao === "excluir") {
      const blingId = Number(b.bling_id);
      if (!(blingId > 0)) return json({ ok: false, mensagem: "Pedido inválido (bling_id)." }, 400);
      // ⚠️ Só conta que NASCEU aqui — conta do Bling se exclui no Bling.
      // `tipo` no log é da 20261134; sem a coluna, a pergunta vai sem ele (pagar e
      // receber têm ids diferentes no Bling, e a conferência no Bling vem abaixo).
      let { data: nasceu, error: eLog } = await db.from("fin_contas_pagar_log").select("id")
        .eq("conta", conta).eq("acao", "criar").eq("ok", true).eq("bling_id", blingId).eq("tipo", tipo).limit(1).maybeSingle();
      if (eLog) {
        ({ data: nasceu } = await db.from("fin_contas_pagar_log").select("id")
          .eq("conta", conta).eq("acao", "criar").eq("ok", true).eq("bling_id", blingId).limit(1).maybeSingle());
      }
      if (!nasceu) return json({ ok: false, mensagem: "Esta conta não foi criada pelo sistema — exclua no Bling." }, 400);
      const token = await tokenValido(db, conta, auth);
      let d: any = null;
      try { d = (await bling(token, "GET", `/contas/${tipo}/${blingId}`))?.data ?? {}; }
      catch (e) { if (!(e instanceof BlingRecusou && e.status === 404)) throw e; }
      if (d) {
        const situacao = d.situacao != null ? String(d.situacao) : null;
        const pagos = Array.isArray(d.borderos) ? d.borderos.length : 0;
        if (situacao !== "1" || pagos > 0) {
          const m = `A conta já tem ${tipo === "receber" ? "recebimento" : "pagamento"} no Bling — estorne-o antes de excluir.`;
          await registrar([{ acao: "excluir", ok: false, bling_id: blingId, mensagem: m }]);
          return json({ ok: false, mensagem: m });
        }
        await bling(token, "DELETE", `/contas/${tipo}/${blingId}`);
      }
      const nota = `excluída no Bling pelo sistema${quem ? ` (${quem})` : ""} em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())}`;
      if (conta === 1) {
        await db.from(tipo === "receber" ? "receivables" : "purchase_payables")
          .update({ status: "cancelado", notes: nota, updated_at: new Date().toISOString() })
          .eq("bling_id", blingId).eq("source", "bling");
        await db.from(ESPELHO[1][tipo]).delete().eq("bling_id", blingId);
      } else {
        await db.from(ESPELHO[2][tipo]).delete().eq("bling_id", blingId);
      }
      await registrar([{ acao: "excluir", ok: true, bling_id: blingId, mensagem: d ? "excluída no Bling" : "já não existia no Bling" }]);
      return json({ ok: true, mensagem: "Conta excluída no Bling." });
    }

    return json({ ok: false, mensagem: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
  }
});
