// ─────────────────────────────────────────────────────────────────────────────
// bling-contas-espelho — contas a RECEBER e a PAGAR do Bling 1 (matriz),
// espelhadas a cada 10 min em `bling_contas_receber` / `bling_contas_pagar`.
//
// É ACRÉSCIMO, de propósito (decisão do dono do processo, 21/10/2026: "não é
// para quebrar nada que funciona"):
//   • NÃO toca o `bling-sync` (a emissão de NF mora lá) nem as tabelas que as
//     telas já usam (`receivables`, `purchase_payables`). Grava só nas DUAS
//     tabelas espelho, que são dela.
//   • ⚠️ NUNCA RENOVA o token do Bling. O `refresh_token` é trocado a cada
//     renovação, e o `bling-sync` DESATIVA a integração quando a renovação
//     falha — duas funções renovando ao mesmo tempo seria a corrida que
//     derrubou o ML (`20260986`), e aqui ela derrubaria a EMISSÃO DE NF. Token
//     perto de vencer ⇒ esta rodada PULA (e diz isso no log); quem renova é o
//     `bling-sync`, como sempre foi. 401 do Bling ⇒ para, sem tentar renovar.
//   • Só LÊ do Bling. Quem escreve lá (a baixa) é a `bling-contas-baixar`.
//
// A listagem do Bling é magra (id, valor, contato, situação, vencimento) e não
// traz a DATA DE PAGAMENTO. O detalhe (`/contas/<tipo>/<id>`) traz, e é pedido
// só para o título NOVO ou cuja situação MUDOU — até `DETALHES_POR_RODADA` por
// rodada; o resto drena nas rodadas seguintes (molde do `order_details`).
//
// Chamada pelo pg_cron com `X-Cron-Secret`. Ausência do segredo FECHA (500).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BLING_API = "https://api.bling.com.br/Api/v3";

const MARGEM_TOKEN_MS = 10 * 60 * 1000;   // menos que isso para vencer: não usa
const DETALHES_POR_RODADA = 60;
const PAUSA_MS = 350;                     // o Bling aceita ~3 req/s
// ⚠️ ORÇAMENTO DE TEMPO. A função é morta em 150 s, e morta ela não grava o
// log — falharia CALADA. A 1ª rodada de verdade (21/10/2026) levou 128 s: 35
// páginas de listagem + 120 detalhes. Passou de 100 s, o detalhe para e o que
// faltou fica para a próxima rodada (é só uma fila que drena). O de RECEBER
// para mais cedo para sobrar tempo para a LISTAGEM do de pagar, que vem depois
// e não pode ser pulada (é ela que deixa o espelho em dia).
const ORCAMENTO_MS: Record<"receber" | "pagar", number> = { receber: 40_000, pagar: 90_000 };
// A DATA DE PAGAMENTO mora no BORDERÔ da baixa (`GET /borderos/{id}`), não no
// título. Fase própria, depois do detalhe, com orçamento próprio: é uma fila
// que drena (~2.600 títulos quitados na 1ª vez) e não pode atrasar a listagem.
const ORCAMENTO_BORDERO_MS: Record<"receber" | "pagar", number> = { receber: 55_000, pagar: 115_000 };
const BORDEROS_POR_RODADA = 40;

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tipo = "receber" | "pagar";
const TABELA: Record<Tipo, string> = { receber: "bling_contas_receber", pagar: "bling_contas_pagar" };

