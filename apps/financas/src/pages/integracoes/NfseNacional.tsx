import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileSpreadsheet, ArrowUpRight, ArrowDownLeft, Ban, AlertTriangle, CheckCircle2,
  Repeat, FileCode2, Loader2, Scale,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboButton } from "@/components/ui/carbo-button";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow,
  CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNfse, useNfseSaude, baixarXmlNfse, type NfseRow } from "@/hooks/useNfse";

// ═══════════════════════════════════════════════════════════════════════════
// NFS-e Nacional — as notas de serviço do Portal Nacional (ADN gov.br)
//
// ⚠️ A tela NÃO calcula nada sobre a NOTA. Papel, cancelamento e valores vêm
// prontos de `carbo_nfse_visao`. Recalcular aqui criaria a segunda definição do
// mesmo fato — e a divergência apareceria como dois totais para o mesmo mês.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ EMITIDA E RECEBIDA NÃO SE SOMAM — e o nome do documento ENGANA
//
// Pedido do dono do processo em 24/09/2026, ao ver a aba "Todas" com mais de
// R$ 1 milhão: *"não tem como ser, pq tem gastos e recebimentos ali, não são
// valores que se somam"*. Estava certo — e o defeito era desta tela.
//
//     emitida   a Carbo PRESTOU o serviço      dinheiro ENTRA   → RECEITA
//     recebida  a Carbo CONTRATOU o serviço    dinheiro SAI     → DESPESA
//
// ⚠️ "Nota recebida" é dinheiro SAINDO, e é por isso que a tela passou a falar
// em **Receita** e **Despesa** em vez de repetir o nome do documento: quem lê
// o número é o financeiro, e "recebida" convida à leitura exatamente oposta.
//
// Consequência no desenho: na aba "Todas" NÃO existe um total único. Há dois
// números separados e um saldo explícito. Um só, somando as duas pontas, é o
// número que não significa nada — e ele estava na tela.
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ ANO EM QUE AS EMITIDAS COMEÇAM. Medido na primeira carga: as recebidas vão
// a fev/2023, as emitidas só a partir de 07/01/2026 — a empresa passou a emitir
// pelo sistema nacional naquele mês. Sem dizer isso, filtrar 2025 mostraria
// ZERO emitidas, e zero se lê como "não vendemos", não como "o dado não existe
// no portal".
const ANO_INICIO_EMITIDAS = 2026;

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

type Papel = "emitida" | "recebida" | "todas";
type Situacao = "todas" | "validas" | "canceladas";

// A contraparte é a OUTRA ponta: numa nota emitida é o tomador, numa recebida é
// o prestador. Coluna fixa repetiria "CARBO SOLUCOES LTDA" em metade da tela.
function contraparte(n: NfseRow): string {
  if (n.papel === "emitida") return n.toma_nome || n.toma_doc || "—";
  return n.emit_nome || n.emit_cnpj || "—";
}

// ⚠️ O selo de DIREÇÃO fala de dinheiro, não de documento. É o que responde
// "esta é de receber ou de pagar?" sem exigir que a pessoa lembre que nota
// recebida é despesa.
function seloDirecao(n: NfseRow) {
  if (n.papel === "emitida") {
    return (
      <CarboBadge variant="success" size="sm" title="A Carbo prestou o serviço — dinheiro entra">
        <ArrowUpRight className="h-3 w-3 mr-1" />Receita
      </CarboBadge>
    );
  }
  if (n.papel === "recebida") {
    return (
      <CarboBadge variant="warning" size="sm" title="A Carbo contratou o serviço — dinheiro sai">
        <ArrowDownLeft className="h-3 w-3 mr-1" />Despesa
      </CarboBadge>
    );
  }
  // ⚠️ `indefinido` APARECE. Colapsá-lo num dos dois inventaria direção de
  // dinheiro a partir de ausência — e aqui isso entra direto num total.
  return <CarboBadge variant="outline" size="sm">Indefinida</CarboBadge>;
}

