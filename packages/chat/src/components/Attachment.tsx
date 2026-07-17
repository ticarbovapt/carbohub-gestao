import { FileText, Download } from "lucide-react";
import { useSignedUrl } from "../hooks";
import type { ChatAttachment } from "../types";

function kindOf(a: ChatAttachment): "image" | "video" | "audio" | "file" {
  const m = a.mime_type ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}
function humanSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fileName(path: string) {
  const base = path.split("/").pop() ?? "arquivo";
  return base.replace(/^\d+-/, "");
}

export function Attachment({ att }: { att: ChatAttachment }) {
  const { data: url, isLoading } = useSignedUrl(att.storage_path);
  const kind = kindOf(att);

  if (isLoading) return <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />;
  if (!url) return <p className="text-xs text-muted-foreground">Anexo indisponível</p>;

  if (kind === "image") {
    // Frame quadrado padronizado (object-cover) como o WhatsApp: a exibição não
    // varia com o tamanho da imagem; abrir (clique) mostra a imagem completa.
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
        <img src={url} alt="" className="aspect-square w-full object-cover" />
      </a>
    );
  }
  if (kind === "video") {
    return <video src={url} controls className="block aspect-video w-full rounded-lg bg-black object-cover" />;
  }
  if (kind === "audio") {
    return <audio src={url} controls className="h-10 w-64 max-w-full" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex max-w-xs items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{fileName(att.storage_path)}</span>
        <span className="text-[11px] text-muted-foreground">{humanSize(att.size_bytes)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
