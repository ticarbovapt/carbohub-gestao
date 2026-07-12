import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTeamMembers } from "./useTeamMembers";

// ─────────────────────────────────────────────────────────────────────────────
// Dados financeiros dos funcionários (PIX / banco / contato de emergência) —
// o que o financeiro precisa pra pagar. Vem em employee_finance (1 linha por
// funcionário, ligada ao profiles.id). A lista de pessoas vem do RPC de equipe;
// aqui casamos com os dados financeiros já cadastrados.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as { from: (t: string) => any };

export interface EmployeeFinance {
  user_id: string;
  full_name: string | null;
  cpf: string | null;
  pix_key: string | null;
  pix_type: string | null;
  bank_name: string | null;
  bank_code: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  account_type: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  notes: string | null;
}

export interface EmployeeRow extends EmployeeFinance {
  team_name: string | null;      // nome vindo do cadastro (profiles)
  username: string | null;
  email: string | null;
  hasData: boolean;              // já tem dados financeiros preenchidos?
}

const EMPTY = (userId: string): EmployeeFinance => ({
  user_id: userId, full_name: null, cpf: null, pix_key: null, pix_type: null,
  bank_name: null, bank_code: null, bank_agency: null, bank_account: null,
  account_type: null, phone: null, emergency_name: null, emergency_phone: null, notes: null,
});

/** Lista de funcionários (equipe) + dados financeiros cadastrados. */
export function useEmployeesFinance() {
  const team = useTeamMembers();
  const finance = useQuery({
    queryKey: ["employee_finance"],
    queryFn: async (): Promise<EmployeeFinance[]> => {
      const { data, error } = await db.from("employee_finance").select("*");
      if (error) throw error;
      return (data ?? []) as EmployeeFinance[];
    },
  });

  const byId = new Map((finance.data ?? []).map((f) => [f.user_id, f]));
  const rows: EmployeeRow[] = (team.data ?? []).map((m) => {
    const f = byId.get(m.id);
    return {
      ...(f ?? EMPTY(m.id)),
      full_name: f?.full_name ?? m.full_name,
      team_name: m.full_name,
      username: m.username,
      email: m.email,
      hasData: !!f,
    };
  });

  return { rows, isLoading: team.isLoading || finance.isLoading };
}

/** Cria/atualiza os dados financeiros de um funcionário (upsert por user_id). */
export function useUpsertEmployeeFinance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: EmployeeFinance) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("employee_finance").upsert(
        { ...e, updated_by: u?.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_finance"] });
      toast.success("Dados do funcionário salvos!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });
}
