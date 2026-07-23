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

// Valores de campos de TODOS os cartões do quadro → Map<cardId, {fieldId: value}>.
// Usado na view de Tabela (D3). Busca os cartões do quadro e depois os valores.
export function useBoardFieldValues(boardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "field-values", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<Map<string, Record<string, unknown>>> => {
      const cardsRes = await db.from("mkt_cards").select("id").eq("board_id", boardId).eq("is_archived", false);
      if (cardsRes.error) throw cardsRes.error;
      const ids: string[] = (cardsRes.data ?? []).map((c: { id: string }) => c.id);
      const map = new Map<string, Record<string, unknown>>();
      if (ids.length === 0) return map;
      const fvRes = await db.from("mkt_card_field_values").select("card_id, field_id, value").in("card_id", ids);
      if (fvRes.error) throw fvRes.error;
      for (const r of (fvRes.data ?? []) as { card_id: string; field_id: string; value: unknown }[]) {
        const rec = map.get(r.card_id) ?? {};
        rec[r.field_id] = r.value;
        map.set(r.card_id, rec);
      }
      return map;
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

  // Define o valor de um campo para um cartão QUALQUER (edição inline na Tabela).
  const setFieldValueFor = useMutation({
    mutationFn: async ({ cardId, fieldId, value }: { cardId: string; fieldId: string; value: unknown }) => {
      const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
      if (empty) {
        const res = await db.from("mkt_card_field_values").delete().eq("card_id", cardId).eq("field_id", fieldId);
        if (res.error) throw res.error;
      } else {
        const res = await db.from("mkt_card_field_values").upsert({ card_id: cardId, field_id: fieldId, value, updated_at: new Date().toISOString() }, { onConflict: "card_id,field_id" });
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt", "field-values", boardId] }),
  });

  return { createField, updateField, deleteField, setFieldValueFor };
}