// ⚠️ Cancelamento e substituição têm rótulos DIFERENTES de propósito: os dois
// tiram a nota do total, mas na substituição existe uma nota nova e o valor não
// sumiu. Quem confere o mês precisa saber qual é qual.
function selo(n: NfseRow) {
  if (n.cancelada) {
    const sub = (n.cancelamento_tipo ?? "").toUpperCase().includes("SUBSTITU");
    if (!sub) {
      return <CarboBadge variant="cancelled" size="sm"><Ban className="h-3 w-3 mr-1" />Cancelada</CarboBadge>;
    }
    return (
      <CarboBadge variant="warning" size="sm"
                  title={n.substituicao_motivo ?? n.cancelamento_motivo ?? undefined}>
        <Repeat className="h-3 w-3 mr-1" />
        {n.substituida_por_numero ? `Substituída pela ${n.substituida_por_numero}` : "Substituída"}
      </CarboBadge>
    );
  }
  if (n.substitui_chave) {
    return <CarboBadge variant="info" size="sm"><Repeat className="h-3 w-3 mr-1" />Substitui outra</CarboBadge>;
  }
  if (n.confirmada_tomador) {
    return <CarboBadge variant="success" size="sm"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmada</CarboBadge>;
  }
  return <CarboBadge variant="outline" size="sm">Válida</CarboBadge>;
}

function BotaoXml({ n }: { n: NfseRow }) {
  const [baixando, setBaixando] = useState(false);
  return (
    <CarboButton
      variant="outline" size="sm" disabled={baixando}
      title="Baixar o XML da nota (documento fiscal)"
      onClick={async () => {
        setBaixando(true);
        try {
          await baixarXmlNfse(n);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBaixando(false);
        }
      }}
    >
      {baixando
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <FileCode2 className="h-3.5 w-3.5" />}
      <span className="ml-1">XML</span>
    </CarboButton>
  );
}

