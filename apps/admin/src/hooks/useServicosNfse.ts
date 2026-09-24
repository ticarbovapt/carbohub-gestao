import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";

// ═══════════════════════════════════════════════════════════════════════════
// Receita de SERVIÇO (NFS-e Nacional) para o Dashboard Comercial
//
// ⚠️ POR QUE ISTO NÃO ESTAVA NO FATURAMENTO, e por que somar é seguro.
//
// Medido em 24/09/2026, antes de escrever uma linha:
//
//   descarbonização dentro do Bling (itens kind='service')  → ZERO linhas
//   pedido só de serviço já contando                        → 0
//   NFS-e emitidas válidas em 2026                          → R$ 551.466,08
//   faturamento do Bling hoje                               → R$ 914.254,57
//
// A causa é estrutural, não esquecimento: `carbo_vendas_metrica.conta_metrica`
// exige NF-e do Bling, e serviço não gera NF-e — gera NFS-e. Logo a
// descarbonização era INVISÍVEL no faturamento, e somá-la NÃO duplica nada.
//
// ⚠️ A conferência de dupla contagem foi feita ANTES porque ela é o único jeito
// de o erro aparecer: um total inflado é plausível, e ninguém desconfia de um
// número que só cresce.
//
// ⚠️ E o efeito é grande: R$ 914 mil → R$ 1,47 milhão, +60% no número que a
// diretoria olha. Quem fechou qualquer mês de 2026 vai ver outro valor.
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ 317 notas (R$ 548.065,56) são código 140101 — lubrificação/limpeza/
// revisão, que é a descarbonização. Outras 3 (R$ 3.400,52) são 170101,
// "Referente a comissão do período…". São 0,6% do valor, e mesmo assim ficam
// SEPARADAS: chamar comissão de descarbonização rotularia errado uma receita de
// outra natureza, e rótulo errado num painel de diretoria é pior que linha a
// mais. Código novo que apareça cai em "outros" e FICA VISÍVEL.
const COD_DESCARBONIZACAO = "140101";

export interface ServicoMes {
  mes: string;               // YYYY-MM — a MESMA chave do `mesIso` do Bling
  descarbonizacao: number;
  outros: number;
  notas: number;
}

// Uma NFS-e como LINHA, para a tela de fonte (`/comercial/dados`).
// ⚠️ Os campos são os da NOTA, não os de um pedido. Não existe `vendedor_id`,
// `segmento` nem `conta_metrica` aqui — inventá-los para caber na tabela de
// pedidos criaria um pedido que não existe em `carboze_orders`, e a ação em
// massa daquela tela tentaria classificar o canal de um id inexistente.
export interface ServicoLinha {
  nsu: number;
  chave: string | null;
  numero: string | null;
  emitida_em: string | null;
  tomador: string;
  doc: string | null;
  valor: number;
  cancelada: boolean;
  codigo: string | null;
  descarbonizacao: boolean;
}

// Cliente de serviço por mês, no MESMO formato dos canais do Bling
// (ativos / novos / acumulado), para o gráfico "Crescimento de Clientes".
export interface ServicoClientesMes {
  mes: string;      // YYYY-MM
  ativos: number;
  novos: number;
  acum: number;
}

