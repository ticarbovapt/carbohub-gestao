import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShoppingCart, Loader2, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RuptureRisk {
  machineId: string;
  machineCode: string;
  model: string;
  currentStock: number;
  capacity: number;
  avgDailyConsumption: number;
  daysUntilRupture: number;
  licensee?: string;
}

interface StockRuptureAlertProps {
  machines: any[];
  consumptionHistory: any[];
}

export function StockRuptureAlert({ machines, consumptionHistory }: StockRuptureAlertProps) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState<string | null>(null);

  // Calculate rupture risks
  const ruptureRisks: RuptureRisk[] = machines
    .filter((m) => m.status === "operational" && m.capacity > 0)
    .map((machine) => {
      const currentStock = (machine.capacity || 100) - (machine.units_since_last_refill || 0);
      const history = consumptionHistory.filter((h: any) => h.machine_id === machine.id);
      
      // Calculate average daily consumption from last 30 days
      const totalConsumed = history.reduce((sum: number, h: any) => sum + (h.units_dispensed || 0), 0);
      const daysWithData = Math.max(history.length, 1);
      const avgDailyConsumption = totalConsumed / daysWithData;
      
      const daysUntilRupture = avgDailyConsumption > 0 
        ? Math.floor(currentStock / avgDailyConsumption) 
        : currentStock > 0 ? 999 : 0;

      return {
        machineId: machine.id,
        machineCode: machine.machine_id,
        model: machine.model,
        currentStock,
        capacity: machine.capacity || 100,
        avgDailyConsumption: Math.round(avgDailyConsumption * 10) / 10,
        daysUntilRupture,
        licensee: machine.licensees?.name,
      };
    })
    .filter((r) => r.daysUntilRupture <= 14)
    .sort((a, b) => a.daysUntilRupture - b.daysUntilRupture);

  // Auto-generate RC (Purchase Request)
  const generateRC = useMutation({
    mutationFn: async (risk: RuptureRisk) => {
      setGenerating(risk.machineId);
      
      const suggestedQty = Math.ceil(risk.capacity * 0.8);
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      
      const { error } = await supabase.from("purchase_requests").insert([{
        rc_number: `RC-AUTO-${Date.now()}`,
        justification: `Risco de ruptura em ${risk.daysUntilRupture} dias. Máquina ${risk.model} (${risk.machineCode}). Estoque atual: ${risk.currentStock}/${risk.capacity} unidades. Consumo médio: ${risk.avgDailyConsumption} un/dia.${risk.licensee ? ` Licenciado: ${risk.licensee}` : ""}`,
        cost_center: "operacional",
        requested_by: userId,
        estimated_value: 0,
        operational_impact: `Ruptura de estoque em ${risk.daysUntilRupture} dias - máquina ${risk.machineCode}`,
        items: JSON.stringify([{
          description: `Reabastecimento ${risk.machineCode} (${risk.model})`,
          quantity: suggestedQty,
          unit: "un",
        }]),
        status: "aguardando_aprovacao" as const,
      }]);

      if (error) throw error;
    },
    onSuccess: (_, risk) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast.success(`RC gerada automaticamente para ${risk.machineCode}`, {
        description: "Requisição de compra criada com prioridade alta.",
      });
      setGenerating(null);
    },
    onError: (error: Error) => {
      toast.error("Erro ao gerar RC: " + error.message);
      setGenerating(null);
    },
  });

  if (ruptureRisks.length === 0) return null;

  const criticalCount = ruptureRisks.filter((r) => r.daysUntilRupture <= 3).length;

  return (
    <Card className={cn(
      "border-2",
      criticalCount > 0 ? "border-destructive/30" : "border-warning/30"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center",
              criticalCount > 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
            )}>
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Risco de Ruptura de Estoque</CardTitle>
              <CardDescription>{ruptureRisks.length} máquina(s) em risco</CardDescription>
            </div>
          </div>
          {criticalCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {criticalCount} crítico(s)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ruptureRisks.slice(0, 5).map((risk) => {
            const isCritical = risk.daysUntilRupture <= 3;
            const stockPercent = Math.round((risk.currentStock / risk.capacity) * 100);
            
            return (
              <div
                key={risk.machineId}
                className={cn(
                  "flex items-center gap-4 rounded-xl border p-4 transition-all",
                  isCritical ? "border-destructive/20 bg-destructive/5" : "border-warning/20 bg-warning/5"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isCritical ? "text-destructive" : "text-warning"
                    )} />
                    <span className="text-sm font-semibold text-foreground">
                      {risk.machineCode}
                    </span>
                    <span className="text-xs text-muted-foreground">({risk.model})</span>
                  </div>
                  <p className={cn(
                    "text-xs font-medium",
                    isCritical ? "text-destructive" : "text-warning"
                  )}>
                    Ruptura em {risk.daysUntilRupture} dia(s) — Estoque: {stockPercent}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Consumo médio: {risk.avgDailyConsumption} un/dia
                    {risk.licensee && ` · ${risk.licensee}`}
                  </p>
                  {/* Stock bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isCritical ? "bg-destructive" : "bg-warning"
                      )}
                      style={{ width: `${Math.max(stockPercent, 2)}%` }}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isCritical ? "destructive" : "outline"}
                  className="flex-shrink-0 gap-1.5"
                  disabled={generating === risk.machineId}
                  onClick={() => generateRC.mutate(risk)}
                >
                  {generating === risk.machineId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-3.5 w-3.5" />
                  )}
                  Gerar RC
                </Button>
              </div>
            );
          })}
        </div>
        {ruptureRisks.length > 5 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            +{ruptureRisks.length - 5} outras máquinas em risco
          </p>
        )}
      </CardContent>
    </Card>
  );
}
