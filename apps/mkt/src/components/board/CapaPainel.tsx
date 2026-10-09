import { LABEL_COLORS, LABEL_COLOR_KEYS, lerCapa, tomDaCapa } from "@/lib/mktTheme";

// O painel "Capa" do Trello: tamanho (faixa no topo ou cartão inteiro), cor e
// remover. É o MESMO no cartão aberto e na edição rápida — duas cópias do
// seletor divergiriam no formato gravado (`full:<cor>` para capa cheia).
// ⚠️ A capa é a CHAVE da paleta (nunca a cor crua): é o que deixa o tema
// escuro/claro escolher o tom na hora de pintar (`tomDaCapa`).
export function CapaPainel({ cover, onChange }: { cover: string | null; onChange: (cover: string | null) => void }) {
  const capa = lerCapa(cover);
  const chave = cover?.replace(/^full:/, "") ?? null;
  const tom = capa ? tomDaCapa(capa.cor) : "hsl(var(--muted))";
  const linha = "h-1 rounded-full bg-foreground/25";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="mkt-meta-label">Tamanho</p>
        <div className="grid grid-cols-2 gap-2">
          {/* Faixa: a cor em cima, o conteúdo do cartão embaixo. */}
          <button type="button" disabled={!chave} onClick={() => chave && onChange(chave)} title="Faixa no topo"
            className={`rounded-md border-2 overflow-hidden text-left disabled:opacity-40 ${chave && !capa?.cheia ? "border-primary" : "border-border"}`}>
            <div className="h-6" style={{ background: tom }} />
            <div className="p-1.5 space-y-1 bg-card"><div className={`${linha} w-4/5`} /><div className={`${linha} w-3/5`} /></div>
          </button>
          {/* Cheia: o cartão inteiro na cor, só o título. */}
          <button type="button" disabled={!chave} onClick={() => chave && onChange(`full:${chave}`)} title="Cartão inteiro"
            className={`rounded-md border-2 overflow-hidden disabled:opacity-40 ${capa?.cheia ? "border-primary" : "border-border"}`}>
            <div className="h-full min-h-[44px] p-1.5 flex flex-col justify-end gap-1" style={{ background: tom }}>
              <div className={`${linha} w-4/5`} /><div className={`${linha} w-3/5`} />
            </div>
          </button>
        </div>
        {!chave && <p className="text-[11px] text-muted-foreground">Escolha uma cor para escolher o tamanho.</p>}
      </div>

      {cover && (
        <button type="button" onClick={() => onChange(null)} className="w-full text-sm rounded-md border border-border py-1.5 hover:bg-muted text-foreground">Remover capa</button>
      )}

      <div className="space-y-1.5">
        <p className="mkt-meta-label">Cores</p>
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLOR_KEYS.map((k) => (
            <button key={k} type="button" title={k}
              onClick={() => onChange(capa?.cheia ? `full:${k}` : k)}
              className={`h-8 rounded-md ${chave === k ? "ring-2 ring-primary ring-offset-1 ring-offset-popover" : ""}`}
              style={{ background: LABEL_COLORS[k] }} />
          ))}
        </div>
      </div>
    </div>
  );
}
