// ─────────────────────────────────────────────────────────────────────────────
// fin-contas-pagar — a conta a pagar NASCE no Finanças e é criada NO BLING
// (matriz = conta 1, filial = conta 2), e só depois aparece aqui.
//
//   acao "opcoes"       portadores (contas financeiras) do Bling, com os mais usados primeiro
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
import { corpoContaPagar, diaBrasilia, erroDaContaNova, type ContaPagarNova } from "../_shared/blingContasRegra.ts";

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
        saida[NOME_EMPRESA[conta]] = {
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

  // As contas (portadores) são só LEITURA, e o diálogo de baixa as usa mesmo com
  // "criar conta a pagar" desligado — por isso respondem antes do interruptor.
  if (acao === "opcoes") {
    try { return json({ ok: true, ...(await opcoes(db, await tokenValido(db, conta, auth), conta)) }); }
    catch (e) { return json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) }); }
  }

  const { data: cfg, error: eCfg } = await db.from("fin_contas_pagar_config").select("ativo").eq("conta", conta).maybeSingle();
  if (eCfg) return json({ ok: false, mensagem: `Configuração ilegível: ${eCfg.message}` }, 500);
  if (!cfg?.ativo) return json({ ok: false, pulado: "desligado", mensagem: `Criar conta a pagar no Bling da ${NOME_EMPRESA[conta]} ainda está desligado.` }, 409);

  try {
    if (acao === "fornecedores") {
      return json({ ok: true, fornecedores: await buscarFornecedores(db, conta, String(b.q ?? "")) });
    }

    const { data: perfil } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
    const quem = (perfil?.full_name as string | null)?.trim() || null;
    const registrar = (linhas: Record<string, unknown>[]) =>
      db.from("fin_contas_pagar_log").insert(linhas.map((l) => ({ conta, user_id: u.user.id, user_nome: quem, ...l })));

    if (acao === "criar") {
      const hoje = diaBrasilia(null);
      const nova: ContaPagarNova = {
        contatoId: Number(b.contato_id),
        portadorId: Number(b.portador_id) > 0 ? Number(b.portador_id) : null,
        historico: String(b.historico ?? ""),
        numeroDocumento: b.numero_documento ? String(b.numero_documento) : null,
        parcelas: Array.isArray(b.parcelas)
          ? (b.parcelas as any[]).map((p) => ({ vencimento: String(p?.vencimento ?? ""), valor: Number(p?.valor) }))
          : [],
      };
      const erro = erroDaContaNova(nova, hoje);
      if (erro) return json({ ok: false, mensagem: erro }, 400);

      // O fornecedor tem de existir no cadastro DAQUELA conta (as duas numeram do zero).
      const { data: contato } = await db.from(CONTATOS[conta]).select("bling_id, nome, fantasia, cpf_cnpj")
        .eq("bling_id", nova.contatoId).maybeSingle();
      if (!contato) return json({ ok: false, mensagem: "Fornecedor não encontrado no cadastro desta empresa no Bling." }, 400);
      const nome = (contato.nome as string) || (contato.fantasia as string) || "Fornecedor";
      const doc = contato.cpf_cnpj ? String(contato.cpf_cnpj).replace(/\D/g, "") : null;

      const token = await tokenValido(db, conta, auth);
      const lote = crypto.randomUUID();
      const criados: { id: number; corpo: Record<string, unknown> }[] = [];
      try {
        for (let i = 0; i < nova.parcelas.length; i++) {
          if (i > 0) await dormir(PAUSA_MS);
          const corpo = corpoContaPagar(nova, i, hoje);
          const r = await bling(token, "POST", "/contas/pagar", corpo);
          const id = Number(r?.data?.id ?? r?.id);
          if (!(id > 0)) throw new Error(`O Bling respondeu sem o id da conta: ${JSON.stringify(r).slice(0, 200)}`);
          criados.push({ id, corpo });
        }
      } catch (e) {
        // Ou todas, ou nenhuma: as que já nasceram lá são excluídas de volta.
        const sobraram: number[] = [];
        for (const c of criados) {
          try { await dormir(PAUSA_MS); await bling(token, "DELETE", `/contas/pagar/${c.id}`); }
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

      const agora = new Date().toISOString();
      const total = criados.length;
      if (conta === 1) {
        const espelho = criados.map((c) => ({
          bling_id: c.id, situacao: "1", valor: c.corpo.valor, saldo: c.corpo.valor, vencimento: c.corpo.vencimento,
          data_emissao: hoje, numero: (c.corpo.numeroDocumento as string) ?? null, contato_id: nova.contatoId,
          contato_nome: nome, contato_documento: doc, historico: c.corpo.historico, listagem: c.corpo, visto_em: agora,
        }));
        const { error: eE } = await db.from("bling_contas_pagar").upsert(espelho, { onConflict: "bling_id" });
        const linhas = criados.map((c, i) => ({
          source: "bling", bling_id: c.id, bling_numero: (c.corpo.numeroDocumento as string) ?? null,
          supplier_name: nome, amount: c.corpo.valor, due_date: c.corpo.vencimento, status: "programado",
          currency: "BRL", notes: c.corpo.historico, bling_raw: c.corpo, parcela: i + 1, parcelas_total: total,
          criado_aqui_por: u.user.id, criado_aqui_nome: quem,
        }));
        const { error: eL } = await db.from("purchase_payables").upsert(linhas, { onConflict: "bling_id" });
        if (eE || eL) {
          // O Bling tem as contas; o espelho de 10 min as traz mesmo assim. A tela diz.
          await registrar(criados.map((c) => ({ acao: "criar", ok: true, lote, bling_id: c.id, contato_id: nova.contatoId,
            valor: c.corpo.valor, vencimento: c.corpo.vencimento, mensagem: `criada no Bling; aqui: ${(eE ?? eL)!.message}` })));
          return json({ ok: true, ids: criados.map((c) => c.id), aviso: `Criada(s) no Bling. A tela leva até 10 min para mostrar: ${(eE ?? eL)!.message}` });
        }
      } else {
        const linhas = criados.map((c) => ({
          bling_id: c.id, numero: (c.corpo.numeroDocumento as string) ?? String(c.id), fornecedor_id: nova.contatoId,
          fornecedor: nome, valor: c.corpo.valor, saldo: c.corpo.valor, vencimento: c.corpo.vencimento, data_emissao: hoje,
          situacao: "1", historico: c.corpo.historico, raw_data: c.corpo, synced_at: agora, updated_at: agora,
          cb_criado_por: u.user.id, cb_criado_nome: quem,
        }));
        const { error: eL } = await db.from("bling2_contas_pagar").upsert(linhas, { onConflict: "bling_id" });
        if (eL) {
          await registrar(criados.map((c) => ({ acao: "criar", ok: true, lote, bling_id: c.id, contato_id: nova.contatoId,
            valor: c.corpo.valor, vencimento: c.corpo.vencimento, mensagem: `criada no Bling; aqui: ${eL.message}` })));
          return json({ ok: true, ids: criados.map((c) => c.id), aviso: `Criada(s) no Bling. A tela leva até 10 min para mostrar: ${eL.message}` });
        }
      }
      await registrar(criados.map((c) => ({ acao: "criar", ok: true, lote, bling_id: c.id, contato_id: nova.contatoId,
        valor: c.corpo.valor, vencimento: c.corpo.vencimento, mensagem: "criada no Bling" })));
      return json({ ok: true, ids: criados.map((c) => c.id), mensagem: total > 1 ? `${total} parcelas criadas no Bling.` : "Conta criada no Bling." });
    }

    if (acao === "excluir") {
      const blingId = Number(b.bling_id);
      if (!(blingId > 0)) return json({ ok: false, mensagem: "Pedido inválido (bling_id)." }, 400);
      // ⚠️ Só conta que NASCEU aqui — conta do Bling se exclui no Bling.
      const { data: nasceu } = await db.from("fin_contas_pagar_log").select("id")
        .eq("conta", conta).eq("acao", "criar").eq("ok", true).eq("bling_id", blingId).limit(1).maybeSingle();
      if (!nasceu) return json({ ok: false, mensagem: "Esta conta não foi criada pelo sistema — exclua no Bling." }, 400);
      const token = await tokenValido(db, conta, auth);
      let d: any = null;
      try { d = (await bling(token, "GET", `/contas/pagar/${blingId}`))?.data ?? {}; }
      catch (e) { if (!(e instanceof BlingRecusou && e.status === 404)) throw e; }
      if (d) {
        const situacao = d.situacao != null ? String(d.situacao) : null;
        const pagos = Array.isArray(d.borderos) ? d.borderos.length : 0;
        if (situacao !== "1" || pagos > 0) {
          const m = "A conta já tem pagamento no Bling — estorne o pagamento antes de excluir.";
          await registrar([{ acao: "excluir", ok: false, bling_id: blingId, mensagem: m }]);
          return json({ ok: false, mensagem: m });
        }
        await bling(token, "DELETE", `/contas/pagar/${blingId}`);
      }
      const nota = `excluída no Bling pelo sistema${quem ? ` (${quem})` : ""} em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())}`;
      if (conta === 1) {
        await db.from("purchase_payables").update({ status: "cancelado", notes: nota, updated_at: new Date().toISOString() })
          .eq("bling_id", blingId).eq("source", "bling");
        await db.from("bling_contas_pagar").delete().eq("bling_id", blingId);
      } else {
        await db.from("bling2_contas_pagar").delete().eq("bling_id", blingId);
      }
      await registrar([{ acao: "excluir", ok: true, bling_id: blingId, mensagem: d ? "excluída no Bling" : "já não existia no Bling" }]);
      return json({ ok: true, mensagem: "Conta excluída no Bling." });
    }

    return json({ ok: false, mensagem: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
  }
});
