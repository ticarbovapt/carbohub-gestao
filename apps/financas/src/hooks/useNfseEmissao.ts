import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// NFS-e do CarboVAPT pelo Portal Nacional (migração 20261096 + edge function
// `nfse-emitir`). A tela só PREPARA e CONFIRMA; quem reserva o número, assina,
// envia e grava o resultado é o servidor — o navegador não tem como dizer
// "autorizada" sozinho.
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠️ ESPELHO de `AMBIENTE` em `supabase/functions/nfse-emitir/index.ts`. Ao
 *  ir para produção, mude os DOIS (e o destino do `nfse-relay`). Aqui ele só
 *  decide o aviso da tela; quem decide onde a nota sai é o servidor. */
export const NFSE_AMBIENTE_TELA: 1 | 2 = 2;

export type NfseStatus = "enviando" | "autorizada" | "rejeitada" | "falha" | "indeterminado";

export interface NfseEmissao {
  id: string; ambiente: 1 | 2; serie: string; n_dps: number; status: NfseStatus;
  chave_acesso: string | null; n_nfse: string | null; erro: string | null;
  c_ind_op?: string; descricao?: string; d_compet?: string;
  tomador?: Record<string, string>;
  criado_em: string; concluido_em: string | null;
}

export interface NfseVeiculo { posicao: number; placa: string | null; modelo: string | null; ano: number | null }

export interface NfsePreparo {
  pedido: {
    id: string; order_number: string; status: string; customer_name: string | null;
    documento: string | null; customer_email: string | null; customer_phone: string | null;
    delivery_address: string | null; delivery_city: string | null; delivery_state: string | null;
    delivery_zip: string | null; po_number: string | null; sale_date: string | null; created_at: string;
    total: number; itens: Array<{ quantity?: number; name?: string }> | null;
    descarb_os_id: string | null; so_servico: boolean; vendedor: string | null;
  };
  veiculos: NfseVeiculo[];
  emissoes: NfseEmissao[];
}

export function useNfsePreparo(orderId: string | null) {
  return useQuery({
    queryKey: ["nfse_preparo", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<NfsePreparo> => {
      const { data, error } = await (supabase as any).rpc("carbo_nfse_emissao_preparar", { p_order: orderId });
      if (error) throw error;
      return data as NfsePreparo;
    },
  });
}

/** Última emissão de cada pedido da lista — o selo da coluna "Nota Fiscal". */
export function useNfseDosPedidos(orderIds: string[]) {
  const ids = [...new Set(orderIds)].sort();
  return useQuery({
    queryKey: ["nfse_emissoes", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, NfseEmissao[]>> => {
      const out: Record<string, NfseEmissao[]> = {};
      // `.in()` em lotes: lista grande estoura a URL.
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await (supabase as any)
          .from("carbo_nfse_emissoes")
          .select("id, order_id, ambiente, serie, n_dps, status, chave_acesso, n_nfse, erro, criado_em, concluido_em, enviado_em")
          .in("order_id", ids.slice(i, i + 150))
          .order("criado_em", { ascending: false });
        // ⚠️ Antes da migração a tabela não existe: o selo some, a tela não cai.
        if (error) { console.error("[nfse] emissões não carregaram:", error); return out; }
        for (const r of (data ?? []) as any[]) {
          const parado = r.status === "enviando" && Date.now() - new Date(r.enviado_em).getTime() > 5 * 60_000;
          (out[r.order_id] ??= []).push({ ...r, status: parado ? "indeterminado" : r.status });
        }
      }
      return out;
    },
  });
}

/** A nota que VALE para o pedido: autorizada em PRODUÇÃO. Teste não fatura. */
export function nfseValida(lista: NfseEmissao[] | undefined): NfseEmissao | null {
  return (lista ?? []).find((e) => e.ambiente === 1 && e.status === "autorizada") ?? null;
}

export interface EmitirNfseInput {
  order_id: string;
  c_ind_op: string;
  d_compet: string;
  descricao: string;
  tomador: { cep: string; cMun: string; lgr: string; nro: string; cpl: string; bairro: string; fone: string; email: string };
  reusar_id?: string | null;
}

export interface EmitirNfseResultado {
  ok: boolean; ambiente: "producao" | "producao_restrita"; emissao_id: string;
  serie: string; n_dps: number; status: NfseStatus;
  chave_acesso: string | null; n_nfse: string | null; erro: string | null;
}

async function erroDaFuncao(error: any): Promise<string> {
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.clone().json();
      if (b?.erro) return String(b.erro);
    } catch { /* corpo não-JSON */ }
  }
  return error?.message || "Erro ao emitir NFS-e";
}

