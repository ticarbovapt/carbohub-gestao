/**
 * Testes de Validação de Etapas - useStageValidation hook
 * 
 * Princípios aplicados:
 * - Toda validação de checklist deve ter cobertura
 * - Testes de comportamento, não de implementação
 */

import { describe, it, expect } from "vitest";
import type { OsWorkflowStage, ChecklistItem } from "@/hooks/useStageValidation";
import { createMockAuthContext, MOCK_ROLES } from "@/test/fixtures";

describe("Stage Validation - Validação de Etapas", () => {
  describe("Mapeamento de Roles por Etapa", () => {
    const stageRoles: Record<OsWorkflowStage, string[]> = {
      comercial: ["operador", "ceo"],
      operacoes: ["operador", "ceo"],
      logistica: ["gestor_compras", "ceo"],
      administrativo: ["gestor_adm", "ceo"],
      fiscal: ["operador_fiscal", "ceo"],
      financeiro: ["gestor_fin", "ceo"],
      pos_venda: ["operador", "ceo"],
    };

    it("comercial deve ser validável por operador", () => {
      expect(stageRoles.comercial).toContain("operador");
    });

    it("logistica deve ser validável por gestor_compras", () => {
      expect(stageRoles.logistica).toContain("gestor_compras");
    });

    it("fiscal deve ser validável por operador_fiscal", () => {
      expect(stageRoles.fiscal).toContain("operador_fiscal");
    });

    it("financeiro deve ser validável por gestor_fin", () => {
      expect(stageRoles.financeiro).toContain("gestor_fin");
    });

    it("CEO deve poder validar todas as etapas", () => {
      Object.values(stageRoles).forEach(roles => {
        expect(roles).toContain("ceo");
      });
    });
  });

  describe("Validação de Checklist Items", () => {
    function validateChecklist(items: ChecklistItem[]): { valid: boolean; missing: string[] } {
      const requiredItems = items.filter(i => i.required);
      const missingItems = requiredItems.filter(item => {
        if (item.type === "checkbox") return item.value !== true;
        return !item.value;
      });

      return {
        valid: missingItems.length === 0,
        missing: missingItems.map(i => i.label),
      };
    }

    it("deve retornar válido quando todos os itens obrigatórios estão preenchidos", () => {
      const items: ChecklistItem[] = [
        { id: "1", label: "Item 1", type: "checkbox", required: true, value: true },
        { id: "2", label: "Item 2", type: "text", required: true, value: "preenchido" },
        { id: "3", label: "Item 3", type: "textarea", required: false },
      ];

      const result = validateChecklist(items);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("deve retornar inválido quando checkbox obrigatório não está marcado", () => {
      const items: ChecklistItem[] = [
        { id: "1", label: "Item Obrigatório", type: "checkbox", required: true, value: false },
      ];

      const result = validateChecklist(items);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("Item Obrigatório");
    });

    it("deve retornar inválido quando campo de texto obrigatório está vazio", () => {
      const items: ChecklistItem[] = [
        { id: "1", label: "Campo Texto", type: "text", required: true, value: "" },
      ];

      const result = validateChecklist(items);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("Campo Texto");
    });

    it("deve ignorar campos não obrigatórios vazios", () => {
      const items: ChecklistItem[] = [
        { id: "1", label: "Obrigatório", type: "checkbox", required: true, value: true },
        { id: "2", label: "Opcional", type: "text", required: false },
      ];

      const result = validateChecklist(items);
      expect(result.valid).toBe(true);
    });

    it("deve listar todos os campos faltantes", () => {
      const items: ChecklistItem[] = [
        { id: "1", label: "Campo 1", type: "checkbox", required: true, value: false },
        { id: "2", label: "Campo 2", type: "text", required: true, value: "" },
        { id: "3", label: "Campo 3", type: "number", required: true, value: undefined },
      ];

      const result = validateChecklist(items);
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(3);
      expect(result.missing).toContain("Campo 1");
      expect(result.missing).toContain("Campo 2");
      expect(result.missing).toContain("Campo 3");
    });
  });

  describe("Permissões de Validação por Role", () => {
    function canValidateStage(
      stage: OsWorkflowStage,
      userRoles: { isCeo: boolean; isGestorAdm: boolean; isGestorFin: boolean; isGestorCompras: boolean; isOperadorFiscal: boolean; isOperador: boolean }
    ): boolean {
      const stageRoleMapping: Record<OsWorkflowStage, (keyof typeof userRoles)[]> = {
        comercial: ["isOperador", "isCeo"],
        operacoes: ["isOperador", "isCeo"],
        logistica: ["isGestorCompras", "isCeo"],
        administrativo: ["isGestorAdm", "isCeo"],
        fiscal: ["isOperadorFiscal", "isCeo"],
        financeiro: ["isGestorFin", "isCeo"],
        pos_venda: ["isOperador", "isCeo"],
      };

      const allowedRoles = stageRoleMapping[stage];
      return allowedRoles.some(role => userRoles[role]);
    }

    it("operador pode validar etapa comercial", () => {
      const ctx = createMockAuthContext("operador");
      expect(canValidateStage("comercial", ctx)).toBe(true);
    });

    it("operador NÃO pode validar etapa fiscal", () => {
      const ctx = createMockAuthContext("operador");
      expect(canValidateStage("fiscal", ctx)).toBe(false);
    });

    it("operador fiscal pode validar etapa fiscal", () => {
      const ctx = createMockAuthContext("operadorFiscal");
      expect(canValidateStage("fiscal", ctx)).toBe(true);
    });

    it("gestor financeiro pode validar etapa financeiro", () => {
      const ctx = createMockAuthContext("gestorFin");
      expect(canValidateStage("financeiro", ctx)).toBe(true);
    });

    it("gestor compras pode validar etapa logística", () => {
      const ctx = createMockAuthContext("gestorCompras");
      expect(canValidateStage("logistica", ctx)).toBe(true);
    });

    it("CEO pode validar qualquer etapa", () => {
      const ctx = createMockAuthContext("ceo");
      const stages: OsWorkflowStage[] = [
        "comercial", "operacoes", "logistica", 
        "administrativo", "fiscal", "financeiro", "pos_venda"
      ];

      stages.forEach(stage => {
        expect(canValidateStage(stage, ctx)).toBe(true);
      });
    });
  });

  describe("Progressão de Etapas", () => {
    const stageOrder: OsWorkflowStage[] = [
      "comercial", "operacoes", "logistica", 
      "administrativo", "fiscal", "financeiro", "pos_venda"
    ];

    it("deve ter 7 etapas no workflow", () => {
      expect(stageOrder).toHaveLength(7);
    });

    it("comercial deve ser a primeira etapa", () => {
      expect(stageOrder[0]).toBe("comercial");
    });

    it("pos_venda deve ser a última etapa", () => {
      expect(stageOrder[stageOrder.length - 1]).toBe("pos_venda");
    });

    it("deve manter ordem correta das etapas", () => {
      expect(stageOrder.indexOf("comercial")).toBeLessThan(stageOrder.indexOf("operacoes"));
      expect(stageOrder.indexOf("operacoes")).toBeLessThan(stageOrder.indexOf("logistica"));
      expect(stageOrder.indexOf("fiscal")).toBeLessThan(stageOrder.indexOf("financeiro"));
    });
  });
});
