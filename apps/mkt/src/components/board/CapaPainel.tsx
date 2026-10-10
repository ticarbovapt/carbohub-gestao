import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_COLORS, LABEL_COLOR_KEYS, lerCapa, tomDaCapa, capaDeAnexo } from "@/lib/mktTheme";
import { tipoDoArquivo, criarAnexoDeArquivo } from "@/lib/mktArquivos";
import { useImagensDeCapa } from "@/lib/mktCapaImagem";

// O painel "Capa" do Trello: tamanho (faixa no topo ou cartão inteiro), cor,
// IMAGEM de um anexo, carregar uma imagem nova, e remover. É o MESMO no cartão
// aberto e na edição rápida — duas cópias do seletor divergiriam no formato
// gravado (`full:<cor>`, `anexo:<id>`, `full:anexo:<id>`).
// ⚠️ A capa guarda a CHAVE da paleta ou o ID do anexo, nunca uma URL: a URL do
// bucket privado expira em 1 h, e substituir o anexo troca a capa junto.
// ⚠️ "Carregar uma imagem de capa" cria um ANEXO de verdade (como no Trello):
// a imagem fica na lista de anexos, com versão, link e tudo — capa solta, fora
// dos anexos, seria um arquivo no bucket que tela nenhuma mostra.

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

export function CapaPainel({ cardId, cover, onChange }: { cardId: string; cover: string | null; onChange: (cover: string | null) => void }) {
  const qc = useQueryClient();
  const capa = lerCapa(cover);
  const cheia = !!capa?.cheia;
  const chaveCor = capa && !capa.anexoId ? cover?.replace(/^full:/, "") ?? null : null;
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<number | null>(null);

  // Os anexos de IMAGEM do cartão (vídeo com capa gerada também serve).
  const { data: imagens = [] } = useQuery({
    queryKey: ["mkt", "capa-anexos", cardId],
    queryFn: async () => {
      const r = await db.from("mkt_card_attachments").select("id, name, mime_type, poster_path, created_at")
        .eq("card_id", cardId).eq("kind", "arquivo").order("created_at", { ascending: false });
      if (r.error) return [];
      return ((r.data ?? []) as { id: string; name: string; mime_type: string | null; poster_path: string | null }[])
        .filter((a) => tipoDoArquivo(a.mime_type, a.name) === "imagem" || a.poster_path);
    },
  });
  const { data: urls = new Map<string, string>() } = useImagensDeCapa([...imagens.map((a) => a.id), capa?.anexoId]);
  const tomAtual = capa?.anexoId ? undefined : capa ? tomDaCapa(capa.cor) : "hsl(var(--muted))";
  const fundoAtual = capa?.anexoId && urls.get(capa.anexoId)
    ? { backgroundImage: `url("${urls.get(capa.anexoId)}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: tomAtual ?? "hsl(var(--muted))" };
  const linha = "h-1 rounded-full bg-foreground/25";

  const trocarTamanho = (paraCheia: boolean) => {
    if (!capa) return;
    if (capa.anexoId) onChange(capaDeAnexo(capa.anexoId, paraCheia));
    else if (chaveCor) onChange(paraCheia ? `full:${chaveCor}` : chaveCor);
  };

  const carregar = async (f: File) => {
    if (tipoDoArquivo(f.type, f.name) !== "imagem") { toast.error("Escolha um arquivo de imagem (JPG, PNG, WebP…)."); return; }
    setEnviando(0);
    try {
      const { id } = await criarAnexoDeArquivo(cardId, f, setEnviando);
      onChange(capaDeAnexo(id, cheia));
      qc.invalidateQueries({ queryKey: ["mkt", "card", cardId] });
      qc.invalidateQueries({ queryKey: ["mkt", "capa-anexos", cardId] });
      toast.success("Imagem enviada e usada como capa. Ela também ficou nos anexos do cartão.");
    } catch (e) {
      toast.error(`Não enviou a imagem: ${(e as Error).message}`);
    } finally { setEnviando(null); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="mkt-meta-label">Tamanho</p>
        <div className="grid grid-cols-2 gap-2">
          {/* Faixa: a capa em cima, o conteúdo do cartão embaixo. */}
          <button type="button" disabled={!capa} onClick={() => trocarTamanho(false)} title="Faixa no topo"
            className={`rounded-md border-2 overflow-hidden text-left disabled:opacity-40 ${capa && !cheia ? "border-primary" : "border-border"}`}>
            <div className="h-6" style={fundoAtual} />
            <div className="p-1.5 space-y-1 bg-card"><div className={`${linha} w-4/5`} /><div className={`${linha} w-3/5`} /></div>
          </button>
          {/* Cheia: o cartão inteiro na capa, só o título. */}
          <button type="button" disabled={!capa} onClick={() => trocarTamanho(true)} title="Cartão inteiro"
            className={`rounded-md border-2 overflow-hidden disabled:opacity-40 ${cheia ? "border-primary" : "border-border"}`}>
            <div className="h-full min-h-[44px] p-1.5 flex flex-col justify-end gap-1" style={fundoAtual}>
              <div className={`${linha} w-4/5`} /><div className={`${linha} w-3/5`} />
            </div>
          </button>
        </div>
        {!capa && <p className="text-[11px] text-muted-foreground">Escolha uma cor ou imagem para escolher o tamanho.</p>}
      </div>

      {cover && (
        <button type="button" onClick={() => onChange(null)} className="w-full text-sm rounded-md border border-border py-1.5 hover:bg-muted text-foreground">Remover capa</button>
      )}

      <div className="space-y-1.5">
        <p className="mkt-meta-label">Cores</p>
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLOR_KEYS.map((k) => (
            <button key={k} type="button" title={k}
              onClick={() => onChange(cheia ? `full:${k}` : k)}
              className={`h-8 rounded-md ${chaveCor === k ? "ring-2 ring-primary ring-offset-1 ring-offset-popover" : ""}`}
              style={{ background: LABEL_COLORS[k] }} />
          ))}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="mkt-meta-label">Anexos</p>
        {imagens.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {imagens.map((a) => (
              <button key={a.id} type="button" title={a.name} onClick={() => onChange(capaDeAnexo(a.id, cheia))}
                className={`h-14 rounded-md overflow-hidden bg-muted ${capa?.anexoId === a.id ? "ring-2 ring-primary ring-offset-1 ring-offset-popover" : ""}`}>
                {urls.get(a.id)
                  ? <img src={urls.get(a.id)} alt={a.name} className="h-full w-full object-cover" />
                  : <span className="block truncate px-1 text-[10px] text-muted-foreground">{a.name}</span>}
              </button>
            ))}
          </div>
        )}
        <button type="button" disabled={enviando !== null} onClick={() => entrada.current?.click()}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm rounded-md border border-border py-1.5 hover:bg-muted text-foreground disabled:opacity-60">
          {enviando !== null
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando… {Math.round(enviando * 100)}%</>
            : <><Upload className="h-3.5 w-3.5" /> Carregar uma imagem de capa</>}
        </button>
        <input ref={entrada} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void carregar(f); }} />
      </div>
    </div>
  );
}