export function useEmitirNfse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EmitirNfseInput): Promise<EmitirNfseResultado> => {
      const { data, error } = await supabase.functions.invoke("nfse-emitir", { body: input });
      if (error) throw new Error(await erroDaFuncao(error));
      return data as EmitirNfseResultado;
    },
    // ⚠️ Recarrega TAMBÉM no erro: a reserva pode ter gravado uma tentativa
    // (rejeitada, indeterminada) que a tela precisa mostrar.
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["nfse_preparo", v.order_id] });
      qc.invalidateQueries({ queryKey: ["nfse_emissoes"] });
    },
  });
}

// ── Montagem do pré-preenchimento (puro) ───────────────────────────────────

const C_DE = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
const C_PARA = "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN";
export function semAcento(s: string): string {
  return [...s].map((c) => { const i = C_DE.indexOf(c); return i >= 0 ? C_PARA[i] : c; }).join("");
}

/**
 * "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. VEICULO: POLO, 2024, SYF5J24." —
 * o padrão das notas que o Finanças já emite (medido, e no modelo enviado).
 * Vaga sem placa ainda (o Carbox preenche NA EXECUÇÃO) não entra; sem nenhuma,
 * diz quantos veículos foram.
 */
export function descricaoPadrao(veiculos: NfseVeiculo[], qtdVendida: number): string {
  const base = "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT.";
  const comDado = veiculos.filter((v) => (v.placa ?? "").trim() || (v.modelo ?? "").trim());
  if (comDado.length === 0) {
    return qtdVendida > 1 ? `${base} ${qtdVendida} VEÍCULOS.` : base;
  }
  const um = (v: NfseVeiculo) =>
    [v.modelo?.trim(), v.ano ? String(v.ano) : "", v.placa?.trim()].filter(Boolean).join(", ").toUpperCase();
  return comDado.length === 1
    ? `${base} VEICULO: ${um(comDado[0])}.`
    : `${base} VEICULOS: ${comDado.map(um).join("; ")}.`;
}

/** "Rua X, 45 - Bairro" (formato do /vender) → as três partes. */
export function partesDoEndereco(s: string | null): { lgr: string; nro: string; bairro: string } {
  let resto = (s ?? "").trim();
  let bairro = "";
  const iB = resto.lastIndexOf(" - ");
  if (iB >= 0) { bairro = resto.slice(iB + 3).trim(); resto = resto.slice(0, iB).trim(); }
  let nro = "";
  const iN = resto.lastIndexOf(",");
  if (iN >= 0) { nro = resto.slice(iN + 1).trim(); resto = resto.slice(0, iN).trim(); }
  return { lgr: resto, nro, bairro };
}

/**
 * Código IBGE do município, que o DPS exige e o pedido não guarda.
 * ViaCEP devolve `ibge` pelo CEP; a reserva é a lista do IBGE por nome + UF.
 * ⚠️ Não achou ⇒ `null`, e o campo fica para a pessoa preencher. Nunca um
 * código "parecido": município errado na nota é nota errada.
 */
export async function ibgeDoMunicipio(cep: string, cidade: string, uf: string): Promise<{ ibge: string; cidade: string; uf: string } | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length === 8) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j = await r.json();
        if (!j.erro && /^\d{7}$/.test(j.ibge ?? "")) return { ibge: j.ibge, cidade: j.localidade ?? cidade, uf: j.uf ?? uf };
      }
    } catch { /* cai para o IBGE */ }
  }
  if (cidade && /^[A-Za-z]{2}$/.test(uf)) {
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const chave = (x: string) => semAcento(x).toLowerCase().replace(/[^a-z0-9]/g, "");
        const alvo = chave(cidade);
        const achados = ((await r.json()) as Array<{ id: number; nome: string }>).filter((m) => chave(m.nome) === alvo);
        if (achados.length === 1) return { ibge: String(achados[0].id), cidade: achados[0].nome, uf: uf.toUpperCase() };
      }
    } catch { /* sem reserva */ }
  }
  return null;
}
