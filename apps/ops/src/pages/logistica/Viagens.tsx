import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plane, Plus, Check, X, Eye } from "lucide-react";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { SolicitacaoViagemDialog } from "@/components/logistica/SolicitacaoViagemDialog";
import { ViagemDetailsDialog, type ViagemDetail } from "@/components/logistica/ViagemDetailsDialog";

// TODO: ligar em viagens (Supabase)

type ViagemStatus = "rascunho" | "pendente_gestor" | "pendente_financeiro" | "pendente_ceo" | "aprovado" | "reprovado" | "em_andamento" | "concluido" | "cancelado";
const STATUS_LABEL: Record<ViagemStatus, string> = {
  rascunho: "Rascunho", pendente_gestor: "Ag. Gestor", pendente_financeiro: "Ag. Financeiro", pendente_ceo: "Ag. CEO",
  aprovado: "Aprovado", reprovado: "Reprovado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<ViagemStatus, string> = {
  rascunho: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pendente_gestor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  pendente_financeiro: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  pendente_ceo: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  aprovado: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reprovado: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  em_andamento: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  concluido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelado: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};
type PCStatus = "aberta" | "enviada" | "aprovada" | "reprovada" | "encerrada";
const PC_STATUS_LABEL: Record<PCStatus, string> = { aberta: "Em Preenchimento", enviada: "Aguardando Aprovação", aprovada: "Aprovada", reprovada: "Reprovada", encerrada: "Encerrada" };
const PC_STATUS_COLOR: Record<PCStatus, string> = {
  aberta: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  enviada: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  aprovada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reprovada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  encerrada: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Viagem { id: string; destino: string; objetivo: string; solicitante: string; data: string; valor: number; status: ViagemStatus; pc: PCStatus | null; }
// TODO: ligar em viagens (Supabase)
const VIAGENS: Viagem[] = [];

const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export default function Viagens() {
  const [tab, setTab] = useState("todas");
  const pendentes = VIAGENS.filter((v) => v.status.startsWith("pendente"));
  const minhas = VIAGENS.filter((v) => v.solicitante === "Lucas Padilha");
  const rows = tab === "pendentes" ? pendentes : tab === "minhas" ? minhas : VIAGENS;

  const [novaOpen, setNovaOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<ViagemDetail | null>(null);
  const [aprovarViagem, setAprovarViagem] = useState<Viagem | null>(null);
  const [reprovarViagem, setReprovarViagem] = useState<Viagem | null>(null);
  const [motivoReprova, setMotivoReprova] = useState("");

  const abrirDetalhe = (v: Viagem) =>
    setDetalhe({
      id: v.id,
      destino: v.destino,
      objetivo: v.objetivo,
      solicitante: v.solicitante,
      data: v.data,
      valor: v.valor,
      statusLabel: STATUS_LABEL[v.status],
      pcLabel: v.pc ? PC_STATUS_LABEL[v.pc] : null,
    });

  const confirmar = () => {
    toast.info("Disponível na fase de lógica");
    setAprovarViagem(null);
    setReprovarViagem(null);
    setMotivoReprova("");
  };

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
            <TabsTrigger value="todas">Todas ({VIAGENS.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tipo / Destino</TableHead><TableHead>Solicitante</TableHead><TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>PC</TableHead><TableHead className="w-[110px]">Ações</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">{dt(v.data)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{brl(v.valor)}</TableCell>
                      <TableCell><span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_COLOR[v.status])}>{STATUS_LABEL[v.status]}</span></TableCell>
                      <TableCell>{v.pc ? <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", PC_STATUS_COLOR[v.pc])}>{PC_STATUS_LABEL[v.pc]}</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirDetalhe(v)}><Eye className="h-4 w-4" /></Button>
                          {v.status.startsWith("pendente") && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => setAprovarViagem(v)}><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setReprovarViagem(v)}><X className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Conexão com dados reais entra na fase de lógica. Aprovações e prestação de contas entram na fase de lógica.</p>
      </div>

      <SolicitacaoViagemDialog open={novaOpen} onOpenChange={setNovaOpen} />

      <ViagemDetailsDialog
        viagem={detalhe}
        open={detalhe !== null}
        onOpenChange={(o) => { if (!o) setDetalhe(null); }}
      />

      <AlertDialog open={aprovarViagem !== null} onOpenChange={(o) => { if (!o) setAprovarViagem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar solicitação de viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovarViagem && (
                <>Confirma a aprovação da viagem para <strong>{aprovarViagem.destino}</strong> de <strong>{aprovarViagem.solicitante}</strong>?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reprovarViagem !== null} onOpenChange={(o) => { if (!o) { setReprovarViagem(null); setMotivoReprova(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar solicitação de viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {reprovarViagem && (
                <>Informe o motivo da reprovação da viagem para <strong>{reprovarViagem.destino}</strong> de <strong>{reprovarViagem.solicitante}</strong>.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Textarea
              placeholder="Motivo da reprovação..."
              rows={3}
              value={motivoReprova}
              onChange={(e) => setMotivoReprova(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
