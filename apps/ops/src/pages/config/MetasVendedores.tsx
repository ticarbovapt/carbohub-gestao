import { useEffect, useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useMetasVendedores, useUpsertMeta } from "@/hooks/useMetas";

// Configuração das metas de vendedores (Carbo Ops). Aqui o gestor DEFINE a meta;
// o quadro de acompanhamento (ranking) vive no Sales e no /acompanhamento do Ops.
interface Draft { target_amount: string; target_qty: string; }
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function MetasVendedoresConfig() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const weekStart = useMemo(() => new Date(), []); // semana não importa aqui (só meta)
  const { data: metas = [], isLoading } = useMetasVendedores(month, weekStart);
  const upsert = useUpsertMeta();

  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d: Record<string, Draft> = {};
    for (const m of metas) d[m.vendedor_id] = { target_amount: String(m.target_amount || ""), target_qty: String(m.target_qty || "") };
    setDraft(d);
  }, [metas]);

  const set = (id: string, patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const totalMeta = metas.reduce((s, m) => s + (Number(draft[m.vendedor_id]?.target_amount) || 0), 0);

  async function handleSave() {
    setSaving(true);
    const ano = month.getFullYear(); const mes = month.getMonth() + 1;
    try {
      await Promise.all(metas.map((m) => {
        const d = draft[m.vendedor_id] ?? { target_amount: "", target_qty: "" };
        return upsert.mutateAsync({
          vendedor_id: m.vendedor_id, ano, mes,
          target_amount: Number(d.target_amount) || 0,
          target_qty: Number(d.target_qty) || 0,
        });
      }));
      toast.success("Metas salvas!");
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CarboPageHeader title="Configurar Metas de Vendedores" description="Defina a meta mensal de cada vendedor (R$ e quantidade)" icon={Target} />
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold w-32 text-center capitalize">{format(month, "MMM 'de' yyyy", { locale: ptBR })}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={isCurrentMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <CarboCard>
          <CarboCardContent className="p-4">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : metas.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum vendedor marcado. Marque “É vendedor?” no Admin para alguém aparecer aqui.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_140px_100px] gap-3 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Vendedor</span><span className="text-right">Meta (R$)</span><span className="text-right">Qtd pedidos</span>
                </div>
                {metas.map((m) => {
                  const d = draft[m.vendedor_id] ?? { target_amount: "", target_qty: "" };
                  return (
                    <div key={m.vendedor_id} className="grid grid-cols-[1fr_140px_100px] gap-3 items-center">
                      <span className="text-sm font-medium truncate">{m.full_name ?? "—"}</span>
                      <Input type="number" min="0" inputMode="numeric" className="h-9 text-right" placeholder="0"
                        value={d.target_amount} onChange={(e) => set(m.vendedor_id, { target_amount: e.target.value })} />
                      <Input type="number" min="0" inputMode="numeric" className="h-9 text-right" placeholder="0"
                        value={d.target_qty} onChange={(e) => set(m.vendedor_id, { target_qty: e.target.value })} />
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t pt-3 mt-1">
                  <span className="text-sm text-muted-foreground">Meta total do time: <strong className="text-foreground">{fmtBRL(totalMeta)}</strong></span>
                  <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4" /> Salvar metas</>}
                  </Button>
                </div>
              </div>
            )}
          </CarboCardContent>
        </CarboCard>

        <p className="text-xs text-muted-foreground text-center">
          O acompanhamento (ranking, progresso) fica no Carbo Sales e em Acompanhamento. Aqui é só a configuração.
        </p>
      </div>
    </div>
  );
}
