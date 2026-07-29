import { useMemo, useState } from "react";
import {
  Store, Search, Plus, Pencil, PauseCircle, PlayCircle, XCircle,
  ShoppingCart, AlertTriangle, FileText,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePdvs, useCreatePdv, useUpdatePdv, useSetPdvStatus, usePdvPedidos,
  PDV_STATUS_LABEL, PDV_STATUS_VARIANT,
  type PdvRow, type PdvStatus, type PdvInput,
} from "@/hooks/usePdvs";

// ─────────────────────────────────────────────────────────────────────────────
// Pontos de Venda (PDVs)
//
// ⚠️ ARQUIVO IDÊNTICO no admin e no crm. A ponte de auth abaixo é o que
// permite isso: a flag de gestor chama `canAdmin` no admin e `isGestor` no
// crm. Mesmo padrão do BugReports, que já é byte a byte igual nos dois.
// Se mexer aqui, copie no outro — foi a duplicação sem sincronia que fez o
// /vender divergir em 3 versões.
//
// PDV é a fonte do canal "Revenda": venda para CNPJ cadastrado aqui nasce
// classificada como revenda (trigger carbo_set_segmento_pdv).
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtDoc = (d?: string | null) => {
  const s = (d ?? "").replace(/\D/g, "");
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  return s || "—";
};

