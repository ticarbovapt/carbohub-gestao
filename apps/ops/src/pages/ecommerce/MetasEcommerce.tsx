import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Target, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { ECOM_PLATFORMS, brl } from "./platforms";
import { toast } from "sonner";

// ⚠️ PORT VISUAL — dados MOCK. Ideia: setar a meta (R$) por plataforma no mês.

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const fmtInput = (raw: string) => { const d = onlyDigits(raw); return d ? Number(d).toLocaleString("pt-BR") : ""; };

const INITIAL: Record<string, string> = { mercadolivre: "90000", amazon: "65000", nuvemshop: "40000" };

export default function MetasEcommerce() {
  const [metas, setMetas] = useState<Record<string, string>>(INITIAL);
  const total = ECOM_PLATFORMS.reduce((s, p) => s + Number(onlyDigits(metas[p.id] || "0")), 0);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CarboPageHeader title="Metas de E-commerce" description="Defina a meta de faturamento por plataforma" icon={Target} />
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold w-28 text-center capitalize">junho de 2026</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="space-y-3">
          {ECOM_PLATFORMS.map((p) => (
            <CarboCard key={p.id}>
              <CarboCardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: p.color + "20" }}>{p.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{p.label}</p>
                  <p className="text-xs text-muted-foreground">Meta de faturamento mensal</p>
                </div>
                <div className="w-44 space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Meta (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input className="pl-9 text-right font-semibold tabular-nums" value={fmtInput(metas[p.id] || "")} onChange={(e) => setMetas((m) => ({ ...m, [p.id]: onlyDigits(e.target.value) }))} placeholder="0" />
                  </div>
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>

        {/* Total geral */}
        <CarboCard className="border-carbo-green/30">
          <CarboCardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-carbo-green/10 flex items-center justify-center text-xl">🎯</div>
              <div><p className="font-semibold text-sm">Total Geral</p><p className="text-xs text-muted-foreground">Soma das metas por plataforma</p></div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-carbo-green">{brl(total)}</p>
          </CarboCardContent>
        </CarboCard>

        <div className="flex justify-end">
          <Button className="gap-2" onClick={() => toast.success("Metas salvas! (mock — lógica entra depois)")}><Save className="h-4 w-4" /> Salvar metas</Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. A gravação real das metas entra na fase de lógica.</p>
      </div>
    </div>
  );
}