export interface ServicosNfse {
  descarbonizacao: number;
  outros: number;
  total: number;
  notas: number;
  // Contagem separada pela mesma razão do valor: a nota de comissão não é
  // descarbonização, e somá-la na contagem repetiria o erro de rótulo.
  notasDescarbonizacao: number;
  ticketMedio: number;
  // A maior nota de serviço do período, para o card "Maior Venda" poder
  // comparar as duas bases em vez de olhar só a do Bling.
  maiorNota: number;
  maiorNotaCliente: string;
  // ⚠️ Chaveado por DOCUMENTO do tomador, igual ao lado do Bling: é isso que
  // deixa as duas recorrências serem SOMADAS sem misturar empresas diferentes.
  porCliente: Map<string, { nome: string; qtd: number }>;
  porMes: ServicoMes[];
  // As notas em si, para a tela de fonte. Mesma base, mesmos filtros.
  linhas: ServicoLinha[];
  // ⚠️ "Novo" é a primeira nota daquele TOMADOR em toda a base lida, não no
  // recorte da tela: com filtro de período, um cliente de 2026 apareceria como
  // novo em cada mês que alguém escolhesse olhar.
  clientesPorMes: ServicoClientesMes[];
  // ⚠️ O mês em que a série COMEÇA. O Bling tem histórico desde out/25, mas o
  // portal nacional só entrega emitidas a partir de jan/26 — os meses
  // anteriores aparecem com zero de serviço, e isso é ausência de DADO, não
  // ausência de serviço. Sem dizer isso, o gráfico afirma que a
  // descarbonização começou em janeiro.
  primeiroMes: string | null;
}

interface Linha {
  nsu: number;
  chave_acesso: string | null;
  numero: string | null;
  papel: string | null;
  toma_nome: string | null;
  toma_doc: string | null;
  cancelada: boolean | null;
  emitida_em: string | null;
  valor_liquido: number | null;
  serv_cod_nacional: string | null;
}

export interface ServicosFiltro { from?: string; to?: string }

