/**
 * OS (Ordem de Serviço) Fixtures - Fixtures para testes de fluxo operacional
 * 
 * Baseado nos princípios do pytest:
 * - Dados de teste isolados
 * - Cenários parametrizáveis
 * - Cobertura de variações reais de uso
 */

import type { DepartmentType } from "@/types/os";

// ============ TIPOS ============

export interface MockServiceOrder {
  id: string;
  os_number: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  current_department: DepartmentType;
  licensee_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  sla_deadline: string | null;
  sla_breached: boolean;
  stage_validated_at: string | null;
  stage_validated_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface MockOsStageHistory {
  id: string;
  service_order_id: string;
  department: DepartmentType;
  status: "pending" | "in_progress" | "completed" | "skipped";
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sla_deadline: string | null;
  sla_breached: boolean;
  checklist_completed: boolean;
  notes: string | null;
  validation_notes: string | null;
}

export interface MockOsChecklist {
  id: string;
  service_order_id: string;
  department: DepartmentType;
  template_id: string | null;
  items: MockChecklistItem[];
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  signature_data: string | null;
}

export interface MockChecklistItem {
  id: string;
  label: string;
  type: "checkbox" | "text" | "textarea" | "select" | "date" | "file" | "number";
  required: boolean;
  options?: string[];
  value?: string | boolean | number;
}

// ============ FIXTURES DE OS ============

// Counter para garantir unicidade
let osCounter = 0;

export function createMockServiceOrder(
  overrides: Partial<MockServiceOrder> = {}
): MockServiceOrder {
  const id = overrides.id || `os-${Math.random().toString(36).substr(2, 9)}`;
  osCounter += 1;
  
  return {
    id,
    os_number: `OS-${Date.now()}-${osCounter}`,
    status: "pending",
    current_department: "venda",
    licensee_id: null,
    customer_name: "Cliente Teste",
    customer_email: "cliente@teste.com",
    customer_phone: "(11) 99999-9999",
    priority: "medium",
    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    sla_breached: false,
    stage_validated_at: null,
    stage_validated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    notes: null,
    ...overrides,
  };
}

// ============ FIXTURES PARAMETRIZADAS PARA CENÁRIOS ============

export const OS_SCENARIOS = {
  /** OS nova, ainda não iniciada */
  new: () => createMockServiceOrder({
    status: "pending",
    current_department: "venda",
  }),

  /** OS em andamento no setor de preparação */
  inPreparation: () => createMockServiceOrder({
    status: "in_progress",
    current_department: "preparacao",
  }),

  /** OS com SLA próximo do vencimento (warning) */
  slaWarning: () => createMockServiceOrder({
    status: "in_progress",
    current_department: "preparacao",
    sla_deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 horas
  }),

  /** OS com SLA estourado */
  slaBreached: () => createMockServiceOrder({
    status: "in_progress",
    current_department: "expedicao",
    sla_deadline: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hora atrás
    sla_breached: true,
  }),

  /** OS com prioridade urgente */
  urgent: () => createMockServiceOrder({
    status: "in_progress",
    current_department: "operacao",
    priority: "urgent",
    sla_deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  }),

  /** OS concluída */
  completed: () => createMockServiceOrder({
    status: "completed",
    current_department: "pos_venda",
    sla_breached: false,
  }),

  /** OS cancelada */
  cancelled: () => createMockServiceOrder({
    status: "cancelled",
    notes: "Cancelada a pedido do cliente",
  }),
} as const;

// ============ FIXTURES DE HISTÓRICO DE ETAPAS ============

export function createMockStageHistory(
  overrides: Partial<MockOsStageHistory> = {}
): MockOsStageHistory {
  return {
    id: `stage-${Math.random().toString(36).substr(2, 9)}`,
    service_order_id: "test-os-id",
    department: "venda",
    status: "pending",
    started_at: null,
    completed_at: null,
    completed_by: null,
    sla_deadline: null,
    sla_breached: false,
    checklist_completed: false,
    notes: null,
    validation_notes: null,
    ...overrides,
  };
}

// ============ FIXTURES DE CHECKLIST ============

export function createMockChecklist(
  overrides: Partial<MockOsChecklist> = {}
): MockOsChecklist {
  return {
    id: `checklist-${Math.random().toString(36).substr(2, 9)}`,
    service_order_id: "test-os-id",
    department: "venda",
    template_id: null,
    items: createDefaultChecklistItems(),
    is_completed: false,
    completed_at: null,
    completed_by: null,
    notes: null,
    signature_data: null,
    ...overrides,
  };
}

export function createDefaultChecklistItems(): MockChecklistItem[] {
  return [
    {
      id: "item-1",
      label: "Dados do cliente verificados",
      type: "checkbox",
      required: true,
      value: false,
    },
    {
      id: "item-2",
      label: "Documentação anexada",
      type: "checkbox",
      required: true,
      value: false,
    },
    {
      id: "item-3",
      label: "Observações",
      type: "textarea",
      required: false,
    },
  ];
}

// ============ FLUXO COMPLETO PARA TESTES DE INTEGRAÇÃO ============

export interface MockOsFlow {
  serviceOrder: MockServiceOrder;
  stageHistories: MockOsStageHistory[];
  checklists: MockOsChecklist[];
}

export function createMockOsFlow(scenario: keyof typeof OS_SCENARIOS = "new"): MockOsFlow {
  const serviceOrder = OS_SCENARIOS[scenario]();
  
  const departments: DepartmentType[] = ["venda", "preparacao", "expedicao", "operacao", "pos_venda"];
  
  const stageHistories: MockOsStageHistory[] = departments.map((dept, index) => {
    const isCompleted = departments.indexOf(serviceOrder.current_department) > index;
    const isCurrent = serviceOrder.current_department === dept;
    
    return createMockStageHistory({
      service_order_id: serviceOrder.id,
      department: dept,
      status: isCompleted ? "completed" : isCurrent ? "in_progress" : "pending",
      started_at: isCompleted || isCurrent ? new Date().toISOString() : null,
      completed_at: isCompleted ? new Date().toISOString() : null,
      checklist_completed: isCompleted,
    });
  });

  const checklists: MockOsChecklist[] = departments.map(dept => 
    createMockChecklist({
      service_order_id: serviceOrder.id,
      department: dept,
      is_completed: departments.indexOf(serviceOrder.current_department) > departments.indexOf(dept),
    })
  );

  return { serviceOrder, stageHistories, checklists };
}

// ============ DADOS PARA TESTES PARAMETRIZADOS ============

export const DEPARTMENT_FLOW_ORDER: DepartmentType[] = [
  "venda",
  "preparacao", 
  "expedicao",
  "operacao",
  "pos_venda",
];

export const SLA_TEST_CASES = [
  { hoursRemaining: 24, expectedStatus: "ok" as const },
  { hoursRemaining: 6, expectedStatus: "warning" as const },
  { hoursRemaining: 2, expectedStatus: "critical" as const },
  { hoursRemaining: -1, expectedStatus: "breached" as const },
] as const;

export const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"] as const;
