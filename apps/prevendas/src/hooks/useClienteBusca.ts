import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete de cliente na /vender — busca em quem JÁ É NOSSO.
//
// Enquanto o vendedor digita o CNPJ (ou o nome), procura em carboze_orders +
// crm_sales_leads via RPC carbo_clientes_busca. Escolher uma sugestão preenche
// o que o sistema já sabe, em vez de redigitar cliente que compra todo mês.
//
// Não confundir com o botão "Buscar dados": aquele vai à Receita Federal e
// serve para cliente NOVO. Este evita recadastrar cliente antigo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteSugestao {
  doc: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  ie: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  pedidos: number;
  ultimo: string | null;
  tipo: "cliente" | "lead";
}

/** Busca com debounce. `termo` é o que está no campo, com máscara ou sem. */
export function useClienteBusca(termo: string, ativo = true) {
  const [sugestoes, setSugestoes] = useState<ClienteSugestao[]>([]);
  const [buscando, setBuscando] = useState(false);

  const digits = (termo || "").replace(/\D/g, "");
  const texto = (termo || "").trim();
  // Mesmo piso da função no banco — abaixo disso a lista traria a base inteira.
  const vale = digits.length >= 3 || texto.length >= 3;

  useEffect(() => {
    if (!ativo || !vale) { setSugestoes([]); return; }

    let vivo = true;
    // 250ms: rápido o bastante para parecer instantâneo, lento o bastante para
    // não disparar uma consulta por tecla.
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc("carbo_clientes_busca", { p_termo: termo, p_limit: 8 });
        if (!vivo) return;
        if (error) {
          // Falhar aqui não pode atrapalhar a venda: o vendedor segue
          // digitando normalmente. Mas o motivo não some.
          console.warn("[useClienteBusca] busca falhou:", error);
          setSugestoes([]);
          return;
        }
        setSugestoes((data as ClienteSugestao[]) ?? []);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 250);

    return () => { vivo = false; clearTimeout(t); };
  }, [termo, ativo, vale]);

  return { sugestoes, buscando };
}

/** "12.345.678/0001-90" ou "123.456.789-00" a partir dos dígitos. */
export function formatDocDigits(d: string): string {
  const s = (d || "").replace(/\D/g, "");
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  return s;
}
