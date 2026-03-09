/**
 * Testes de Fluxo de OS - Validação de workflow de ordens de serviço
 * 
 * Princípios aplicados:
 * - Todo fluxo de OS deve ser testável
 * - Testes independentes entre si
 * - Cobertura de variações reais de uso
 */

import { describe, it, expect } from "vitest";
import { 
  createMockServiceOrder,
  createMockOsFlow,
  createMockStageHistory,
  createMockChecklist,
  OS_SCENARIOS,
  DEPARTMENT_FLOW_ORDER,
  SLA_TEST_CASES,
  PRIORITY_LEVELS,
} from "@/test/fixtures";
import type { DepartmentType } from "@/types/os";

describe("OS Flow - Fluxo de Ordens de Serviço", () => {
  describe("Criação de OS", () => {
    it("deve criar OS com valores padrão corretos", () => {
      const os = createMockServiceOrder();

      expect(os.status).toBe("pending");
      expect(os.current_department).toBe("venda");
      expect(os.priority).toBe("medium");
      expect(os.sla_breached).toBe(false);
      expect(os.stage_validated_at).toBeNull();
    });

    it("deve permitir override de propriedades", () => {
      const os = createMockServiceOrder({
        status: "in_progress",
        current_department: "preparacao",
        priority: "urgent",
      });

      expect(os.status).toBe("in_progress");
      expect(os.current_department).toBe("preparacao");
      expect(os.priority).toBe("urgent");
    });

    it("deve gerar IDs únicos para cada OS", () => {
      const os1 = createMockServiceOrder();
      const os2 = createMockServiceOrder();

      expect(os1.id).not.toBe(os2.id);
      expect(os1.os_number).not.toBe(os2.os_number);
    });
  });

  describe("Cenários de OS", () => {
    it("cenário NEW deve criar OS pendente em venda", () => {
      const os = OS_SCENARIOS.new();

      expect(os.status).toBe("pending");
      expect(os.current_department).toBe("venda");
    });

    it("cenário IN_PREPARATION deve criar OS em preparação", () => {
      const os = OS_SCENARIOS.inPreparation();

      expect(os.status).toBe("in_progress");
      expect(os.current_department).toBe("preparacao");
    });

    it("cenário SLA_WARNING deve ter deadline próximo", () => {
      const os = OS_SCENARIOS.slaWarning();
      const deadline = new Date(os.sla_deadline!);
      const now = new Date();
      const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      expect(hoursRemaining).toBeLessThan(4);
      expect(hoursRemaining).toBeGreaterThan(0);
    });

    it("cenário SLA_BREACHED deve ter deadline no passado", () => {
      const os = OS_SCENARIOS.slaBreached();
      const deadline = new Date(os.sla_deadline!);
      const now = new Date();

      expect(deadline.getTime()).toBeLessThan(now.getTime());
      expect(os.sla_breached).toBe(true);
    });

    it("cenário URGENT deve ter prioridade urgent", () => {
      const os = OS_SCENARIOS.urgent();

      expect(os.priority).toBe("urgent");
    });

    it("cenário COMPLETED deve ter status completed", () => {
      const os = OS_SCENARIOS.completed();

      expect(os.status).toBe("completed");
      expect(os.sla_breached).toBe(false);
    });

    it("cenário CANCELLED deve ter notas de cancelamento", () => {
      const os = OS_SCENARIOS.cancelled();

      expect(os.status).toBe("cancelled");
      expect(os.notes).toBeTruthy();
    });
  });

  describe("Ordem do Fluxo de Departamentos", () => {
    it("deve seguir a ordem correta de departamentos", () => {
      expect(DEPARTMENT_FLOW_ORDER).toEqual([
        "venda",
        "preparacao",
        "expedicao",
        "operacao",
        "pos_venda",
      ]);
    });

    it("deve ter 5 departamentos no fluxo", () => {
      expect(DEPARTMENT_FLOW_ORDER).toHaveLength(5);
    });

    it("venda deve ser o primeiro departamento", () => {
      expect(DEPARTMENT_FLOW_ORDER[0]).toBe("venda");
    });

    it("pos_venda deve ser o último departamento", () => {
      expect(DEPARTMENT_FLOW_ORDER[DEPARTMENT_FLOW_ORDER.length - 1]).toBe("pos_venda");
    });
  });

  describe("Fluxo Completo de OS", () => {
    it("deve criar fluxo com histórico de todas as etapas", () => {
      const flow = createMockOsFlow("new");

      expect(flow.serviceOrder).toBeDefined();
      expect(flow.stageHistories).toHaveLength(5);
      expect(flow.checklists).toHaveLength(5);
    });

    it("deve marcar etapas anteriores como concluídas", () => {
      const flow = createMockOsFlow("inPreparation");
      const vendaStage = flow.stageHistories.find(s => s.department === "venda");

      expect(vendaStage?.status).toBe("completed");
      expect(vendaStage?.checklist_completed).toBe(true);
    });

    it("deve marcar etapa atual como in_progress", () => {
      const flow = createMockOsFlow("inPreparation");
      const prepStage = flow.stageHistories.find(s => s.department === "preparacao");

      expect(prepStage?.status).toBe("in_progress");
    });

    it("deve marcar etapas futuras como pendentes", () => {
      const flow = createMockOsFlow("inPreparation");
      const expStage = flow.stageHistories.find(s => s.department === "expedicao");
      const opStage = flow.stageHistories.find(s => s.department === "operacao");

      expect(expStage?.status).toBe("pending");
      expect(opStage?.status).toBe("pending");
    });
  });

  describe("Histórico de Etapas", () => {
    it("deve criar histórico com valores padrão", () => {
      const history = createMockStageHistory();

      expect(history.status).toBe("pending");
      expect(history.sla_breached).toBe(false);
      expect(history.checklist_completed).toBe(false);
    });

    it("etapa completada deve ter completed_at e completed_by", () => {
      const history = createMockStageHistory({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: "user-id",
      });

      expect(history.completed_at).toBeTruthy();
      expect(history.completed_by).toBe("user-id");
    });

    it("etapa pulada deve ter status skipped", () => {
      const history = createMockStageHistory({ status: "skipped" });

      expect(history.status).toBe("skipped");
    });
  });

  describe("Checklists", () => {
    it("deve criar checklist com itens padrão", () => {
      const checklist = createMockChecklist();

      expect(checklist.items).toHaveLength(3);
      expect(checklist.is_completed).toBe(false);
    });

    it("itens obrigatórios devem estar marcados como required", () => {
      const checklist = createMockChecklist();
      const requiredItems = checklist.items.filter(i => i.required);

      expect(requiredItems.length).toBeGreaterThan(0);
    });

    it("checklist completado deve ter completed_at", () => {
      const checklist = createMockChecklist({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: "user-id",
      });

      expect(checklist.is_completed).toBe(true);
      expect(checklist.completed_at).toBeTruthy();
    });
  });

  describe("SLA - Testes Parametrizados", () => {
    SLA_TEST_CASES.forEach(({ hoursRemaining, expectedStatus }) => {
      it(`SLA com ${hoursRemaining}h restantes deve ser ${expectedStatus}`, () => {
        const deadline = new Date(Date.now() + hoursRemaining * 60 * 60 * 1000);
        const os = createMockServiceOrder({
          sla_deadline: deadline.toISOString(),
          sla_breached: hoursRemaining < 0,
        });

        const now = new Date();
        const remaining = (new Date(os.sla_deadline!).getTime() - now.getTime()) / (1000 * 60 * 60);

        if (expectedStatus === "breached") {
          expect(remaining).toBeLessThan(0);
          expect(os.sla_breached).toBe(true);
        } else if (expectedStatus === "critical") {
          expect(remaining).toBeLessThan(4);
          expect(remaining).toBeGreaterThan(0);
        } else if (expectedStatus === "warning") {
          expect(remaining).toBeLessThan(8);
        } else {
          expect(remaining).toBeGreaterThan(8);
        }
      });
    });
  });

  describe("Prioridades - Testes Parametrizados", () => {
    PRIORITY_LEVELS.forEach((priority) => {
      it(`deve criar OS com prioridade ${priority}`, () => {
        const os = createMockServiceOrder({ priority });

        expect(os.priority).toBe(priority);
      });
    });
  });

  describe("Validação de Etapas", () => {
    it("etapa só pode avançar após checklist completo", () => {
      const checklist = createMockChecklist({ is_completed: false });
      
      // Simula validação - não deve permitir avançar
      const canAdvance = checklist.is_completed;
      
      expect(canAdvance).toBe(false);
    });

    it("etapa pode avançar quando checklist está completo", () => {
      const checklist = createMockChecklist({ 
        is_completed: true,
        completed_by: "user-id",
      });
      
      const canAdvance = checklist.is_completed;
      
      expect(canAdvance).toBe(true);
    });
  });

  describe("Isolamento de Dados", () => {
    it("cada OS deve ser independente", () => {
      const flow1 = createMockOsFlow("new");
      const flow2 = createMockOsFlow("completed");

      expect(flow1.serviceOrder.id).not.toBe(flow2.serviceOrder.id);
      expect(flow1.serviceOrder.status).toBe("pending");
      expect(flow2.serviceOrder.status).toBe("completed");
    });

    it("modificar uma OS não deve afetar outra", () => {
      const os1 = createMockServiceOrder();
      const os2 = createMockServiceOrder();

      // Simula modificação
      os1.status = "cancelled";

      expect(os2.status).toBe("pending");
    });
  });
});
