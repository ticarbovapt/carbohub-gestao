import { useMemo, useState } from "react";
import {
  Store, Search, Plus, Pencil, PauseCircle, PlayCircle, XCircle,
  ShoppingCart, AlertTriangle, FileText, Package, ArrowUp, ArrowDown, ChevronsUpDown,
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
  useUpsertPdvMix, usePdvVendedores,
  PDV_STATUS_LABEL, PDV_STATUS_VARIANT, PDV_PRODUTO_LABEL, PDV_OFERECE_LABEL,
  type PdvRow, type PdvStatus, type PdvInput,
  type PdvProduto, type PdvOferece, type PdvMixItem,
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

/** Ordem fixa do catálogo — não depender da ordem das chaves do JSON. */
const PRODUTOS: PdvProduto[] = ["10ml", "100ml", "1l"];

const PRODUTO_CURTO: Record<PdvProduto, string> = { "10ml": "10ml", "100ml": "100ml", "1l": "1L" };

/** Mix compacto na linha da tabela: verde vende, cinza não, âmbar a confirmar.
 *  O âmbar é o que interessa — é onde falta alguém ir no ponto conferir. */
function MixChips({ mix }: { mix: Partial<Record<PdvProduto, PdvMixItem>> }) {
  const cor: Record<PdvOferece, string> = {
    sim: "bg-carbo-green/15 text-carbo-green",
    nao: "bg-muted text-muted-foreground/70",
    a_confirmar: "bg-amber-500/15 text-amber-500",
  };
  return (
    <div className="flex items-center justify-center gap-1">
      {PRODUTOS.map((k) => {
        const it = mix?.[k];
        if (!it) return null;
        return (
          <span key={k}
            title={`${PDV_PRODUTO_LABEL[k]} — ${PDV_OFERECE_LABEL[it.oferece]}${
              it.preco != null ? ` · ${brl(it.preco)}` : ""}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${cor[it.oferece]}`}>
            {PRODUTO_CURTO[k]}
          </span>
        );
      })}
    </div>
  );
}

type PdvCol = "codigo" | "nome" | "cnpj" | "cidade" | "dono" | "mix" | "status" | "pedidos" | "comprado" | "ultima";

function SortTh({ col, label, sort, onSort, align = "left" }: {
  col: PdvCol; label: string; sort: { col: PdvCol; dir: "asc" | "desc" };
  onSort: (c: PdvCol) => void; align?: "left" | "center" | "right";
}) {
  const active = sort.col === col;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className="px-3 py-2 font-medium">
      <button onClick={() => onSort(col)}
        className={`flex items-center gap-1 w-full ${justify} hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}>
        {label}
        {active
          ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

/** Quantos produtos o PDV declara vender — é por isso que se ordena o Mix. */
const mixVendidos = (p: PdvRow) => PRODUTOS.filter((k) => p.mix?.[k]?.oferece === "sim").length;

/** Status por relevância operacional, não alfabética: ativo primeiro,
 *  inativo por último. Ordenar 'Ativo/Cadastrado/Inativo/Pausado' pelo
 *  alfabeto não ajuda ninguém. */
const ORDEM_STATUS: Record<string, number> = { active: 0, registered: 1, suspended: 2, inactive: 3 };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const VAZIO: PdvInput = {
  name: "", legal_name: "", cnpj: "", address_city: "", address_state: "",
  address_street: "", address_zip: "", contact_name: "", contact_phone: "",
  email: "", notes: "", status: "active", opened_at: "", owner_seller_id: "", is_micro: false, micro_desde: "",
};

const MIX_VAZIO: Record<PdvProduto, PdvMixItem> = {
  "10ml": { oferece: "a_confirmar", preco: null },
  "100ml": { oferece: "a_confirmar", preco: null },
  "1l": { oferece: "a_confirmar", preco: null },
};

export default function Pdvs() {
  // Ponte de auth: admin expõe `canAdmin`, crm expõe `isGestor`.
  const auth = useAuth() as { isGestor?: boolean; canAdmin?: boolean };
  const isGestor = Boolean(auth.isGestor ?? auth.canAdmin);

  const { data: pdvs = [], isLoading, error } = usePdvs();
  const criar = useCreatePdv();
  const atualizar = useUpdatePdv();
  const mudarStatus = useSetPdvStatus();
  const salvarMix = useUpsertPdvMix();
  const { data: vendedores = [] } = usePdvVendedores();
  const [mix, setMix] = useState<Record<PdvProduto, PdvMixItem> | null>(null);

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fUf, setFUf] = useState<string>("all");
  const [fDono, setFDono] = useState<string>("all");
  // Começa por nome, que é como a tela já vinha.
  const [sort, setSort] = useState<{ col: PdvCol; dir: "asc" | "desc" }>({ col: "nome", dir: "asc" });
  // Primeiro clique numa coluna nova: texto sobe (A→Z), número e data descem
  // (maior/mais recente primeiro) — é o que se quer ver em "quem comprou mais".
  const toggleSort = (c: PdvCol) =>
    setSort((s) => s.col === c
      ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" }
      : { col: c, dir: ["pedidos", "comprado", "ultima", "mix"].includes(c) ? "desc" : "asc" });

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
      if (fDono !== "all" && (p.owner_seller_name ?? "") !== fDono) return false;
      if (!t) return true;
      // Busca por nome comercial, razão social, cidade, CNPJ e dono — a razão
      // social entra porque quase nunca é igual ao nome comercial, e o dono
      // porque "quais são os pontos do Márcio" é a pergunta mais comum aqui.
      return (
        p.name.toLowerCase().includes(t) ||
        (p.legal_name ?? "").toLowerCase().includes(t) ||
        (p.address_city ?? "").toLowerCase().includes(t) ||
        (p.pdv_code ?? "").toLowerCase().includes(t) ||
        (p.owner_seller_name ?? "").toLowerCase().includes(t) ||
        (dig.length >= 3 && p.cnpj_digits.includes(dig))
      );
    });
  }, [pdvs, busca, fStatus, fUf, fDono]);

  const listaOrdenada = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    // localeCompare com pt-BR: sem isso "Área" cairia depois de "Zona" e
    // acentuada nenhuma ordenaria direito.
    const txt = (a: string, b: string) => a.localeCompare(b, "pt-BR") * dir;
    const num = (a: number, b: number) => (a - b) * dir;
    // Vazio SEMPRE por último, nos dois sentidos: PDV sem compra não deve
    // encabeçar "última compra" só porque a ordem é crescente.
    const dt = (a: string | null, b: string | null) =>
      !a && !b ? 0 : !a ? 1 : !b ? -1 : a.localeCompare(b) * dir;

    return [...lista].sort((a, b) => {
      switch (sort.col) {
        case "codigo":   return txt(a.pdv_code ?? "", b.pdv_code ?? "");
        case "nome":     return txt(a.name ?? "", b.name ?? "");
        // Por dígitos: o CNPJ formatado ordenaria pela pontuação.
        case "cnpj":     return txt(a.cnpj_digits ?? "", b.cnpj_digits ?? "");
        // UF primeiro, cidade depois — é como se lê um mapa comercial.
        case "cidade":   return txt(
          `${a.address_state ?? ""} ${a.address_city ?? ""}`,
          `${b.address_state ?? ""} ${b.address_city ?? ""}`);
        case "dono":     return txt(a.owner_seller_name ?? "", b.owner_seller_name ?? "");
        case "mix":      return num(mixVendidos(a), mixVendidos(b));
        case "status":   return num(ORDEM_STATUS[a.status] ?? 9, ORDEM_STATUS[b.status] ?? 9);
        case "pedidos":  return num(a.pedidos, b.pedidos);
        case "comprado": return num(a.total_comprado, b.total_comprado);
        case "ultima":   return dt(a.ultima_compra, b.ultima_compra);
        default:         return 0;
      }
    });
  }, [lista, sort]);

  const donos = useMemo(
    () => Array.from(new Set(pdvs.map((p) => p.owner_seller_name).filter(Boolean))).sort() as string[],
    [pdvs],
  );

  const kpi = useMemo(() => ({
    total: pdvs.length,
    ativos: pdvs.filter((p) => p.status === "active").length,
    // "Cadastrado" fica em card próprio, FORA de Ativos: ponto que ainda não
    // vendeu não pode inflar o número de pontos operando.
    cadastrados: pdvs.filter((p) => p.status === "registered").length,
    pausados: pdvs.filter((p) => p.status === "suspended").length,
    inativos: pdvs.filter((p) => p.status === "inactive").length,
    semDoc: pdvs.filter((p) => p.sem_documento).length,
    compraram: pdvs.filter((p) => p.pedidos > 0).length,
    semDono: pdvs.filter((p) => !p.owner_seller_name).length,
  }), [pdvs]);

  const abrirNovo = () => { setEditId(null); setForm({ ...VAZIO }); setMix({ ...MIX_VAZIO }); };
  const abrirEdicao = (p: PdvRow) => {
    setEditId(p.id);
    setForm({
      name: p.name, legal_name: p.legal_name ?? "", cnpj: p.cnpj ?? "",
      address_city: p.address_city ?? "", address_state: p.address_state ?? "",
      address_street: p.address_street ?? "", address_zip: p.address_zip ?? "",
      contact_name: p.contact_name ?? "", contact_phone: p.contact_phone ?? "",
      email: p.email ?? "", notes: p.notes ?? "", status: p.status,
      opened_at: p.opened_at ?? "", owner_seller_id: p.owner_seller_id ?? "",
      is_micro: p.is_micro ?? false, micro_desde: p.micro_desde ?? "",
    });
    // Produto que ainda não tem linha no banco entra como "a confirmar", não
    // como "não vende" — não sabemos, e afirmar que não vende seria inventar.
    setMix({ ...MIX_VAZIO, ...(p.mix ?? {}) } as Record<PdvProduto, PdvMixItem>);
  };

  const salvar = () => {
    if (!form?.name.trim()) return;
    // O mix mora em outra tabela e só pode ser gravado com o PDV já existindo:
    // na edição o id está na mão, na criação vem do insert.
    const gravarMix = (id: string) => {
      if (mix) salvarMix.mutate({ pdvId: id, mix });
      setForm(null); setEditId(null); setMix(null);
    };
    if (editId) atualizar.mutate({ id: editId, ...form }, { onSuccess: () => gravarMix(editId) });
    else criar.mutate(form, { onSuccess: (novoId: string) => gravarMix(novoId) });
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
          {/* ⚠️ Cadastrar PDV é de QUALQUER pessoa do time, não só da gestão.
              Quem descobre a loja nova é quem está na rua — e o caminho antigo
              ("manda o CNPJ no grupo e alguém cadastra") perde o cliente entre
              a visita e o cadastro.

              O botão só aparecia para gestor E a RLS só deixava gestor escrever:
              esconder sem liberar o banco seria trocar um botão inútil por um
              erro no clique. Os dois mudaram juntos (migração 20260940). */}
          <Button className="gap-2 shrink-0" onClick={abrirNovo}>
            <Plus className="h-4 w-4" /> Novo PDV
          </Button>
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            ["all", "Total", kpi.total, "text-foreground"],
            ["active", "Ativos", kpi.ativos, "text-carbo-green"],
            ["registered", "Cadastrados", kpi.cadastrados, "text-sky-500"],
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
          <Select value={fDono} onValueChange={setFDono}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Vendedor dono" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os donos</SelectItem>
              {donos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground ml-auto self-center">
            {lista.length} de {pdvs.length} · {kpi.compraram} já compraram
            {kpi.semDoc > 0 && ` · ${kpi.semDoc} sem documento`}
            {kpi.semDono > 0 && ` · ${kpi.semDono} sem dono`}
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
                    <SortTh col="codigo"   label="Código"      sort={sort} onSort={toggleSort} />
                    <SortTh col="nome"     label="PDV"         sort={sort} onSort={toggleSort} />
                    <SortTh col="cnpj"     label="CNPJ"        sort={sort} onSort={toggleSort} />
                    <SortTh col="cidade"   label="Cidade / UF" sort={sort} onSort={toggleSort} />
                    <SortTh col="dono"     label="Dono"        sort={sort} onSort={toggleSort} />
                    <SortTh col="mix"      label="Mix"         sort={sort} onSort={toggleSort} align="center" />
                    <SortTh col="status"   label="Status"      sort={sort} onSort={toggleSort} align="center" />
                    <SortTh col="pedidos"  label="Pedidos"     sort={sort} onSort={toggleSort} align="right" />
                    <SortTh col="comprado" label="Comprado"    sort={sort} onSort={toggleSort} align="right" />
                    <SortTh col="ultima"   label="Última"      sort={sort} onSort={toggleSort} />
                    {isGestor && <th className="px-3 py-2 font-medium text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {listaOrdenada.map((p) => (
                    // Clique na LINHA inteira, não só no nome: com o handler
                    // preso ao botão do nome, a maior parte da linha não fazia
                    // nada e parecia quebrada. A coluna de ações para o clique
                    // com stopPropagation para não abrir o detalhe junto.
                    <tr key={p.id} onClick={() => setDetalhe(p)}
                      className={`border-b last:border-0 hover:bg-accent/40 cursor-pointer ${p.status !== "active" ? "opacity-60" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{p.pdv_code}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="text-left w-full">
                          <span className="block truncate font-medium">{p.name}</span>
                          {/* Razão social embaixo: quase nunca é igual ao nome
                              comercial, e é ela que sai na nota. */}
                          {p.legal_name && p.legal_name.toLowerCase() !== p.name.toLowerCase() && (
                            <span className="block truncate text-[11px] text-muted-foreground">{p.legal_name}</span>
                          )}
                          {/* Micro é PDV também — por isso etiqueta ao lado do
                              nome, e não uma coluna "tipo" que sugeriria que
                              ele deixou de ser ponto de venda. */}
                          {p.is_micro && (
                            <span className="mt-0.5 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                              Microdistribuidor
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {p.sem_documento
                          ? <span className="text-amber-500" title="Sem documento — não classifica venda automaticamente">sem documento</span>
                          : fmtDoc(p.cnpj)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {[p.address_city, p.address_state].filter(Boolean).join("/") || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {p.owner_seller_name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <MixChips mix={p.mix} />
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
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                    <SelectItem value="registered">Cadastrado (ainda não vende)</SelectItem>
                    <SelectItem value="suspended">Pausado</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Abertura</Label>
                <Input type="date" value={form.opened_at ?? ""}
                  onChange={(e) => set({ opened_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor dono</Label>
                <Select value={form.owner_seller_id || "—"}
                  onValueChange={(v) => set({ owner_seller_id: v === "—" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem dono" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">Sem dono</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.full_name ?? "(sem nome)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Dito na tela, não só no código: senão alguém troca o dono
                    achando que está corrigindo a comissão de uma venda. */}
                <p className="text-[11px] text-muted-foreground">
                  Carteira do ponto. Não altera o vendedor das vendas nem a comissão.
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 accent-violet-500"
                    checked={form.is_micro ?? false}
                    onChange={(e) => set({ is_micro: e.target.checked })} />
                  <span className="font-medium">Também é microdistribuidor</span>
                </label>
                {form.is_micro && (
                  <div className="pt-1">
                    <Label className="text-xs">Microdistribuidor desde</Label>
                    <Input type="date" className="mt-1 h-8 max-w-[200px]"
                      value={form.micro_desde ?? ""}
                      onChange={(e) => set({ micro_desde: e.target.value })} />
                  </div>
                )}
                {/* Dito na tela: foi confundir as duas datas que fez o Auto
                    Diesel aparecer aberto em jul/2026 comprando desde dez/2025. */}
                <p className="text-[11px] text-muted-foreground">
                  Continua sendo PDV e contando na base de pontos. A data aqui é de virar
                  microdistribuidor — a abertura do ponto é o campo Abertura.
                </p>
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

              {/* Mix de produto */}
              <div className="md:col-span-2 space-y-2 rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-sm">Mix de produto</Label>
                  <span className="text-[11px] text-muted-foreground">preço de revenda ao consumidor</span>
                </div>
                {mix && PRODUTOS.map((k) => (
                  <div key={k} className="grid grid-cols-[1fr_140px_120px] gap-2 items-center">
                    <span className="text-sm">{PDV_PRODUTO_LABEL[k]}</span>
                    <Select value={mix[k].oferece}
                      onValueChange={(v) => setMix((m) => m && { ...m, [k]: { ...m[k], oferece: v as PdvOferece } })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Vende</SelectItem>
                        <SelectItem value="nao">Não vende</SelectItem>
                        <SelectItem value="a_confirmar">A confirmar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-8" type="number" step="0.01" min="0" placeholder="R$"
                      value={mix[k].preco ?? ""}
                      onChange={(e) => setMix((m) => m && {
                        ...m,
                        // Campo vazio guarda NULO, nunca 0 — zero diria que o
                        // PDV revende de graça, e o "menor preço" da tela iria
                        // para R$ 0,00 sem ninguém entender por quê.
                        [k]: { ...m[k], preco: e.target.value === "" ? null : Number(e.target.value) },
                      })} />
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Preço em branco fica vazio, não R$ 0,00. "A confirmar" marca o que ainda
                  ninguém checou no ponto.
                </p>
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
      {/* w-[calc(100vw-2rem)] antes do sm: o max-w-3xl sozinho não impede o
          diálogo de passar da viewport em tela estreita. E `min-w-0` nos
          filhos é o que faz o overflow-x-auto da tabela funcionar: sem ele o
          grid do DialogContent estica para caber a tabela e o conteúdo sai
          cortado pela borda, sem barra de rolagem nenhuma. */}
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap break-words">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 min-w-0">
          {([
            ["Pedidos", String(pdv.pedidos)],
            ["Comprado", brl(pdv.total_comprado)],
            ["Última compra", fmtData(pdv.ultima_compra)],
            ["Abertura", fmtData(pdv.opened_at)],
            ["Vendedor dono", pdv.owner_seller_name ?? "—"],
            ...(pdv.is_micro ? ([["Microdistribuidor desde", fmtData(pdv.micro_desde)]] as [string, string][]) : []),
            ["Primeira compra", fmtData(pdv.primeira_compra)],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded-lg border bg-card px-3 py-2 min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{l}</p>
              <p className="text-sm font-semibold tabular-nums truncate" title={v}>{v}</p>
            </div>
          ))}
        </div>

        {/* Mix — o que este ponto revende e por quanto. */}
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="inline h-3.5 w-3.5 mr-1" /> Mix de produto
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
            {PRODUTOS.map((k) => {
              const it = pdv.mix?.[k];
              return (
                <div key={k} className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{PDV_PRODUTO_LABEL[k]}</p>
                  <p className={`text-sm font-semibold ${
                    it?.oferece === "sim" ? "text-carbo-green"
                    : it?.oferece === "a_confirmar" ? "text-amber-500"
                    : "text-muted-foreground"}`}>
                    {it ? PDV_OFERECE_LABEL[it.oferece] : "A confirmar"}
                  </p>
                  {/* Preço só aparece quando existe: nulo é "não registrado",
                      e mostrar R$ 0,00 aqui viraria informação falsa. */}
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {it?.preco != null ? brl(it.preco) : "preço não registrado"}
                  </p>
                </div>
              );
            })}
          </div>
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

        <div className="min-w-0">
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
            <div className="rounded-lg border overflow-x-auto min-w-0">
              <table className="w-full text-sm min-w-[560px]">
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
