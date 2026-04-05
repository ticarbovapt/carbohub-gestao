import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrgNode {
  id: string;
  full_name: string;
  avatar_url: string | null;
  hierarchy_level: number;
  reports_to: string | null;
  department: string | null;
  job_title: string | null;
  job_category: string | null;
  carbo_role: string | null;
  children: OrgNode[];
}

// ── Static fallback tree (from Mapa_Responsabilidades_CarboVapt — aba Resumo) ─
function makeNode(
  id: string, full_name: string, job_title: string,
  department: string, hierarchy_level: number,
  children: OrgNode[] = []
): OrgNode {
  return { id, full_name, avatar_url: null, hierarchy_level, reports_to: null,
    department, job_title, job_category: null, carbo_role: null, children };
}

export const STATIC_ORG_TREE: OrgNode[] = [
  makeNode("thelis", "Thelis Botelho", "CEO / Liderança Comercial", "Command", 1, [
    makeNode("emmily", "Emmily Moreira", "Assistente Executiva", "Command", 4),
    makeNode("priscilla", "Priscilla", "Sócia-Adm / Financeiro", "Finance", 2, [
      makeNode("sueilha", "Sueilha", "Financeiro", "Finance", 6),
    ]),
    makeNode("jayane", "Jayane", "Coordenadora Administrativo", "Finance", 4, [
      makeNode("ana", "Ana", "Fiscal", "Finance", 6),
      makeNode("ligia", "Lígia", "Marketing / Kits", "Finance", 6),
    ]),
    makeNode("marina", "Marina O. Rodrigues", "Diretora de Estratégia, Marca e Crescimento", "Growth", 2, [
      makeNode("dyanne", "Dyanne", "Marketing / Operacional", "Growth", 6),
      makeNode("mirian", "Mirian", "Social Media / Analista Mkt", "Growth", 6),
      makeNode("dyane", "Dyane", "Assistente de Marketing", "Growth", 6),
      makeNode("remo", "Remo", "Editor de Vídeos", "Growth", 6),
      makeNode("arthur", "Arthur", "Designer e Editor de Vídeos", "Growth", 6),
    ]),
    makeNode("vinicius", "Vinicius Constantino", "Diretor de Desenvolvimento de Negócios (B2B)", "B2B", 2, [
      makeNode("rodrigo", "Rodrigo Torquato", "Consultor de Vendas Corporativas – Nordeste", "B2B", 4),
      makeNode("marcius", "Marcius D'Ávilla", "PRV e Consultor B2B – Sudeste", "B2B", 6),
    ]),
    makeNode("peterson", "Peterson Oliveira", "Gerente de Operações e Logística", "OPS", 3, [
      makeNode("jeane", "Jeane", "Compras / Envios", "OPS", 6),
      makeNode("david", "David", "Operacional", "OPS", 6),
      makeNode("reinaldo", "Reinaldo", "Operacional / Suporte Técnico", "OPS", 6),
      makeNode("luis_carlos", "Luis Carlos", "Operacional / Envase", "OPS", 6),
      makeNode("ronaldo", "Ronaldo", "Operacional", "OPS", 6),
      makeNode("iury", "Iury", "Desenvolvedor Back-end", "OPS", 6),
    ]),
    makeNode("erick", "Erick Almeida", "Diretor de Expansão Nacional do Varejo", "Expansão", 2, [
      makeNode("lorran", "Lorran Barba", "Sucesso do Licenciado (Base)", "Expansão", 6),
      makeNode("thiago", "Thiago Damasceno", "Ativador de Licenciados – BA", "Expansão", 6),
      makeNode("edson", "Edson França", "Ativador e Técnico – Sul", "Expansão", 6),
      makeNode("ricardo", "Ricardo", "Técnico Operacional – Baixada Santista", "Expansão", 6),
      makeNode("jonathas", "Jonathas", "Técnico Operacional – Sudeste", "Expansão", 6),
      makeNode("ivo", "Ivo Scarpin", "PAP e Técnico – Sul", "Expansão", 6),
    ]),
  ]),
];

const LEVEL_LABELS: Record<number, string> = {
  1: "CEO",
  2: "Diretor(a)",
  3: "Gerente",
  4: "Coordenador(a)",
  5: "Supervisor(a)",
  6: "Staff",
};

const DEPT_COLORS: Record<string, string> = {
  Command: "#6366f1",   // indigo
  OPS: "#3b82f6",       // blue
  Growth: "#22c55e",    // green
  Finance: "#f59e0b",   // amber
  Expansão: "#8b5cf6",  // violet
  B2B: "#ec4899",       // pink
};

export function getLevelLabel(level: number): string {
  return LEVEL_LABELS[level] || "Staff";
}

export function getDeptColor(dept: string | null): string {
  return DEPT_COLORS[dept || ""] || "#64748b";
}

function buildTree(nodes: Omit<OrgNode, "children">[]): OrgNode[] {
  const map = new Map<string, OrgNode>();
  const roots: OrgNode[] = [];

  // Create nodes with empty children
  for (const n of nodes) {
    map.set(n.id, { ...n, children: [] });
  }

  // Link children to parents
  for (const n of nodes) {
    const node = map.get(n.id)!;
    if (n.reports_to && map.has(n.reports_to)) {
      map.get(n.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by hierarchy_level then name
  const sortChildren = (node: OrgNode) => {
    node.children.sort((a, b) => a.hierarchy_level - b.hierarchy_level || a.full_name.localeCompare(b.full_name));
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

export function useOrgChart() {
  return useQuery({
    queryKey: ["org-chart"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, hierarchy_level, reports_to, department, job_title, job_category, carbo_role")
        .not("hierarchy_level", "is", null)
        .order("hierarchy_level", { ascending: true });

      if (error) throw error;

      // When DB has no hierarchy data yet, fall back to the static org structure
      if (!data || data.length === 0) return STATIC_ORG_TREE;

      return buildTree(data as Omit<OrgNode, "children">[]);
    },
  });
}

export function useOrgChartFlat() {
  return useQuery({
    queryKey: ["org-chart-flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, hierarchy_level, reports_to, department, job_title, job_category, carbo_role")
        .not("hierarchy_level", "is", null)
        .order("hierarchy_level", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
