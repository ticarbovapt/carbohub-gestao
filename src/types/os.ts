export type OsStatus = "draft" | "active" | "paused" | "completed" | "cancelled";
export type StageStatus = "pending" | "in_progress" | "completed" | "blocked";
export type DepartmentType = "venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda";
export type AppRole = "admin" | "manager" | "operator" | "viewer";

export interface Department {
  id: string;
  type: DepartmentType;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  os_number: string;
  customer_id: string | null;
  title: string;
  description: string | null;
  status: OsStatus;
  current_department: DepartmentType;
  priority: number;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined data
  customer?: Customer;
}

export interface OsStageHistory {
  id: string;
  service_order_id: string;
  department: DepartmentType;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  department: DepartmentType;
  name: string;
  description: string | null;
  items: ChecklistItemTemplate[];
  is_active: boolean;
  version: number;
  created_at: string;
}

export interface ChecklistItemTemplate {
  id: string;
  label: string;
  type: "boolean" | "number" | "text" | "sensor";
  required: boolean;
  sensorType?: string;
  unit?: string;
  min?: number;
  max?: number;
}

export interface OsChecklist {
  id: string;
  service_order_id: string;
  template_id: string | null;
  department: DepartmentType;
  items: ChecklistItem[];
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  signature_data: string | null;
  notes: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  type: "boolean" | "number" | "text" | "sensor";
  value: boolean | number | string | null;
  isValid: boolean;
  notes?: string;
  sensorData?: {
    source: string;
    timestamp: string;
    raw_value: number;
  };
}

// Department display info with icons and colors
export const DEPARTMENT_INFO: Record<DepartmentType, { name: string; icon: string; color: string }> = {
  venda: { name: "Venda", icon: "💰", color: "#10B981" },
  preparacao: { name: "Preparação", icon: "📦", color: "#F59E0B" },
  expedicao: { name: "Expedição", icon: "🚚", color: "#3B82F6" },
  operacao: { name: "Operação", icon: "⚙️", color: "#8B5CF6" },
  pos_venda: { name: "Pós-Venda", icon: "🎯", color: "#EC4899" },
};

// Department flow order
export const DEPARTMENT_ORDER: DepartmentType[] = [
  "venda",
  "preparacao",
  "expedicao",
  "operacao",
  "pos_venda",
];

export function getDepartmentIndex(dept: DepartmentType): number {
  return DEPARTMENT_ORDER.indexOf(dept);
}

export function getNextDepartment(current: DepartmentType): DepartmentType | null {
  const index = getDepartmentIndex(current);
  if (index < DEPARTMENT_ORDER.length - 1) {
    return DEPARTMENT_ORDER[index + 1];
  }
  return null;
}

export function getPreviousDepartment(current: DepartmentType): DepartmentType | null {
  const index = getDepartmentIndex(current);
  if (index > 0) {
    return DEPARTMENT_ORDER[index - 1];
  }
  return null;
}

// ============================================================
// CarboVAPT — Ordens de Serviço (Descarbonização)
// ============================================================

export type OsStage =
  | "nova"
  | "qualificacao"
  | "agendamento"
  | "confirmada"
  | "em_execucao"
  | "pos_servico"
  | "concluida"
  | "cancelada";

export type OsServiceType = "b2c" | "b2b" | "frota";

export interface OsStageConfig {
  id: OsStage;
  label: string;
  emoji: string;
  color: string;    // hex or tailwind-compatible color for border
  bgClass: string;  // tailwind bg class
}

export const OS_STAGES: OsStageConfig[] = [
  { id: "nova",         label: "Nova OS",      emoji: "📥", color: "#64748b", bgClass: "bg-slate-500" },
  { id: "qualificacao", label: "Qualificação",  emoji: "📋", color: "#3b82f6", bgClass: "bg-blue-500" },
  { id: "agendamento",  label: "Agendamento",   emoji: "📅", color: "#f59e0b", bgClass: "bg-amber-500" },
  { id: "confirmada",   label: "Confirmada",    emoji: "✅", color: "#6366f1", bgClass: "bg-indigo-500" },
  { id: "em_execucao",  label: "Em Execução",   emoji: "⚙️", color: "#8b5cf6", bgClass: "bg-purple-500" },
  { id: "pos_servico",  label: "Pós-Serviço",   emoji: "📝", color: "#f97316", bgClass: "bg-orange-500" },
  { id: "concluida",    label: "Concluída",     emoji: "✔️", color: "#22c55e", bgClass: "bg-green-500" },
  { id: "cancelada",    label: "Cancelada",     emoji: "🔄", color: "#ef4444", bgClass: "bg-red-500" },
];

// Stages shown in the Kanban board (excludes cancelada — shown separately)
export const OS_KANBAN_STAGES: OsStageConfig[] = OS_STAGES.filter(
  (s) => s.id !== "cancelada"
);

// Stage progression order (without cancelada)
const OS_STAGE_ORDER: OsStage[] = [
  "nova", "qualificacao", "agendamento", "confirmada",
  "em_execucao", "pos_servico", "concluida",
];

export function getNextOsStage(current: OsStage): OsStage | null {
  const i = OS_STAGE_ORDER.indexOf(current);
  if (i >= 0 && i < OS_STAGE_ORDER.length - 1) return OS_STAGE_ORDER[i + 1];
  return null;
}

export function getOsStageConfig(id: OsStage): OsStageConfig {
  return OS_STAGES.find((s) => s.id === id) ?? OS_STAGES[0];
}

// Extended ServiceOrder type with CarboVAPT fields
export interface ServiceOrderCarboVAPT extends ServiceOrder {
  os_stage: OsStage;
  service_type: OsServiceType | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  scheduled_at: string | null;
  executed_at: string | null;
  cancelled_reason: string | null;
  customer_name: string | null;
  technician_id: string | null;
}
