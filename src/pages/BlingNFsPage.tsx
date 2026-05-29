import { useState } from "react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  FileText, ChevronLeft, ChevronRight, Search, RefreshCw,
  CheckCircle2, AlertCircle, HelpCircle, Clock, Link2, Unlink,
  Download, ExternalLink, Archive, ArchiveRestore,
} from "lucide-react";
import {
  useBlingNFes, useLinkNFeToOrder, useUnlinkNFe, useArchiveNFe,
  NF_MATCH_LABELS, NF_MATCH_VARIANT,
  type BlingNFe, type NFeMatchStatus,
} from "@/hooks/useBlingNFes";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtBRL(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return format(new Date(s + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

function fmtCnpj(cnpj: string | null) {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return cnpj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual link popover
// ─────────────────────────────────────────────────────────────────────────────
function LinkPopover({ nfe }: { nfe: BlingNFe }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(nfe.matched_order_number ?? "");
  const link = useLinkNFeToOrder();
  const unlink = useUnlinkNFe();
  const isLinked = nfe.match_status === "matched" || nfe.match_status === "manual";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={isLinked ? "Gerenciar vínculo" : "Vincular a pedido"}
        >
          {isLinked ? <Link2 className="h-3.5 w-3.5 text-green-500" /> : <Link2 className="h-3.5 w-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="end">
        <p className="text-sm font-semibold">
          {isLinked ? "Vínculo com pedido" : "Vincular a pedido"}
        </p>

        {isLinked && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">Pedido vinculado</p>
            <p className="font-mono text-sm font-bold text-green-600">{nfe.matched_order_number}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {nfe.match_status === "manual" ? "Vínculo manual" : "Vínculo automático"}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {isLinked ? "Alterar para outro pedido:" : "Número do pedido (ex: PED-2026-00042):"}
          </p>
          <Input
            className="font-mono text-sm h-8"
            placeholder="PED-AAAA-NNNNN"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
          />
        </div>

        <div className="flex gap-2">
          <CarboButton
            size="sm"
            className="flex-1"
            disabled={!code.match(/^PED-\d{4}-\d{5}$/) || link.isPending}
            onClick={async () => {
              await link.mutateAsync({ nfeId: nfe.id, orderNumber: code });
              setOpen(false);
            }}
          >
            {link.isPending ? "Salvando..." : isLinked ? "Alterar vínculo" : "Vincular"}
          </CarboButton>

          {isLinked && (
            <CarboButton
              variant="outline"
              size="sm"
              disabled={unlink.isPending}
              onClick={async () => {
                await unlink.mutateAsync(nfe.id);
                setCode("");
                setOpen(false);
              }}
            >
              <Unlink className="h-3.5 w-3.5" />
            </CarboButton>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Match status icon
// ─────────────────────────────────────────────────────────────────────────────
function MatchIcon({ status }: { status: NFeMatchStatus }) {
  if (status === "matched" || status === "manual")
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === "invalid_code")
    return <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
  if (status === "ignored")
    return <Archive className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />;
  if (status === "no_code")
    return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function BlingNFsPage() {
  const today = new Date();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [matchFilter, setMatchFilter] = useState<NFeMatchStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const archiveNFe = useArchiveNFe();

  const monthStr = showAllMonths
    ? undefined
    : `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

  // Busca TODAS as NFs do mês (sem filtro de status) — para os KPIs de balanço
  // refletirem o mês inteiro, inclusive arquivadas e vinculadas.
  const { data: nfes = [], isLoading } = useBlingNFes({
    month: monthStr,
    search,
  });

  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  // ── KPIs (mês inteiro, inclusive arquivadas — balanço fiel) ────────────────
  const total      = nfes.length;
  const vinculadas = nfes.filter(n => n.match_status === "matched" || n.match_status === "manual").length;
  const semCodigo  = nfes.filter(n => n.match_status === "no_code").length;
  const invalidas  = nfes.filter(n => n.match_status === "invalid_code").length;
  const arquivadas = nfes.filter(n => n.match_status === "ignored").length;
  const totalValor = nfes.reduce((s, n) => s + (n.valor_total ?? 0), 0);

  // ── Tabela (visão de trabalho): "Todos" esconde arquivadas ─────────────────
  const visibleNfes = matchFilter === "all"
    ? nfes.filter(n => n.match_status !== "ignored")
    : nfes.filter(n => n.match_status === matchFilter);

  // ── Trigger sync manual ───────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entity: "nfe" }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success("Sync de NFs iniciado! Atualizando em alguns segundos...");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["bling-nfes"] });
      }, 4000);
    } catch (e: any) {
      toast.error("Erro ao sincronizar: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-carbo-green" /> Notas Fiscais (Bling)
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              NFs importadas do Bling — histórico completo + cruzamento com pedidos do sistema
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CarboButton
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar NFs
            </CarboButton>
          </div>
        </div>

        {/* Month nav + all-months toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setMonth(m => startOfMonth(subMonths(m, 1))); setShowAllMonths(false); }}
              disabled={showAllMonths}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-32 text-center capitalize">
              {showAllMonths ? "Todos os meses" : format(month, "MMM 'de' yyyy", { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setMonth(m => startOfMonth(addMonths(m, 1))); setShowAllMonths(false); }}
              disabled={showAllMonths || isCurrentMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <button
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${showAllMonths ? "bg-carbo-green/20 border-carbo-green/40 text-carbo-green font-semibold" : "border-border text-muted-foreground hover:border-foreground/30"}`}
            onClick={() => setShowAllMonths(v => !v)}
          >
            Ver todos
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{total}</p>
              <p className="text-xs text-muted-foreground">Total NFs</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{fmtBRL(totalValor)}</p>
              <p className="text-xs text-muted-foreground">Valor total</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-500 tabular-nums">{vinculadas}</p>
              <p className="text-xs text-muted-foreground">Vinculadas</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">{semCodigo}</p>
              <p className="text-xs text-muted-foreground">Sem pedido</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{invalidas}</p>
              <p className="text-xs text-muted-foreground">Cód. inválido</p>
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, CNPJ, nº NF ou pedido..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={matchFilter} onValueChange={v => setMatchFilter(v as NFeMatchStatus | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status vínculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos (exceto arquivadas)</SelectItem>
              <SelectItem value="matched">Vinculadas</SelectItem>
              <SelectItem value="manual">Vínculo manual</SelectItem>
              <SelectItem value="no_code">Sem pedido</SelectItem>
              <SelectItem value="invalid_code">Código inválido</SelectItem>
              <SelectItem value="pending">Processando</SelectItem>
              <SelectItem value="ignored">Arquivadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alerta só para Código inválido — o caso que realmente pede ação.
            "Sem pedido" é estado neutro (NF avulsa) e não dispara alerta. */}
        {invalidas > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm space-y-1">
            <p className="font-semibold text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {invalidas} NF(s) com código de pedido inválido
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              A observação da NF tem um código <span className="font-mono">PED-AAAA-NNNNN</span> que não corresponde a
              nenhum pedido no sistema. Verifique se o número está correto, vincule manualmente, ou arquive se não se aplica.
            </p>
          </div>
        )}

        {/* Dica informativa (neutra) sobre o vínculo automático */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground leading-relaxed">
          💡 Para vínculo automático, inclua o número do pedido na observação da NF no Bling
          (ex: <span className="font-mono">PED-2026-00042</span>). NFs sem pedido (avulsas) são normais — se não precisam de
          nada, use o botão <strong>Arquivar</strong> para tirá-las da lista.
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : visibleNfes.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-16 text-center space-y-3">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">
                {matchFilter === "all" && arquivadas > 0
                  ? `Nenhuma NF ativa nesta visão (${arquivadas} arquivada${arquivadas !== 1 ? "s" : ""} — veja no filtro "Arquivadas").`
                  : "Nenhuma nota fiscal encontrada."}
              </p>
              <p className="text-xs text-muted-foreground">
                Clique em "Sincronizar NFs" para importar notas do Bling.
              </p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">NF / Série</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">CNPJ</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Valor</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Situação</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Vínculo</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Pedido</th>
                    <th className="p-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {visibleNfes.map(nf => (
                    <tr
                      key={nf.id}
                      className="border-b transition-colors hover:bg-muted/10"
                    >
                      <td className="p-3 text-muted-foreground whitespace-nowrap tabular-nums">
                        {fmtDate(nf.data_emissao)}
                      </td>
                      <td className="p-3 font-mono text-xs font-medium whitespace-nowrap">
                        {nf.numero ?? "—"}{nf.serie ? ` / ${nf.serie}` : ""}
                      </td>
                      <td className="p-3 max-w-[160px] truncate" title={nf.contato_nome ?? undefined}>
                        {nf.contato_nome ?? "—"}
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {fmtCnpj(nf.contato_cnpj)}
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums whitespace-nowrap">
                        {fmtBRL(nf.valor_total)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {nf.situacao ?? "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <MatchIcon status={nf.match_status} />
                          <CarboBadge variant={NF_MATCH_VARIANT[nf.match_status]} size="sm">
                            {NF_MATCH_LABELS[nf.match_status]}
                          </CarboBadge>
                        </div>
                        {nf.match_error && (
                          <p className="text-[10px] text-red-400 mt-0.5">{nf.match_error}</p>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {nf.matched_order_number
                          ? <span className="text-carbo-green font-semibold">{nf.matched_order_number}</span>
                          : <span className="text-muted-foreground/50">—</span>
                        }
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Vincular / desvincular */}
                          <LinkPopover nfe={nf} />

                          {/* Download XML */}
                          {nf.xml_url && (
                            <a
                              href={nf.xml_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Baixar XML"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}

                          {/* Abrir DANFE/PDF */}
                          {nf.pdf_url && (
                            <a
                              href={nf.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Abrir DANFE"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}

                          {/* Arquivar / Desarquivar — só para NFs não vinculadas */}
                          {nf.match_status !== "matched" && nf.match_status !== "manual" && (
                            nf.match_status === "ignored" ? (
                              <button
                                onClick={() => archiveNFe.mutate({ nfeId: nf.id, archive: false })}
                                disabled={archiveNFe.isPending}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                                title="Desarquivar"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => archiveNFe.mutate({ nfeId: nf.id, archive: true })}
                                disabled={archiveNFe.isPending}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                                title="Arquivar (NF sem ação necessária)"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarboCard>
        )}

        <p className="text-xs text-center text-muted-foreground">
          {total} nota{total !== 1 ? "s" : ""} {showAllMonths ? "no total" : "neste mês"}
          {arquivadas > 0 && ` · ${arquivadas} arquivada${arquivadas !== 1 ? "s" : ""} (contam no balanço)`}
          {" · "}Sincronização automática às 7h e 13h (Fortaleza)
        </p>
      </div>
    </BoardLayout>
  );
}
