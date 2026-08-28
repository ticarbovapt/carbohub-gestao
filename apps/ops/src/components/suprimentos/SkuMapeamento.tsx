import { useMemo, useState } from "react";
import {
  AlertTriangle, Info, Link2, Pencil, Plus, Save, Trash2, X, ListChecks, Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PLATAFORMAS, TODAS_AS_PLATAFORMAS, kitImplausivel, rotuloPlataforma,
  useAlternarMapeamento, useApagarMapeamento, useProdutosDoMapa, useSalvarMapeamento,
  useSkuMapeamentos, useSkusSemMapa,
  type SkuMapeamento as Mapeamento,
} from "@/hooks/useSkuMapeamento";

// ─────────────────────────────────────────────────────────────────────────────
// Cadastro do mapa SKU → produto (aba "Mapeamento SKU" de Suprimentos, CD SP).
//
// O número que a tela edita é UM só: `unidades_por_venda` — quantas unidades
// físicas saem da prateleira por unidade vendida daquele SKU. `units_per_kit` e
// `display_units_per_pack` são LEGADO e aparecem apenas como conferência quando
// discordam; editá-los aqui recriaria a divergência que a 20260955 desfez.
//
// A segunda aba é a LISTA DE TRABALHO: SKU que já vendeu e não tem mapa, lida
// da view do ensaio (`carbo_estoque_ensaio`). Enquanto o SKU estiver ali, a
// venda dele não deduziria nada — ela SOME, não erra.
// ─────────────────────────────────────────────────────────────────────────────

interface Form {
  id?: string;
  platform: string;          // sentinela TODAS_AS_PLATAFORMAS = null no banco
  platform_sku: string;
  product_id: string;
  unidades_por_venda: string;
}

