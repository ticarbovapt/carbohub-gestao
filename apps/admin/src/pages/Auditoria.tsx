import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import {
  ShieldCheck, Search, ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Central de Auditoria — feed unificado de todos os logs do sistema.
// Fonte: RPC admin_audit_feed (SECURITY DEFINER, só gestor). Cada evento vem
// normalizado {source, category, event_at, actor, action, entity, summary, details}.
// ─────────────────────────────────────────────────────────────────────────────

interface AuditRow {
  source: string;
  category: string;
  event_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  summary: string;
  details: Record<string, unknown> | null;
}

// Fontes (source → rótulo + categoria). A categoria dá a cor do selo.
const SOURCES: { id: string; label: string; category: string }[] = [
  { id: "crm_lead_deletion", label: "Exclusão de card (CRM)", category: "CRM" },
  { id: "crm_lead_transfer", label: "Transferência de card", category: "CRM" },
  { id: "order_deletion", label: "Exclusão de venda", category: "Vendas" },
  { id: "order_status", label: "Status da venda", category: "Vendas" },
  { id: "order_audit", label: "Auditoria de pedidos", category: "Vendas" },
  { id: "stock_movement", label: "Movimentação de estoque", category: "Estoque" },
  { id: "os_stage", label: "Etapas de produção (OP)", category: "Produção" },
  { id: "pdv_replenishment", label: "Reabastecimento PDV", category: "PDV" },
  { id: "rc_approval", label: "Aprovações de compra (RC)", category: "Compras" },
  { id: "bling_sync", label: "Sincronizações Bling", category: "Bling" },
  { id: "employee_finance", label: "Financeiro RH", category: "Financeiro" },
  { id: "flow_audit", label: "Bloqueios de fluxo", category: "Governança" },
  { id: "governance", label: "Governança/acessos", category: "Governança" },
  { id: "system_audit", label: "Auditoria do sistema", category: "Sistema" },
];

const CAT_COLOR: Record<string, string> = {
  CRM: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Vendas: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Estoque: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Produção: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  PDV: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Compras: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Bling: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Financeiro: "bg-red-500/15 text-red-600 dark:text-red-400",
  Governança: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  Sistema: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
};

const CATEGORIES = Array.from(new Set(SOURCES.map((s) => s.category)));
const PAGE = 100;

export default function Auditoria() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeSources, setActiveSources] = useState<string[]>([]); // vazio = todas
  const [limit, setLimit] = useState(PAGE);

  // debounce simples da busca
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-audit-feed", activeSources, debounced, limit],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase.rpc("admin_audit_feed", {
        p_sources: activeSources.length ? activeSources : null,
        p_search: debounced || null,
        p_from: null,
        p_to: null,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  function toggleCategory(cat: string) {
    const ids = SOURCES.filter((s) => s.category === cat).map((s) => s.id);
    const allActive = ids.every((id) => activeSources.includes(id));
    setActiveSources((prev) =>
      allActive ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])),
    );
    setLimit(PAGE);
  }

  const activeCats = new Set(
    CATEGORIES.filter((cat) => {
      const ids = SOURCES.filter((s) => s.category === cat).map((s) => s.id);
      return ids.some((id) => activeSources.includes(id));
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" /> Central de Auditoria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tudo que acontece no sistema: exclusões, movimentações de estoque, etapas de produção,
            status de venda, sincronizações e mais. Só gestores têm acesso.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
            placeholder="Buscar por descrição, item ou responsável…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setActiveSources([]); setLimit(PAGE); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeSources.length === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCats.has(cat) ? CAT_COLOR[cat] + " ring-1 ring-inset ring-current" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Erro ao carregar auditoria: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum evento encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((row, i) => <AuditItem key={`${row.source}-${row.event_at}-${i}`} row={row} />)}
          {data.length >= limit && (
            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} disabled={isFetching}>
                Carregar mais
              </Button>
            </div>
          )}
          <p className="pt-1 text-center text-[11px] text-muted-foreground">{data.length} evento(s) exibido(s)</p>
        </div>
      )}
    </div>
  );
}

function AuditItem({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const when = new Date(row.event_at);
  const detailEntries = row.details ? Object.entries(row.details).filter(([, v]) => v !== null && v !== undefined && v !== "") : [];

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <ProfileAvatar userId={row.actor_id || row.source} fullName={row.actor_name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_COLOR[row.category] ?? "bg-muted text-muted-foreground"}`}>
              {row.category}
            </span>
            <span className="text-sm font-medium text-foreground">{row.action}</span>
          </div>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">{row.summary}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {row.actor_name || "—"} · {format(when, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        {detailEntries.length > 0 && (
          <span className="mt-1 shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        )}
      </button>

      {open && detailEntries.length > 0 && (
        <div className="border-t px-4 py-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <dt className="shrink-0 font-medium text-muted-foreground">{k}:</dt>
                <dd className="min-w-0 break-words text-foreground">
                  {typeof v === "object" ? <code className="text-[11px]">{JSON.stringify(v)}</code> : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
