import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileSpreadsheet, ArrowUpRight, ArrowDownLeft, Ban, AlertTriangle, CheckCircle2, Repeat,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow,
  CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNfse, useNfseSaude, type NfseRow } from "@/hooks/useNfse";

// ═══════════════════════════════════════════════════════════════════════════
// NFS-e Nacional — as notas de serviço do Portal Nacional (ADN gov.br)
//
// ⚠️ A tela NÃO calcula nada. Papel (emitida/recebida), cancelamento e valores
// vêm prontos de `carbo_nfse_visao`. Recalcular aqui criaria a segunda
// definição do mesmo fato — e a divergência apareceria como dois totais para o
// mesmo mês, sem erro nenhum. É a mesma razão de a etapa da esteira morar na
// view e não no `EsteiraOnline.tsx`.
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ ANO EM QUE AS EMITIDAS COMEÇAM. Medido na primeira carga: as recebidas vão
// até fev/2023, as emitidas só a partir de 07/01/2026 — a empresa passou a
// emitir pelo sistema nacional naquele mês. Sem dizer isso na tela, o filtro de
// 2025 mostraria ZERO emitidas, e zero se lê como "não vendemos", não como "o
// dado não existe aqui". Ausência tem de se anunciar.
const ANO_INICIO_EMITIDAS = 2026;

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

type Papel = "emitida" | "recebida" | "todas";

// A contraparte é a OUTRA ponta: numa nota emitida é o tomador, numa recebida é
// o emitente. Uma coluna "cliente/fornecedor" que mostrasse sempre o mesmo lado
// deixaria metade da tela repetindo "CARBO SOLUCOES LTDA".
function contraparte(n: NfseRow): string {
  if (n.papel === "emitida") return n.toma_nome || n.toma_doc || "—";
  return n.emit_nome || n.emit_cnpj || "—";
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
    // ⚠️ O número da substituta vai NO selo. "Substituída" sozinho informa um
    // fim sem apontar a continuação — e quem confere o mês precisa justamente
    // saber para onde o valor foi. Quando o elo não existe (a substituta não
    // chegou pelo ADN), o selo diz "Substituída" e nada mais: ausência
    // aparecendo como ausência, nunca disfarçada de resposta.
    return (
      <CarboBadge variant="warning" size="sm"
                  title={n.substituicao_motivo ?? n.cancelamento_motivo ?? undefined}>
        <Repeat className="h-3 w-3 mr-1" />
        {n.substituida_por_numero ? `Substituída pela ${n.substituida_por_numero}` : "Substituída"}
      </CarboBadge>
    );
  }
  // A nota NOVA de um par de substituição é válida, e dizer isso evita a
  // leitura errada de que ela é uma nota a mais no mês.
  if (n.substitui_chave) {
    return <CarboBadge variant="info" size="sm"><Repeat className="h-3 w-3 mr-1" />Substitui outra</CarboBadge>;
  }
  if (n.confirmada_tomador) {
    return <CarboBadge variant="success" size="sm"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmada</CarboBadge>;
  }
  return <CarboBadge variant="outline" size="sm">Válida</CarboBadge>;
}

