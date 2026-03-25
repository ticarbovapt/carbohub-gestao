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
