import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Campos Personalizados por quadro — definições + mutações. O valor por cartão
// fica em useCardDetail (fieldValues / setFieldValue).

const db = supabase as unknown as { from: (t: string) => any };

export type FieldType = "text" | "number" | "date" | "select" | "multiselect" | "checkbox" | "url";
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto", number: "Número", date: "Data",
  select: "Seleção única", multiselect: "Seleção múltipla", checkbox: "Caixa de seleção", url: "URL",
};
export interface FieldOption { id: string; label: string; color?: string; }
export interface CustomField {
  id: string; board_id: string; name: string; type: FieldType;
  options: FieldOption[]; position: number;
}

export function useCustomFields(boardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "custom-fields", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<CustomField[]> => {
      const res = await db.from("mkt_custom_fields").select("*").eq("board_id", boardId).order("position");
      if (res.error) throw res.error;
      return (res.data ?? []).map((f: Record<string, unknown>) => ({
        id: f.id as string, board_id: f.board_id as string, name: (f.name as string) ?? "",
        type: f.type as FieldType, options: (f.options as FieldOption[]) ?? [], position: Number(f.position) || 0,
      }));
    },
  });
}

export function useCustomFieldMutations(boardId: string | null) {
  const qc = useQueryClient();
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["mkt", "custom-fields", boardId] });
    qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
  };

  const createField = useMutation({
    mutationFn: async ({ name, type, position }: { name: string; type: FieldType; position: number }) => {
      const res = await db.from("mkt_custom_fields").insert({ board_id: boardId, name, type, position, options: [] });
      if (res.error) throw res.error;
    },
    onSuccess: inval,
  });

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<CustomField, "name" | "type" | "options" | "position">> }) => {
      const res = await db.from("mkt_custom_fields").update(patch).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: inval,
  });

  const deleteField = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await db.from("mkt_custom_fields").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: inval,
  });

  return { createField, updateField, deleteField };
}