export default function NfseNacional() {
  // ⚠️ O estado mora na URL, como no seletor do e-commerce: sem isso o F5
  // devolve a aba errada e não dá para mandar "olha 2025" a alguém.
  const [params, setParams] = useSearchParams();
  const papel = (params.get("papel") as Papel) || "emitida";
  const ano = params.get("ano") || "todos";
  const busca = params.get("q") || "";

  const troca = (chave: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (!valor || valor === "todos") p.delete(chave); else p.set(chave, valor);
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
      if (ano !== "todos") {
        if (!n.emitida_em) return false;
        if (String(new Date(n.emitida_em).getFullYear()) !== ano) return false;
      }
      if (!termo) return true;
      return [n.numero, n.emit_nome, n.toma_nome, n.emit_cnpj, n.toma_doc,
              n.descricao, n.chave_acesso]
        .some((c) => (c ?? "").toLowerCase().includes(termo));
    });
  }, [notas, papel, ano, busca]);

  const resumo = useMemo(() => {
    // ⚠️ Nota cancelada NÃO entra no total, mas CONTINUA na lista. Escondê-la
    // faria o número fechar e a conferência ficar impossível — é a mesma razão
    // de o usuário bloqueado não sumir da tela de Usuários.
    const validas = lista.filter((n) => !n.cancelada);
    return {
      total: lista.length,
      canceladas: lista.length - validas.length,
      liquido: validas.reduce((s, n) => s + num(n.valor_liquido), 0),
      retido: validas.reduce((s, n) => s + num(n.total_retido), 0),
    };
  }, [lista]);

  // ⚠️ O aviso só aparece quando ele é VERDADEIRO para o que está na tela:
  // filtro de ano anterior a 2026 com a aba de emitidas. Aviso permanente vira
  // paisagem e deixa de ser lido.
  const avisoHistorico =
    papel !== "recebida" && ano !== "todos" && Number(ano) < ANO_INICIO_EMITIDAS;

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <CarboPageHeader
        title="NFS-e Nacional"
        description="Notas de serviço do Portal Nacional (gov.br) — emitidas e recebidas"
        icon={FileSpreadsheet}
        iconColor="blue"
      />

      {/* Saúde da integração. ⚠️ Fica no topo porque, quando ela para, TODO
          número abaixo fica velho — e um painel que não sabe dizer se está
          desatualizado é pior que painel nenhum. */}
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
                <AlertTriangle className="h-3 w-3 mr-1" />
                Sem leitura há mais de 3 h
              </CarboBadge>
            )}
            {/* ⚠️ Documento malformado não some: ele fica guardado com
                xml_ok=false, fora das views, e é ANUNCIADO aqui. Some da tela
                sem aviso seria nota fiscal desaparecendo em silêncio. */}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CarboKPI title="Notas no filtro" value={resumo.total}
                  icon={FileSpreadsheet} iconColor="blue" animated />
        <CarboKPI title="Valor líquido (válidas)" value={fmtBRL(resumo.liquido)}
                  icon={papel === "recebida" ? ArrowDownLeft : ArrowUpRight}
                  iconColor={papel === "recebida" ? "warning" : "green"} />
        <CarboKPI title="Retido" value={fmtBRL(resumo.retido)} iconColor="muted" />
        <CarboKPI title="Canceladas" value={resumo.canceladas}
                  icon={Ban} iconColor={resumo.canceladas ? "destructive" : "muted"} animated />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={papel} onValueChange={(v) => troca("papel", v)}>
          <TabsList>
            <TabsTrigger value="emitida">Emitidas</TabsTrigger>
            <TabsTrigger value="recebida">Recebidas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
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

      {avisoHistorico && (
        <CarboCard>
          <CarboCardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              A empresa passou a emitir NFS-e pelo sistema nacional em{" "}
              <strong className="text-foreground">janeiro de {ANO_INICIO_EMITIDAS}</strong>.
              Nenhuma nota emitida em {ano} está aqui — e isso é ausência de dado
              no portal, não ausência de faturamento. As <strong>recebidas</strong>{" "}
              existem desde 2023.
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
                  <CarboTableHead>
                    {papel === "emitida" ? "Tomador" : papel === "recebida" ? "Prestador" : "Contraparte"}
                  </CarboTableHead>
                  <CarboTableHead>Serviço</CarboTableHead>
                  <CarboTableHead>Município</CarboTableHead>
                  <CarboTableHead className="text-right">Serviço</CarboTableHead>
                  <CarboTableHead className="text-right">Líquido</CarboTableHead>
                  <CarboTableHead>Situação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {lista.map((n) => {
                  // ⚠️ `valor_servico` e `valor_liquido` são colunas SEPARADAS,
                  // e isso foi medido: divergem em 7 das 696 notas, com
                  // R$ 6.541,77 de retenção. Mostrar um só faria a diferença
                  // sumir justamente nas notas com imposto retido.
                  const divergem = num(n.valor_servico) !== num(n.valor_liquido);
                  return (
                    <CarboTableRow key={`${n.ambiente}-${n.nsu}`}
                                   className={n.cancelada ? "opacity-60" : undefined}>
                      <CarboTableCell className="font-medium">{n.numero ?? "—"}</CarboTableCell>
                      <CarboTableCell>{fmtData(n.emitida_em)}</CarboTableCell>
                      <CarboTableCell className="max-w-[260px] truncate" title={contraparte(n)}>
                        {contraparte(n)}
                      </CarboTableCell>
                      <CarboTableCell className="max-w-[320px] truncate"
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