const FORM_VAZIO: Form = {
  platform: TODAS_AS_PLATAFORMAS,
  platform_sku: "",
  product_id: "",
  unidades_por_venda: "1",
};

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function SkuMapeamento() {
  const { data: mapas = [], isLoading } = useSkuMapeamentos();
  const { data: produtos = [] } = useProdutosDoMapa();
  const { data: semMapa = [], isLoading: carregandoSemMapa } = useSkusSemMapa();

  const salvar = useSalvarMapeamento();
  const alternar = useAlternarMapeamento();
  const apagar = useApagarMapeamento();

  const [aba, setAba] = useState("mapa");
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Form>(FORM_VAZIO);

  const produtoEscolhido = useMemo(
    () => produtos.find((p) => p.id === form.product_id) ?? null,
    [produtos, form.product_id],
  );
  const fator = Number(form.unidades_por_venda);
  // ⚠️ Destino-KIT com fator 1 está CERTO (a LogHouse guarda kits fechados; o
  // sachê avulso tem saldo zero). Só destino-KIT com fator > 1 é implausível.
  // A regra mora no hook — ver `kitImplausivel`.
  const avisoKit = kitImplausivel(produtoEscolhido, fator);

  const valido =
    form.platform_sku.trim().length > 0 &&
    !!form.product_id &&
    Number.isFinite(fator) &&
    fator > 0 &&
    Number.isInteger(fator);

  const abrirNovo = () => { setForm(FORM_VAZIO); setAberto(true); };

  const abrirDaLista = (platform: string, sku: string) => {
    setForm({ ...FORM_VAZIO, platform: platform || TODAS_AS_PLATAFORMAS, platform_sku: sku });
    setAberto(true);
  };

  const abrirEdicao = (m: Mapeamento) => {
    setForm({
      id: m.id,
      platform: m.platform ?? TODAS_AS_PLATAFORMAS,
      platform_sku: m.platform_sku,
      product_id: m.product_id,
      unidades_por_venda: String(m.unidades_por_venda ?? 1),
    });
    setAberto(true);
  };

  const gravar = () => {
    salvar.mutate(
      {
        id: form.id,
        platform_sku: form.platform_sku,
        platform: form.platform === TODAS_AS_PLATAFORMAS ? null : form.platform,
        product_id: form.product_id,
        unidades_por_venda: fator,
      },
      {
        onSuccess: () => {
          toast.success(form.id ? "Mapeamento atualizado" : "Mapeamento criado");
          setAberto(false);
        },
        onError: (e: any) => toast.error("Não deu para salvar", { description: e.message }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium mb-0.5">O que este mapa decide</p>
          <p className="text-xs text-muted-foreground">
            Cada linha diz de qual produto sai a venda de um SKU da plataforma e{" "}
            <strong className="text-foreground">quantas unidades físicas</strong> saem da prateleira
            por unidade vendida — do produto que está de fato na prateleira. Kit de 5 frascos
            apontando para o frasco = 5. Frasco avulso = 1. Kit que o galpão guarda fechado (o
            avulso nem tem saldo) aponta para o próprio kit = 1.{" "}
            <strong className="text-foreground">SKU sem mapa não erra: ele some</strong> — a venda
            simplesmente não deduziria nada.
          </p>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="mapa" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Mapeamentos
            <CarboBadge variant="secondary">{mapas.length}</CarboBadge>
          </TabsTrigger>
          <TabsTrigger value="sem-mapa" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> SKUs vendidos sem mapa
            {semMapa.length > 0 && <CarboBadge variant="destructive">{semMapa.length}</CarboBadge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Lista do mapa ─────────────────────────────────────────────── */}
        <TabsContent value="mapa" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={abrirNovo} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo mapeamento
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : mapas.length === 0 ? (
            <CarboEmptyState
              title="Nenhum mapeamento cadastrado"
              description="Comece pela aba “SKUs vendidos sem mapa”: ela lista o que já vendeu e ainda não tem destino."
            />
          ) : (
            <div className="space-y-2">
              {mapas.map((m) => {
                const p = m.produto;
                const kitSuspeito = kitImplausivel(p, m.unidades_por_venda);
                // Legado que discorda do número atual — só conferência.
                const legadoDiverge =
                  (m.units_per_kit != null && Number(m.units_per_kit) !== m.unidades_por_venda) ||
                  (m.display_units_per_pack != null &&
                    Number(m.display_units_per_pack) !== m.unidades_por_venda);
                return (
                  <CarboCard key={m.id} className={m.is_active ? "" : "opacity-60"}>
                    <CarboCardContent className="py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">
                              {m.platform_sku}
                            </code>
                            <CarboBadge variant="secondary">{rotuloPlataforma(m.platform)}</CarboBadge>
                            {!m.is_active && <CarboBadge variant="destructive">Inativo</CarboBadge>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                            <span className="text-carbo-blue">→</span>
                            <span className="font-medium text-foreground">
                              {p?.name ?? "Produto não encontrado"}
                            </span>
                            {p?.product_code && <span>({p.product_code})</span>}
                            {/* ⚠️ O rótulo NOMEIA a coluna. Este número já foi
                                confundido com `display_units_per_pack` numa
                                conferência, e a discussão custou meio dia
                                porque a tela mostrava "10" sem dizer de onde.
                                Número na tela sem o nome da coluna é número
                                que não dá para conferir contra o banco. */}
                            <span
                              className="ml-1 px-1.5 py-0.5 rounded bg-muted font-semibold text-foreground"
                              title="Coluna `unidades_por_venda` de sku_product_mappings — é ela que multiplica a dedução"
                            >
                              1 venda = {m.unidades_por_venda} {p?.stock_unit ?? "un"}{" "}
                              <span className="font-mono font-normal opacity-60">
                                (unidades_por_venda)
                              </span>
                            </span>
                          </div>
                          {kitSuspeito && (
                            <p className="flex items-start gap-1.5 text-[11px] text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                              O destino é um KIT <strong>e</strong> o fator é {m.unidades_por_venda}:
                              cada venda baixaria {m.unidades_por_venda} KITS, não{" "}
                              {m.unidades_por_venda} unidades. Ou o destino é o item unitário (fator{" "}
                              {m.unidades_por_venda}), ou o destino é o kit com fator 1 — os dois
                              juntos multiplicam duas vezes.
                            </p>
                          )}
                          {legadoDiverge && (
                            <p className="text-[11px] text-muted-foreground">
                              Legado divergente:{" "}
                              <code className="font-mono">units_per_kit</code>{" "}
                              {String(m.units_per_kit ?? "—")} ·{" "}
                              <code className="font-mono">display_units_per_pack</code>{" "}
                              {String(m.display_units_per_pack ?? "—")}. Quem manda na dedução é{" "}
                              <code className="font-mono">unidades_por_venda</code>, o número acima —
                              nenhum dos dois legados.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={m.is_active ? "Desativar" : "Ativar"}
                            onClick={() =>
                              alternar.mutate(
                                { id: m.id, is_active: !m.is_active },
                                {
                                  onError: (e: any) =>
                                    toast.error("Não deu para alterar", { description: e.message }),
                                },
                              )
                            }
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${m.is_active ? "bg-carbo-green" : "bg-muted-foreground"}`}
                            />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(m)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (!confirm(`Apagar o mapa do SKU ${m.platform_sku}?`)) return;
                              apagar.mutate(m.id, {
                                onSuccess: () => toast.success("Mapeamento removido"),
                                onError: (e: any) =>
                                  toast.error("Não deu para remover", { description: e.message }),
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CarboCardContent>
                  </CarboCard>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── A lista de trabalho ───────────────────────────────────────── */}
        <TabsContent value="sem-mapa" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            SKUs que já apareceram em vendas pagas/enviadas/entregues e não têm mapa ativo, do maior
            volume para o menor. Fonte: <code className="font-mono">carbo_estoque_ensaio</code> — a
            view do ensaio, que não mexe em estoque nenhum. Linhas que chegaram{" "}
            <strong className="text-foreground">sem SKU na origem</strong> aparecem aqui do mesmo
            jeito, com o botão desabilitado: não dá para mapeá-las por SKU, e escondê-las tornaria
            invisível justamente o caso que mais precisa de atenção.
          </p>

          {carregandoSemMapa ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : semMapa.length === 0 ? (
            <CarboEmptyState title="Nada pendente" description="Todo SKU vendido tem um mapa ativo." />
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 divide-y divide-amber-500/15">
              {semMapa.map((s) => {
                // ⚠️ Venda que chegou SEM SKU na origem (a Shopee é assim hoje).
                // Ela FICA na lista: não dá para mapear por SKU, e some da lista
                // é exatamente o que já a tornava invisível. O botão explica.
                const semSku = !s.product_sku;
                return (
                  <div
                    key={`${s.platform}::${s.product_sku ?? " sem-sku"}`}
                    className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
                  >
                    {semSku ? (
                      <span className="text-xs font-medium text-amber-400 shrink-0 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        sem SKU na origem — não é possível mapear por SKU
                      </span>
                    ) : (
                      <code className="text-sm font-mono font-semibold bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {s.product_sku}
                      </code>
                    )}
                    <CarboBadge variant="secondary">{rotuloPlataforma(s.platform)}</CarboBadge>
                    <span className="text-xs text-muted-foreground truncate max-w-[22rem]">
                      {s.product_name ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Boxes className="h-3.5 w-3.5" /> {s.packs} vendidos · {s.linhas} linha
                      {s.linhas > 1 ? "s" : ""} · última {fmtData(s.ultima_venda)}
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto gap-1.5"
                      disabled={semSku}
                      title={
                        semSku
                          ? "A venda chegou sem SKU do produto: o mapa é por SKU, então não há o que cadastrar aqui. " +
                            "Corrija na origem (o canal precisa mandar o SKU) — enquanto isso, esta venda não deduz estoque."
                          : undefined
                      }
                      onClick={() => s.product_sku && abrirDaLista(s.platform, s.product_sku)}
                    >
                      <Link2 className="h-3.5 w-3.5" /> Mapear
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Formulário ──────────────────────────────────────────────────── */}
      <Dialog open={aberto} onOpenChange={(v) => !v && setAberto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-carbo-blue" />
              {form.id ? "Editar mapeamento" : "Novo mapeamento de SKU"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>SKU da plataforma <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ex.: MLB-1234567, B08XYZ, CZ-SACHE-KIT10"
                value={form.platform_sku}
                onChange={(e) => setForm((f) => ({ ...f, platform_sku: e.target.value }))}
              />
            </div>

            <div>
              <Label>Plataforma</Label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_AS_PLATAFORMAS}>Todas as plataformas</SelectItem>
                  {PLATAFORMAS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                “Todas as plataformas” vale para qualquer canal que venda esse mesmo SKU — que é o
                caso comum. Um mapa específico de plataforma, quando existir, vence o genérico.
              </p>
            </div>

            <div>
              <Label>Produto de onde a unidade sai <span className="text-destructive">*</span></Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.product_code} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Tem de ser o produto <strong className="text-foreground">unitário</strong> (o frasco),
                não o kit — é o fator abaixo que multiplica.
              </p>
            </div>

            <div>
              <Label>
                1 venda deste SKU = <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className="w-28"
                  value={form.unidades_por_venda}
                  onChange={(e) => setForm((f) => ({ ...f, unidades_por_venda: e.target.value }))}
                />
                <span className="text-sm text-muted-foreground">
                  unidades físicas na prateleira
                  {produtoEscolhido ? ` de ${produtoEscolhido.product_code}` : ""}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Kit de 5 frascos = 5. Kit de 10 sachês = 10. Frasco avulso = 1. Número inteiro — o
                banco recusa fração, porque o saldo é inteiro e arredondar em silêncio quebraria a
                conta.
              </p>
            </div>

            {avisoKit && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/90">
                  <strong>“{produtoEscolhido?.product_code}” é um KIT e o fator é {fator}.</strong>{" "}
                  Cada venda baixaria {fator} KITS do estoque, não {fator} unidades — o fator
                  multiplica de novo o que o kit já agrupa. Escolha uma das duas: destino no item
                  unitário com fator {fator}, ou destino no kit com fator 1 (é o cadastro certo
                  quando o galpão guarda o kit fechado e o avulso tem saldo zero). Se estiver certo
                  assim mesmo, pode salvar — isto é um aviso, não uma trava.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(false)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={gravar} disabled={!valido || salvar.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SkuMapeamento;
