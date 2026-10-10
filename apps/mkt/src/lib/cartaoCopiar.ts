// ─────────────────────────────────────────────────────────────────────────────
// Copiar um cartão (o "Copiar" do menu do cartão, como no Trello) para qualquer
// lista de qualquer quadro, escolhendo o que vai junto.
//
// ⚠️ Arquivo é COPIADO no bucket, nunca compartilhado entre os dois cartões:
// excluir um cartão apaga os objetos dele ("Itens arquivados" e "Excluir
// quadro" fazem isso), e um objeto compartilhado sumiria do OUTRO cartão,
// calado. A cópia do Storage é feita no servidor — vídeo de 243 MB não passa
// pelo navegador. Versões anteriores NÃO vão: a cópia nasce na versão 1.
// ⚠️ Para OUTRO quadro, etiqueta e campo são remapeados como no "Mover"
// (`mkt_cartao_mover`): etiqueta por nome + cor, criada se faltar; campo por
// nome + tipo, e sem par o valor fica de fora.
// ⚠️ Falhou no meio ⇒ apaga o cartão novo e os arquivos já copiados: cópia
// pela metade é pior que cópia nenhuma, porque parece completa.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { BUCKET, caminhoDoArquivo, caminhoDaCapa } from "@/lib/mktArquivos";
import { anexoDaCapa, capaDeAnexo, lerCapa } from "@/lib/mktTheme";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };

export interface OpcoesCopia {
  titulo: string;
  checklists: boolean; etiquetas: boolean; membros: boolean; anexos: boolean; comentarios: boolean; campos: boolean;
}

const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

