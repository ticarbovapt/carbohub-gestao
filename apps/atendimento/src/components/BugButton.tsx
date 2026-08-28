import { useEffect, useRef, useState } from "react";
import {
  Bug, Lightbulb, Plus, CheckCircle2, ImagePlus, X, Paperclip,
  ChevronDown, ArrowRight,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBugReports, useSubmitBugReport, type BugKind, type BugStatus } from "@/hooks/useBugReports";
import { KINDS, kindOf, kindUi } from "@carbo/demandas";
import { captureClientContext, uploadBugAttachments, type BugAttachment } from "@/lib/bugContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─────────────────────────────────────────────────────────────────────────────
// Reporte de bug/sugestão — widget do topo.
// ⚠️ ARQUIVO PADRONIZADO — idêntico nos 6 apps (crm/ops/admin/financas/mkt/ti).
// Só a constante APP (em hooks/useBugReports.ts) muda de app pra app.
//
// Princípios do formulário:
//  • Só DOIS campos obrigatórios (resumo + descrição). Cada campo obrigatório a
//    mais é um reporte que deixa de ser feito.
//  • O bloco de impacto tem a MESMA altura em bug e sugestão — trocar o tipo
//    não pode fazer o diálogo pular na frente de quem está escrevendo.
//  • Nada de vermelho "destructive" como categoria: vermelho = erro de verdade.
// ─────────────────────────────────────────────────────────────────────────────

// Etapas do fluxo do TI, na linguagem de quem pediu.
const STATUS_LABEL: Record<string, string> = {
  open: "Recebido",
  priorizada: "Na fila",
  in_progress: "Sendo resolvido",
  aguardando: "Aguardando você",
  em_teste: "Em validação",
  resolved: "Resolvido",
  declined: "Recusado",
};
// Etapas não-finais, na ordem — viram a barrinha de progresso do acompanhamento.
const FLUXO = ["open", "priorizada", "in_progress", "aguardando", "em_teste"];

const statusLabel = (s: BugStatus) => STATUS_LABEL[s] ?? "Em andamento";
const emAberto = (s: string) => s !== "resolved" && s !== "declined";
/** A bola está com quem reportou — o único caso que merece alerta vermelho. */
const precisaDeVoce = (s: string) => s === "aguardando";

const dtFmt = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

const BLOQUEIOS = [
  { key: "travado",  label: "Estou travado",    hint: "Não consigo trabalhar por causa disso" },
  { key: "contorno", label: "Dá pra contornar", hint: "Atrapalha, mas tem jeitinho" },
  { key: "incomoda", label: "Só incomoda",      hint: "Funciona, mas podia ser melhor" },
] as const;

const ALCANCES = [
  { key: "so_eu",      label: "Só eu",      hint: "Parece ser só comigo" },
  { key: "meu_time",   label: "Meu time",   hint: "Outras pessoas da minha área também" },
  { key: "todo_mundo", label: "Todo mundo", hint: "A empresa inteira sente" },
] as const;

