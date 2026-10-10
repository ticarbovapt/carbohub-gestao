import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET, tipoDoArquivo } from "@/lib/mktArquivos";

// As URLs das capas de IMAGEM de um conjunto de cartões, numa ida só.
// ⚠️ Usa a CAPA LEVE do anexo (`poster_path`, jpeg de 480 px) e só cai no
// arquivo original quando ela não existe e o anexo é imagem: um quadro com 30
// capas baixando o original de cada uma seria 30 fotos de vários MB.
// ⚠️ O bucket é PRIVADO: URL assinada vale 1 h; a consulta envelhece em 50 min
// e reassina antes de a imagem quebrar.
// ⚠️ Anexo apagado ou inacessível simplesmente não aparece no mapa — quem pinta
// cai no fundo neutro, nunca numa imagem quebrada.

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

export function useImagensDeCapa(anexoIds: (string | null | undefined)[]) {
  const ids = [...new Set(anexoIds.filter(Boolean) as string[])].sort();
  return useQuery({
    queryKey: ["mkt", "capas-imagem", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
    queryFn: async () => {
      const mapa = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 150) {
        const r = await db.from("mkt_card_attachments").select("id, name, mime_type, storage_path, poster_path").in("id", ids.slice(i, i + 150));
        if (r.error) continue;
        const linhas = (r.data ?? []) as { id: string; name: string; mime_type: string | null; storage_path: string | null; poster_path: string | null }[];
        const caminhos = linhas.map((a) => ({
          id: a.id,
          path: a.poster_path ?? (tipoDoArquivo(a.mime_type, a.name) === "imagem" ? a.storage_path : null),
        })).filter((x) => x.path) as { id: string; path: string }[];
        if (!caminhos.length) continue;
        const s = await supabase.storage.from(BUCKET).createSignedUrls(caminhos.map((c) => c.path), 3600);
        if (s.error || !s.data) continue;
        s.data.forEach((d, k) => { if (d.signedUrl) mapa.set(caminhos[k].id, d.signedUrl); });
      }
      return mapa;
    },
  });
}
