import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";

// ═══════════════════════════════════════════════════════════════════════════
// NFS-e Nacional — leitura para a tela do Finanças
//
// A regra toda (papel, cancelamento, valores) mora no BANCO, nas views da
// `20261002`. Aqui só há IO. Recalcular "é emitida ou recebida?" no front
// criaria a segunda definição do mesmo fato — e a divergência apareceria como
// dois totais diferentes para o mesmo mês, sem erro nenhum.
// ═══════════════════════════════════════════════════════════════════════════

export interface NfseRow {
  ambiente: string;
  nsu: number;
  chave_acesso: string | null;
  numero: string | null;
  situacao_codigo: string | null;
  municipio_emissao: string | null;
  municipio_prestacao: string | null;
  servico_nacional: string | null;
  emit_cnpj: string | null;
  emit_nome: string | null;
  toma_doc: string | null;
  toma_nome: string | null;
  emitida_em: string | null;
  processada_em: string | null;
  competencia: string | null;
  valor_liquido: number | null;
  base_calculo: number | null;
  total_retido: number | null;
  valor_servico: number | null;
  descricao: string | null;
  papel: "emitida" | "recebida" | "indefinido";
  // ⚠️ `cancelada` cobre CANCELAMENTO **e** CANCELAMENTO_POR_SUBSTITUICAO: os
  // dois tiram a nota do valor válido. `cancelamento_tipo` separa os dois,
  // porque na substituição existe uma nota nova e o valor não sumiu.
  cancelada: boolean;
  cancelamento_tipo: string | null;
  cancelada_em: string | null;
  cancelamento_motivo: string | null;
  // CONFIRMACAO_TOMADOR é o OPOSTO de cancelamento — o tomador confirmando.
  confirmada_tomador: boolean;
  confirmada_em: string | null;
  // ⚠️ O elo da substituição mora na nota NOVA (`substitui_chave`), apontando
  // para trás. `substituida_por_*` é o outro lado, resolvido no banco — sem
  // ele, "Substituída" informa um fim sem apontar a continuação.
  substitui_chave: string | null;
  substituicao_motivo: string | null;
  substituida_por_chave: string | null;
  substituida_por_numero: string | null;
}

export interface NfseSaude {
  ultimo_nsu: number;
  notas: number;
  eventos: number;
  malformados: number;
  ultima_rodada: string | null;
  ultimo_status: string | null;
  ultimo_erro: string | null;
  parada: boolean;
}

const COLUNAS =
  "ambiente,nsu,chave_acesso,numero,situacao_codigo,municipio_emissao,municipio_prestacao," +
  "servico_nacional,emit_cnpj,emit_nome,toma_doc,toma_nome,emitida_em,processada_em," +
  "competencia,valor_liquido,base_calculo,total_retido,valor_servico,descricao," +
  "papel,cancelada,cancelamento_tipo,cancelada_em,cancelamento_motivo," +
  "confirmada_tomador,confirmada_em,substitui_chave,substituicao_motivo," +
  "substituida_por_chave,substituida_por_numero";

export function useNfse() {
  return useQuery({
    queryKey: ["nfse_visao"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NfseRow[]> =>
      // ⚠️ `lerTudo` desde o PRIMEIRO dia, com 696 linhas — bem abaixo do teto
      // de 1.000 do PostgREST. Não é excesso de zelo: são ~700 notas por ano,
      // então a tabela cruza o teto em meses. E o defeito dessa família é
      // invisível até cruzar — depois some um ano de cada vez, do mais antigo
      // para o mais novo, sem erro. Acrescentar a paginação depois exigiria
      // alguém notar que sumiu.
      //
      // ⚠️ O desempate é o `nsu`, que é único por (ambiente, nsu): `emitida_em`
      // tem empates (duas notas no mesmo dia já apareceram na primeira carga),
      // e sem ordem estável a mesma linha volta em duas páginas enquanto outra
      // não volta nenhuma.
      await lerTudo<NfseRow>((de, ate) =>
        (supabase as any)
          .from("carbo_nfse_visao")
          .select(COLUNAS)
          .order("emitida_em", { ascending: false, nullsFirst: false })
          .order("nsu", { ascending: false })
          .range(de, ate),
      ),
  });
}

// ⚠️ O XML CRU vem de `carbo_nfse_dfe`, não das views: as views entregam o
// parse, e o financeiro precisa do documento fiscal em si — é ele que vale
// para a contabilidade. Buscar sob demanda (e não trazer junto da lista) é o
// que impede 697 documentos inteiros de atravessarem a rede a cada abertura.
export async function baixarXmlNfse(n: { ambiente: string; nsu: number; numero: string | null }) {
  const { data, error } = await (supabase as any)
    .from("carbo_nfse_dfe")
    .select("xml, xml_ok")
    .eq("ambiente", n.ambiente)
    .eq("nsu", n.nsu)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // ⚠️ Ausência é dita, nunca disfarçada de arquivo vazio: baixar um .xml de
  // 0 byte faria a pessoa achar que tem o documento e descobrir no contador.
  if (!data?.xml) throw new Error("Esta nota não tem XML guardado.");

  const nome = `NFSe-${n.numero ?? n.nsu}.xml`;
  const url = URL.createObjectURL(new Blob([data.xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sem o revoke a aba segura o documento inteiro em memória até fechar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useNfseSaude() {
  return useQuery({
    queryKey: ["nfse_saude"],
    staleTime: 60 * 1000,
    // A tela relê sozinha de minuto em minuto. ⚠️ Isso NÃO torna o dado mais
    // fresco — quem busca no ADN é o cron de 1 h. Acelerar só a tela daria
    // sensação de tempo real sobre um número de uma hora atrás, que é pior que
    // não acelerar; o que este refetch faz é mostrar a rodada assim que ela
    // acontece, e denunciar `parada` sem depender de um F5.
    refetchInterval: 60 * 1000,
    queryFn: async (): Promise<NfseSaude | null> => {
      const { data, error } = await (supabase as any)
        .from("carbo_nfse_saude")
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as NfseSaude) ?? null;
    },
  });
}
