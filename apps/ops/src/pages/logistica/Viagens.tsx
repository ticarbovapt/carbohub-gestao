import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plane, Plus, Check, X, Eye, Receipt, Loader2 } from "lucide-react";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { SolicitacaoViagemDialog } from "@/components/logistica/SolicitacaoViagemDialog";
import { ViagemDetailsDialog } from "@/components/logistica/ViagemDetailsDialog";
import { PrestacaoContasDialog } from "@/components/logistica/PrestacaoContasDialog";
import { useViagens, useViagemMutations, useCurrentUserId, type Viagem, type ViagemStatus } from "@/hooks/useViagens";

const STATUS_LABEL: Record<ViagemStatus, string> = {
  pendente: "Pendente", aprovado: "Aprovado", reprovado: "Reprovado",
  em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<ViagemStatus, string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  aprovado: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reprovado: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  em_andamento: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  concluido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelado: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};
const PC_LABEL: Record<string, string> = {
  aberta: "Em Preenchimento", enviada: "Aguardando Aprovação", aprovada: "Aprovada", reprovada: "Reprovada", encerrada: "Encerrada",
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function Viagens() {
  const { data: viagens = [], isLoading } = useViagens();
  const { data: userId } = useCurrentUserId();
  const { approve, reject } = useViagemMutations();

  const [tab, setTab] = useState("todas");
  const pendentes = viagens.filter((v) => v.status === "pendente");
  const minhas = viagens.filter((v) => v.created_by && v.created_by === userId);
  const rows = tab === "pendentes" ? pendentes : tab === "minhas" ? minhas : viagens;

  const [novaOpen, setNovaOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Viagem | null>(null);
  const [pcViagem, setPcViagem] = useState<Viagem | null>(null);
  const [aprovarViagem, setAprovarViagem] = useState<Viagem | null>(null);
  const [reprovarViagem, setReprovarViagem] = useState<Viagem | null>(null);
  const [motivoReprova, setMotivoReprova] = useState("");

  const doAprovar = async () => {
    if (!aprovarViagem) return;
    try { await approve.mutateAsync(aprovarViagem.id); toast.success("Viagem aprovada."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao aprovar."); }
    setAprovarViagem(null);
  };
  const doReprovar = async () => {
    if (!reprovarViagem) return;
    try { await reject.mutateAsync({ id: reprovarViagem.id, motivo: motivoReprova }); toast.success("Viagem reprovada."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao reprovar."); }
    setReprovarViagem(null); setMotivoReprova("");
  };

  const podePrestarContas = (v: Viagem) => v.status === "aprovado" || v.status === "em_andamento" || v.status === "concluido";

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Viagens & Prestação de Contas"
          description="Solicite, aprove e preste contas de viagens corporativas"
          icon={Plane}
          actions={<Button className="gap-2" onClick={() => setNovaOpen(true)}><Plus className="h-4 w-4" /> Nova Solicitação</Button>}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="minhas">Minhas ({minhas.length})</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
            <TabsTrigger value="todas">Todas ({viagens.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
            ) : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Destino</TableHead><TableHead>Solicitante</TableHead><TableHead>Ida</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>PC</TableHead><TableHead className="w-[150px]">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <CarboEmptyState icon={Plane} title="Nenhuma viagem" description="Nenhuma viagem registrada." />
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell><p className="font-medium">{v.destino}</p><p className="text-xs text-muted-foreground truncate max-w-[220px]">{v.objetivo}</p></TableCell>
                      <TableCell className="text-sm">{v.solicitante}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dt(v.data_ida)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{brl(v.valor_estimado)}</TableCell>
                      <TableCell><span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_COLOR[v.status])}>{STATUS_LABEL[v.status]}</span></TableCell>
                      <TableCell>{v.pc_status ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted">{PC_LABEL[v.pc_status] ?? v.pc_status}</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetalhe(v)} title="Detalhes"><Eye className="h-4 w-4" /></Button>
                          {v.status === "pendente" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => setAprovarViagem(v)} title="Aprovar"><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setReprovarViagem(v)} title="Reprovar"><X className="h-4 w-4" /></Button>
                            </>
                          )}
                          {podePrestarContas(v) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-carbo-blue" onClick={() => setPcViagem(v)} title="Prestar contas"><Receipt className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SolicitacaoViagemDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <ViagemDetailsDialog viagem={detalhe} statusLabel={detalhe ? STATUS_LABEL[detalhe.status] : ""} open={detalhe !== null} onOpenChange={(o) => { if (!o) setDetalhe(null); }} />
      <PrestacaoContasDialog viagem={pcViagem} open={pcViagem !== null} onOpenChange={(o) => { if (!o) setPcViagem(null); }} />

      <AlertDialog open={aprovarViagem !== null} onOpenChange={(o) => { if (!o) setAprovarViagem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar solicitação de viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovarViagem && (<>Confirma a aprovação da viagem para <strong>{aprovarViagem.destino}</strong> de <strong>{aprovarViagem.solicitante}</strong>?</>)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approve.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doAprovar(); }} disabled={approve.isPending}>Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reprovarViagem !== null} onOpenChange={(o) => { if (!o) { setReprovarViagem(null); setMotivoReprova(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar solicitação de viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {reprovarViagem && (<>Informe o motivo da reprovação da viagem para <strong>{reprovarViagem.destino}</strong> de <strong>{reprovarViagem.solicitante}</strong>.</>)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Textarea placeholder="Motivo da reprovação..." rows={3} value={motivoReprova} onChange={(e) => setMotivoReprova(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reject.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doReprovar(); }} disabled={reject.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