export async function copiarCartao(cardId: string, listId: string, posicao: number, o: OpcoesCopia): Promise<string> {
  const eu = (await db.auth.getUser()).data.user?.id ?? null;
  const card = ok(await db.from("mkt_cards").select("*").eq("id", cardId).single()) as Record<string, any>;
  const lista = ok(await db.from("mkt_lists").select("board_id").eq("id", listId).single()) as { board_id: string };
  const outroQuadro = lista.board_id !== card.board_id;

  const novoId = crypto.randomUUID();
  const copiados: string[] = [];
  try {
    ok(await db.from("mkt_cards").insert({
      id: novoId, board_id: lista.board_id, list_id: listId, position: posicao,
      title: o.titulo.trim() || card.title, description: card.description,
      // Capa de IMAGEM só vai se o anexo for junto (remapeada abaixo para o
      // anexo COPIADO); senão apontaria para a foto de outro cartão.
      start_date: card.start_date, due_date: card.due_date, is_complete: false, cover: anexoDaCapa(card.cover) ? null : card.cover,
      location_lat: card.location_lat, location_lng: card.location_lng, location_name: card.location_name,
      created_by: eu,
    }));

    if (o.etiquetas) {
      const cl = ok(await db.from("mkt_card_labels").select("label_id, mkt_labels(name, color)").eq("card_id", cardId)) as { label_id: string; mkt_labels: { name: string; color: string } }[];
      let ids = cl.map((x) => x.label_id);
      if (outroQuadro && cl.length) {
        const destino = ok(await db.from("mkt_labels").select("id, name, color").eq("board_id", lista.board_id)) as { id: string; name: string; color: string }[];
        ids = [];
        for (const x of cl) {
          const achou = destino.find((d) => d.name === x.mkt_labels.name && d.color === x.mkt_labels.color);
          if (achou) { ids.push(achou.id); continue; }
          const criada = ok(await db.from("mkt_labels").insert({ board_id: lista.board_id, name: x.mkt_labels.name, color: x.mkt_labels.color }).select("id, name, color").single()) as { id: string; name: string; color: string };
          destino.push(criada); ids.push(criada.id);
        }
      }
      const unicos = [...new Set(ids)];
      if (unicos.length) ok(await db.from("mkt_card_labels").insert(unicos.map((label_id) => ({ card_id: novoId, label_id }))));
    }

    if (o.membros) {
      const ms = ok(await db.from("mkt_card_members").select("user_id").eq("card_id", cardId)) as { user_id: string }[];
      if (ms.length) ok(await db.from("mkt_card_members").insert(ms.map((m) => ({ card_id: novoId, user_id: m.user_id }))));
    }

    if (o.campos) {
      const vs = ok(await db.from("mkt_card_field_values").select("field_id, value, mkt_custom_fields(name, type)").eq("card_id", cardId)) as { field_id: string; value: unknown; mkt_custom_fields: { name: string; type: string } }[];
      let linhas = vs.map((v) => ({ card_id: novoId, field_id: v.field_id, value: v.value }));
      if (outroQuadro && vs.length) {
        const destino = ok(await db.from("mkt_custom_fields").select("id, name, type").eq("board_id", lista.board_id)) as { id: string; name: string; type: string }[];
        linhas = vs.flatMap((v) => {
          const d = destino.find((f) => f.name === v.mkt_custom_fields.name && f.type === v.mkt_custom_fields.type);
          return d ? [{ card_id: novoId, field_id: d.id, value: v.value }] : [];
        });
      }
      if (linhas.length) ok(await db.from("mkt_card_field_values").insert(linhas));
    }

    if (o.checklists) {
      const ks = ok(await db.from("mkt_checklists").select("id, title, position").eq("card_id", cardId)) as { id: string; title: string; position: number }[];
      for (const k of ks) {
        const nk = ok(await db.from("mkt_checklists").insert({ card_id: novoId, title: k.title, position: k.position }).select("id").single()) as { id: string };
        const its = ok(await db.from("mkt_checklist_items").select("text, is_done, position, due_date, assignee_id").eq("checklist_id", k.id)) as Record<string, unknown>[];
        if (its.length) ok(await db.from("mkt_checklist_items").insert(its.map((i) => ({ ...i, checklist_id: nk.id }))));
      }
    }

    if (o.anexos) {
      const as = ok(await db.from("mkt_card_attachments").select("*").eq("card_id", cardId)) as Record<string, any>[];
      for (const a of as) {
        const { id: _id, card_id: _c, created_at: _ca, ...resto } = a;
        const novo: Record<string, any> = { ...resto, card_id: novoId, created_by: eu };
        if ("versao" in novo) novo.versao = 1;
        const novoAnexo = crypto.randomUUID();
        novo.id = novoAnexo;
        const copia = async (de: string | null, para: string) => {
          if (!de) return null;
          const r = await supabase.storage.from(BUCKET).copy(de, para);
          if (r.error) throw new Error(`arquivo "${a.name}": ${r.error.message}`);
          copiados.push(para);
          return para;
        };
        if (a.storage_path) {
          novo.storage_path = await copia(a.storage_path, caminhoDoArquivo(novoId, a.name ?? "arquivo"));
          novo.external_url = `storage://${BUCKET}/${novo.storage_path}`;
          if ("poster_path" in a) novo.poster_path = await copia(a.poster_path, caminhoDaCapa(novoAnexo));
          if ("web_path" in a && a.web_path) novo.web_path = await copia(a.web_path, `web/${novoAnexo}/${crypto.randomUUID()}.mp4`);
        }
        ok(await db.from("mkt_card_attachments").insert(novo));
        if (anexoDaCapa(card.cover) === a.id) {
          ok(await db.from("mkt_cards").update({ cover: capaDeAnexo(novoAnexo, !!lerCapa(card.cover)?.cheia) }).eq("id", novoId));
        }
      }
    }

    if (o.comentarios) {
      const cs = ok(await db.from("mkt_comments").select("user_id, body, created_at, updated_at").eq("card_id", cardId).order("created_at")) as Record<string, unknown>[];
      for (let i = 0; i < cs.length; i += 200) {
        ok(await db.from("mkt_comments").insert(cs.slice(i, i + 200).map((c) => ({ ...c, card_id: novoId }))));
      }
    }
    return novoId;
  } catch (e) {
    if (copiados.length) await supabase.storage.from(BUCKET).remove(copiados);
    await db.from("mkt_cards").delete().eq("id", novoId);
    throw e;
  }
}
