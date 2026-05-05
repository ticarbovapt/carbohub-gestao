import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Car, Users, Truck, Building2, Loader2, ClipboardCheck, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateServiceOrder } from "@/hooks/useServiceOrders";
import type { OsServiceType } from "@/types/os";

// ─── Checklist data from Checklist Operacional - Abertura de Licenciado CarboVAPT ───
const CHECKLIST_SECTIONS = [
  {
    id: "pre_operacao",
    title: "1. Pré-Operação",
    description: "Liberar envio e instalação somente com 100% dos itens concluídos.",
    subsections: [
      {
        id: "documentacao",
        title: "1.1 Documentação e Cadastro",
        items: [
          { id: "termo_compromisso", label: "Termo de Compromisso de Licenciamento assinado" },
          { id: "contrato_social", label: "Contrato social atualizado" },
          { id: "rg_cnh", label: "RG/CNH do representante legal" },
          { id: "email_representante", label: "E-mail do representante legal" },
        ],
      },
      {
        id: "contatos",
        title: "1.2 Contatos e Estrutura",
        items: [
          { id: "gerente_definido", label: "Gerente definido e contato registrado" },
          { id: "ponto_focal", label: "Ponto focal definido e contato registrado" },
          { id: "resp_financeiro", label: "Responsável financeiro definido e contato registrado" },
        ],
      },
      {
        id: "kit_pdv",
        title: "1.3 Kit PDV CarboVapt",
        items: [
          { id: "banner_infografico", label: "Banner infográfico" },
          { id: "folhetos_pdv", label: "Folhetos Informativos" },
          { id: "display_mesa_pdv", label: "Display de Mesa" },
          { id: "banner_tripe_pdv", label: "Banner Tripé" },
          { id: "mobile_pdv", label: "Mobile" },
        ],
      },
      {
        id: "kit_carboze",
        title: "1.4 Kit CarboZé",
        items: [
          { id: "display_panfleto", label: "Display de panfleto" },
          { id: "panfletos_cz", label: "Panfletos" },
          { id: "expositor", label: "Expositor (P, M ou G)" },
          { id: "wind_banner", label: "Wind banner" },
          { id: "banner_tripe_cz", label: "Banner Tripé" },
          { id: "mobile_cz", label: "Mobile" },
          { id: "mini_banner", label: "Mini banner de balcão" },
        ],
      },
      {
        id: "maleta",
        title: "Maleta Experimento",
        items: [
          { id: "diesel_s10", label: "Diesel S10" },
          { id: "acido_sulfurico", label: "Ácido sulfúrico" },
          { id: "estabilizador", label: "Estabilizador CarboZé" },
          { id: "proveta", label: "Proveta" },
          { id: "tubo_ensaio", label: "Tubo de ensaio" },
          { id: "becker", label: "Becker medidor / Seringa" },
        ],
      },
      {
        id: "equipamento_vapt",
        title: "1.5 Equipamento CarboVapt",
        items: [
          { id: "maquina_estado", label: "Máquina em bom estado" },
          { id: "cartao_ativacao", label: "Cartão de ativação" },
          { id: "mangueira", label: "Mangueira" },
          { id: "flange", label: "Flange" },
          { id: "decibelimetro", label: "Decibelímetro" },
          { id: "reagentes_teste", label: "Reagentes para teste" },
          { id: "reagentes_estoque", label: "Reagentes para estoque" },
        ],
      },
      {
        id: "gravacao",
        title: "1.6 Equipamentos de Gravação",
        items: [
          { id: "microfones", label: "Microfones carregados" },
          { id: "celular", label: "Celular com memória e câmera ok" },
          { id: "camiseta", label: "Camiseta da marca" },
        ],
      },
      {
        id: "equipe",
        title: "1.7 Equipe e Equipamentos",
        items: [
          { id: "uniforme", label: "Uniforme" },
          { id: "epis", label: "EPIs disponíveis" },
          { id: "extensao", label: "Extensão elétrica 50m+" },
          { id: "maleta_ferramentas", label: "Maleta de ferramentas completa" },
          { id: "kit_limpeza", label: "Kit de Limpeza" },
          { id: "veiculo_limpo", label: "Veículo limpo" },
        ],
      },
    ],
  },
  {
    id: "entrega_tecnica",
    title: "2. Entrega Técnica",
    description: "Garantir equipamento instalado e operador apto.",
    subsections: [
      {
        id: "recebimento",
        title: "2.1 Recebimento e Inspeção",
        items: [
          { id: "horario_chegada", label: "Horário de chegada registrado" },
          { id: "equipamentos_integros", label: "Equipamentos íntegros" },
          { id: "checklist_pre_conferido", label: "Todos os itens do checklist pré-operação conferidos" },
          { id: "sem_dano", label: "Nenhum dano identificado" },
        ],
      },
      {
        id: "testes_tecnicos",
        title: "2.2 Testes Técnicos",
        items: [
          { id: "ligacao_inicial", label: "Ligação inicial OK" },
          { id: "teste_funcionamento", label: "Teste de funcionamento aprovado" },
          { id: "sem_vazamento", label: "Nenhum vazamento detectado" },
          { id: "contagem_zerada", label: "Contagem de máquina zerada" },
        ],
      },
      {
        id: "treinamento_tecnico",
        title: "2.3 Treinamento Técnico",
        items: [
          { id: "apresentacao_maquina", label: "Apresentação da máquina" },
          { id: "funcionamento_passo", label: "Funcionamento passo a passo explicado" },
          { id: "demo_pratica", label: "Demonstração prática realizada" },
          { id: "operador_praticou", label: "Operador praticou sob supervisão" },
          { id: "pontos_criticos", label: "Pontos críticos explicados" },
          { id: "manutencao_basica", label: "Manutenção básica orientada" },
          { id: "adesivo_instrucoes", label: "Adesivo de instruções apresentado" },
          { id: "operador_apto", label: "Operador apto para operar sozinho" },
        ],
      },
      {
        id: "experiencia_quimica",
        title: "2.4 Experiência Química CarboZé",
        items: [
          { id: "experimento_realizado", label: "Experimento realizado" },
          { id: "comparacao_explicada", label: "Comparação explicada" },
          { id: "materiais_descartados", label: "Materiais descartados corretamente" },
        ],
      },
      {
        id: "encerramento_tecnico",
        title: "2.5 Encerramento Técnico",
        items: [
          { id: "area_limpa", label: "Área limpa e organizada" },
          { id: "embalagens_recolhidas", label: "Embalagens recolhidas" },
          { id: "contatos_suporte", label: "Contatos de suporte fornecidos" },
          { id: "horario_finalizacao", label: "Horário de finalização registrado" },
          { id: "liberacao_tecnica", label: "Liberação técnica para operação comercial" },
          { id: "maquina_local_seco", label: "Máquina em local seco e arejado livre de riscos" },
        ],
      },
    ],
  },
  {
    id: "entrega_comercial",
    title: "4. Entrega Comercial",
    description: "Deixar o licenciado apto para vender.",
    subsections: [
      {
        id: "sistema_processos",
        title: "4.1 Sistema e Processos",
        items: [
          { id: "sistema_carbovapt", label: "Sistema CarboVapt apresentado" },
          { id: "dados_acesso", label: "Dados de Acesso entregues e testados" },
          { id: "grupo_whatsapp", label: "Contatos para grupo WhatsApp validados" },
          { id: "estoque_registrado", label: "Estoque de reagentes registrados no sistema" },
          { id: "processo_mensal", label: "Processo mensal explicado" },
          { id: "termo_reagentes", label: "Termo de reagentes assinado" },
        ],
      },
      {
        id: "treinamento_comercial",
        title: "4.2 Treinamento Comercial e Marca",
        items: [
          { id: "tecnologia_apresentada", label: "Tecnologia apresentada" },
          { id: "diferenciais", label: "Diferenciais explicados" },
          { id: "processo_vendas", label: "Processo de vendas definido" },
          { id: "matriz_objecoes", label: "Matriz de objeções apresentada" },
          { id: "estrategia_frotas", label: "Estratégia para frotas explicada" },
          { id: "portaria_192", label: "Portaria 192 apresentada" },
          { id: "posicionamento", label: "Posicionamento de mercado alinhado" },
          { id: "suporte_marketing", label: "Suporte e marketing apresentados" },
          { id: "grupos_canais", label: "Grupos e canais explicados" },
          { id: "maquina_vendas", label: "Máquina de Vendas Apresentada" },
          { id: "termo_maquina_online", label: "Termo de Aceite da Máquina de Vendas Online assinado" },
          { id: "raio_atendimento", label: "Raio de atendimento registrado" },
          { id: "categorias_veiculos", label: "Categorias e modelos de veículos atendidos registrados" },
          { id: "contingente_marketing", label: "Contingente de marketing do licenciado levantado" },
        ],
      },
      {
        id: "publicidade_local",
        title: "4.3 Publicidade no Local",
        items: [
          { id: "infografico_posicionado", label: "Infográfico posicionado" },
          { id: "display_posicionado", label: "Display posicionado" },
          { id: "panfletos_posicionados", label: "Panfletos posicionados" },
          { id: "banner_posicionado", label: "Banner posicionados" },
          { id: "registro_fotos_videos", label: "Registro em fotos e vídeos dos itens posicionados" },
          { id: "registro_aperto_mao", label: "Registro do aperto de mão entre vendedor e licenciado" },
        ],
      },
      {
        id: "conteudo_gravacoes",
        title: "4.4 Conteúdo e Gravações",
        items: [
          { id: "video_inauguracao", label: "Vídeo inauguração gravado" },
          { id: "midias_enviadas", label: "Mídias enviadas no grupo" },
        ],
      },
      {
        id: "integracao_carboze",
        title: "4.5 Integração CarboZé",
        items: [
          { id: "kit_verificado", label: "Kit verificado" },
          { id: "itens_pdv_instalados", label: "Itens de Publicidade no PDV instalados" },
          { id: "alinhamento_comercial", label: "Alinhamento comercial realizado" },
          { id: "licenciado_apto", label: "Licenciado apto para iniciar vendas" },
          { id: "sistema_carboze", label: "Sistema CarboZé Apresentado" },
          { id: "modelo_comercial", label: "Modelo Comercial Alinhado" },
          { id: "estoque_inicial", label: "Estoque inicial registrado" },
          { id: "fotos_cz", label: "Registro em fotos e vídeos dos itens posicionados" },
        ],
      },
    ],
  },
  {
    id: "pos_operacao",
    title: "5. Pós-Operação",
    description: "Registrar, comunicar e garantir follow-up.",
    subsections: [
      {
        id: "pos_items",
        title: "5. Pós-Operação",
        items: [
          { id: "fotos_drive", label: "Fotos e Vídeos armazenadas no Drive" },
          { id: "operacao_crm_erp", label: "Operação registrada no CRM e ERP" },
          { id: "status_abertura", label: "Status: Abertura Concluída" },
          { id: "grupo_licenciado", label: "Grupo do licenciado criado" },
          { id: "msg_agradecimento", label: "Mensagem de agradecimento enviada no grupo" },
          { id: "guia_assinatura", label: "Guia do Licenciado enviado para assinatura digital" },
          { id: "guia_assinado", label: "Guia do Licenciado assinado colocado na pasta do cliente" },
          { id: "pasta_documentos", label: "Pasta de documentos administrativos completa" },
          { id: "administrativo_informado", label: "Administrativo e Financeiro informados das condições comerciais e data de início de faturamento" },
        ],
      },
    ],
  },
];

