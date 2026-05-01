// CNPJ / CPF auto-lookup — BrasilAPI (free, no auth) + fallback ReceitaWS
// Plan reference: cnpj_service.py logic ported to frontend hook

import { useState, useCallback, useRef } from "react";
import type { CnpjData } from "@/types/crm";

type LookupStatus = "idle" | "loading" | "success" | "error" | "not_found";

interface UseCnpjLookupReturn {
  status: LookupStatus;
  data: CnpjData | null;
  error: string | null;
  lookup: (rawCnpj: string) => Promise<CnpjData | null>;
  reset: () => void;
}

function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false; // all same digits

  const calc = (cnpj: string, weights: number[]) =>
    weights.reduce((sum, w, i) => sum + Number(cnpj[i]) * w, 0);

  const mod = (n: number) => {
    const r = n % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const d1 = mod(calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  const d2 = mod(calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));

  return Number(cnpj[12]) === d1 && Number(cnpj[13]) === d2;
}

async function fetchBrasilApi(cnpj: string): Promise<CnpjData> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (!res.ok) throw new Error(`BrasilAPI ${res.status}`);
  const json = await res.json();

  return {
    cnpj: json.cnpj,
    razao_social: json.razao_social || "",
    nome_fantasia: json.nome_fantasia || null,
    logradouro: json.logradouro || null,
    numero: json.numero || null,
    bairro: json.bairro || null,
    municipio: json.municipio || null,
    uf: json.uf || null,
    cep: json.cep || null,
    cnae_fiscal_descricao: json.cnae_fiscal_descricao || null,
    descricao_situacao_cadastral: (json.descricao_situacao_cadastral || "").toUpperCase(),
  };
}

async function fetchReceitaWs(cnpj: string): Promise<CnpjData> {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ReceitaWS ${res.status}`);
  const json = await res.json();
  if (json.status === "ERROR") throw new Error("NOT_FOUND");

  return {
    cnpj: cnpj,
    razao_social: json.nome || "",
    nome_fantasia: json.fantasia || null,
    logradouro: json.logradouro || null,
    numero: json.numero || null,
    bairro: json.bairro || null,
    municipio: json.municipio || null,
    uf: json.uf || null,
    cep: json.cep?.replace(/\D/g, "") || null,
    cnae_fiscal_descricao: json.atividade_principal?.[0]?.text || null,
    descricao_situacao_cadastral: (json.situacao || "").toUpperCase(),
  };
}

// Simple in-memory cache so the same CNPJ isn't re-fetched in the same session
const cache = new Map<string, CnpjData>();

export function useCnpjLookup(): UseCnpjLookupReturn {
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [data, setData] = useState<CnpjData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookup = useCallback(async (rawCnpj: string): Promise<CnpjData | null> => {
    const cnpj = normalizeCnpj(rawCnpj);
    if (cnpj.length < 14) return null;
    if (!isValidCnpj(cnpj)) {
      setStatus("error");
      setError("CNPJ inválido");
      return null;
    }

    // Return cached result immediately
    if (cache.has(cnpj)) {
      const cached = cache.get(cnpj)!;
      setData(cached);
      setStatus("success");
      setError(null);
      return cached;
    }

    setStatus("loading");
    setError(null);

    try {
      let result: CnpjData;
      try {
        result = await fetchBrasilApi(cnpj);
      } catch (e) {
        if ((e as Error).message === "NOT_FOUND") throw e;
        // BrasilAPI failed — try fallback
        result = await fetchReceitaWs(cnpj);
      }

      cache.set(cnpj, result);
      setData(result);
      setStatus("success");
      setError(null);
      return result;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOT_FOUND") {
        setStatus("not_found");
        setError("CNPJ não encontrado na Receita Federal");
      } else {
        setStatus("error");
        setError("Falha na consulta. Preencha manualmente.");
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("idle");
    setData(null);
    setError(null);
  }, []);

  return { status, data, error, lookup, reset };
}

/** Badge color for CNPJ status */
export function cnpjStatusVariant(status: string | null): "success" | "destructive" | "warning" | "secondary" {
  if (!status) return "secondary";
  const s = status.toUpperCase();
  if (s === "ATIVA") return "success";
  if (s === "BAIXADA" || s === "INAPTA" || s === "NULA") return "destructive";
  if (s === "SUSPENSA") return "warning";
  return "secondary";
}

/** Format raw CNPJ digits to XX.XXX.XXX/XXXX-XX */
export function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