/** Linha de 3 chips — mesma família visual em todo o formulário. */
function ChipRow({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { key: string; label: string; hint: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" title={o.hint}
          onClick={() => onChange(value === o.key ? "" : o.key)}
          className={`h-8 rounded-md border px-2 text-xs font-medium leading-none transition-colors ${
            value === o.key
              ? "border-primary bg-primary/10 text-foreground"
              : "border-input text-muted-foreground hover:bg-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Progresso das etapas — "sendo resolvido" passa a ler como movimento. */
function StageBar({ status }: { status: BugStatus }) {
  if (status === "resolved") return <div className="h-1 w-full rounded-full bg-carbo-green" title="Resolvido" />;
  if (status === "declined") return <div className="h-1 w-full rounded-full bg-muted-foreground/40" title="Recusado" />;
  const idx = FLUXO.indexOf(status);
  return (
    <div className="flex gap-0.5" title={statusLabel(status)}>
      {FLUXO.map((s, i) => (
        <span key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
      ))}
    </div>
  );
}

// Exemplo e rótulo por tipo. Um pedido de cabo com placeholder "Botão de
// salvar não funciona" faz a pessoa achar que está no lugar errado.
const PLACEHOLDER_RESUMO: Record<string, string> = {
  bug:      "Ex: Botão de salvar não funciona",
  sugestao: "Ex: Poderia ter filtro por data",
  infra:    "Ex: Falta cabo HDMI no monitor da recepção",
  acesso:   "Ex: Preciso de acesso ao Bling",
  ajuda:    "Ex: Como emito a segunda via da NF?",
};
// ⚠️ CURTOS de propósito. Este rótulo divide a linha com o botão "usar
// modelo"; um texto longo ("O que você precisa acessar") quebrava em duas
// linhas em alguns tipos e o diálogo mudava de altura ao trocar de tipo.
const ROTULO_DESCRICAO: Record<string, string> = {
  bug:      "O que aconteceu",
  sugestao: "Sua ideia",
  infra:    "O que você precisa",
  acesso:   "O que você precisa",
  ajuda:    "Sua dúvida",
};

export function BugButton() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [kind, setKind] = useState<BugKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bloqueio, setBloqueio] = useState("");
  const [alcance, setAlcance] = useState("");
  const [files, setFiles] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [touched, setTouched] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(false);

  const { data: bugs = [] } = useMyBugReports(user?.id);
  const submit = useSubmitBugReport();

  const DRAFT_KEY = "bugreport:draft";

  // Rascunho: um ESC acidental não pode destruir o relato inteiro.
  useEffect(() => {
    if (!dialogOpen) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { kind?: BugKind; title?: string; description?: string };
        if (d.title || d.description) {
          setKind(d.kind ?? "bug"); setTitle(d.title ?? ""); setDescription(d.description ?? "");
          setRascunhoRecuperado(true);
        }
      }
    } catch { /* sem rascunho */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen || enviado) return;
    try {
      if (title || description) localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, title, description }));
    } catch { /* quota */ }
  }, [kind, title, description, dialogOpen, enviado]);

  if (!user) return null;

  // A badge só acende quando a bola está com o usuário. Antes ela vivia vermelha
  // dizendo "o TI está trabalhando" — nada acionável, e as pessoas aprendiam a ignorar.
  const precisamDeVoce = bugs.filter((b) => precisaDeVoce(b.status)).length;
  const abertos = bugs.filter((b) => emAberto(b.status)).length;

  function addFiles(list: FileList | File[]) {
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, 3 - files.length);
    setFiles((prev) => [
      ...prev,
      ...imgs.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
    ]);
  }
  function removeFile(id: string) {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  }

  function limpar() {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setKind("bug"); setTitle(""); setDescription(""); setBloqueio(""); setAlcance("");
    setFiles([]); setTouched(false); setCtxOpen(false); setRascunhoRecuperado(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
  }

  function abrirDialog() {
    setOpen(false);
    setEnviado(false);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) { setTouched(true); return; }
    setSubindo(true);
    let attachments: BugAttachment[] = [];
    try {
      if (files.length) attachments = await uploadBugAttachments(files.map((f) => f.file), user!.id);
    } finally {
      setSubindo(false);
    }
    submit.mutate(
      {
        kind,
        title: title.trim(),
        description: description.trim(),
        url: window.location.href,
        reporter_id: user!.id,
        reporter_name: profile?.full_name ?? null,
        reporter_email: user!.email ?? null,
        department: (profile as { department?: string } | null)?.department ?? null,
        // Sugestão é o único tipo que não bloqueia ninguém por definição —
        // perguntar ali soaria como convite a inflar a prioridade.
        bloqueio: kindOf(kind).bloqueia ? (bloqueio || null) : null,
        pessoas_afetadas: alcance || null,
        attachments,
        client_context: captureClientContext(),
      },
      { onSuccess: () => { limpar(); setEnviado(true); } },
    );
  }

  // Frase de consequência em vez do rótulo da prioridade — dá noção de agência
  // sem anunciar "Crítica", que convidaria todo mundo a marcar o pior caso.
  const consequencia =
    bloqueio === "travado" && (alcance === "todo_mundo" || alcance === "meu_time")
      ? "o TI olha isso primeiro"
      : bloqueio || alcance ? "entra na fila com essa leitura" : "";

  const enviando = submit.isPending || subindo;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="Reportar bug ou sugestão"
          >
            <Bug className="h-4 w-4" />
            {precisamDeVoce > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
                {precisamDeVoce > 9 ? "9+" : precisamDeVoce}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <Bug className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm">Meus reportes</span>
              {abertos > 0 && (
                <span className="text-[10px] text-muted-foreground shrink-0">{abertos} em andamento</span>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={abrirDialog}>
              <Plus className="h-3 w-3" /> Reportar
            </Button>
          </div>

          {bugs.length === 0 ? (
            <div className="px-4 py-8 text-center space-y-1.5">
              <Bug className="h-8 w-8 mx-auto text-muted-foreground/25" />
              <p className="text-sm font-medium">Nada reportado ainda</p>
              <p className="text-xs text-muted-foreground">
                Achou algo estranho ou teve uma ideia? Conta pra gente.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {bugs.slice(0, 5).map((b) => (
                  <div key={b.id}
                    className={`px-4 py-2.5 space-y-1.5 ${precisaDeVoce(b.status) ? "border-l-2 border-amber-500 bg-amber-500/5" : ""}`}>
                    <div className="flex items-start gap-2">
                      {(() => { const { Icon, className } = kindUi(b.kind);
                        return <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${className}`} />; })()}
                      <p className="text-sm leading-snug flex-1 min-w-0 break-words">{b.title}</p>
                    </div>
                    <StageBar status={b.status} />
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className={precisaDeVoce(b.status) ? "text-amber-600 font-medium" : ""}>
                        {statusLabel(b.status)}
                        {(b as { assignee_name?: string | null }).assignee_name
                          ? ` · ${(b as { assignee_name?: string | null }).assignee_name}` : ""}
                      </span>
                      <span>{dtFmt(b.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setOpen(false); navigate("/bugs"); }}
                className="w-full px-4 py-2.5 border-t text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1"
              >
                Ver todos ({bugs.length}) <ArrowRight className="h-3 w-3" />
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEnviado(false); }}>
        <DialogContent
          className="sm:max-w-lg max-h-[92vh] overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !enviado) { e.preventDefault(); handleSubmit(); }
          }}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData?.items ?? [])
              .filter((i) => i.type.startsWith("image/"))
              .map((i) => i.getAsFile())
              .filter(Boolean) as File[];
            if (imgs.length) { e.preventDefault(); addFiles(imgs); }
          }}
        >
          {enviado ? (
            /* Confirmação — é o único ponto que liga "criar" a "acompanhar". */
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-carbo-green/10 p-3">
                <CheckCircle2 className="h-6 w-6 text-carbo-green" />
              </div>
              <div>
                <p className="text-sm font-medium">Recebido pelo TI</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Você é avisado a cada passo. Não precisa fazer mais nada.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); navigate("/bugs"); }}>
                  Acompanhar
                </Button>
                <Button size="sm" onClick={() => setEnviado(false)}>Reportar outro</Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="text-base">O que você quer nos contar?</DialogTitle>
                {/* GRADE de largura igual, não flex-wrap.
                    Com frases de tamanhos diferentes ("Algo está errado" ×
                    "Não sei usar") o wrap produzia duas fileiras irregulares,
                    com sobra à direita — parecia quebrado, não intencional.
                    Cinco células iguais lêem como um controle só.

                    Ícone em cima do rótulo: lado a lado, "Equipamento" não
                    cabe em 1/5 da largura do diálogo e truncava.

                    A dica fica numa linha FIXA abaixo (h-4) em vez de dentro do
                    botão. É ela que traduz "Bug" para quem reporta — e a altura
                    fixa é o que impede o diálogo de pular ao trocar de tipo. */}
                <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
                  {KINDS.map((k) => {
                    const { Icon, className } = kindUi(k.key);
                    const ativo = kind === k.key;
                    return (
                      <button key={k.key} type="button" onClick={() => setKind(k.key as BugKind)} title={k.hint}
                        aria-pressed={ativo}
                        className={`flex flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium leading-none transition-all ${
                          ativo ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50"}`}>
                        <Icon className={`h-4 w-4 ${ativo ? className : ""}`} />
                        <span className="truncate max-w-full">{k.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="h-4 truncate text-[11px] text-muted-foreground">{kindOf(kind).hint}</p>
              </DialogHeader>

              {rascunhoRecuperado && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span>Rascunho recuperado</span>
                  <button onClick={limpar} className="hover:text-foreground underline underline-offset-2">descartar</button>
                </div>
              )}

              {/* ── O relato ── */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bug-title">Resumo <span className="text-destructive">*</span></Label>
                  <Input
                    id="bug-title"
                    autoFocus
                    placeholder={PLACEHOLDER_RESUMO[kind] ?? "Ex: Botão de salvar não funciona"}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  {touched && !title.trim() && (
                    <p className="text-[11px] text-destructive">Um resumo curto ajuda o TI a achar isso depois.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="bug-desc" className="whitespace-nowrap">
                      {ROTULO_DESCRICAO[kind] ?? "O que aconteceu"} <span className="text-destructive">*</span>
                    </Label>
                    {kind === "bug" && !description && (
                      <button type="button"
                        onClick={() => setDescription("O que aconteceu:\n\nO que eu esperava:\n\nComo repetir:\n")}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        usar roteiro
                      </button>
                    )}
                  </div>
                  <Textarea
                    id="bug-desc"
                    rows={5}
                    placeholder={kind === "sugestao"
                      ? "O que melhoraria e por que ajudaria."
                      : "O que aconteceu? O que esperava? Alguma mensagem de erro?"}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  {touched && !description.trim() ? (
                    <p className="text-[11px] text-destructive">Descreva o que houve — sem isso o TI não consegue começar.</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Quanto mais detalhe, mais rápido resolve.</p>
                  )}
                </div>
              </div>

              {/* ── O contexto ── */}
              <div className="space-y-3 border-t pt-4">
                {/* min-h fixo: trocar bug↔sugestão não pode fazer o diálogo pular. */}
                {/* Duas perguntas distintas, cada uma com o seu rótulo. Antes as
                    duas fileiras dividiam um título só e liam como 6 opções de
                    uma pergunta só. min-h fixo: trocar o tipo não faz pular. */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3 min-h-[116px]">
                  {kindOf(kind).bloqueia && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Isso te impede de trabalhar?
                        </span>
                        <span className="text-[10px] text-muted-foreground">opcional</span>
                      </div>
                      <ChipRow value={bloqueio} onChange={setBloqueio} options={BLOQUEIOS} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {kind === "sugestao" ? "Quem ganharia com isso?" : "Além de você, quem mais sente?"}
                      </span>
                      {consequencia
                        ? <span className="text-[10px] text-carbo-green">{consequencia}</span>
                        : <span className="text-[10px] text-muted-foreground">opcional</span>}
                    </div>
                    <ChipRow value={alcance} onChange={setAlcance} options={ALCANCES} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                      onClick={() => fileRef.current?.click()} disabled={files.length >= 3}>
                      <ImagePlus className="h-3.5 w-3.5" /> Anexar print
                    </Button>
                    <span className="text-[11px] text-muted-foreground">ou cole com Ctrl+V</span>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                  {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {files.map((f) => (
                        <div key={f.id} className="group relative h-16 w-24 overflow-hidden rounded-md border">
                          <img src={f.preview} alt="" className="h-full w-full object-cover" />
                          <button type="button" onClick={() => removeFile(f.id)}
                            className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <button type="button" onClick={() => setCtxOpen((o) => !o)}
                    className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="text-left">Já vai junto: a tela, seu navegador e seu usuário — não precisa explicar</span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${ctxOpen ? "rotate-180" : ""}`} />
                  </button>
                  {ctxOpen && (
                    <dl className="mt-1.5 space-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                      <div className="flex justify-between gap-2"><dt>Tela</dt><dd className="truncate">{location.pathname}</dd></div>
                      <div className="flex justify-between gap-2"><dt>Janela</dt><dd>{window.innerWidth}×{window.innerHeight}</dd></div>
                      <div className="flex justify-between gap-2"><dt>Você</dt><dd className="truncate">{profile?.full_name ?? user.email}</dd></div>
                    </dl>
                  )}
                </div>
              </div>

              <DialogFooter className="sm:justify-between gap-2">
                <span className="hidden sm:block text-[11px] text-muted-foreground self-center">
                  Ctrl+Enter para enviar
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSubmit} disabled={enviando}>
                    {enviando ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
