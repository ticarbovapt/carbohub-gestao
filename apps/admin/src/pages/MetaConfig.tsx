import { useMemo, useState } from "react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Target, Settings, Loader2,
} from "lucide-react";
import {
  useSalesTargetsWithProgress,
  useUpsertSalesTarget,
  useDeleteSalesTarget,
  useUpsertSalesTargetDefault,
  useDeleteSalesTargetDefault,
  type SalesTargetWithProgress,
} from "@/hooks/useSalesTargets";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import {
  useMetaStats,
  useUpsertMetaTarget,
  PLATFORM_META,
  ALL_PLATFORMS,
  type MetaPlatform,
} from "@/hooks/useMetaEcommerce";
import { DistribuirMetaCard } from "@/components/DistribuirMetaCard";
import type { ItemDistribuivel } from "@/hooks/useDistribuicaoMeta";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Dialog de edição de meta e-commerce ──────────────────────────────────────
function EcoTargetDialog({ open, onClose, month, platform, currentTarget }: {
  open: boolean; onClose: () => void;
  month: Date; platform: MetaPlatform; currentTarget: number;
}) {
  const [digits, setDigits] = useState(currentTarget > 0 ? String(currentTarget) : "");
  const upsert = useUpsertMetaTarget();
  const meta = platform ? PLATFORM_META[platform] : { label: "Total Geral", emoji: "🎯", color: "#22c55e" };
  const numericValue = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const displayValue = numericValue > 0
    ? numericValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    await upsert.mutateAsync({ month, platform, target_amount: numericValue });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.emoji}</span> Meta {meta.label}
          </DialogTitle>
          <DialogDescription>{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            type="text" inputMode="numeric"
            value={displayValue}
            onChange={e => setDigits(e.target.value.replace(/\D/g, ""))}
            className="text-xl font-bold tracking-wide"
            placeholder="R$ 0" autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}
            className="bg-carbo-green hover:bg-carbo-green/90 text-white">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Tab = "vendedores" | "ecommerce";

