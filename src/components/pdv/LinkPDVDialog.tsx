import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Link } from "lucide-react";

interface LinkPDVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, pre-selects this user */
  targetUserId?: string;
}

export function LinkPDVDialog({ open, onOpenChange, targetUserId }: LinkPDVDialogProps) {
  const [selectedPdvId, setSelectedPdvId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(targetUserId || "");
  const queryClient = useQueryClient();

  // Fetch available PDVs
  const { data: pdvs, isLoading: pdvsLoading } = useQuery({
    queryKey: ["pdv-list-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdvs")
        .select("id, pdv_code, name, status")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch users without PDV binding
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users-without-pdv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, department")
        .eq("status", "approved")
        .order("full_name");
      if (error) throw error;
      // Filter out users who already have a pdv_users entry
      const { data: existingLinks } = await supabase
        .from("pdv_users")
        .select("user_id");
      const linkedIds = new Set((existingLinks || []).map(l => l.user_id));
      return (data || []).filter(u => !linkedIds.has(u.id));
    },
    enabled: open && !targetUserId,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const userId = targetUserId || selectedUserId;
      if (!userId || !selectedPdvId) throw new Error("Selecione PDV e usuário");

      const { error } = await supabase
        .from("pdv_users")
        .insert({
          user_id: userId,
          pdv_id: selectedPdvId,
          is_primary: true,
          can_request_replenishment: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário vinculado ao PDV com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["pdv-status"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-list"] });
      onOpenChange(false);
      setSelectedPdvId("");
      setSelectedUserId("");
    },
    onError: (e: Error) => toast.error("Erro ao vincular: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Vincular Usuário a PDV
          </DialogTitle>
          <DialogDescription>
            Selecione o PDV e o usuário para criar o vínculo de acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!targetUserId && (
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={usersLoading ? "Carregando..." : "Selecione o usuário"} />
                </SelectTrigger>
                <SelectContent>
                  {(users || []).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} {u.username ? `(${u.username})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>PDV</Label>
            <Select value={selectedPdvId} onValueChange={setSelectedPdvId}>
              <SelectTrigger>
                <SelectValue placeholder={pdvsLoading ? "Carregando..." : "Selecione o PDV"} />
              </SelectTrigger>
              <SelectContent>
                {(pdvs || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.pdv_code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={linkMutation.isPending || !selectedPdvId || (!targetUserId && !selectedUserId)}
          >
            {linkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
