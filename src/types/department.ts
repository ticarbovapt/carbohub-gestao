export type DepartmentId = "logistica" | "manutencao" | "qualidade" | "seguranca";

export interface Department {
  id: DepartmentId;
  name: string;
  icon: string;
  description: string;
  color: string; // CSS variable name
}

export const departments: Department[] = [
  {
    id: "logistica",
    name: "Logística",
    icon: "🚚",
    description: "Gestão de entregas e armazenagem",
    color: "dept-logistica",
  },
  {
    id: "manutencao",
    name: "Manutenção",
    icon: "🔧",
    description: "Manutenção preventiva e corretiva",
    color: "dept-manutencao",
  },
  {
    id: "qualidade",
    name: "Qualidade",
    icon: "✅",
    description: "Controle e garantia de qualidade",
    color: "dept-qualidade",
  },
  {
    id: "seguranca",
    name: "Segurança",
    icon: "🛡️",
    description: "Segurança do trabalho e conformidade",
    color: "dept-seguranca",
  },
];

export const getDepartmentById = (id: DepartmentId): Department | undefined => {
  return departments.find((d) => d.id === id);
};
