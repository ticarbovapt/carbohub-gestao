import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Funcionários (dados financeiros pra pagamento) — cadastro próprio em
// employee_finance, com vínculo OPCIONAL a um usuário do sistema (user_id).
// A tela mostra: TODOS os perfis do sistema (RPC carbo_all_profiles) + os
// funcionários avulsos criados aqui (sem usuário). Dá pra criar um funcionário
// sem usuário e, depois, vincular a um usuário quando ele existir no sistema.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: unknown) => Promise<{ data: any; error: any }>;
};

export interface EmployeeFinance {
  id: string | null;             // employee_finance.id (null = ainda não cadastrado)
  user_id: string | null;        // usuário do sistema vinculado (opcional)
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

export interface SystemProfile {
  id: string; full_name: string | null; username: string | null; email: string | null;
  avatar_url: string | null; department: string | null; secondary_department: string | null;
}

export interface EmployeeRow extends EmployeeFinance {
  key: string;
  displayName: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  department: string | null;           // setor (chave); null p/ avulso
  secondaryDepartment: string | null;
  linkedUserName: string | null; // nome do usuário do sistema vinculado
  origin: "sistema" | "avulso";  // veio de um perfil do sistema ou cadastrado à mão
  hasData: boolean;
}

const emptyFinance = (): EmployeeFinance => ({
  id: null, user_id: null, full_name: null, cpf: null, pix_key: null, pix_type: null,
  bank_name: null, bank_code: null, bank_agency: null, bank_account: null,
  account_type: null, phone: null, emergency_name: null, emergency_phone: null, notes: null,
});

// Cadastro deixa de ser "Pendente" quando tem o MÍNIMO pra pagar: uma chave PIX,
// OU os dados bancários completos (banco + agência + conta).
const filled = (f: EmployeeFinance) =>
  !!(f.pix_key?.trim() || (f.bank_name?.trim() && f.bank_agency?.trim() && f.bank_account?.trim()));

/** Perfis do sistema (todos) + funcionários avulsos + dados financeiros. */
export function useEmployeesFinance() {
  const profilesQ = useQuery({
    queryKey: ["all_profiles"],
    queryFn: async (): Promise<SystemProfile[]> => {
      const { data, error } = await db.rpc("carbo_all_profiles");
      if (error) throw error as Error;
      return (data ?? []) as SystemProfile[];
    },
  });
  const financeQ = useQuery({
    queryKey: ["employee_finance"],
    queryFn: async (): Promise<EmployeeFinance[]> => {
      const { data, error } = await db.from("employee_finance").select("*").eq("active", true);
      if (error) throw error;
      return (data ?? []) as EmployeeFinance[];
    },
  });

  const profiles = profilesQ.data ?? [];
  const finance = financeQ.data ?? [];
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const finByUser = new Map(finance.filter((f) => f.user_id).map((f) => [f.user_id as string, f]));

  const rows: EmployeeRow[] = [];

  // 1) Um item por perfil do sistema (com dados financeiros, se já vinculados).
  for (const p of profiles) {
    const f = finByUser.get(p.id);
    rows.push({
      ...(f ?? emptyFinance()),
      full_name: f?.full_name ?? p.full_name,
      key: f?.id ?? `profile:${p.id}`,
      user_id: p.id,
      displayName: p.full_name || p.username || "—",
      username: p.username,
      email: p.email,
      avatarUrl: p.avatar_url,
      department: p.department,
      secondaryDepartment: p.secondary_department,
      linkedUserName: p.full_name || p.username,
      origin: "sistema",
      hasData: !!f && filled(f),
    });
  }

  // 2) Funcionários avulsos (sem usuário do sistema vinculado).
  for (const f of finance) {
    if (f.user_id && profById.has(f.user_id)) continue; // já listado acima
    rows.push({
      ...f,
      key: f.id ?? `fin:${f.full_name}`,
      displayName: f.full_name || "—",
      username: null,
      email: null,
      avatarUrl: null,
      department: null,
      secondaryDepartment: null,
      linkedUserName: f.user_id ? "(usuário removido)" : null,
      origin: "avulso",
      hasData: filled(f),
    });
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));

  return {
    rows,
    profiles,
    // perfis do sistema ainda NÃO vinculados a nenhum funcionário (pra "vincular usuário")
    unlinkedProfiles: profiles.filter((p) => !finByUser.has(p.id)),
    isLoading: profilesQ.isLoading || financeQ.isLoading,
  };
}

/** Cria/atualiza um funcionário. Sem id → insere; com id → atualiza. */
export function useUpsertEmployeeFinance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: EmployeeFinance) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        user_id: e.user_id, full_name: e.full_name, cpf: e.cpf,
        pix_key: e.pix_key, pix_type: e.pix_type,
        bank_name: e.bank_name, bank_code: e.bank_code, bank_agency: e.bank_agency,
        bank_account: e.bank_account, account_type: e.account_type,
        phone: e.phone, emergency_name: e.emergency_name, emergency_phone: e.emergency_phone,
        notes: e.notes, updated_by: u?.user?.id ?? null, updated_at: new Date().toISOString(),
      };
      if (e.id) {
        const { error } = await db.from("employee_finance").update(payload).eq("id", e.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("employee_finance").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_finance"] });
      toast.success("Dados do funcionário salvos!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });
}
