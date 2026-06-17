import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Minha Equipe" — colegas do mesmo departamento (RPC SECURITY DEFINER).
const db = supabase as unknown as { rpc: (fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }> };

export interface TeamMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  email: string | null;
  department: string | null;
  funcao: string | null;
  secondary_department: string | null;
  secondary_funcao: string | null;
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await db.rpc("carbo_team_members");
      if (error) throw error as Error;
      return (data ?? []) as TeamMember[];
    },
  });
}

// Rótulos de departamento (sigla/label) e função — legíveis por qualquer usuário.
export function useOrgLabels() {
  return useQuery({
    queryKey: ["org_labels"],
    queryFn: async () => {
      const [{ data: deps }, { data: fns }] = await Promise.all([
        supabase.from("carbo_departments").select("key,label,sigla"),
        supabase.from("carbo_functions").select("department,function_key,label"),
      ]);
      const deptLabel: Record<string, string> = {};
      for (const d of (deps ?? []) as { key: string; label: string }[]) deptLabel[d.key] = d.label;
      const fnLabel: Record<string, string> = {};
      for (const f of (fns ?? []) as { department: string; function_key: string; label: string }[]) {
        fnLabel[`${f.department}:${f.function_key}`] = f.label;
      }
      return { deptLabel, fnLabel };
    },
  });
}
