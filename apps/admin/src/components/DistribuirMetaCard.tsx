import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock, LockOpen, Scale, TrendingUp, Save, AlertTriangle, Check } from "lucide-react";
import {
  useMetaGeral, useDistribuirMeta,
  distribuirIgual, distribuirProporcional, redistribuirDestravados,
  fmtBRL,
  type EscopoMeta, type ItemDistribuivel,
} from "@/hooks/useDistribuicaoMeta";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// O bloco "meta geral + distribuição", usado pelas duas abas de Configurar
// Metas. Vendedores repartem o canal `revenda`; plataformas, o `online`.
//
// ⚠️ A tela NUNCA corrige a diferença sozinha. Se o total é 100.000 e a soma
// dá 78.000, ela mostra "faltam 22.000" e deixa salvar assim — distribuição
// parcial é um estado de trabalho legítimo. Fechar a conta à força seria
// inventar número em cima de decisão de diretoria.
// ─────────────────────────────────────────────────────────────────────────────

/** Só dígitos → inteiro. A tela de metas trabalha em reais cheios. */
function paraNumero(texto: string): number {
  return parseInt(texto.replace(/\D/g, "") || "0", 10);
}

export function DistribuirMetaCard({
  escopo, mes, itens, carregando,
}: {
  escopo: EscopoMeta;
  mes: Date;
  itens: ItemDistribuivel[];
  carregando?: boolean;
}) {
  const { data: metaSalva = 0, isLoading: carregandoMeta } = useMetaGeral(escopo, mes);
  const distribuir = useDistribuirMeta();

  const [totalTexto, setTotalTexto] = useState("");
  const [valores, setValores] = useState<Record<string, number>>({});
  const [travados, setTravados] = useState<Set<string>>(new Set());
  const [mexeu, setMexeu] = useState(false);

  const chaveDoMes = `${escopo}-${format(mes, "yyyy-MM")}`;

  // ⚠️ Reinicia ao trocar de mês OU de aba. Sem a chave no deps, mudar o mês
  // manteria na tela os valores do mês anterior e um "Salvar" gravaria a
  // distribuição errada no mês certo — em silêncio.
  useEffect(() => {
    setTotalTexto(metaSalva > 0 ? String(metaSalva) : "");
    setValores(Object.fromEntries(itens.map((i) => [i.id, i.metaAtual])));
    setTravados(new Set());
    setMexeu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDoMes, metaSalva, itens.length]);

  const total = paraNumero(totalTexto);
  const distribuido = useMemo(
    () => itens.reduce((a, i) => a + (valores[i.id] ?? 0), 0),
    [itens, valores],
  );
  const residual = total - distribuido;

  const aplicar = (novos: Record<string, number>) => {
    setValores(novos);
    setMexeu(true);
  };

  const alternarTrava = (id: string) => {
    setTravados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const repartir = (modo: "igual" | "proporcional") => {
    if (total <= 0) return;
    aplicar(
      travados.size > 0
        ? redistribuirDestravados(total, itens, valores, travados, modo)
        : modo === "igual"
          ? distribuirIgual(total, itens.map((i) => i.id))
          : distribuirProporcional(total, itens),
    );
  };

  const salvar = () => {
    distribuir.mutate(
      { escopo, mes, total, itens: itens.map((i) => ({ id: i.id, valor: valores[i.id] ?? 0 })) },
      { onSuccess: () => setMexeu(false) },
    );
  };

  const semHistorico = itens.every((i) => i.realizado <= 0);
  const pctBarra = total > 0 ? Math.min(100, (distribuido / total) * 100) : 0;

  if (carregando || carregandoMeta) {
    return <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />;
  }

  return (
    <CarboCard>
      <CarboCardContent className="space-y-4 py-4">

        {/* ── A meta geral ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Meta geral de {format(mes, "MMMM", { locale: ptBR })}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-muted-foreground">R$</span>
              <Input
                value={total > 0 ? total.toLocaleString("pt-BR") : ""}
                onChange={(e) => { setTotalTexto(e.target.value); setMexeu(true); }}
                placeholder="0"
                inputMode="numeric"
                className="w-44 text-lg font-bold tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => repartir("igual")}
              disabled={total <= 0 || itens.length === 0}>
              <Scale className="mr-1.5 h-4 w-4" /> Dividir igual
            </Button>
            <Button variant="outline" size="sm" onClick={() => repartir("proporcional")}
              disabled={total <= 0 || itens.length === 0 || semHistorico}
              title={semHistorico
                ? "Ninguém tem realizado neste período — sem base para proporção."
                : "Reparte proporcionalmente ao que cada um já vendeu no mês."}>
              <TrendingUp className="mr-1.5 h-4 w-4" /> Proporcional ao realizado
            </Button>
          </div>
        </div>

        {/* ── A barra e o resíduo ── */}
        <div className="space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                residual === 0 ? "bg-emerald-500" : residual > 0 ? "bg-amber-500" : "bg-red-500",
              )}
              style={{ width: `${pctBarra}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {fmtBRL(distribuido)} distribuídos de {fmtBRL(total)}
            </span>
            {total > 0 && (
              residual === 0 ? (
                <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> a soma fecha
                </span>
              ) : residual > 0 ? (
                <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> faltam {fmtBRL(residual)}
                </span>
              ) : (
                <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> passou {fmtBRL(Math.abs(residual))} do total
                </span>
              )
            )}
          </div>
        </div>

        {/* ── As linhas ── */}
        <div className="divide-y rounded-lg border">
          {itens.map((i) => {
            const valor = valores[i.id] ?? 0;
            const pct = total > 0 ? (valor / total) * 100 : 0;
            const travado = travados.has(i.id);

            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    Realizado: {fmtBRL(i.realizado)}
                  </div>
                </div>

                <Badge variant="outline" className="tabular-nums text-xs">
                  {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </Badge>

                <Input
                  value={valor > 0 ? valor.toLocaleString("pt-BR") : ""}
                  onChange={(e) => {
                    aplicar({ ...valores, [i.id]: paraNumero(e.target.value) });
                    // Editar à mão trava a linha: foi uma decisão explícita, e
                    // seria péssimo o próximo "Dividir igual" apagá-la sem avisar.
                    setTravados((s) => new Set(s).add(i.id));
                  }}
                  placeholder="0"
                  inputMode="numeric"
                  className="w-32 text-right tabular-nums"
                />

                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => alternarTrava(i.id)}
                  title={travado ? "Destravar (entra na próxima repartição)" : "Travar neste valor"}
                  aria-label={travado ? "Destravar" : "Travar"}
                >
                  {travado
                    ? <Lock className="h-4 w-4 text-amber-500" />
                    : <LockOpen className="h-4 w-4 text-muted-foreground/50" />}
                </Button>
              </div>
            );
          })}

          {itens.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nada para distribuir neste escopo.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {travados.size > 0
              ? `${travados.size} linha(s) travada(s) — as repartições só mexem no resto.`
              : "Editar um valor à mão trava a linha automaticamente."}
          </p>
          <Button onClick={salvar} disabled={!mexeu || distribuir.isPending || total <= 0}
            className="bg-carbo-green text-white hover:bg-carbo-green/90">
            <Save className="mr-1.5 h-4 w-4" />
            {distribuir.isPending ? "Salvando…" : "Salvar distribuição"}
          </Button>
        </div>

      </CarboCardContent>
    </CarboCard>
  );
}
