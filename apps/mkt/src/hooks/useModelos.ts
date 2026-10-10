import { anexoDaCapa } from "@/lib/mktTheme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CardDetail } from "@/hooks/useCardDetail";

// ─────────────────────────────────────────────────────────────────────────────
// MODELOS DE CARTÃO — "Reels padrão" já nasce com checklist, etiquetas, campos
// e descrição. O modelo é do QUADRO (etiqueta e campo são do quadro).
//
// ⚠️ O modelo guarda o CONTEÚDO, nunca o estado: checklist volta DESMARCADO, e
// membros, datas e anexos não vão — são de cada peça, não do formato.
// ⚠️ Criar a partir do modelo são várias gravações (cartão, etiquetas,
// checklists, itens, campos). Falhou no meio ⇒ apaga o cartão criado (as FKs
// levam o resto em cascata): cartão pela metade parece pronto e não está.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface Modelo {
  id: string; board_id: string; nome: string; titulo: string; descricao: string | null; cover: string | null;
  label_ids: string[];
  checklists: { title: string; items: string[] }[];
  campos: { field_id: string; value: unknown }[];
  criado_em: string;
}

async function meuId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useModelos(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ["mkt", "modelos", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<Modelo[]> => {
      const r = await db.from("mkt_card_templates").select("*").eq("board_id", boardId).order("nome");
      if (r.error) return []; // antes da migração: só não há modelos
      return r.data as Modelo[];
    },
  });
}

/** O conteúdo de um cartão, no formato de modelo. */
export function modeloDoCartao(d: CardDetail) {
  return {
    titulo: d.card.title,
    descricao: d.card.description,
    // Capa de IMAGEM aponta um anexo DESTE cartão, e modelo não leva anexos:
    // o cartão criado do modelo apontaria para a foto de outro cartão.
    cover: anexoDaCapa(d.card.cover) ? null : d.card.cover,
    label_ids: d.labelIds,
    checklists: d.checklists.map((c) => ({ title: c.title, items: c.items.map((i) => i.text) })),
    campos: Object.entries(d.fieldValues)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([field_id, value]) => ({ field_id, value })),
  };
}

export function useModeloMutations(boardId: string | null | undefined) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["mkt", "modelos", boardId] });

  const salvar = useMutation({
    mutationFn: async ({ nome, detalhe }: { nome: string; detalhe: CardDetail }) => {
      const r = await db.from("mkt_card_templates").insert({
        board_id: boardId, nome, ...modeloDoCartao(detalhe), criado_por: await meuId(),
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: inv,
  });

  const excluir = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const r = await db.from("mkt_card_templates").delete().eq("id", id);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: inv,
  });

  const criarCartao = useMutation({
    mutationFn: async ({ modelo, listId, position, titulo }: { modelo: Modelo; listId: string; position: number; titulo?: string }) => {
      if (!boardId) throw new Error("sem quadro");
      const eu = await meuId();
      // Sem título digitado, nasce com o NOME do modelo ("Reels padrão") — o
      // título do cartão de origem era daquela peça, não do formato.
      const title = (titulo?.trim() || modelo.nome).trim();
      const card = await db.from("mkt_cards").insert({
        list_id: listId, board_id: boardId, title, position, description: modelo.descricao, cover: modelo.cover, created_by: eu,
      }).select("id").single();
      if (card.error) throw new Error(card.error.message);
      const cardId = card.data.id as string;
      try {
        // Etiqueta apagada do quadro depois de salvar o modelo: só fica de fora.
        const lab = await db.from("mkt_labels").select("id").eq("board_id", boardId).in("id", modelo.label_ids.length ? modelo.label_ids : ["00000000-0000-0000-0000-000000000000"]);
        const labelIds = ((lab.data ?? []) as { id: string }[]).map((l) => l.id);
        if (labelIds.length) {
          const r = await db.from("mkt_card_labels").insert(labelIds.map((label_id) => ({ card_id: cardId, label_id })));
          if (r.error) throw new Error(r.error.message);
        }
        for (const [k, cl] of modelo.checklists.entries()) {
          const c = await db.from("mkt_checklists").insert({ card_id: cardId, title: cl.title, position: (k + 1) * 1024 }).select("id").single();
          if (c.error) throw new Error(c.error.message);
          if (cl.items.length) {
            const it = await db.from("mkt_checklist_items").insert(cl.items.map((text, j) => ({ checklist_id: c.data.id, text, position: (j + 1) * 1024 })));
            if (it.error) throw new Error(it.error.message);
          }
        }
        // Campo apagado do quadro: idem, fica de fora em vez de derrubar a criação.
        const ids = modelo.campos.map((c) => c.field_id);
        if (ids.length) {
          const f = await db.from("mkt_custom_fields").select("id").eq("board_id", boardId).in("id", ids);
          const vivos = new Set(((f.data ?? []) as { id: string }[]).map((x) => x.id));
          const linhas = modelo.campos.filter((c) => vivos.has(c.field_id)).map((c) => ({ card_id: cardId, field_id: c.field_id, value: c.value }));
          if (linhas.length) {
            const r = await db.from("mkt_card_field_values").insert(linhas);
            if (r.error) throw new Error(r.error.message);
          }
        }
        await db.from("mkt_activity").insert({ board_id: boardId, card_id: cardId, user_id: eu, type: "card.create", data: { title, modelo: modelo.nome } });
      } catch (e) {
        await db.from("mkt_cards").delete().eq("id", cardId);
        throw e;
      }
      return cardId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] }),
  });

  return { salvar, excluir, criarCartao };
}
