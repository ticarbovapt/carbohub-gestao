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
