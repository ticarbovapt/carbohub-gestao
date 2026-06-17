import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSupplierMutations } from "@/hooks/useSuppliers";

export interface SupplierFormInitial {
  legal_name?: string;
  cnpj?: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  id?: string;
  initial?: SupplierFormInitial;
}

export function SupplierFormDialog({ open, onOpenChange, mode, id, initial }: SupplierFormDialogProps) {
  const { create, update } = useSupplierMutations();
  const [name, setName] = useState(initial?.legal_name ?? "");
  const [cnpj, setCnpj] = useState(initial?.cnpj ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const pending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    const payload = { legal_name: name, cnpj, contact, email, phone, notes };
    try {
      if (mode === "edit" && id) await update.mutateAsync({ id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(mode === "create" ? "Fornecedor criado." : "Fornecedor atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o fornecedor.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo Fornecedor" : "Editar Fornecedor"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Cadastre um fornecedor no mestre de MRP." : "Atualize os dados do fornecedor."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input placeholder="Química Sul Indústria LTDA" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contato</Label>
            <Input placeholder="Nome do responsável" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" placeholder="contato@fornecedor.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea placeholder="Observações sobre o fornecedor..." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (mode === "create" ? "Criar Fornecedor" : "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
