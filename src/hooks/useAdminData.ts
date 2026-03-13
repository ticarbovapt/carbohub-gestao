import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

export interface DbDepartment {
  id: string;
  type: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DbStation {
  id: string;
  name: string;
  location: string | null;
  department_type: string;
  qr_code: string;
  checklist_template_id: string | null;
  sensor_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbChecklistTemplate {
  id: string;
  department: string;
  name: string;
  description: string | null;
  items: any;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Departments
// ============================================================

export function useDepartments() {
  return useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as DbDepartment[];
    },
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dept: Partial<DbDepartment>) => {
      const { data, error } = await supabase
        .from("departments")
        .insert(dept as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-departments"] });
      toast.success("Departamento criado com sucesso");
    },
    onError: (e: any) => toast.error(`Erro ao criar: ${e.message}`),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DbDepartment> & { id: string }) => {
      const { data, error } = await supabase
        .from("departments")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-departments"] });
      toast.success("Departamento atualizado");
    },
    onError: (e: any) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-departments"] });
      toast.success("Departamento removido");
    },
    onError: (e: any) => toast.error(`Erro ao remover: ${e.message}`),
  });
}

// ============================================================
// Stations
// ============================================================

export function useStations() {
  return useQuery({
    queryKey: ["admin-stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DbStation[];
    },
  });
}

export function useCreateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (station: Partial<DbStation>) => {
      const { data, error } = await supabase
        .from("stations")
        .insert(station as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stations"] });
      toast.success("Estação criada com sucesso");
    },
    onError: (e: any) => toast.error(`Erro ao criar: ${e.message}`),
  });
}

export function useUpdateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DbStation> & { id: string }) => {
      const { data, error } = await supabase
        .from("stations")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stations"] });
      toast.success("Estação atualizada");
    },
    onError: (e: any) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
}

export function useDeleteStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stations"] });
      toast.success("Estação removida");
    },
    onError: (e: any) => toast.error(`Erro ao remover: ${e.message}`),
  });
}

// ============================================================
// Checklist Templates
// ============================================================

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["admin-checklist-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as DbChecklistTemplate[];
    },
  });
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<DbChecklistTemplate>) => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .insert(template as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-checklist-templates"] });
      toast.success("Template criado com sucesso");
    },
    onError: (e: any) => toast.error(`Erro ao criar: ${e.message}`),
  });
}

export function useUpdateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DbChecklistTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-checklist-templates"] });
      toast.success("Template atualizado");
    },
    onError: (e: any) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-checklist-templates"] });
      toast.success("Template removido");
    },
    onError: (e: any) => toast.error(`Erro ao remover: ${e.message}`),
  });
}