const fmtData = (d?: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const VAZIO: PdvInput = {
  name: "", legal_name: "", cnpj: "", address_city: "", address_state: "",
  address_street: "", address_zip: "", contact_name: "", contact_phone: "",
  email: "", notes: "", status: "active",
};

export default function Pdvs() {
  // Ponte de auth: admin expõe `canAdmin`, crm expõe `isGestor`.
  const auth = useAuth() as { isGestor?: boolean; canAdmin?: boolean };
  const isGestor = Boolean(auth.isGestor ?? auth.canAdmin);

  const { data: pdvs = [], isLoading, error } = usePdvs();
  const criar = useCreatePdv();
  const atualizar = useUpdatePdv();
  const mudarStatus = useSetPdvStatus();

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fUf, setFUf] = useState<string>("all");

  const [form, setForm] = useState<PdvInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<PdvRow | null>(null);

  const set = (patch: Partial<PdvInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const ufs = useMemo(
    () => Array.from(new Set(pdvs.map((p) => p.address_state).filter(Boolean))).sort() as string[],
    [pdvs],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const dig = busca.replace(/\D/g, "");
    return pdvs.filter((p) => {
      if (fStatus !== "all" && p.status !== fStatus) return false;
      if (fUf !== "all" && p.address_state !== fUf) return false;
      if (!t) return true;
      // Busca por nome comercial, razão social, cidade e CNPJ — a razão social
      // entra porque quase nunca é igual ao nome comercial.
      return (
        p.name.toLowerCase().includes(t) ||
        (p.legal_name ?? "").toLowerCase().includes(t) ||
        (p.address_city ?? "").toLowerCase().includes(t) ||
        (p.pdv_code ?? "").toLowerCase().includes(t) ||
        (dig.length >= 3 && p.cnpj_digits.includes(dig))
      );
    });
  }, [pdvs, busca, fStatus, fUf]);

  const kpi = useMemo(() => ({
    total: pdvs.length,
    ativos: pdvs.filter((p) => p.status === "active").length,
    pausados: pdvs.filter((p) => p.status === "suspended").length,
    inativos: pdvs.filter((p) => p.status === "inactive").length,
    semDoc: pdvs.filter((p) => p.sem_documento).length,
    compraram: pdvs.filter((p) => p.pedidos > 0).length,
  }), [pdvs]);

  const abrirNovo = () => { setEditId(null); setForm({ ...VAZIO }); };
  const abrirEdicao = (p: PdvRow) => {
    setEditId(p.id);
    setForm({
      name: p.name, legal_name: p.legal_name ?? "", cnpj: p.cnpj ?? "",
      address_city: p.address_city ?? "", address_state: p.address_state ?? "",
      address_street: p.address_street ?? "", address_zip: p.address_zip ?? "",
      contact_name: p.contact_name ?? "", contact_phone: p.contact_phone ?? "",
      email: p.email ?? "", notes: p.notes ?? "", status: p.status,
    });
  };

  const salvar = () => {
    if (!form?.name.trim()) return;
    const done = { onSuccess: () => { setForm(null); setEditId(null); } };
    if (editId) atualizar.mutate({ id: editId, ...form }, done);
    else criar.mutate(form, done);
  };

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <main className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CarboPageHeader
            icon={Store}
            title="Pontos de Venda"
            description="Cadastro dos PDVs. Venda para CNPJ daqui entra automaticamente como canal Revenda."
          />
          {isGestor && (
            <Button className="gap-2 shrink-0" onClick={abrirNovo}>
              <Plus className="h-4 w-4" /> Novo PDV
            </Button>
          )}
        </div>

        {/* Erro visível — falha de consulta não pode virar lista vazia. */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Não foi possível carregar os PDVs</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(error as { message?: string })?.message ?? "Erro desconhecido"}
              </p>
            </div>
          </div>
        )}

        {/* KPIs — clicar filtra */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ["all", "Total", kpi.total, "text-foreground"],
            ["active", "Ativos", kpi.ativos, "text-carbo-green"],
            ["suspended", "Pausados", kpi.pausados, "text-amber-500"],
            ["inactive", "Inativos", kpi.inativos, "text-muted-foreground"],
          ] as [string, string, number, string][]).map(([k, label, valor, cor]) => (
            <button key={k} onClick={() => setFStatus(k)}
              className={`rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                fStatus === k ? "border-carbo-green/50 bg-carbo-green/[0.05]" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Nome, razão social, CNPJ, cidade ou código…"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={fUf} onValueChange={setFUf}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as UFs</SelectItem>
              {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground ml-auto self-center">
            {lista.length} de {pdvs.length} · {kpi.compraram} já compraram
            {kpi.semDoc > 0 && ` · ${kpi.semDoc} sem documento`}
          </p>
        </div>

        {/* Lista */}
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : lista.length === 0 ? (
              <div className="py-10">
                <CarboEmptyState icon={Store} title="Nenhum PDV encontrado"
                  description={pdvs.length ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro ponto de venda."} />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-board-surface">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">PDV</th>
                    <th className="px-3 py-2 font-medium">CNPJ</th>
                    <th className="px-3 py-2 font-medium">Cidade / UF</th>
                    <th className="px-3 py-2 font-medium text-center">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Pedidos</th>
                    <th className="px-3 py-2 font-medium text-right">Comprado</th>
                    <th className="px-3 py-2 font-medium">Última</th>
                    {isGestor && <th className="px-3 py-2 font-medium text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id}
                      className={`border-b last:border-0 hover:bg-accent/40 ${p.status !== "active" ? "opacity-60" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{p.pdv_code}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <button className="text-left w-full" onClick={() => setDetalhe(p)}>
                          <span className="block truncate font-medium">{p.name}</span>
                          {/* Razão social embaixo: quase nunca é igual ao nome
                              comercial, e é ela que sai na nota. */}
                          {p.legal_name && p.legal_name.toLowerCase() !== p.name.toLowerCase() && (
                            <span className="block truncate text-[11px] text-muted-foreground">{p.legal_name}</span>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {p.sem_documento
                          ? <span className="text-amber-500" title="Sem documento — não classifica venda automaticamente">sem documento</span>
                          : fmtDoc(p.cnpj)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {[p.address_city, p.address_state].filter(Boolean).join("/") || "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <CarboBadge variant={PDV_STATUS_VARIANT[p.status]} size="sm">
                          {PDV_STATUS_LABEL[p.status]}
                        </CarboBadge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.pedidos || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {p.total_comprado ? brl(p.total_comprado) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                        {fmtData(p.ultima_compra)}
                      </td>
                      {isGestor && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => abrirEdicao(p)} title="Editar"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {p.status === "active" ? (
                              <button onClick={() => mudarStatus.mutate({ id: p.id, status: "suspended" })} title="Pausar"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500">
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => mudarStatus.mutate({ id: p.id, status: "active" })} title="Reativar"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-carbo-green/10 hover:text-carbo-green">
                                <PlayCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {p.status !== "inactive" && (
                              <button onClick={() => mudarStatus.mutate({ id: p.id, status: "inactive" })} title="Desativar"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CarboCardContent>
        </CarboCard>

        <p className="text-[11px] text-muted-foreground">
          Pausar ou desativar <strong>não</strong> reclassifica o histórico: quem comprou enquanto era PDV
          continua contando como Revenda. O status serve para gestão da operação.
        </p>
      </div>

      {/* Criar / editar */}
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) { setForm(null); setEditId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar PDV" : "Novo PDV"}</DialogTitle>
            <DialogDescription>
              O CNPJ é o que liga o PDV às vendas — sem ele, o canal não é classificado sozinho.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid md:grid-cols-2 gap-3 py-1">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Nome comercial *</Label>
                <Input value={form.name} onChange={(e) => set({ name: e.target.value })}
                  placeholder="Como o time chama o PDV" autoFocus />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Razão social</Label>
                <Input value={form.legal_name ?? ""} onChange={(e) => set({ legal_name: e.target.value })}
                  placeholder="Como sai na nota fiscal" />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ / CPF</Label>
                <Input className="font-mono" value={form.cnpj ?? ""} onChange={(e) => set({ cnpj: e.target.value })}
                  placeholder="só números" maxLength={18} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status ?? "active"} onValueChange={(v) => set({ status: v as PdvStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="suspended">Pausado</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address_street ?? ""} onChange={(e) => set({ address_street: e.target.value })}
                  placeholder="Rua, número, bairro" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.address_city ?? ""} onChange={(e) => set({ address_city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.address_state || "—"} onValueChange={(v) => set({ address_state: v === "—" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">—</SelectItem>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input className="font-mono" value={form.address_zip ?? ""} onChange={(e) => set({ address_zip: e.target.value })} maxLength={9} />
              </div>
              <div className="space-y-1.5">
                <Label>Contato</Label>
                <Input value={form.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Observação</Label>
                <Input value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm(null); setEditId(null); }}>Cancelar</Button>
            <Button onClick={salvar} disabled={!form?.name.trim() || salvando}>
              {salvando ? "Salvando…" : editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdvDetalhe pdv={detalhe} onClose={() => setDetalhe(null)} />
    </main>
  );
}

// ── Detalhe: dados + histórico de pedidos ───────────────────────────────────
function PdvDetalhe({ pdv, onClose }: { pdv: PdvRow | null; onClose: () => void }) {
  const { data: pedidos = [], isLoading } = usePdvPedidos(pdv?.cnpj_digits ?? null);
  if (!pdv) return null;

  return (
    <Dialog open={!!pdv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {pdv.name}
            <CarboBadge variant={PDV_STATUS_VARIANT[pdv.status]} size="sm">
              {PDV_STATUS_LABEL[pdv.status]}
            </CarboBadge>
            <span className="text-xs font-mono text-muted-foreground">{pdv.pdv_code}</span>
          </DialogTitle>
          <DialogDescription>
            {pdv.legal_name && <span className="block">{pdv.legal_name}</span>}
            {fmtDoc(pdv.cnpj)} · {[pdv.address_city, pdv.address_state].filter(Boolean).join("/") || "sem cidade"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {([
            ["Pedidos", String(pdv.pedidos)],
            ["Comprado", brl(pdv.total_comprado)],
            ["Última compra", fmtData(pdv.ultima_compra)],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{l}</p>
              <p className="text-sm font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>

        {pdv.sem_documento && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span className="text-muted-foreground">
              Sem CNPJ/CPF cadastrado. As vendas deste PDV <strong>não</strong> são classificadas como
              Revenda automaticamente até o documento ser preenchido.
            </span>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShoppingCart className="inline h-3.5 w-3.5 mr-1" /> Pedidos
          </p>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : pedidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {pdv.sem_documento ? "Sem documento — não há como localizar os pedidos." : "Nenhum pedido registrado."}
            </p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Pedido</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 font-medium">NF</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-center">Conta?</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{o.order_number || "—"}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                        {fmtData(o.sale_date ?? o.created_at.slice(0, 10))}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">{o.vendedor_name || "—"}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {o.nf_numero
                          ? <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{o.nf_numero}</span>
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(o.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <CarboBadge variant={o.conta_metrica ? "success" : "secondary"} size="sm">
                          {o.conta_metrica ? "Conta" : "Não conta"}
                        </CarboBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