export default function NfseNacional() {
  // O estado mora na URL, como no seletor do e-commerce: sem isso o F5 devolve
  // a aba errada e não dá para mandar "olha 2025" a alguém.
  const [params, setParams] = useSearchParams();
  const papel = (params.get("papel") as Papel) || "emitida";
  const ano = params.get("ano") || "todos";
  const situacao = (params.get("sit") as Situacao) || "todas";
  const busca = params.get("q") || "";

  const troca = (chave: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (!valor || valor === "todos" || valor === "todas") p.delete(chave);
    else p.set(chave, valor);
    setParams(p, { replace: true });
  };

  const { data: notas, isLoading, error } = useNfse();
  const { data: saude } = useNfseSaude();

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const n of notas ?? []) {
      if (n.emitida_em) s.add(String(new Date(n.emitida_em).getFullYear()));
    }
    return Array.from(s).sort().reverse();
  }, [notas]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (notas ?? []).filter((n) => {
      if (papel !== "todas" && n.papel !== papel) return false;
      if (situacao === "validas" && n.cancelada) return false;
      if (situacao === "canceladas" && !n.cancelada) return false;
      if (ano !== "todos") {
        if (!n.emitida_em) return false;
        if (String(new Date(n.emitida_em).getFullYear()) !== ano) return false;
      }
      if (!termo) return true;
      return [n.numero, n.emit_nome, n.toma_nome, n.emit_cnpj, n.toma_doc,
              n.descricao, n.chave_acesso]
        .some((c) => (c ?? "").toLowerCase().includes(termo));
    });
  }, [notas, papel, ano, situacao, busca]);

  // ⚠️ Os totais são SEPARADOS por direção, sempre — inclusive quando a aba é
  // de um papel só. É o que impede a aba "Todas" de voltar a mostrar um número
  // que soma dinheiro que entra com dinheiro que sai.
  //
  // Nota cancelada NÃO entra no total, mas CONTINUA na lista: escondê-la faria
  // o número fechar e a conferência ficar impossível — a razão de o usuário
  // bloqueado não sumir da tela de Usuários.
  const resumo = useMemo(() => {
    const validas = lista.filter((n) => !n.cancelada);
    const soma = (p: string) =>
      validas.filter((n) => n.papel === p).reduce((s, n) => s + num(n.valor_liquido), 0);
    const receita = soma("emitida");
    const despesa = soma("recebida");
    return {
      total: lista.length,
      canceladas: lista.length - validas.length,
      indefinidas: validas.filter((n) => n.papel === "indefinido").length,
      receita,
      despesa,
      saldo: receita - despesa,
      retido: validas.reduce((s, n) => s + num(n.total_retido), 0),
    };
  }, [lista]);

  // O aviso só aparece quando é VERDADEIRO para o que está na tela. Aviso
  // permanente vira paisagem e deixa de ser lido.
  const avisoHistorico =
    papel !== "recebida" && ano !== "todos" && Number(ano) < ANO_INICIO_EMITIDAS;

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <CarboPageHeader
        title="NFS-e Nacional"
        description="Notas de serviço do Portal Nacional (gov.br) — emitidas (receita) e recebidas (despesa)"
        icon={FileSpreadsheet}
        iconColor="blue"
      />

      {saude && (
        <CarboCard>
          <CarboCardContent className="py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-muted-foreground">
              Último NSU lido: <strong className="text-foreground">{saude.ultimo_nsu}</strong>
            </span>
            <span className="text-muted-foreground">
              {saude.notas} notas · {saude.eventos} eventos
            </span>
            <span className="text-muted-foreground">
              Última leitura: <strong className="text-foreground">
                {saude.ultima_rodada ? new Date(saude.ultima_rodada).toLocaleString("pt-BR") : "nunca"}
              </strong>
            </span>
            {saude.parada && (
              <CarboBadge variant="warning" size="sm">
                <AlertTriangle className="h-3 w-3 mr-1" />Sem leitura há mais de 3 h
              </CarboBadge>
            )}
            {saude.malformados > 0 && (
              <CarboBadge variant="destructive" size="sm">
                {saude.malformados} documento(s) que não abriram
              </CarboBadge>
            )}
            {saude.ultimo_erro && (
              <CarboBadge variant="destructive" size="sm">Erro na última leitura</CarboBadge>
            )}
          </CarboCardContent>
        </CarboCard>
      )}

      {/* ⚠️ QUATRO cartões, e Receita e Despesa NUNCA se fundem num só. Na aba
          "Todas" o quarto é o SALDO — explícito, com sinal —, em vez de um
          "valor líquido" que somaria as duas pontas. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CarboKPI title="Notas no filtro" value={resumo.total}
                  icon={FileSpreadsheet} iconColor="blue" animated />
        <CarboKPI title="Receita (emitidas válidas)" value={fmtBRL(resumo.receita)}
                  icon={ArrowUpRight} iconColor="green" />
        <CarboKPI title="Despesa (recebidas válidas)" value={fmtBRL(resumo.despesa)}
                  icon={ArrowDownLeft} iconColor="warning" />
        {papel === "todas" ? (
          <CarboKPI title="Saldo (receita − despesa)" value={fmtBRL(resumo.saldo)}
                    icon={Scale} iconColor={resumo.saldo >= 0 ? "green" : "destructive"} />
        ) : (
          <CarboKPI title="Canceladas" value={resumo.canceladas}
                    icon={Ban} iconColor={resumo.canceladas ? "destructive" : "muted"} animated />
        )}
      </div>

      {papel === "todas" && (
        <CarboCard>
          <CarboCardContent className="py-3 flex items-start gap-2 text-sm">
            <Scale className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">Receita e despesa não se somam.</strong>{" "}
              Nota <strong>emitida</strong> é serviço que a Carbo prestou (dinheiro entra);
              nota <strong>recebida</strong> é serviço que a Carbo contratou (dinheiro sai).
              O saldo acima é só o de <strong>serviços</strong> — não é lucro, e não inclui
              venda de produto.
              {resumo.canceladas > 0 && <> {resumo.canceladas} cancelada(s) estão na lista e fora dos totais.</>}
            </span>
          </CarboCardContent>
        </CarboCard>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={papel} onValueChange={(v) => troca("papel", v)}>
          <TabsList>
            <TabsTrigger value="emitida">Emitidas · receita</TabsTrigger>
            <TabsTrigger value="recebida">Recebidas · despesa</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={situacao} onValueChange={(v) => troca("sit", v)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="validas">Só válidas</TabsTrigger>
            <TabsTrigger value="canceladas">Canceladas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={ano} onValueChange={(v) => troca("ano", v)}>
          <TabsList>
            <TabsTrigger value="todos">Todos os anos</TabsTrigger>
            {anos.map((a) => <TabsTrigger key={a} value={a}>{a}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div className="ml-auto w-full sm:w-72">
          <CarboSearchInput
            placeholder="Nº, CNPJ, nome, descrição ou chave…"
            value={busca}
            onChange={(e) => troca("q", e.target.value)}
          />
        </div>
      </div>

      {resumo.indefinidas > 0 && (
        <CarboCard>
          <CarboCardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              {resumo.indefinidas} nota(s) com direção <strong>indefinida</strong> — a Carbo não
              aparece como prestadora nem como tomadora (provável intermediação). Elas ficam
              <strong> fora</strong> da receita e da despesa de propósito.
            </span>
          </CarboCardContent>
        </CarboCard>
      )}

      {avisoHistorico && (
        <CarboCard>
          <CarboCardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              A empresa passou a emitir NFS-e pelo sistema nacional em{" "}
              <strong className="text-foreground">janeiro de {ANO_INICIO_EMITIDAS}</strong>.
              Nenhuma nota emitida em {ano} está aqui — e isso é ausência de dado no portal,
              não ausência de faturamento. As <strong>recebidas</strong> existem desde 2023.
            </span>
          </CarboCardContent>
        </CarboCard>
      )}

      {error && (
        <CarboCard>
          <CarboCardContent className="py-3 text-sm text-destructive">
            Não consegui ler as notas: {(error as Error).message}
          </CarboCardContent>
        </CarboCard>
      )}

      <CarboCard>
        <CarboCardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <CarboSkeleton key={i} className="h-10" />)}
            </div>
          ) : lista.length === 0 ? (
            <CarboEmptyState
              icon={FileSpreadsheet}
              title="Nenhuma nota neste filtro"
              description="Troque o ano, a aba ou limpe a busca."
            />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Nº</CarboTableHead>
                  <CarboTableHead>Emissão</CarboTableHead>
                  <CarboTableHead>Direção</CarboTableHead>
                  <CarboTableHead>
                    {papel === "emitida" ? "Tomador" : papel === "recebida" ? "Prestador" : "Contraparte"}
                  </CarboTableHead>
                  <CarboTableHead>Serviço</CarboTableHead>
                  <CarboTableHead>Município</CarboTableHead>
                  <CarboTableHead className="text-right">Serviço</CarboTableHead>
                  <CarboTableHead className="text-right">Líquido</CarboTableHead>
                  <CarboTableHead>Situação</CarboTableHead>
                  <CarboTableHead>Arquivo</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {lista.map((n) => {
                  // `valor_servico` e `valor_liquido` são colunas SEPARADAS, e
                  // isso foi medido: divergem em 7 das 697, com R$ 6.541,77 de
                  // retenção. Mostrar um só faria a diferença sumir justo nas
                  // notas com imposto retido.
                  const divergem = num(n.valor_servico) !== num(n.valor_liquido);
                  return (
                    <CarboTableRow key={`${n.ambiente}-${n.nsu}`}
                                   className={n.cancelada ? "opacity-60" : undefined}>
                      <CarboTableCell className="font-medium">{n.numero ?? "—"}</CarboTableCell>
                      <CarboTableCell>{fmtData(n.emitida_em)}</CarboTableCell>
                      <CarboTableCell>{seloDirecao(n)}</CarboTableCell>
                      <CarboTableCell className="max-w-[240px] truncate" title={contraparte(n)}>
                        {contraparte(n)}
                      </CarboTableCell>
                      <CarboTableCell className="max-w-[280px] truncate"
                                      title={n.descricao ?? n.servico_nacional ?? ""}>
                        {n.descricao ?? n.servico_nacional ?? "—"}
                      </CarboTableCell>
                      <CarboTableCell>{n.municipio_emissao ?? "—"}</CarboTableCell>
                      <CarboTableCell className="text-right tabular-nums">
                        {fmtBRL(num(n.valor_servico))}
                      </CarboTableCell>
                      <CarboTableCell className={`text-right tabular-nums ${divergem ? "font-semibold" : ""}`}
                                      title={divergem ? `Retido: ${fmtBRL(num(n.total_retido))}` : undefined}>
                        {fmtBRL(num(n.valor_liquido))}
                      </CarboTableCell>
                      <CarboTableCell>{selo(n)}</CarboTableCell>
                      <CarboTableCell><BotaoXml n={n} /></CarboTableCell>
                    </CarboTableRow>
                  );
                })}
              </CarboTableBody>
            </CarboTable>
          )}
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}
