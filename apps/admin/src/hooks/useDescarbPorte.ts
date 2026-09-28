import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";
import { DESCARB_MODALIDADES } from "@carbo/shell";

// ═══════════════════════════════════════════════════════════════════════════
// CarboVAPT por PORTE — e por que a fonte é a VENDA, não a nota
//
// Medido em 28/09/2026, procurando o porte em três lugares:
//
//   NFS-e (`descricao`)   o detalhe estruturado `texto|qtd|unit|total#` existe
//                         de 07/01 a 30/04 e ACABA ali — de 04/05 em diante,
//                         172 notas e R$ 461 mil sem detalhe nenhum. Não é
//                         cobertura parcial, é CORTE DE DATA: a numeração das
//                         notas reiniciou (2120 → 50), ou seja, trocou-se de
//                         emissor por volta de 01/05. E o porte NUNCA está
//                         escrito com a palavra, em nenhum período.
//   `crm_os`              VAZIA. Ninguém usa aquela tela, e ela nem tem coluna
//                         de porte — só placa, modelo e qtd_veiculos.
//   `carboze_orders`      ✅ AQUI. O `/vender` tem linha de serviço própria com
//                         `modality` P/M/G (lista fechada, preço fixo em
//                         `DESCARB_MODALIDADES`), gravada no item.
//
// ⚠️ ISTO NÃO É UM RECORTE DA RECEITA DE SERVIÇO. São duas bases diferentes:
// aqui está o que foi REGISTRADO na venda; o faturamento continua sendo a
// NFS-e (`useServicosNfse`). Elas não se somam nem se subtraem — a razão entre
// as duas é uma COBERTURA, não uma partição, porque não existe elo entre o
// pedido e a nota (a nota é emitida fora do sistema). Apresentar "dos quais"
// seria afirmar um vínculo que não medimos.
//
// Medido na janela de ago/26 em diante: 32 veículos e R$ 43.800 no `/vender`
// contra R$ 130.398,72 em 56 notas — 33,6%. O fluxo de serviço na tela começou
// em 03/08/2026.
// ═══════════════════════════════════════════════════════════════════════════

/** Um porte, sempre presente na saída mesmo valendo zero (ver `LINHAS`). */
export interface PorteLinha {
  porte: string;
  rotulo: string;
  /** "até 2.5L · flex" — a mesma dica que o vendedor vê ao escolher. */
  motor: string;
  preco: number;
  veiculos: number;
  total: number;
  pedidos: number;
}

export interface DescarbPorte {
  linhas: PorteLinha[];
  veiculos: number;
  total: number;
  pedidos: number;
  /** Primeira e última venda de serviço no recorte — "começou em 03/08". */
  primeira: string | null;
  ultima: string | null;
}

export interface PorteFiltro { from?: string; to?: string }

interface Item {
  kind?: string | null;
  modality?: string | null;
  quantity?: number | string | null;
  quantidade?: number | string | null;
  unit_price?: number | string | null;
  preco_unitario?: number | string | null;
}
interface Pedido {
  id: string;
  status: string | null;
  created_at: string;
  sale_date: string | null;
  items: Item[] | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function useDescarbPorte(filtros: PorteFiltro = {}) {
  const { from, to } = filtros;
  return useQuery({
    queryKey: ["dash-comercial-descarb-porte", from ?? "", to ?? ""],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DescarbPorte> => {
      // ⚠️ `lerTudo`, não uma consulta solta: `carboze_orders` já passou de
      // 1.400 linhas e o teto do PostgREST é 1.000, SEM aviso. Foi esse teto
      // que fez esta mesma tela mostrar 865 pedidos de 1.170. O desempate é o
      // `id`, único — sem ordem estável a mesma linha sai em duas páginas.
      const pedidos = await lerTudo<Pedido>((de, ate) =>
        supabase
          .from("carboze_orders" as never)
          .select("id, status, created_at, sale_date, items")
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(de, ate) as never,
      );

      // ⚠️ A data é `data_efetiva` (`sale_date` quando existe, senão a
      // criação) — a MESMA régua do resto do painel. Recortar por `created_at`
      // faria o pedido criado num mês e faturado no seguinte cair no mês
      // errado, que é o defeito já pago em `/vendas`.
      const dentro = (p: Pedido) => {
        const eff = p.sale_date ?? (p.created_at ?? "").substring(0, 10);
        return (!from || eff >= from) && (!to || eff <= to);
      };

      // Sempre as TRÊS, mesmo zeradas. Porte ausente da saída sumiria da tela
      // em vez de aparecer como coluna vazia — e "não vendemos M" e "não
      // registramos nenhum M" são respostas diferentes. É a mesma lição das
      // etapas do Rastreio que sumiam do quadro.
      const acc = new Map<string, PorteLinha>(
        DESCARB_MODALIDADES.map((m) => [
          m.key,
          {
            porte: m.key,
            rotulo: m.label,
            motor: `${m.motor} · ${m.fuels.length === 2 ? "flex ou diesel" : m.fuels[0]}`,
            preco: m.price,
            veiculos: 0,
            total: 0,
            pedidos: 0,
          },
        ]),
      );
      // ⚠️ Balde do que veio SEM modalidade. Hoje é zero (medido), e é
      // exatamente por isso que ele precisa existir: o dia em que alguém salvar
      // serviço sem porte, o número tem de APARECER, não se diluir nos três.
      const semPorte: PorteLinha = {
        porte: "?", rotulo: "Sem porte", motor: "registrado sem modalidade",
        preco: 0, veiculos: 0, total: 0, pedidos: 0,
      };

      let veiculos = 0, total = 0;
      const pedidosComServico = new Set<string>();
      let primeira: string | null = null, ultima: string | null = null;

      for (const p of pedidos) {
        const st = (p.status ?? "").toLowerCase();
        if (st === "quote" || st === "cancelled") continue;
        if (!dentro(p)) continue;
        const itens = Array.isArray(p.items) ? p.items : [];

        const daqui = new Set<string>();
        for (const i of itens) {
          if ((i?.kind ?? "") !== "service") continue;
          const qtd = num(i.quantity ?? i.quantidade);
          const preco = num(i.unit_price ?? i.preco_unitario);
          const linha = acc.get((i.modality ?? "").toUpperCase()) ?? semPorte;
          linha.veiculos += qtd;
          linha.total += qtd * preco;
          daqui.add(linha.porte);
          veiculos += qtd;
          total += qtd * preco;
        }
        if (daqui.size === 0) continue;

        pedidosComServico.add(p.id);
        // Um pedido com P e G conta uma vez em CADA porte — é contagem de
        // pedidos por porte, não rateio.
        for (const k of daqui) (acc.get(k) ?? semPorte).pedidos += 1;

        const eff = p.sale_date ?? (p.created_at ?? "").substring(0, 10);
        if (!primeira || eff < primeira) primeira = eff;
        if (!ultima || eff > ultima) ultima = eff;
      }

      const linhas = [...acc.values()];
      if (semPorte.veiculos > 0 || semPorte.total > 0) linhas.push(semPorte);

      return {
        linhas,
        veiculos,
        total,
        pedidos: pedidosComServico.size,
        primeira,
        ultima,
      };
    },
  });
}
