import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowRightLeft, Factory, Check, X, CheckCheck, Pencil,
  AlertTriangle, Package
} from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TransferSuggestion {
  id: string;
  product_id: string;
  product_code: string;
  from_hub: string;
  to_hub: string;
  quantity: number;
  status: string;
  notes: string | null;
  suggested_reason: string | null;
  created_at: string;
}

interface OpSuggestion {
  id: string;
  product_code: string;
  product_id: string | null;
  hub_origin_id: string;
  target_hub_id: string | null;
  suggested_qty: number;
  status: string;
  reason: string | null;
  created_at: string;
}

export function PendingSuggestions({ canApprove }: { canApprove: boolean }) {
  const [tab, setTab] = useState("transfers");
  const [selectedTransfers, setSelectedTransfers] = useState<Set<string>>(new Set());
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<{ id: string; qty: number; type: "transfer" | "op" } | null>(null);
  const [editQty, setEditQty] = useState("");
  const [confirmBatch, setConfirmBatch] = useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["mrp-products-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mrp_products").select("id, name, product_code").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["pending-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*")
        .in("status", ["suggested", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TransferSuggestion[];
    },
  });

  const { data: opSuggestions = [] } = useQuery({
    queryKey: ["pending-op-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("op_suggestions")
        .select("*")
        .in("status", ["suggested", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OpSuggestion[];
    },
  });

  const getHubName = (id: string) => warehouses?.find(w => w.id === id)?.name || id.slice(0, 8);
  const getProductName = (code: string) => products?.find(p => p.product_code === code)?.name || code;

  const updateTransfer = useMutation({
    mutationFn: async ({ id, status, qty }: { id: string; status: string; qty?: number }) => {
      const updates: Record<string, any> = { status };
      if (status === "approved") {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      if (status === "executed") {
        updates.executed_by = user?.id;
        updates.executed_at = new Date().toISOString();
      }
      if (qty !== undefined) updates.quantity = qty;
      const { error } = await supabase.from("stock_transfers").update(updates).eq("id", id);
      if (error) throw error;

      // If executing, move stock
      if (status === "executed") {
        const transfer = transfers.find(t => t.id === id);
        if (transfer) {
          // Decrease from_hub
          const { data: fromStock } = await supabase
            .from("warehouse_stock")
            .select("id, quantity")
            .eq("warehouse_id", transfer.from_hub)
            .eq("product_id", transfer.product_id)
            .single();
          if (fromStock && fromStock.quantity >= transfer.quantity) {
            await supabase.from("warehouse_stock")
              .update({ quantity: fromStock.quantity - transfer.quantity, updated_at: new Date().toISOString() })
              .eq("id", fromStock.id);
          } else {
            throw new Error("Saldo insuficiente no hub de origem");
          }

          // Increase to_hub
          const { data: toStock } = await supabase
            .from("warehouse_stock")
            .select("id, quantity")
            .eq("warehouse_id", transfer.to_hub)
            .eq("product_id", transfer.product_id)
            .single();
          if (toStock) {
            await supabase.from("warehouse_stock")
              .update({ quantity: toStock.quantity + transfer.quantity, updated_at: new Date().toISOString() })
              .eq("id", toStock.id);
          }

          // Audit log
          await supabase.from("flow_audit_logs").insert({
            user_id: user?.id,
            action_type: `transfer_${status}`,
            resource_type: "stock_transfer",
            resource_id: id,
            reason: `Transferência ${status}: ${transfer.quantity} un de ${getHubName(transfer.from_hub)} → ${getHubName(transfer.to_hub)}`,
            details: { product_code: transfer.product_code, from_hub: transfer.from_hub, to_hub: transfer.to_hub, qty: transfer.quantity },
          });
        }
      } else {
        // Audit for approve/reject
        await supabase.from("flow_audit_logs").insert({
          user_id: user?.id,
          action_type: `transfer_${status}`,
          resource_type: "stock_transfer",
          resource_id: id,
          reason: `Transferência ${status}`,
          details: { status },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-transfers"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      toast.success("Transferência atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOpSuggestion = useMutation({
    mutationFn: async ({ id, status, qty }: { id: string; status: string; qty?: number }) => {
      const updates: Record<string, any> = { status };
      if (status === "approved") {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      if (qty !== undefined) updates.suggested_qty = qty;
      const { error } = await supabase.from("op_suggestions").update(updates).eq("id", id);
      if (error) throw error;

      // If creating OP from approved suggestion
      if (status === "created") {
        const suggestion = opSuggestions.find(s => s.id === id);
        if (suggestion) {
          const { error: opErr } = await supabase.from("production_orders").insert({
            op_number: "",
            product_id: suggestion.product_id,
            product_code: suggestion.product_code,
            quantity: suggestion.suggested_qty,
            source: "safety_stock",
            type: "auto_replenishment",
            status: "pending",
            created_by: user?.id,
            notes: suggestion.target_hub_id
              ? `OP via sugestão. Após produção, programar envio para ${getHubName(suggestion.target_hub_id)}: ${suggestion.suggested_qty} un`
              : `OP via sugestão automática: ${suggestion.suggested_qty} un`,
          });
          if (opErr) throw opErr;
        }
      }

      await supabase.from("flow_audit_logs").insert({
        user_id: user?.id,
        action_type: `op_${status}`,
        resource_type: "op_suggestion",
        resource_id: id,
        reason: `OP sugestão ${status}`,
        details: { status },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-op-suggestions"] });
      toast.success("Sugestão de OP atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestedTransfers = transfers.filter(t => t.status === "suggested");
  const approvedTransfers = transfers.filter(t => t.status === "approved");
  const suggestedOps = opSuggestions.filter(o => o.status === "suggested");
  const approvedOps = opSuggestions.filter(o => o.status === "approved");

  const totalPending = suggestedTransfers.length + suggestedOps.length;

  const handleBatchApprove = async () => {
    setConfirmBatch(false);
    const promises: Promise<void>[] = [];
    selectedTransfers.forEach(id => {
      promises.push(updateTransfer.mutateAsync({ id, status: "approved" }));
    });
    selectedOps.forEach(id => {
      promises.push(updateOpSuggestion.mutateAsync({ id, status: "approved" }));
    });
    try {
      await Promise.all(promises);
      setSelectedTransfers(new Set());
      setSelectedOps(new Set());
      toast.success("Aprovação em lote concluída");
    } catch {
      // individual errors handled by mutations
    }
  };

  const handleSaveQty = async () => {
    if (!editingItem) return;
    const qty = Number(editQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantidade inválida");
      return;
    }
    if (editingItem.type === "transfer") {
      await updateTransfer.mutateAsync({ id: editingItem.id, status: "suggested", qty });
    } else {
      await updateOpSuggestion.mutateAsync({ id: editingItem.id, status: "suggested", qty });
    }
    setEditingItem(null);
  };

  const toggleTransfer = (id: string) => {
    setSelectedTransfers(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleOp = (id: string) => {
    setSelectedOps(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAllTransfers = () => {
    if (selectedTransfers.size === suggestedTransfers.length) {
      setSelectedTransfers(new Set());
    } else {
      setSelectedTransfers(new Set(suggestedTransfers.map(t => t.id)));
    }
  };

  const selectAllOps = () => {
    if (selectedOps.size === suggestedOps.length) {
      setSelectedOps(new Set());
    } else {
      setSelectedOps(new Set(suggestedOps.map(o => o.id)));
    }
  };

  if (totalPending === 0 && approvedTransfers.length === 0 && approvedOps.length === 0) {
    return (
      <CarboCard className="border-dashed">
        <CarboCardContent className="py-8 text-center">
          <Check className="h-8 w-8 mx-auto mb-2 text-carbo-green" />
          <p className="text-sm font-medium text-foreground">Nenhuma sugestão pendente</p>
          <p className="text-xs text-muted-foreground mt-1">Todos os estoques estão equilibrados entre os HUBs</p>
        </CarboCardContent>
      </CarboCard>
    );
  }

  const totalSelected = selectedTransfers.size + selectedOps.size;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-sm text-foreground">Sugestões pendentes</h3>
          {totalPending > 0 && (
            <CarboBadge variant="warning" className="text-[10px]">{totalPending}</CarboBadge>
          )}
        </div>
        {canApprove && totalSelected > 0 && (
          <Button size="sm" onClick={() => setConfirmBatch(true)} className="gap-1.5">
            <CheckCheck className="h-3.5 w-3.5" />
            Aprovar em lote ({totalSelected})
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 bg-muted/50">
          <TabsTrigger value="transfers" className="text-xs gap-1 h-7">
            <ArrowRightLeft className="h-3 w-3" />
            Transferências ({suggestedTransfers.length + approvedTransfers.length})
          </TabsTrigger>
          <TabsTrigger value="ops" className="text-xs gap-1 h-7">
            <Factory className="h-3 w-3" />
            Produção ({suggestedOps.length + approvedOps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transfers" className="space-y-2 mt-2">
          {suggestedTransfers.length > 0 && canApprove && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={selectedTransfers.size === suggestedTransfers.length && suggestedTransfers.length > 0}
                onCheckedChange={selectAllTransfers}
              />
              <span>Selecionar tudo</span>
            </div>
          )}
          {[...suggestedTransfers, ...approvedTransfers].map(t => (
            <CarboCard key={t.id} className="border-l-2 border-l-warning">
              <CarboCardContent className="py-3">
                <div className="flex items-start gap-3">
                  {canApprove && t.status === "suggested" && (
                    <Checkbox
                      checked={selectedTransfers.has(t.id)}
                      onCheckedChange={() => toggleTransfer(t.id)}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{getProductName(t.product_code)}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{t.product_code}</span>
                      <CarboBadge variant={t.status === "approved" ? "success" : "warning"} className="text-[10px]">
                        {t.status === "approved" ? "Aprovada" : "Pendente"}
                      </CarboBadge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <span>{getHubName(t.from_hub)}</span>
                      <ArrowRightLeft className="h-3 w-3" />
                      <span>{getHubName(t.to_hub)}</span>
                      <span className="font-semibold text-foreground">· {t.quantity} un</span>
                    </div>
                    {(t.notes || t.suggested_reason) && (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{t.suggested_reason || t.notes}</p>
                    )}
                  </div>
                  {canApprove && (
                    <div className="flex items-center gap-1 shrink-0">
                      {t.status === "suggested" && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItem({ id: t.id, qty: t.quantity, type: "transfer" }); setEditQty(String(t.quantity)); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-carbo-green" onClick={() => updateTransfer.mutate({ id: t.id, status: "approved" })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => updateTransfer.mutate({ id: t.id, status: "rejected" })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {t.status === "approved" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => updateTransfer.mutate({ id: t.id, status: "executed" })}>
                          <Check className="h-3 w-3" /> Executar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
          {suggestedTransfers.length === 0 && approvedTransfers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma transferência pendente</p>
          )}
        </TabsContent>

        <TabsContent value="ops" className="space-y-2 mt-2">
          {suggestedOps.length > 0 && canApprove && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={selectedOps.size === suggestedOps.length && suggestedOps.length > 0}
                onCheckedChange={selectAllOps}
              />
              <span>Selecionar tudo</span>
            </div>
          )}
          {[...suggestedOps, ...approvedOps].map(o => (
            <CarboCard key={o.id} className="border-l-2 border-l-carbo-blue">
              <CarboCardContent className="py-3">
                <div className="flex items-start gap-3">
                  {canApprove && o.status === "suggested" && (
                    <Checkbox
                      checked={selectedOps.has(o.id)}
                      onCheckedChange={() => toggleOp(o.id)}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{getProductName(o.product_code)}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{o.product_code}</span>
                      <CarboBadge variant={o.status === "approved" ? "success" : "default"} className="text-[10px]">
                        {o.status === "approved" ? "Aprovada" : "Pendente"}
                      </CarboBadge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <Factory className="h-3 w-3" />
                      <span>Produção: {getHubName(o.hub_origin_id)}</span>
                      {o.target_hub_id && (
                        <>
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>Destino: {getHubName(o.target_hub_id)}</span>
                        </>
                      )}
                      <span className="font-semibold text-foreground">· {o.suggested_qty} un</span>
                    </div>
                    {o.reason && (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{o.reason}</p>
                    )}
                  </div>
                  {canApprove && (
                    <div className="flex items-center gap-1 shrink-0">
                      {o.status === "suggested" && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItem({ id: o.id, qty: o.suggested_qty, type: "op" }); setEditQty(String(o.suggested_qty)); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-carbo-green" onClick={() => updateOpSuggestion.mutate({ id: o.id, status: "approved" })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => updateOpSuggestion.mutate({ id: o.id, status: "rejected" })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {o.status === "approved" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => updateOpSuggestion.mutate({ id: o.id, status: "created" })}>
                          <Package className="h-3 w-3" /> Criar OP
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
          {suggestedOps.length === 0 && approvedOps.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma sugestão de OP pendente</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit quantity dialog */}
      <Dialog open={!!editingItem} onOpenChange={open => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Editar quantidade</DialogTitle>
            <DialogDescription>Ajuste a quantidade antes de aprovar</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nova quantidade</label>
              <Input type="number" min={1} value={editQty} onChange={e => setEditQty(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveQty}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch approve confirmation */}
      <AlertDialog open={confirmBatch} onOpenChange={setConfirmBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar em lote</AlertDialogTitle>
            <AlertDialogDescription>
              Você aprovará {totalSelected} sugestão(ões). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchApprove}>Confirmar aprovação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
