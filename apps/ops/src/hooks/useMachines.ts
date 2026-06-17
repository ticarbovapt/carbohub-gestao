import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Máquinas (machines) — leitura + criar/editar. Licenciado via licensees.
//  RLS: machines CRUD aberto a autenticado; licensees SELECT aberto (migration Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type MachineStatus = "operational" | "maintenance" | "offline" | "retired";

export interface Machine {
  id: string;
  codigo: string;
  modelo: string;
  serie: string;
  licenciado: string;
  licenseeId: string | null;
  status: MachineStatus;
  ultimaManut: string | null;
  proximaManut: string | null;
  instalacao: string | null;
  creditos: number;
}

export function useLicensees() {
  return useQuery({
    queryKey: ["ops", "licensees"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const res = await db.from("licensees").select("id, name").order("name");
      if (res.error) throw res.error;
      return (res.data ?? []).map((l: Record<string, unknown>) => ({ id: l.id as string, name: (l.name as string) ?? "—" }));
    },
  });
}

export function useMachines() {
  return useQuery({
    queryKey: ["ops", "machines"],
    queryFn: async (): Promise<Machine[]> => {
      const [machines, licensees] = await Promise.all([
        db.from("machines").select("id, machine_id, model, serial_number, licensee_id, status, last_maintenance_date, next_maintenance_date, installation_date, total_credits_generated").order("machine_id"),
        db.from("licensees").select("id, name"),
      ]);
      if (machines.error) throw machines.error;
      if (licensees.error) throw licensees.error;
      const nameById = new Map<string, string>();
      for (const l of licensees.data ?? []) nameById.set(l.id, l.name ?? "");
      return (machines.data ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        codigo: (m.machine_id as string) ?? "",
        modelo: (m.model as string) ?? "",
        serie: (m.serial_number as string) ?? "",
        licenciado: m.licensee_id ? nameById.get(m.licensee_id as string) ?? "—" : "—",
        licenseeId: (m.licensee_id as string) ?? null,
        status: (m.status as MachineStatus) ?? "operational",
        ultimaManut: (m.last_maintenance_date as string) ?? null,
        proximaManut: (m.next_maintenance_date as string) ?? null,
        instalacao: (m.installation_date as string) ?? null,
        creditos: Number(m.total_credits_generated) || 0,
      }));
    },
  });
}

export interface MachineInput {
  machine_id: string;
  model: string;
  serial_number?: string;
  licensee_id?: string | null;
  installation_date?: string | null;
  status: MachineStatus;
}

export function useMachineMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "machines"] });

  const payload = (p: MachineInput) => ({
    machine_id: p.machine_id.trim(),
    model: p.model.trim(),
    serial_number: p.serial_number?.trim() || null,
    licensee_id: p.licensee_id || null,
    installation_date: p.installation_date || null,
    status: p.status,
  });

  const validate = (p: MachineInput) => {
    if (!p.machine_id.trim()) throw new Error("Código é obrigatório.");
    if (!p.model.trim()) throw new Error("Modelo é obrigatório.");
  };

  const create = useMutation({
    mutationFn: async (p: MachineInput) => {
      validate(p);
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("machines").insert({ ...payload(p), created_by: auth?.user?.id ?? null });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...p }: MachineInput & { id: string }) => {
      validate(p);
      const res = await db.from("machines").update(payload(p)).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update };
}
