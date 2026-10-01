import { useMemo, useState } from "react";
import { FileText, Search, Loader2, Gift, ExternalLink, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow,
  CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pager, useUrlPage, paginate } from "./Pager";
import {
  useNfesFilialSemPedido, useLinkableOrders, useVincularNfFilial,
  type NfeFilialSemPedido,
} from "@/hooks/useNfeLinking";

/**
 * O vínculo manual da FILIAL (Bling 2) — a rede das duas automáticas.
 *
 * A filial casa a NF por dois caminhos (`carbo_vincula_nf_filial`): id exato e,
 * desde a `20261022`, o rodapé da nota. Nenhum alcança tudo, e os buracos são
 * conhecidos: pedido com `external_ref` de prefixo errado, NF emitida avulsa no
 * painel, e nota em que o rodapé não chegou — o Bling substitui a observação
 * pelo texto fiscal da natureza (`20260996`).
 *
 * ⚠️ Aba SEPARADA da matriz, e não um filtro dentro dela. As duas contas
 * numeram do zero: `bling_id` de uma não significa nada na outra, e misturá-las
 * numa lista só faria alguém vincular a nota da empresa errada ao pedido — sem
 * erro nenhum, porque os dois números existem. É a mesma razão pela qual a
 * esteira entra com o `bling_id` do Bling 1 NEGATIVO.
 */

const fmtBRL = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};

// ─── Ordenação por coluna ────────────────────────────────────────────────────
//
// Puras e fora do componente: dá para conferir o recorte sem montar tela, pelo
// mesmo caminho das funções de filtro da caixa de Conversas.

type Coluna = "nf" | "cliente" | "emissao" | "rodape" | "valor";
type Direcao = "asc" | "desc";

/**
 * ⚠️ AUSÊNCIA NÃO COMPETE POR POSIÇÃO — nulo vai para o FIM nos dois sentidos.
 *
 * Com nulo participando da comparação, ordenar por "Rodapé" encheria a primeira
 * página de "sem rodapé" num dos sentidos, que é exatamente o contrário do que
 * a pessoa quer ver ao clicar ali: ela quer achar as que TÊM. É a mesma regra
 * do `nulls last` que a consulta já usa por emissão.
 */
function compara(a: unknown, b: unknown, dir: Direcao): number {
  const vazio = (v: unknown) => v == null || v === "";
  if (vazio(a) && vazio(b)) return 0;
  if (vazio(a)) return 1;
  if (vazio(b)) return -1;

  let d: number;
  if (typeof a === "number" && typeof b === "number") {
    d = a - b;
  } else {
    const sa = String(a), sb = String(b);
    // `numeric: true` faz "000986" vir antes de "001038" e "9" antes de "10".
    // Sem isto a ordem do número da NF é alfabética — e alfabética em número é
    // a ordem que parece certa até o dígito mudar de casa.
    d = sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
  }
  return dir === "asc" ? d : -d;
}

function valorDaColuna(n: NfeFilialSemPedido, col: Coluna): unknown {
  switch (col) {
    case "nf":      return n.numero ?? String(n.bling_id);
    case "cliente": return n.contato_nome;
    case "emissao": return n.data_emissao;
    case "rodape":  return n.codigo_no_rodape;
    case "valor":   return n.valor_total;
  }
}

/**
 * ⚠️ Devolve lista NOVA e DESEMPATA pelo `bling_id`.
 *
 * O desempate não é zelo: esta lista é PAGINADA. Com dezenas de notas no mesmo
 * dia e nenhum critério único, a ordem entre elas fica por conta do acaso — e
 * aí a mesma nota pode aparecer em duas páginas enquanto outra não aparece em
 * nenhuma. É o mesmo defeito que o `lerTudo` paga com `.order("id")`, e ele sai
 * como número LIGEIRAMENTE errado, que é pior que tela vazia porque ninguém
 * nota.
 *
 * E ordenar no lugar mutaria o array do cache do react-query.
 */
function ordenar(lista: NfeFilialSemPedido[], col: Coluna, dir: Direcao): NfeFilialSemPedido[] {
  return [...lista].sort((x, y) => {
    const d = compara(valorDaColuna(x, col), valorDaColuna(y, col), dir);
    return d !== 0 ? d : x.bling_id - y.bling_id;
  });
}

