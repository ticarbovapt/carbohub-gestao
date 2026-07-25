import { useEffect, useState } from "react";
import { signedAttachmentUrl } from "@/lib/bugContext";

// O bucket é privado (prints podem conter dado de cliente), então cada anexo
// vira uma URL assinada de curta duração na hora de exibir.
export function AnexosDaDemanda({ anexos }: { anexos: { path: string; name: string }[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let ativo = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const a of anexos) {
        const u = await signedAttachmentUrl(a.path);
        if (u) out[a.path] = u;
      }
      if (ativo) setUrls(out);
    })();
    return () => { ativo = false; };
  }, [anexos]);

  return (
    <div className="flex flex-wrap gap-2">
      {anexos.map((a) => {
        const url = urls[a.path];
        return url ? (
          <a key={a.path} href={url} target="_blank" rel="noreferrer"
            className="block h-20 w-28 overflow-hidden rounded-md border hover:border-carbo-green transition-colors"
            title={`Abrir ${a.name}`}>
            <img src={url} alt={a.name} className="h-full w-full object-cover" />
          </a>
        ) : (
          <div key={a.path} className="h-20 w-28 rounded-md border bg-muted/40 animate-pulse" />
        );
      })}
    </div>
  );
}