export default function MetaConfigPage() {
  const [tab, setTab]       = useState<Tab>("vendedores");
  const [month, setMonth]   = useState(() => startOfMonth(new Date()));
  const [dialogOpen, setDialog] = useState(false);
  const [editTarget, setEdit]   = useState<SalesTargetWithProgress | null>(null);
  const [ecoDialog, setEcoDialog] = useState<{ platform: MetaPlatform; target: number } | null>(null);

  const [vendedorId, setVendedorId]     = useState("");
  const [targetDigits, setTargetDigits] = useState("");
  // Escopo da meta sendo editada: "default" (padrão, vale todo mês) ou "month" (exceção do mês)
  const [editScope, setEditScope]       = useState<"default" | "month">("default");

  const monthStr  = month.toISOString().slice(0, 10);

  // ⚠️ `isLoading` renomeado: o `isLoading` da aba Vendedores já ocupa o nome,
  // e descartá-lo aqui era o que fazia a tela escrever "Não definida" para meta
  // que existe, enquanto os alvos ainda estavam em voo.
  const { totalStats, platformStats, isLoading: ecoLoading } = useMetaStats(month);
  const today      = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  const { data: targets = [], isLoading } = useSalesTargetsWithProgress(monthStr);
  const { data: teamMembers = [] }        = useTeamMembers();
  const upsert         = useUpsertSalesTarget();
  const upsertDefault  = useUpsertSalesTargetDefault();
  const deleteMeta     = useDeleteSalesTarget();
  const deleteDefault  = useDeleteSalesTargetDefault();

  const activeMembers = teamMembers.filter(m =>
    m.status === "approved" && m.is_vendedor
  );

  // Nova meta padrão (vale para todos os meses)
  const openNew = () => {
    setEdit(null);
    setEditScope("default");
    setVendedorId("");
    setTargetDigits("");
    setDialog(true);
  };

  // Editar a meta PADRÃO de um vendedor
  const openEditDefault = (t: SalesTargetWithProgress) => {
    setEdit(t);
    setEditScope("default");
    setVendedorId(t.vendedor_id);
    setTargetDigits(String(Math.round(Number(t.default_amount || 0))));
    setDialog(true);
  };

  // Criar/editar a EXCEÇÃO do mês selecionado
  const openEditMonth = (t: SalesTargetWithProgress) => {
    setEdit(t);
    setEditScope("month");
    setVendedorId(t.vendedor_id);
    // começa do valor efetivo atual (exceção ou padrão) para facilitar o ajuste
    setTargetDigits(String(Math.round(Number(t.target_amount || t.default_amount || 0))));
    setDialog(true);
  };

  const handleClose = () => { setDialog(false); setEdit(null); };

  // ── Itens distribuíveis de cada aba ────────────────────────────────────────
  //
  // ⚠️ A lista sai de `targets`, NÃO de `activeMembers`.
  //
  // A primeira versão usava `activeMembers`, e o card nascia dizendo "Nada para
  // distribuir neste escopo" mesmo com nove vendedores logo abaixo na tela. O
  // motivo é que `activeMembers` filtra por `m.status` e `m.is_vendedor`, e a
  // RPC `carbo_team_members` NÃO retorna nenhum dos dois campos — o filtro é
  // sempre falso e a lista, sempre vazia. O TypeScript avisava
  // ("Property 'status' does not exist on type 'TeamMember'") e o aviso foi
  // lido como ruído pré-existente.
  //
  // `useSalesTargetsWithProgress` já resolve isto: monta a partir de `profiles`
  // com `is_vendedor = true` ("aparecem no dashboard mesmo zerados") e devolve
  // `target_amount` já resolvido — exceção do mês vence, senão a meta padrão,
  // senão zero. É a mesma lista que a tela mostra logo abaixo, então o card e
  // as metas individuais não podem divergir.
  const itensVendedores: ItemDistribuivel[] = useMemo(
    () => targets.map((t) => ({
      id: t.vendedor_id,
      nome: t.vendedor?.full_name || "(sem nome)",
      metaAtual: Number(t.target_amount ?? 0),
      realizado: Number(t.actual_amount ?? 0),
    })),
    [targets],
  );

  const itensEcommerce: ItemDistribuivel[] = useMemo(
    () => platformStats
      // `platform: null` é o card de Total Geral — ele não é um destino de
      // distribuição, é o próprio total.
      .filter((s) => s.platform !== null)
      .map((s) => ({
        id: String(s.platform),
        nome: s.label,
        metaAtual: Number(s.target ?? 0),
        realizado: Number(s.actual ?? 0),
      })),
    [platformStats],
  );

  const targetAmountNum = parseInt(targetDigits.replace(/\D/g, "") || "0", 10);
  const targetDisplay   = targetAmountNum > 0
    ? targetAmountNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    if (!vendedorId) return;
    if (editScope === "default") {
      await upsertDefault.mutateAsync({ vendedor_id: vendedorId, target_amount: targetAmountNum });
    } else {
      await upsert.mutateAsync({
        vendedor_id: vendedorId,
        month: monthStr,
        target_amount: targetAmountNum,
        target_qty: 0,
        linha: null,
      });
    }
    handleClose();
  };

  return (
    <>
      <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6 text-carbo-green" /> Configurar Metas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie metas mensais de vendedores e e-commerce</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["vendedores", "ecommerce"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-carbo-green text-carbo-green bg-carbo-green/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "vendedores" ? "Vendedores" : "E-commerce"}
            </button>
          ))}
        </div>

        {/* ── Tab: Vendedores ─────────────────────────────────────────────── */}
        {/* ⚠️ O seletor de mês vale para as DUAS abas.
            Ele vivia dentro do bloco `tab === "vendedores"`, e a aba E-commerce
            usava o mesmo estado `month` SEM MOSTRÁ-LO e sem poder mudá-lo. Dava
            para gravar a meta de agosto achando que era a de setembro — o mês
            só aparecia no subtítulo do diálogo, depois do clique. */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5 w-fit">
          <Button variant="ghost" size="icon" className="h-7 w-7"
            aria-label="Mês anterior"
            onClick={() => setMonth(m => startOfMonth(subMonths(m, 1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold w-32 text-center capitalize">
            {format(month, "MMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            aria-label="Próximo mês"
            onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
            disabled={isCurrentMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {tab === "vendedores" && (
          <>
            <DistribuirMetaCard
              escopo="vendedores"
              mes={month}
              itens={itensVendedores}
              carregando={isLoading}
            />

            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metas individuais
            </p>

            <div className="flex items-center justify-end gap-3 flex-wrap">
              <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white"
                onClick={openNew}>
                <Plus className="h-4 w-4" /> Meta padrão
              </Button>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
              A <strong className="text-foreground">meta padrão</strong> vale para todos os meses automaticamente.
              Se um mês for diferente, clique em <strong className="text-foreground">"Meta deste mês"</strong> para criar uma exceção — ela vence só naquele mês.
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
            ) : targets.length === 0 ? (
              <CarboCard>
                <CarboCardContent className="py-12 text-center space-y-3">
                  <Target className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhum vendedor ativo encontrado.</p>
                </CarboCardContent>
              </CarboCard>
            ) : (
              <div className="space-y-2">
                {[...targets]
                  .sort((a, b) => (a.vendedor?.full_name || "").localeCompare(b.vendedor?.full_name || ""))
                  .map(t => (
                  <CarboCard key={t.id}>
                    <CarboCardContent className="p-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{t.vendedor?.full_name || "—"}</p>
                          {t.source === "month" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                              Específica deste mês
                            </span>
                          )}
                          {t.source === "default" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-carbo-green/15 text-carbo-green">
                              Meta padrão
                            </span>
                          )}
                          {t.source === "none" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Sem meta
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Meta: {fmtBRL(Number(t.target_amount))} · Real: {fmtBRL(t.actual_amount || 0)} ({t.pct_amount || 0}%)
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 flex-wrap">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditDefault(t)}>
                          <Pencil className="h-3 w-3" /> Meta padrão
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditMonth(t)}>
                          <Pencil className="h-3 w-3" /> Meta deste mês
                        </Button>
                        {t.source === "month" && t.override_id && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                            onClick={() => deleteMeta.mutate(t.override_id!)}>
                            <Trash2 className="h-3 w-3" /> Voltar ao padrão
                          </Button>
                        )}
                      </div>
                    </CarboCardContent>
                  </CarboCard>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Tab: E-commerce ─────────────────────────────────────────────── */}
        {tab === "ecommerce" && (
          <div className="space-y-3">
            <DistribuirMetaCard
              escopo="ecommerce"
              mes={month}
              itens={itensEcommerce}
              carregando={ecoLoading}
            />

            {/* ⚠️ Esta frase dizia o CONTRÁRIO até 01/09/2026: "o Total Geral é
                a soma das metas por plataforma; não existe meta total separada".
                A regra foi revertida a pedido — agora o total é definido
                primeiro, no bloco acima, e a distribuição vive por plataforma.
                A frase ficou porque a pergunta que ela responde não mudou: quem
                abre a tela precisa saber qual dos dois números manda. */}
            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
              A <strong className="text-foreground">meta geral</strong> é definida
              acima e guardada separadamente. A soma por plataforma{" "}
              <strong className="text-foreground">não precisa fechar</strong> com
              ela — a diferença aparece na barra, para você decidir.
            </div>

            {/* ⚠️ Enquanto carrega, NÃO diga "Não definida".
                Antes o `isLoading` do hook era descartado: com os alvos ainda em
                voo, `getTarget` devolvia 0 e a tela escrevia "Meta: Não definida"
                para metas que existem — numa tela de configuração, isso convida
                a redigitar por cima do que já estava certo. */}
            {ecoLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Por plataforma</p>
                {platformStats.map(stats => (
                  <CarboCard key={String(stats.platform)}>
                    <CarboCardContent className="p-3 flex items-center gap-3">
                      <span className="text-lg shrink-0">{stats.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{stats.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Meta: {stats.target > 0 ? fmtBRL(stats.target) : "Não definida"}
                          {" · "}Real: {fmtBRL(stats.actual)}
                          {/* ⚠️ "(0%)" só aparece quando existe meta. Sem meta,
                              0% é 0% de nada — e lê como fracasso de um canal
                              que ninguém mediu ainda. */}
                          {stats.target > 0 && ` (${stats.actualPct.toFixed(0)}%)`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        aria-label={`Editar meta de ${stats.label}`}
                        onClick={() => setEcoDialog({ platform: stats.platform, target: stats.target })}>
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </CarboCardContent>
                  </CarboCard>
                ))}

                {/* ⚠️ O total vem DEPOIS da lista e SEM engrenagem: ele é o
                    resultado da edição, não um campo. No topo e com botão, ele
                    voltava a parecer algo que se preenche primeiro — e gravava
                    um número que o sistema passou a ignorar. */}
                <CarboCard className="border-carbo-green/40">
                  <CarboCardContent className="p-3 flex items-center gap-3">
                    <span className="text-lg shrink-0">🎯</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">Total Geral</p>
                      <p className="text-xs text-muted-foreground">
                        {totalStats.target > 0
                          ? `${fmtBRL(totalStats.target)} · soma de ${platformStats.filter(p => p.target > 0).length} de ${platformStats.length} plataformas`
                          : "Nenhuma meta definida por plataforma"}
                      </p>
                    </div>
                  </CarboCardContent>
                </CarboCard>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Dialog Nova / Editar Meta ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-carbo-green" />
              {editScope === "default" ? "Meta padrão" : "Meta deste mês"}
            </DialogTitle>
            <DialogDescription>
              {editScope === "default"
                ? "Vale para todos os meses, até ser alterada."
                : `Exceção só para ${format(month, "MMMM 'de' yyyy", { locale: ptBR })}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select
                value={vendedorId || "__none__"}
                onValueChange={v => setVendedorId(v === "__none__" ? "" : v)}
                disabled={!!editTarget}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Selecione o vendedor</SelectItem>
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.username || m.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{editScope === "default" ? "Meta de Faturamento (padrão mensal)" : "Meta de Faturamento (só este mês)"}</Label>
              <Input
                type="text" inputMode="numeric"
                value={targetDisplay}
                onChange={e => setTargetDigits(e.target.value.replace(/\D/g, ""))}
                placeholder="R$ 0"
                className="text-xl font-bold tracking-wide"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-between gap-2">
            {editScope === "default" && editTarget && (editTarget.default_amount || 0) > 0 ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => { await deleteDefault.mutateAsync(vendedorId); handleClose(); }}
                disabled={deleteDefault.isPending}
              >
                Remover padrão
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={!vendedorId || targetAmountNum === 0 || upsert.isPending || upsertDefault.isPending}
                className="bg-carbo-green hover:bg-carbo-green/90 text-white"
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog E-commerce Meta ────────────────────────────────────── */}
      {ecoDialog && (
        <EcoTargetDialog
          open={!!ecoDialog}
          onClose={() => setEcoDialog(null)}
          month={month}
          platform={ecoDialog.platform}
          currentTarget={ecoDialog.target}
        />
      )}
    </>
  );
}
