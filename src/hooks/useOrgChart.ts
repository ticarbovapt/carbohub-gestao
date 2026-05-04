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
  email?: string | null;
  phone?: string | null;
  dual_role?: string;
  assistant?: boolean;
  children: OrgNode[];
}

function makeNode(
  id: string,
  full_name: string,
  job_title: string,
  department: string,
  hierarchy_level: number,
  children: OrgNode[] = [],
  dual_role?: string,
  assistant?: boolean
): OrgNode {
  return {
    id, full_name, avatar_url: null, hierarchy_level, reports_to: null,
    department, job_title, job_category: null, carbo_role: null,
    dual_role, assistant, children,
  };
}

// ── Fallback estático (usado apenas se DB vazio / inacessível) ──────────────
export const STATIC_ORG_TREE: OrgNode[] = [
  makeNode("thelis", "Thelis Botelho", "CEO / Liderança Comercial", "Command", 1, [
    makeNode("emmily", "Emmily Moreira", "Assistente Executiva", "Command", 4, [], undefined, true),
    makeNode("priscilla", "Priscilla", "Sócia-Adm / Financeiro", "Finance", 2, [
      makeNode("sueilha", "Sueilha", "Financeiro", "Finance", 6),
    ]),
    makeNode("jayane", "Jayane", "Coordenadora Administrativa", "Finance", 4, [
      makeNode("ana", "Ana", "Fiscal", "Finance", 6),
      makeNode("ligia", "Légia", "Marketing / Kits", "Finance", 6),
    ]),
    makeNode("marina_or", "Marina O. Rodrigues", "Head — Estratégia, Marca e Crescimento", "Growth & B2B", 2, [
      makeNode("dyanne", "Dyanne", "Marketing / Operacional", "Growth", 6),
      makeNode("mirian", "Mirian", "Social Media / Analista Mkt", "Growth", 6),
      makeNode("dyane", "Dyane", "Assistente de Marketing", "Growth", 6),
      makeNode("remo", "Remo", "Editor de Vídeos", "Growth", 6),
      makeNode("arthur", "Arthur", "Designer e Editor de Vídeos", "Growth", 6),
      makeNode("rodrigo", "Rodrigo Torquato", "Consultor de Vendas Corporativas – Nordeste", "B2B", 4),
      makeNode("marcius", "Marcius D'Ávilla", "PRV e Consultor B2B – Sudeste", "B2B", 6),
    ], "Head — Desenvolvimento de Negócios Corporativos"),
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
      makeNode("thiago_d", "Thiago Damasceno", "Ativador de Licenciados – BA", "Expansão", 6),
      makeNode("marcio", "Márcio", "Técnico Operacional – Nordeste", "Expansão", 6),
      makeNode("weider", "Weider Moura", "Consultor Comercial – CarboZé e Pro", "Expansão", 6),
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

export const DEPT_COLORS: Record<string, string> = {
  Command:        "#6366f1",
  OPS:            "#3b82f6",
  Growth:         "#22c55e",
  "Growth & B2B": "#10b981",
  Finance:        "#f59e0b",
  Expansão:       "#8b5cf6",
  B2B:            "#ec4899",
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

  for (const n of nodes) map.set(n.id, { ...n, children: [] });

  for (const n of nodes) {
    const node = map.get(n.id)!;
    if (n.reports_to && map.has(n.reports_to)) {
      map.get(n.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (node: OrgNode) => {
    node.children.sort((a, b) => a.hierarchy_level - b.hierarchy_level || a.full_name.localeCompare(b.full_name));
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

// ── Hook principal — lê de org_chart_nodes (dinâmico) ─────────────────────
export function useOrgChart() {
  return useQuery({
    queryKey: ["org-chart"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_chart_nodes" as any)
        .select("id, full_name, avatar_url, hierarchy_level, reports_to, department, job_title, dual_role, assistant")
        .order("hierarchy_level", { ascending: true });

      if (error) {
        console.warn("[useOrgChart] DB error, usando fallback estático:", error.message);
        return STATIC_ORG_TREE;
      }
      if (!data || data.length === 0) return STATIC_ORG_TREE;

      // Normaliza para OrgNode (campos ausentes ficam null)
      const normalized = (data as any[]).map((r) => ({
        id: r.id,
        full_name: r.full_name,
        avatar_url: r.avatar_url ?? null,
        hierarchy_level: r.hierarchy_level ?? 6,
        reports_to: r.reports_to ?? null,
        department: r.department ?? null,
        job_title: r.job_title ?? null,
        job_category: null,
        carbo_role: null,
        dual_role: r.dual_role ?? undefined,
        assistant: r.assistant ?? false,
      }));

      return buildTree(normalized);
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// ── Hook flat (para lista/tabela) — também lê de org_chart_nodes ──────────
export function useOrgChartFlat() {
  return useQuery({
    queryKey: ["org-chart-flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_chart_nodes" as any)
        .select("id, full_name, avatar_url, hierarchy_level, reports_to, department, job_title, dual_role, assistant, email, phone")
        .order("hierarchy_level", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