class BlingRecusou extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function blingGet(token: string, caminho: string, tentativa = 0): Promise<any> {
  const r = await fetch(`${BLING_API}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 429 && tentativa < 4) {
    await dormir(1000 * 2 ** tentativa);
    return blingGet(token, caminho, tentativa + 1);
  }
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new BlingRecusou(r.status, `Bling ${r.status} em ${caminho}: ${corpo.slice(0, 300)}`);
  }
  return r.json();
}

const dataOuNull = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== "0000-00-00" ? s : null;
};
const numOuNull = (v: unknown): number | null => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

Deno.serve(async (req) => {
  if (!CRON_SECRET) return json(500, { erro: "CRON_SECRET ausente no servidor — configure em Edge Functions → Secrets." });
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json(401, { erro: "não autorizado" });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const inicio = Date.now();
  const resumo: Record<string, unknown> = {};
  const log = async (ok: boolean, extra: Record<string, unknown>) => {
    await db.from("bling_contas_espelho_log").insert({ ok, ms: Date.now() - inicio, resumo: { ...resumo, ...extra } });
    // Faxina: o log é para ver as últimas rodadas, não para crescer para sempre.
    await db.from("bling_contas_espelho_log").delete().lt("rodou_em", new Date(Date.now() - 7 * 864e5).toISOString());
  };

  // ── O token: SÓ LÊ. ────────────────────────────────────────────────────────
  const { data: integ } = await db.from("bling_integration")
    .select("access_token, expires_at").eq("is_active", true).maybeSingle();
  if (!integ?.access_token) {
    await log(false, { pulado: "sem integração ativa com o Bling 1" });
    return json(200, { pulado: "sem integração ativa" });
  }
  if (new Date(integ.expires_at).getTime() - Date.now() < MARGEM_TOKEN_MS) {
    await log(true, { pulado: "token perto de vencer — quem renova é o bling-sync; esta rodada não usa" });
    return json(200, { pulado: "token perto de vencer" });
  }
  const token = integ.access_token as string;

  try {
    for (const tipo of ["receber", "pagar"] as Tipo[]) {
      const tabela = TABELA[tipo];
      // O que já temos, para saber o que é NOVO ou MUDOU de situação.
      const conhecido = new Map<number, string | null>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await db.from(tabela).select("bling_id, situacao").order("bling_id").range(de, de + 999);
        if (error) throw new Error(`ler ${tabela}: ${error.message}`);
        for (const r of data ?? []) conhecido.set(Number(r.bling_id), r.situacao as string | null);
        if (!data || data.length < 1000) break;
      }

      let lidos = 0;
      const precisaDetalhe: number[] = [];
      const agora = new Date().toISOString();
      for (let pagina = 1; ; pagina++) {
        const resp = await blingGet(token, `/contas/${tipo}?pagina=${pagina}&limite=100`);
        const contas: any[] = resp?.data ?? [];
        if (!contas.length) break;
        const linhas = contas.map((c) => {
          const situacao = c.situacao != null ? String(c.situacao) : null;
          const id = Number(c.id);
          if (!conhecido.has(id) || conhecido.get(id) !== situacao) precisaDetalhe.push(id);
          return {
            bling_id: id,
            situacao,
            valor: numOuNull(c.valor),
            vencimento: dataOuNull(c.vencimento ?? c.dataVencimento),
            contato_id: numOuNull(c.contato?.id),
            listagem: c,
            visto_em: agora,
          };
        });
        const { error } = await db.from(tabela).upsert(linhas, { onConflict: "bling_id" });
        if (error) throw new Error(`gravar ${tabela}: ${error.message}`);
        lidos += contas.length;
        if (contas.length < 100) break;
        await dormir(PAUSA_MS);
      }

      // Também drena o que nunca ganhou detalhe (rodadas anteriores no teto).
      if (precisaDetalhe.length < DETALHES_POR_RODADA) {
        const { data } = await db.from(tabela).select("bling_id").is("detalhe_em", null)
          .order("bling_id", { ascending: false }).limit(DETALHES_POR_RODADA);
        for (const r of data ?? []) if (!precisaDetalhe.includes(Number(r.bling_id))) precisaDetalhe.push(Number(r.bling_id));
      }

      let detalhados = 0;
      for (const id of precisaDetalhe.slice(0, DETALHES_POR_RODADA)) {
        if (Date.now() - inicio > ORCAMENTO_MS[tipo]) break;
        await dormir(PAUSA_MS);
        const d = (await blingGet(token, `/contas/${tipo}/${id}`))?.data ?? {};
        const { error } = await db.from(tabela).update({
          numero: d.numeroDocumento ?? d.numero ?? null,
          contato_nome: d.contato?.nome ?? null,
          contato_documento: d.contato?.numeroDocumento ? String(d.contato.numeroDocumento).replace(/\D/g, "") : null,
          saldo: numOuNull(d.saldo),
          data_emissao: dataOuNull(d.dataEmissao),
          // A data vem do BORDERÔ (fase abaixo). Título quitado mantém a que já
          // foi lida; título que voltou a aberto perde a dele.
          ...(dataOuNull(d.dataPagamento ?? d.dataBaixa)
            ? { data_pagamento: dataOuNull(d.dataPagamento ?? d.dataBaixa) }
            : ["2", "3"].includes(String(d.situacao)) ? {} : { data_pagamento: null }),
          origem_id: numOuNull(d.origem?.id),
          origem_tipo: d.origem?.tipoOrigem ?? null,
          origem_numero: d.origem?.numero != null ? String(d.origem.numero) : null,
          historico: d.historico ?? null,
          detalhe: d,
          detalhe_em: new Date().toISOString(),
        }).eq("bling_id", id);
        if (error) throw new Error(`detalhe ${tabela} ${id}: ${error.message}`);
        detalhados++;
      }
      // ── A data de pagamento: o borderô mais recente do título quitado ─────
      // ⚠️ Só lê. Borderô pode cobrir vários títulos; aqui ele só dá a DATA.
      // ⚠️ Esta fase NUNCA derruba a rodada: um borderô recusado pelo Bling
      // (404, 400…) abortaria tudo e o de PAGAR não seria nem listado — o
      // espelho deixaria de andar por causa de uma DATA. Falha vira contagem e
      // o PRIMEIRO erro vai para o log, que é onde se diagnostica.
      const b = { gravados: 0, sem_bordero: 0, sem_data: 0, erros: 0, parou_por_tempo: false,
                  candidatos: 0, primeiro_erro: null as string | null, exemplo_sem_bordero: null as unknown,
                  exemplo_sem_data: null as unknown };
      // Só a lista de borderôs, não o detalhe inteiro: são até 1.000 linhas.
      const { data: semData, error: eSem } = await db.from(tabela).select("bling_id, borderos:detalhe->borderos")
        .in("situacao", ["2", "3"]).is("data_pagamento", null).not("detalhe", "is", null)
        .order("bling_id", { ascending: false }).limit(1000);
      if (eSem) { b.erros++; b.primeiro_erro = `ler pendentes: ${eSem.message}`; }
      b.candidatos = semData?.length ?? 0;
      // ⚠️ SORTEIO, nunca "os 40 mais recentes": título que não dá data (sem
      // borderô, borderô recusado) continua pendente, e numa fila em ordem fixa
      // os mesmos 40 voltariam a cada rodada e a fila nunca andaria.
      const fila = [...(semData ?? [])].sort(() => Math.random() - 0.5).slice(0, BORDEROS_POR_RODADA);
      for (const r of fila) {
        if (Date.now() - inicio > ORCAMENTO_BORDERO_MS[tipo]) { b.parou_por_tempo = true; break; }
        try {
          const lista = (r as any).borderos;
          const ids = (Array.isArray(lista) ? lista : [])
            .map((x: any) => Number(typeof x === "object" ? x?.id : x)).filter((n: number) => n > 0);
          if (!ids.length) {
            b.sem_bordero++;
            if (!b.exemplo_sem_bordero) b.exemplo_sem_bordero = { bling_id: r.bling_id, borderos: lista ?? null };
            continue;
          }
          await dormir(PAUSA_MS);
          const bo = (await blingGet(token, `/borderos/${Math.max(...ids)}`))?.data ?? {};
          const dia = dataOuNull(bo.data ?? bo.dataPagamento);
          if (!dia) {
            b.sem_data++;
            if (!b.exemplo_sem_data) b.exemplo_sem_data = { bling_id: r.bling_id, chaves: Object.keys(bo), data: bo.data ?? null };
            continue;
          }
          const { error } = await db.from(tabela).update({ data_pagamento: dia }).eq("bling_id", r.bling_id);
          if (error) throw new Error(`gravar ${r.bling_id}: ${error.message}`);
          b.gravados++;
        } catch (e) {
          b.erros++;
          if (!b.primeiro_erro) b.primeiro_erro = e instanceof Error ? e.message : String(e);
        }
      }
      resumo[tipo] = { lidos, detalhados, faltam_detalhe: Math.max(0, precisaDetalhe.length - detalhados), bordero: b };
    }
    await log(true, {});
    return json(200, resumo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // ⚠️ 401 NÃO dispara renovação aqui — só registra. Ver o cabeçalho.
    await log(false, { erro: msg, status: e instanceof BlingRecusou ? e.status : null });
    return json(500, { erro: msg, ...resumo });
  }
});