/** O cabeçalho clicável. A seta DIZ o sentido — sem ela, clicar e ver a lista
 *  mudar não ensina qual é o estado atual. */
function Ordenavel({ col, rotulo, atual, dir, aoClicar, alinhar }: {
  col: Coluna; rotulo: string; atual: Coluna; dir: Direcao;
  aoClicar: (c: Coluna) => void; alinhar?: "right";
}) {
  const ativa = atual === col;
  return (
    <button type="button" onClick={() => aoClicar(col)}
            title={`Ordenar por ${rotulo}`}
            className={`flex w-full items-center gap-1 text-[11px] font-medium uppercase
                        tracking-wide transition-colors hover:text-foreground ${
              alinhar === "right" ? "justify-end" : ""} ${
              ativa ? "text-foreground" : "text-muted-foreground"}`}>
      {rotulo}
      {/* ⚠️ A seta aparece SÓ na coluna ativa. Uma seta apagada em todas as
          colunas vira decoração, e aí a ativa deixa de se distinguir. */}
      {ativa && (dir === "asc"
        ? <ArrowUp className="h-3 w-3 shrink-0" />
        : <ArrowDown className="h-3 w-3 shrink-0" />)}
    </button>
  );
}

/** Diálogo de vínculo: escolhe o pedido para casar com a NF da filial. */
function DialogoFilial({ nfe, onClose }: { nfe: NfeFilialSemPedido | null; onClose: () => void }) {
  /* ⚠️ A busca NASCE com o código do rodapé quando ele existe. É o dado que a
     própria nota carrega, e digitá-lo de novo à mão é onde se erra um dígito —
     num número de dez caracteres que só difere no fim. */
  const [search, setSearch] = useState(nfe?.codigo_no_rodape ?? "");
  const { data: orders = [], isLoading } = useLinkableOrders(search, !!nfe);
  const vincular = useVincularNfFilial();

  /* ⚠️ A NATUREZA decide quando existe. Quando NÃO existe — e hoje ela não
     existe em nenhuma nota da filial, foi medido —, quem decide é quem está
     olhando a nota, e a escolha é OBRIGATÓRIA: a RPC recusa sem ela.

     A versão anterior não perguntava nada, e `carbo_natureza_e_bonificacao(null)`
     devolvia `false` — ou seja, TODA nota ia para a coluna da venda. Foi assim
     que a segunda nota da NOVA NB tomou o lugar da primeira. */
  const naturezaConhecida = !!nfe?.natureza_operacao;
  const [como, setComo] = useState<"venda" | "bonificacao" | null>(null);
  const podeVincular = naturezaConhecida || como !== null;

  return (
    <Dialog open={!!nfe} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Vincular NF {nfe?.numero || ""} da FILIAL a um pedido
          </DialogTitle>
          <DialogDescription>
            {nfe?.contato_nome} · {fmtBRL(nfe?.valor_total ?? 0)} · {fmtDate(nfe?.data_emissao ?? null)}
          </DialogDescription>
        </DialogHeader>

        {/* ⚠️ A natureza é DITA antes do clique. Nota de bonificação vai para
            as colunas de bonificação — quem vincula precisa saber disso ANTES,
            senão fica procurando a nota na coluna errada depois e conclui que
            o vínculo não funcionou. */}
        {naturezaConhecida && nfe?.e_bonificacao && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30
                          bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
            <Gift className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              A natureza desta nota é de <strong>bonificação</strong> — ela entra como
              nota de <strong>remessa</strong> do pedido, não como a nota da venda.
              O valor dela não conta no faturamento.
            </span>
          </div>
        )}

        {/* O rodapé cru, quando existe. É a prova de qual pedido a nota
            anuncia, e é o que permite conferir o VENDEDOR — que não é chave,
            é conferência. */}
        {nfe?.informacoes_adicionais && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[11px]
                        leading-relaxed text-muted-foreground">
            {nfe.informacoes_adicionais}
          </p>
        )}

        {/* ── A escolha, quando o espelho não sabe ──────────────────────
            ⚠️ Um pedido pode ter DUAS notas: a da venda, que é receita, e a
            remessa de bonificação, que não é. É a mesma lógica da matriz
            (`20260903`), e é por isso que elas moram em colunas separadas.
            Sem natureza no espelho, nada na nota diz qual é esta — e chutar
            põe a bonificação no lugar da venda, derrubando o pedido do
            faturamento. */}
        {!naturezaConhecida && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
              <strong>Esta nota é a da venda ou a remessa de bonificação?</strong>{" "}
              O espelho ainda não trouxe a natureza dela, então quem sabe é você.
              Um mesmo pedido pode ter as duas.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setComo("venda")}
                      className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                        como === "venda"
                          ? "border-carbo-green/50 bg-carbo-green/10"
                          : "border-border hover:bg-muted/60"}`}>
                <span className="block text-xs font-semibold">Nota da venda</span>
                <span className="block text-[10px] text-muted-foreground">conta no faturamento</span>
              </button>
              <button type="button" onClick={() => setComo("bonificacao")}
                      className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                        como === "bonificacao"
                          ? "border-amber-500/50 bg-amber-500/10"
                          : "border-border hover:bg-muted/60"}`}>
                <span className="block text-xs font-semibold">Remessa de bonificação</span>
                <span className="block text-[10px] text-muted-foreground">não conta no faturamento</span>
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <CarboSearchInput
            placeholder="Buscar pedido por nº ou cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando…
            </div>
          ) : orders.length === 0 ? (
            /* ⚠️ Diz POR QUE pode estar vazio. "Nenhum pedido" sozinho leva a
               pessoa a concluir que o pedido não existe, quando o caso comum é
               ele já ter nota — e a busca só traz os que estão sem. */
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum pedido sem nota encontrado.
              {search.trim() && <> O pedido pode já ter uma NF vinculada.</>}
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  /* ⚠️ Desabilitado até a escolha existir. Deixar clicável
                     para falhar na RPC faria a pessoa escolher o pedido,
                     clicar, e só então descobrir que faltava um passo acima —
                     com o diálogo já rolado para baixo. */
                  disabled={vincular.isPending || !podeVincular}
                  onClick={() =>
                    vincular.mutate(
                      {
                        orderNumber: o.order_number,
                        blingId: nfe!.bling_id,
                        como: naturezaConhecida ? undefined : (como ?? undefined),
                      },
                      { onSuccess: onClose },
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-lg border
                             px-3 py-2 text-left transition-colors hover:border-carbo-green/40
                             hover:bg-carbo-green/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-semibold">{o.order_number}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {o.customer_name || "—"} · {fmtDate(o.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums">
                    {fmtBRL(o.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VincularNFsFilialTab() {
  const [search, setSearch] = useState("");
  const { data: notas = [], isLoading, error } = useNfesFilialSemPedido(search);
  const [vinculando, setVinculando] = useState<NfeFilialSemPedido | null>(null);
  const [page, setPage] = useUrlPage("pfilial");
  /* O padrão continua sendo a emissão mais recente — é a ordem em que a
     consulta já vem, e trocar o padrão mudaria a tela de quem não pediu nada. */
  const [ordem, setOrdem] = useState<{ col: Coluna; dir: Direcao }>({ col: "emissao", dir: "desc" });

  /* ⚠️ Clicar numa coluna VOLTA para a página 1. Sem isso, quem está na página
     3 reordena e continua na 3 — de uma lista inteiramente diferente —, e a
     conclusão é "a ordenação pulou linhas". */
  const trocarOrdem = (col: Coluna) => {
    setOrdem((o) => o.col === col
      ? { col, dir: o.dir === "asc" ? "desc" : "asc" }
      /* Coluna nova começa ASCENDENTE, menos a emissão: data quase sempre se
         procura da mais recente, e o resto (nome, número, valor) do menor para
         o maior. */
      : { col, dir: col === "emissao" ? "desc" : "asc" });
    setPage(1);
  };

  const ordenadas = useMemo(() => ordenar(notas, ordem.col, ordem.dir), [notas, ordem]);
  const pag = paginate(ordenadas, page);

  /* ⚠️ Conta só o que o automático VAI casar de verdade: ele passou a exigir
     natureza conhecida (sem ela, uma remessa iria para a coluna da venda). Com
     o `codigo_no_rodape` sozinho, o aviso prometia um casamento que não
     aconteceria — e promessa que não se cumpre é pior que aviso nenhum, porque
     a pessoa espera em vez de resolver. */
  const comCodigo = notas.filter((n) => n.codigo_no_rodape && n.natureza_operacao).length;
  const esperandoNatureza = notas.filter((n) => n.codigo_no_rodape && !n.natureza_operacao).length;

  return (
    <div className="space-y-4">
      <CarboCard>
        <CarboCardContent className="space-y-4 pt-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold">NFs da FILIAL sem pedido vinculado</p>
              <p className="text-xs text-muted-foreground">
                O que o casamento automático não pegou — pedido com referência
                trocada, nota avulsa, ou rodapé que não chegou.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <CarboSearchInput
                placeholder="Buscar por nº, cliente ou V…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {/* ⚠️ Quando a nota JÁ anuncia o pedido no rodapé, ela vai ser casada
              sozinha na próxima rodada do cron — e mandar alguém vincular à mão
              o que o sistema vai fazer em cinco minutos é trabalho inventado.
              A tela diz isso em vez de deixar a pessoa descobrir. */}
          {comCodigo > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-carbo-green/30
                          bg-carbo-green/5 px-3 py-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-carbo-green" />
              <span>
                <strong>{comCodigo}</strong> destas já trazem o número do pedido no rodapé —
                o casamento automático as pega na próxima rodada (a cada 5 min).
                Não precisa vincular à mão.
              </span>
            </p>
          )}

          {/* ⚠️ Estado PRÓPRIO, e não juntado ao de cima. "Vai casar sozinha" e
              "tem o número mas ainda não dá para casar" pedem coisas opostas:
              na primeira a pessoa espera, na segunda ela decide. Colapsar as
              duas num número só faria metade da fila parecer resolvida. */}
          {esperandoNatureza > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30
                          bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>
                <strong>{esperandoNatureza}</strong> trazem o número do pedido mas ainda
                estão sem a natureza no espelho — sem ela não dá para saber se a nota é a
                da venda ou a remessa de bonificação, e o automático não arrisca.
                Vincule à mão dizendo qual é, ou espere o espelho trazer.
              </span>
            </p>
          )}

          {/* ⚠️ Erro e vazio são coisas diferentes, e mostrá-los igual já custou
              caro neste repo: a tela de estoque dos vendedores dizia "ninguém
              tem caixa" quando o que havia era falha de permissão. */}
          {error ? (
            <p className="flex items-start gap-1.5 text-xs text-red-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Não consegui carregar: {(error as Error).message}
            </p>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : notas.length === 0 ? (
            <CarboEmptyState
              icon={FileText}
              title="Nenhuma NF da filial pendente"
              description={search
                ? "Nenhuma NF encontrada com essa busca."
                : "Toda nota válida da filial já está vinculada a um pedido."}
            />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead><Ordenavel col="nf" rotulo="NF" atual={ordem.col} dir={ordem.dir} aoClicar={trocarOrdem} /></CarboTableHead>
                  <CarboTableHead><Ordenavel col="cliente" rotulo="Cliente" atual={ordem.col} dir={ordem.dir} aoClicar={trocarOrdem} /></CarboTableHead>
                  <CarboTableHead><Ordenavel col="emissao" rotulo="Emissão" atual={ordem.col} dir={ordem.dir} aoClicar={trocarOrdem} /></CarboTableHead>
                  <CarboTableHead><Ordenavel col="rodape" rotulo="Rodapé" atual={ordem.col} dir={ordem.dir} aoClicar={trocarOrdem} /></CarboTableHead>
                  <CarboTableHead><Ordenavel col="valor" rotulo="Valor" atual={ordem.col} dir={ordem.dir} aoClicar={trocarOrdem} alinhar="right" /></CarboTableHead>
                  {/* Ações não ordena: não há "maior ação". Cabeçalho clicável
                      que não faz nada é pior que cabeçalho morto.

                      ⚠️ Mas ele usa as classes dos cabeçalhos INATIVOS. Com o
                      estilo padrão ele ficava mais claro que todos os outros e
                      lia como a coluna ATIVA — o destaque da ordenação deixava
                      de significar alguma coisa. */}
                  <CarboTableHead>
                    <span className="block text-right text-[11px] font-medium uppercase
                                     tracking-wide text-muted-foreground">
                      Ações
                    </span>
                  </CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {pag.slice.map((n) => (
                  <CarboTableRow key={n.bling_id}>
                    <CarboTableCell>
                      {/* ⚠️ A nota de BONIFICAÇÃO se distingue no PRÓPRIO
                          número, em violeta, e não só por um chip ao lado. As
                          duas notas de um pedido chegam com o mesmo cliente, a
                          mesma data e o mesmo rodapé — o que as separa é o que
                          elas SÃO, e isso tem de ser visível na varredura, sem
                          ler a linha inteira. Chip ao lado é informação que só
                          chega depois de já ter lido o número.

                          Violeta, e não âmbar: o âmbar desta tela já é o aviso
                          de "falta natureza", e duas coisas diferentes na mesma
                          cor voltam a exigir leitura. */}
                      <CarboBadge
                        variant={n.e_bonificacao ? "outline" : "secondary"}
                        className={`gap-1 ${n.e_bonificacao
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                          : ""}`}>
                        {n.e_bonificacao
                          ? <Gift className="h-3 w-3" />
                          : <FileText className="h-3 w-3" />}
                        {n.numero || n.bling_id}{n.serie ? `/${n.serie}` : ""}
                      </CarboBadge>
                      {n.e_bonificacao && (
                        <CarboBadge variant="outline"
                                    className="ml-1 gap-1 border-violet-500/40 bg-violet-500/10
                                               text-[10px] text-violet-400">
                          bonificação
                        </CarboBadge>
                      )}
                    </CarboTableCell>
                    <CarboTableCell className="max-w-[220px] truncate">
                      {n.contato_nome || "—"}
                    </CarboTableCell>
                    <CarboTableCell>{fmtDate(n.data_emissao)}</CarboTableCell>
                    <CarboTableCell>
                      {n.codigo_no_rodape ? (
                        <span className="font-mono text-[11px] text-carbo-green">
                          {n.codigo_no_rodape}
                        </span>
                      ) : (
                        /* ⚠️ "sem rodapé" é DITO. Vazio aqui se lê como "não
                           carregou", e o que ele significa é que esta nota só
                           pode ser casada à mão — que é a informação que decide
                           o que a pessoa faz em seguida. */
                        <span className="text-[11px] text-muted-foreground/60">sem rodapé</span>
                      )}
                    </CarboTableCell>
                    <CarboTableCell className="text-right font-medium">
                      {fmtBRL(n.valor_total)}
                    </CarboTableCell>
                    <CarboTableCell>
                      <div className="flex items-center justify-end gap-2">
                        {/* O PDF vem do próprio espelho: a filial guarda o link
                            do DANFE. Sem link, o botão não aparece — botão que
                            não faz nada é pior que botão nenhum. */}
                        {n.pdf_url && (
                          <CarboButton size="sm" variant="outline" className="gap-1.5" asChild>
                            <a href={n.pdf_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" /> DANFE
                            </a>
                          </CarboButton>
                        )}
                        <CarboButton size="sm" variant="outline" className="gap-1.5"
                                     onClick={() => setVinculando(n)}>
                          <Search className="h-3.5 w-3.5" /> Vincular
                        </CarboButton>
                      </div>
                    </CarboTableCell>
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          )}

          {!isLoading && !error && (
            <Pager page={pag.safePage} pageCount={pag.pageCount} total={ordenadas.length} onPage={setPage} />
          )}
        </CarboCardContent>
      </CarboCard>

      {/* `key` no bling_id: sem ele o diálogo reusaria o estado da nota
          anterior, e a busca nasceria com o código do pedido ERRADO já
          digitado — a pior forma de sugerir. */}
      <DialogoFilial key={vinculando?.bling_id ?? "nenhuma"}
                     nfe={vinculando} onClose={() => setVinculando(null)} />
    </div>
  );
}
