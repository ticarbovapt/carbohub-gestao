import { useEffect, useState } from "react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, type Supplier } from "@/hooks/useSuppliers";
import { useAuth } from "@/contexts/AuthContext";

const formVazio = {
  name: "", legal_name: "", document_number: "", email: "", phone: "",
  address: "", city: "", state: "", zip_code: "", category: "geral", notes: "",
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (t: string) => t.replace(/\D/g, "");

export function SuppliersList() {
  const { gestor } = useAuth();
  // Busca na URL (replace: o Voltar não apaga letra a letra).
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [buscaTxt, setBuscaTxt] = useState(busca);
  useEffect(() => { setBuscaTxt((atual) => (atual.trim() === busca ? atual : busca)); }, [busca]);
  useEffect(() => {
    if (buscaTxt.trim() === busca) return;
    const t = setTimeout(() => setBusca(buscaTxt.trim()), 300);
    return () => clearTimeout(t);
  }, [buscaTxt, busca, setBusca]);

  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState(formVazio);

  const { data: suppliers = [], isLoading, isError, error } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const canManage = gestor;

  // Nome, razão social, cidade sem acento; documento pelos DÍGITOS (o cadastro
  // tem CNPJ com e sem pontuação — comparar o texto formatado deixa de fora).
  const termo = semAcento(busca.trim());
  const termoDig = soDigitos(busca);
  const filtered = !termo ? suppliers : suppliers.filter((s) =>
    semAcento(s.name).includes(termo) ||
    semAcento(s.legal_name || "").includes(termo) ||
    semAcento(s.city || "").includes(termo) ||
    (termoDig.length >= 3 && soDigitos(s.document_number || "").includes(termoDig))
  );

  const categorias = Array.from(new Set(suppliers.map((s) => s.category).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const openCreate = () => {
    setForm(formVazio);
    setEditSupplier(null);
    setShowForm(true);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name, legal_name: s.legal_name || "", document_number: s.document_number || "",
      email: s.email || "", phone: s.phone || "", address: s.address || "", city: s.city || "",
      state: s.state || "", zip_code: s.zip_code || "", category: s.category || "geral", notes: s.notes || "",
    });
    setEditSupplier(s);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      name: form.name.trim(),
      state: form.state.trim().toUpperCase(),
      category: form.category.trim() || "geral",
    };
    try {
      if (editSupplier) await updateSupplier.mutateAsync({ id: editSupplier.id, ...payload });
      else await createSupplier.mutateAsync(payload);
      setShowForm(false);
    } catch { /* o hook já avisou; o formulário fica aberto */ }
  };

  // ⚠️ Cotação, OC e conta a pagar apontam para o fornecedor (FK): o banco
  // recusa excluir quem tem histórico, e o hook traduz a recusa.
  const excluir = async (s: Supplier) => {
    const ok = await confirmar({
      titulo: `Excluir "${s.name}"?`,
      mensagem: "Fornecedor com compras não pode ser excluído; nesse caso, inative-o.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok) deleteSupplier.mutate(s.id);
  };

  return (
    <div className="space-y-4">
      {/* Barra: busca à esquerda, a ação principal à direita */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, CNPJ ou cidade…"
            value={buscaTxt}
            onChange={(e) => setBuscaTxt(e.target.value)}
            className="pl-9"
          />
        </div>
        {canManage && (
          <Button onClick={openCreate} className="carbo-gradient gap-2 self-start text-white lg:self-auto" size="sm">
            <Plus className="h-4 w-4" /> Novo fornecedor
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-[110px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : isError ? (
              <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-destructive">
                Não foi possível ler os fornecedores: {(error as Error)?.message ?? "erro desconhecido"}
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">Nenhum fornecedor encontrado</TableCell></TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="leading-tight">
                      <p className="font-medium">{s.name}</p>
                      {s.legal_name && s.legal_name !== s.name && <p className="text-xs text-muted-foreground">{s.legal_name}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.document_number || "—"}</TableCell>
                  <TableCell className="text-sm capitalize">{s.category || "—"}</TableCell>
                  <TableCell>
                    {s.city ? (
                      <span className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {s.city}{s.state ? `/${s.state}` : ""}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {s.phone ? (
                      <span className="flex items-center gap-1 whitespace-nowrap text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {s.phone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <CarboBadge variant={s.is_active ? "success" : "secondary"}>
                      {s.is_active ? "Ativo" : "Inativo"}
                    </CarboBadge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Editar">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateSupplier.mutate({ id: s.id, is_active: !s.is_active })} title={s.is_active ? "Inativar" : "Ativar"}>
                          {s.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-success" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => excluir(s)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {termo ? `${filtered.length} de ${suppliers.length} fornecedor(es)` : `${suppliers.length} fornecedor(es)`}
      </p>

      {/* Criar / editar */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSupplier ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Como o time chama" />
              </div>
              <div>
                <Label>Razão social</Label>
                <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="Como sai na nota" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>CNPJ/CPF</Label>
                <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Input list="fornecedor-categorias" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="geral" />
                <datalist id="fornecedor-categorias">
                  {categorias.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 0000-0000" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@fornecedor.com" />
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>Estado</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Condição de pagamento, contato comercial…" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.name.trim() || createSupplier.isPending || updateSupplier.isPending} className="carbo-gradient text-white">
                {editSupplier ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