export function useServicosNfse(filtros: ServicosFiltro = {}) {
  const { from, to } = filtros;
  return useQuery({
    queryKey: ["dash-comercial-servicos-nfse", from ?? "", to ?? ""],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ServicosNfse> => {
      // ⚠️ `lerTudo` desde o primeiro dia: são ~700 notas/ano e o teto do
      // PostgREST é 1.000, sem aviso. O desempate é o `nsu`, único — sem ordem
      // estável a mesma linha sai em duas páginas e outra em nenhuma.
      const linhas = await lerTudo<Linha>((de, ate) =>
        supabase
          .from("carbo_nfse_visao" as never)
          .select("nsu, chave_acesso, numero, papel, cancelada, emitida_em, valor_liquido, serv_cod_nacional, toma_nome, toma_doc")
          .order("emitida_em", { ascending: false, nullsFirst: false })
          .order("nsu", { ascending: false })
          .range(de, ate) as never,
      );

      const dentro = (iso: string) =>
        (!from || iso >= from) && (!to || iso <= to);

      const porMes = new Map<string, ServicoMes>();
      let descarbonizacao = 0, outros = 0, notas = 0, notasDescarbonizacao = 0;
      let maiorNota = 0, maiorNotaCliente = "—";
      const porCliente = new Map<string, { nome: string; qtd: number }>();
      let primeiroMes: string | null = null;
      const listagem: ServicoLinha[] = [];

      // ⚠️ O "primeiro mês de cada tomador" é calculado sobre a base INTEIRA,
      // antes de qualquer filtro de período. Calculado dentro do recorte, um
      // cliente de janeiro apareceria como NOVO em todo mês que alguém
      // escolhesse olhar — e "novos" é o número que diz se a base cresce.
      const primeiroMesDoCliente = new Map<string, string>();
      for (const l of linhas) {
        if (l.papel !== "emitida" || l.cancelada || !l.emitida_em) continue;
        const doc = (l.toma_doc ?? "").replace(/\D/g, "");
        const id = doc ? `doc:${doc}` : `nome:${(l.toma_nome ?? "").trim().toLocaleLowerCase("pt-BR")}`;
        if (id === "nome:") continue;
        const mes = l.emitida_em.slice(0, 7);
        const atual = primeiroMesDoCliente.get(id);
        if (!atual || mes < atual) primeiroMesDoCliente.set(id, mes);
      }
      const ativosPorMes = new Map<string, Set<string>>();
      const novosPorMes = new Map<string, number>();

      for (const l of linhas) {
        // A LISTA mostra a nota cancelada; o TOTAL não a soma. Escondê-la
        // faria o número fechar e a conferência ficar impossível — mesma razão
        // de o usuário bloqueado não sumir da tela de Usuários.
        if (l.papel === "emitida" && l.emitida_em && dentro(l.emitida_em.slice(0, 10))) {
          listagem.push({
            nsu: l.nsu,
            chave: l.chave_acesso,
            numero: l.numero,
            emitida_em: l.emitida_em,
            tomador: l.toma_nome || "—",
            doc: l.toma_doc,
            valor: Number(l.valor_liquido) || 0,
            cancelada: l.cancelada === true,
            codigo: l.serv_cod_nacional,
            descarbonizacao: (l.serv_cod_nacional ?? "").replace(/\D/g, "") === COD_DESCARBONIZACAO,
          });
        }

        // ⚠️ Só EMITIDA e só VÁLIDA. `recebida` é despesa — somá-la aqui
        // inverteria o sinal do dinheiro dentro do faturamento, que é o erro
        // que a tela da NFS-e existe para evitar.
        if (l.papel !== "emitida") continue;
        if (l.cancelada) continue;
        if (!l.emitida_em) continue;

        const dia = l.emitida_em.slice(0, 10);
        if (!dentro(dia)) continue;

        const mes = dia.slice(0, 7);
        const v = Number(l.valor_liquido) || 0;
        const eDescarb = (l.serv_cod_nacional ?? "").replace(/\D/g, "") === COD_DESCARBONIZACAO;

        const atual = porMes.get(mes) ?? { mes, descarbonizacao: 0, outros: 0, notas: 0 };
        if (eDescarb) { atual.descarbonizacao += v; descarbonizacao += v; notasDescarbonizacao++; }
        else { atual.outros += v; outros += v; }
        atual.notas++;
        porMes.set(mes, atual);

        notas++;
        if (v > maiorNota) { maiorNota = v; maiorNotaCliente = l.toma_nome || "—"; }

        const doc = (l.toma_doc ?? "").replace(/\D/g, "");
        const nome = l.toma_nome || "—";
        const chave = doc ? `doc:${doc}` : `nome:${nome.toLocaleLowerCase("pt-BR")}`;
        const cli = porCliente.get(chave) ?? { nome, qtd: 0 };
        cli.qtd++;
        porCliente.set(chave, cli);

        // Ativo no mês = teve nota naquele mês. Conjunto, não contador: duas
        // notas do mesmo cliente no mesmo mês são UM cliente ativo.
        let ativos = ativosPorMes.get(mes);
        if (!ativos) { ativos = new Set(); ativosPorMes.set(mes, ativos); }
        ativos.add(chave);
        if (primeiroMesDoCliente.get(chave) === mes && !novosPorMes.has(`${mes}|${chave}`)) {
          novosPorMes.set(`${mes}|${chave}`, 1);
        }

        if (!primeiroMes || mes < primeiroMes) primeiroMes = mes;
      }

      // ⚠️ O acumulado soma os NOVOS mês a mês, nunca `ativos` — somar ativos
      // contaria de novo o cliente que comprou em dois meses, e a curva de base
      // passaria a subir mais rápido que a base real.
      const mesesClientes = Array.from(ativosPorMes.keys()).sort();
      let acum = 0;
      const clientesPorMes: ServicoClientesMes[] = mesesClientes.map((mes) => {
        let novosDoMes = 0;
        for (const k of novosPorMes.keys()) if (k.startsWith(`${mes}|`)) novosDoMes++;
        acum += novosDoMes;
        return { mes, ativos: ativosPorMes.get(mes)?.size ?? 0, novos: novosDoMes, acum };
      });

      return {
        descarbonizacao,
        outros,
        total: descarbonizacao + outros,
        notas,
        notasDescarbonizacao,
        ticketMedio: notas > 0 ? (descarbonizacao + outros) / notas : 0,
        maiorNota,
        maiorNotaCliente,
        porCliente,
        porMes: Array.from(porMes.values()).sort((a, b) => a.mes.localeCompare(b.mes)),
        linhas: listagem,
        clientesPorMes,
        primeiroMes,
      };
    },
  });
}
