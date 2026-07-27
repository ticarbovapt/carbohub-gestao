import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Busca de endereço por CEP (ViaCEP, com BrasilAPI de reserva).
//
// Serve para CONFERÊNCIA: quem cota digita o CEP e vê na hora que endereço é
// aquele. CEP errado digitado por engano é o erro mais barato de pegar aqui e
// o mais caro de descobrir depois que a carga saiu.
//
// A cotação da Jamef NÃO depende disto — ela resolve o município pela própria
// tabela de faixas. Se as duas APIs caírem, a cotação continua funcionando.
// ─────────────────────────────────────────────────────────────────────────────

export interface Endereco {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
}

interface ViaCepResp {
  erro?: boolean | string;
  cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
}
interface BrasilApiResp {
  cep?: string; street?: string; neighborhood?: string; city?: string; state?: string;
}

async function viaCep(cep: string): Promise<Endereco | null> {
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!r.ok) throw new Error("viacep");
  const d = (await r.json()) as ViaCepResp;
  if (d.erro || !d.localidade || !d.uf) return null;
  return {
    cep, logradouro: d.logradouro || null, bairro: d.bairro || null,
    cidade: d.localidade, uf: d.uf,
  };
}

async function brasilApi(cep: string): Promise<Endereco | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!r.ok) return null;
  const d = (await r.json()) as BrasilApiResp;
  if (!d.city || !d.state) return null;
  return {
    cep, logradouro: d.street || null, bairro: d.neighborhood || null,
    cidade: d.city, uf: d.state,
  };
}

export function useCepLookup(cepRaw: string) {
  const [endereco, setEndereco] = useState<Endereco | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const cep = (cepRaw || "").replace(/\D/g, "");

  useEffect(() => {
    if (cep.length !== 8) { setEndereco(null); setNaoEncontrado(false); return; }
    let ativo = true;
    setBuscando(true); setNaoEncontrado(false);
    (async () => {
      try {
        let e: Endereco | null = null;
        try { e = await viaCep(cep); } catch { e = await brasilApi(cep); }
        if (!ativo) return;
        setEndereco(e);
        setNaoEncontrado(e === null);
      } catch {
        // Sem internet/API fora: não é erro do usuário e não bloqueia a cotação.
        if (ativo) { setEndereco(null); setNaoEncontrado(false); }
      } finally {
        if (ativo) setBuscando(false);
      }
    })();
    return () => { ativo = false; };
  }, [cep]);

  return { endereco, buscando, naoEncontrado };
}
