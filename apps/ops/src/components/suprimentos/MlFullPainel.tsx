import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { AlertTriangle, Truck, PackageCheck, Ban, RefreshCw, Send } from "lucide-react";
import {
  useMlFullEstoque, useMlFullRemessas, useRegistrarRemessa,
  useReceberRemessa, useCancelarRemessa, type LinhaMlFull,
} from "@/hooks/useMlFull";

// ─────────────────────────────────────────────────────────────────────────────
// ML Full — o galpão do Mercado Livre, visto daqui.
//
// ⚠️ A tela existe para ANTECIPAR ruptura, e é isso que decide o desenho:
// a lista vem ordenada do menor saldo para o maior, e a coluna "Em trânsito"
// fica ao lado de "No ML" porque os dois juntos é que respondem "preciso
// mandar mais?".
//
// ⚠️ Nada aqui edita o estoque do ML. O número dele é espelho — o que se
// registra é a SAÍDA do nosso galpão.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR");

/** Quando o espelho foi atualizado, em linguagem de gente. */
function idade(iso: string | null): { texto: string; velho: boolean } {
  if (!iso) return { texto: "nunca sincronizado", velho: true };
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return { texto: "agora há pouco", velho: false };
  if (min < 60) return { texto: `há ${min} min`, velho: false };
  const h = Math.round(min / 60);
  // ⚠️ O cron é de hora em hora, então 3 h sem sincronizar é sinal de que ele
  // parou. Espelho parado mostra número velho com cara de atual — pior que
  // tela vazia, porque ninguém desconfia.
  return { texto: `há ${h} h`, velho: h >= 3 };
}