type ChecklistState = Record<string, boolean>;

function ChecklistSection({
  section,
  state,
  onChange,
}: {
  section: (typeof CHECKLIST_SECTIONS)[0];
  state: ChecklistState;
  onChange: (id: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  const totalItems = section.subsections.reduce((s, ss) => s + ss.items.length, 0);
  const checkedItems = section.subsections.reduce(
    (s, ss) => s + ss.items.filter((i) => state[i.id]).length,
    0
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors text-left">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-semibold text-sm">{section.title}</span>
        </div>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full",
          checkedItems === totalItems ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
        )}>
          {checkedItems}/{totalItems}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 pl-2 pt-3 pb-1">
          {section.subsections.map((sub) => (
            <div key={sub.id}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 ml-1">{sub.title}</p>
              <div className="space-y-2">
                {sub.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2.5 cursor-pointer group"
                  >
                    <Checkbox
                      id={item.id}
                      checked={!!state[item.id]}
                      onCheckedChange={(v) => onChange(item.id, !!v)}
                      className="mt-0.5"
                    />
                    <span className={cn(
                      "text-sm leading-snug transition-colors",
                      state[item.id] ? "line-through text-muted-foreground" : "group-hover:text-foreground"
                    )}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Service type options ─────────────────────────────────────────────────
interface ServiceTypeOption {
  value: OsServiceType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const SERVICE_TYPES: ServiceTypeOption[] = [
  {
    value: "b2c",
    label: "B2C — Eventual",
    description: "Descarbonização pontual para pessoa física / consumidor",
    icon: <Car className="h-5 w-5" />,
    color: "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-700",
  },
  {
    value: "b2b",
    label: "B2B — Eventual",
    description: "Descarbonização para empresa / frota corporativa eventual",
    icon: <Building2 className="h-5 w-5" />,
    color: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-700",
  },
  {
    value: "frota",
    label: "Frota — Agendamento",
    description: "Agendamento recorrente de frota (agenda + máquina alocada)",
    icon: <Truck className="h-5 w-5" />,
    color: "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-700",
  },
  {
    value: "abertura_licenciado",
    label: "Abertura de Licenciado",
    description: "Checklist operacional completo de abertura de licenciado CarboVAPT",
    icon: <ClipboardCheck className="h-5 w-5" />,
    color: "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20 text-orange-700",
  },
];

interface CreateOSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateOSDialog({ open, onOpenChange, onSuccess }: CreateOSDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"type" | "form" | "checklist">("type");
  const [selectedType, setSelectedType] = useState<OsServiceType | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistState>({});

  const createMutation = useCreateServiceOrder();

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setStep("type");
        setSelectedType(null);
        setChecklistState({});
      }, 200);
    }
  };

  const handleTypeSelect = (type: OsServiceType) => {
    setSelectedType(type);
    setStep(type === "abertura_licenciado" ? "checklist" : "form");
  };

  const handleChecklistToggle = (id: string, checked: boolean) => {
    setChecklistState((prev) => ({ ...prev, [id]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedType) return;
    const fd = new FormData(e.currentTarget);
    await createMutation.mutateAsync({
      title: (fd.get("title") as string) || `OS ${selectedType.toUpperCase()} — ${fd.get("customer_name")}`,
      service_type: selectedType,
      customer_name: (fd.get("customer_name") as string) || undefined,
      vehicle_plate: (fd.get("vehicle_plate") as string) || undefined,
      vehicle_model: (fd.get("vehicle_model") as string) || undefined,
      priority: parseInt(fd.get("priority") as string) || 3,
      scheduled_at: (fd.get("scheduled_at") as string) || undefined,
      description: (fd.get("description") as string) || undefined,
    });
    handleOpenChange(false);
    onSuccess?.();
  };

  const handleChecklistSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const licenciado = (fd.get("licenciado") as string) || "";
    const local = (fd.get("local") as string) || "";
    const tecnico = (fd.get("tecnico") as string) || "";

    const totalItems = CHECKLIST_SECTIONS.reduce(
      (s, sec) => s + sec.subsections.reduce((ss, sub) => ss + sub.items.length, 0), 0
    );
    const checkedCount = Object.values(checklistState).filter(Boolean).length;

    await createMutation.mutateAsync({
      title: `Abertura Licenciado ${licenciado || ""}`.trim(),
      service_type: "abertura_licenciado",
      customer_name: licenciado || undefined,
      priority: 2,
      scheduled_at: (fd.get("data_prevista") as string) || undefined,
      description: `Local: ${local} | Técnico: ${tecnico}`,
      metadata: {
        checklist: checklistState,
        checklist_progress: `${checkedCount}/${totalItems}`,
        local,
        tecnico,
        resp_comercial: (fd.get("resp_comercial") as string) || "",
      },
    });
    handleOpenChange(false);
    onSuccess?.();
  };

  const isChecklist = step === "checklist";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn("transition-all", isChecklist ? "max-w-2xl" : "max-w-lg")}>
        {/* ── Step 1: Tipo ── */}
        {step === "type" && (
          <>
            <DialogHeader>
              <DialogTitle>Nova Ordem de Serviço</DialogTitle>
              <DialogDescription>Selecione o tipo de OS CarboVAPT</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              {SERVICE_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeSelect(opt.value)}
                  className={cn(
                    "flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all",
                    opt.color
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">{opt.icon}</div>
                  <div>
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2: Formulário simples (B2C / B2B / Frota) ── */}
        {step === "form" && selectedType && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{SERVICE_TYPES.find((t) => t.value === selectedType)?.label}</DialogTitle>
              <DialogDescription>Preencha as informações da Ordem de Serviço</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer_name">
                  {selectedType === "frota" ? "Empresa / Frota" : "Nome do Cliente"}
                </Label>
                <Input
                  id="customer_name"
                  name="customer_name"
                  placeholder={selectedType === "frota" ? "Ex: Transportadora XYZ" : "Nome do cliente"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_plate">Placa do Veículo</Label>
                  <Input id="vehicle_plate" name="vehicle_plate" placeholder="ABC-1234" className="uppercase" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_model">Modelo</Label>
                  <Input id="vehicle_model" name="vehicle_model" placeholder="Ex: Fiat Uno 1.0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_at">
                  {selectedType === "frota" ? "Data do Agendamento" : "Data Prevista (opcional)"}
                </Label>
                <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required={selectedType === "frota"} />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select name="priority" defaultValue="3">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">🔴 Urgente</SelectItem>
                    <SelectItem value="2">🟠 Alta</SelectItem>
                    <SelectItem value="3">⚪ Normal</SelectItem>
                    <SelectItem value="4">🔵 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Título da OS</Label>
                <Input id="title" name="title" placeholder="Ex: Descarbonização motor Honda Fit" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Observações</Label>
                <Textarea id="description" name="description" placeholder="Informações adicionais..." rows={2} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("type")} disabled={createMutation.isPending}>
                Voltar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : "Criar OS"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── Step 3: Checklist Abertura de Licenciado ── */}
        {step === "checklist" && (
          <form onSubmit={handleChecklistSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-orange-500" />
                Checklist Abertura de Licenciado CarboVAPT
              </DialogTitle>
              <DialogDescription>Preencha os dados e marque os itens conforme a operação avança.</DialogDescription>
            </DialogHeader>

            {/* Cabeçalho */}
            <div className="grid grid-cols-2 gap-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="licenciado">Licenciado *</Label>
                <Input id="licenciado" name="licenciado" placeholder="Nome do licenciado" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="local">Local</Label>
                <Input id="local" name="local" placeholder="Cidade/UF" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tecnico">Técnico CarboVapt</Label>
                <Input id="tecnico" name="tecnico" placeholder="Nome do técnico" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resp_comercial">Responsável Comercial</Label>
                <Input id="resp_comercial" name="resp_comercial" placeholder="Nome" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="data_prevista">Data Prevista para Abertura</Label>
                <Input id="data_prevista" name="data_prevista" type="date" />
              </div>
            </div>

            {/* Checklist sections — scrollable */}
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1 py-2 border rounded-lg px-3">
              {CHECKLIST_SECTIONS.map((section) => (
                <ChecklistSection
                  key={section.id}
                  section={section}
                  state={checklistState}
                  onChange={handleChecklistToggle}
                />
              ))}
            </div>

            {/* Progress */}
            {(() => {
              const total = CHECKLIST_SECTIONS.reduce(
                (s, sec) => s + sec.subsections.reduce((ss, sub) => ss + sub.items.length, 0), 0
              );
              const checked = Object.values(checklistState).filter(Boolean).length;
              const pct = Math.round((checked / total) * 100);
              return (
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{checked}/{total} itens marcados</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-green-500" : "bg-orange-400")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("type")} disabled={createMutation.isPending}>
                Voltar
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : "Criar OS com Checklist"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