export function MlFullPainel() {
  const { data: linhas = [], isLoading, refetch, isFetching } = useMlFullEstoque();
  const { data: remessas = [] } = useMlFullRemessas();
  const registrar = useRegistrarRemessa();
  const receber = useReceberRemessa();
  const cancelar = useCancelarRemessa();

  const [alvo, setAlvo] = useState<LinhaMlFull | null>(null);
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");

  const sync = useMemo(() => {
    const maior = linhas.reduce<string | null>(
      (a, l) => (!a || (l.sincronizado_em ?? "") > a ? l.sincronizado_em : a), null);
    return idade(maior);
  }, [linhas]);

  const semMapa = linhas.filter((l) => !l.product_id);
  const emTransito = remessas.filter((r) => r.status === "em_transito");

  const abrirRemessa = (l: LinhaMlFull) => { setAlvo(l); setQtd(""); setObs(""); };

  const confirmar = () => {
    const n = Number(qtd);
    if (!alvo?.product_id || !Number.isFinite(n) || n <= 0) return;
    registrar.mutate(
      { productId: alvo.product_id, quantidade: n, observacao: obs || undefined },
      { onSuccess: () => setAlvo(null) },
    );
  };

  return (
    <div className="space-y-4">
      {/* Frescor do espelho. Sem isto, número velho passa por atual. */}
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={sync.velho ? "destructive" : "secondary"}>
          Espelho do ML · {sync.texto}
        </Badge>
        {sync.velho && (
          <span className="text-destructive text-xs">
            O espelho atualiza de hora em hora — este número pode estar velho.
          </span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto gap-1.5"
                onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* ⚠️ Anúncio sem mapa aparece, não some. Sem mapa é trabalho a fazer. */}
      {semMapa.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              {semMapa.length} anúncio(s) sem mapa de SKU
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>
              Sem o mapa não dá para ligar ao nosso produto — e sem isso não dá para
              registrar remessa. Cadastre em <strong>CD SP LogHouse → Mapeamento SKU</strong>.
            </p>
            {semMapa.slice(0, 5).map((l) => (
              <div key={`${l.item_id}-${l.variation_id ?? ""}`} className="font-mono">
                {l.seller_sku ?? "(sem SKU no anúncio)"} · {l.titulo_anuncio ?? l.item_id}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <CarboEmptyState title="Carregando…" description="Buscando o espelho do Mercado Livre." />
      ) : linhas.length === 0 ? (
        <CarboEmptyState
          title="Nenhum anúncio no Fulfillment"
          description="O espelho roda de hora em hora. Se continuar vazio, os anúncios podem não estar marcados como Full no painel do Mercado Livre — nesse caso o ajuste é lá, não aqui."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Produto</th>
                    <th className="text-right p-3">No ML</th>
                    <th className="text-right p-3">Em trânsito</th>
                    <th className="text-right p-3">CD SP</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const zerado = (l.disponivel ?? 0) <= 0;
                    return (
                      <tr key={`${l.item_id}-${l.variation_id ?? ""}`} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-medium">
                            {l.produto ?? l.titulo_anuncio ?? l.item_id}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {l.product_code ?? l.seller_sku ?? "—"}
                            {l.variation_id ? ` · var ${l.variation_id}` : ""}
                          </div>
                        </td>
                        <td className={`p-3 text-right font-semibold tabular-nums ${zerado ? "text-destructive" : ""}`}>
                          {fmt(l.disponivel)}
                        </td>
                        {/* ⚠️ Destacado quando existe: é ele que explica um "No ML"
                            baixo logo depois de um envio. */}
                        <td className="p-3 text-right tabular-nums">
                          {l.em_transito > 0
                            ? <span className="text-blue-400">{fmt(l.em_transito)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {fmt(l.saldo_loghouse)}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm" variant="outline" className="gap-1.5"
                            disabled={!l.product_id}
                            title={l.product_id ? undefined : "Anúncio sem mapa de SKU"}
                            onClick={() => abrirRemessa(l)}>
                            <Send className="h-3.5 w-3.5" /> Remessa
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Em trânsito: o que já saiu e ainda não apareceu no ML. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4" /> Em trânsito para o Full
            {emTransito.length > 0 && <Badge variant="secondary">{emTransito.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emTransito.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada a caminho.</p>
          ) : (
            <div className="space-y-2">
              {emTransito.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-sm border-b pb-2 last:border-0">
                  <div className="flex-1">
                    <div className="font-medium">
                      {r.produto?.name ?? r.product_id}
                      <span className="text-muted-foreground font-normal"> · {r.quantidade} un</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Saiu de {r.origem?.code ?? "—"} em{" "}
                      {new Date(r.enviado_em).toLocaleDateString("pt-BR")}
                      {r.observacao ? ` · ${r.observacao}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5"
                          onClick={() => receber.mutate(r.id)} disabled={receber.isPending}>
                    <PackageCheck className="h-3.5 w-3.5" /> Chegou
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-destructive"
                          onClick={() => {
                            const motivo = window.prompt("Por que está cancelando esta remessa?");
                            if (motivo) cancelar.mutate({ id: r.id, motivo });
                          }}
                          disabled={cancelar.isPending}>
                    <Ban className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remessa para o ML Full</DialogTitle>
            {/* ⚠️ A descrição diz o que a ação NÃO faz. Quem clica espera ver o
                número do ML subir, e ele não sobe hoje. */}
            <DialogDescription>
              Tira do <strong>Hub Natal</strong> e põe em trânsito. O saldo no ML
              não muda agora — ele sobe quando o Mercado Livre receber e o espelho
              trouxer o número novo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">{alvo?.produto ?? alvo?.titulo_anuncio}</div>
              <div className="text-xs text-muted-foreground font-mono">{alvo?.product_code}</div>
            </div>
            <div>
              <Label htmlFor="qtd">Quantidade</Label>
              <Input id="qtd" type="number" min={1} value={qtd}
                     onChange={(e) => setQtd(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="obs">Observação (opcional)</Label>
              <Input id="obs" value={obs} onChange={(e) => setObs(e.target.value)}
                     placeholder="nº da remessa, transportadora…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button onClick={confirmar}
                    disabled={registrar.isPending || !(Number(qtd) > 0)}>
              Registrar remessa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
