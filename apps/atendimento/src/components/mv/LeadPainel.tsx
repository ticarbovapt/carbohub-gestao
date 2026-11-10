import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, CalendarPlus, ExternalLink, History, Loader2, MessageCircle } from "lucide-react";
import { confirmar, pedirTexto } from "@carbo/shell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useAuth } from "@/contexts/AuthContext";
import { useMvAtualizar, useMvCriar, useMvEventos } from "@/hooks/useMaquinaVendas";
import {
  COR_ETAPA, ETAPAS, ROTULO_ETAPA, faltaParaEtapa, fmtQuando, hoje, isoParaLocal, linkGoogleAgenda,
  linkWhatsapp, localParaIso, type Etapa, type MvEvento, type MvLead, type PagoPara, type Pessoa,
} from "@/lib/maquinaVendas";

// O painel do lead: o mesmo para criar (`lead = null`) e editar. Grava só no
// "Salvar" — rascunho local, para não disparar aviso ao técnico a cada tecla.

type Rascunho = {
  nome: string; whatsapp: string; link_chat: string; cidade: string; uf: string; modelo: string;
  veiculos: string; valor: string; etapa: Etapa; motivo_perda: string; anotacoes: string;
  tomador_decisao: string; parceiro: string; pago_para: PagoPara | ""; primeiro_contato_em: string;
  ultimo_contato_em: string; proximo_contato_em: string; fechamento_em: string; pos_venda_nf: boolean;
  responsavel_id: string; tecnico_id: string; agendado_para: string; duracao_min: string; local_execucao: string;
};

const NENHUM = "__nenhum";

function deLead(l: MvLead | null, eu: string | undefined, etapa?: Etapa): Rascunho {
  return {
    nome: l?.nome ?? "", whatsapp: l?.whatsapp ?? "", link_chat: l?.link_chat ?? "",
    cidade: l?.cidade ?? "", uf: l?.uf ?? "", modelo: l?.modelo ?? "",
    veiculos: l?.veiculos != null ? String(l.veiculos) : "",
    valor: l?.valor != null ? String(l.valor).replace(".", ",") : "",
    etapa: l?.etapa ?? etapa ?? "contato", motivo_perda: l?.motivo_perda ?? "", anotacoes: l?.anotacoes ?? "",
    tomador_decisao: l?.tomador_decisao ?? "", parceiro: l?.parceiro ?? "", pago_para: l?.pago_para ?? "",
    primeiro_contato_em: l?.primeiro_contato_em ?? hoje(), ultimo_contato_em: l?.ultimo_contato_em ?? "",
    proximo_contato_em: isoParaLocal(l?.proximo_contato_em), fechamento_em: l?.fechamento_em ?? "",
    pos_venda_nf: l?.pos_venda_nf ?? false, responsavel_id: l?.responsavel_id ?? (l ? "" : eu ?? ""),
    tecnico_id: l?.tecnico_id ?? "", agendado_para: isoParaLocal(l?.agendado_para),
    duracao_min: String(l?.duracao_min ?? 90), local_execucao: l?.local_execucao ?? "",
  };
}

const nulo = (s: string) => (s.trim() ? s.trim() : null);
function numero(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function paraCampos(r: Rascunho) {
  return {
    nome: r.nome.trim(), whatsapp: nulo(r.whatsapp), link_chat: nulo(r.link_chat), cidade: nulo(r.cidade),
    uf: nulo(r.uf.toUpperCase()), modelo: nulo(r.modelo), veiculos: numero(r.veiculos), valor: numero(r.valor),
    etapa: r.etapa, motivo_perda: r.etapa === "perdido" ? nulo(r.motivo_perda) : null, anotacoes: nulo(r.anotacoes),
    tomador_decisao: nulo(r.tomador_decisao), parceiro: nulo(r.parceiro), pago_para: r.pago_para || null,
    primeiro_contato_em: r.primeiro_contato_em || hoje(), ultimo_contato_em: r.ultimo_contato_em || null,
    proximo_contato_em: localParaIso(r.proximo_contato_em), fechamento_em: r.fechamento_em || null,
    pos_venda_nf: r.pos_venda_nf, responsavel_id: r.responsavel_id || null, tecnico_id: r.tecnico_id || null,
    agendado_para: localParaIso(r.agendado_para), duracao_min: Number(r.duracao_min) || 90,
    local_execucao: nulo(r.local_execucao),
  };
}

function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1 block text-xs text-muted-foreground">{rotulo}</Label>{children}</div>;
}

function PessoaSelect({ valor, onChange, pessoas, vazio }: { valor: string; onChange: (v: string) => void; pessoas: Pessoa[]; vazio: string }) {
  return (
    <Select value={valor || NENHUM} onValueChange={(v) => onChange(v === NENHUM ? "" : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NENHUM}>{vazio}</SelectItem>
        {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function textoEvento(e: MvEvento, nomeDe: (id: string | null) => string): string {
  switch (e.tipo) {
    case "criado": return "Lead criado";
    case "etapa": return `${ROTULO_ETAPA[e.de as Etapa] ?? e.de} → ${ROTULO_ETAPA[e.para as Etapa] ?? e.para}`;
    case "agenda": return e.para ? `Execução marcada para ${fmtQuando(e.para)}` : "Execução desmarcada";
    case "tecnico": return e.para ? `Técnico: ${nomeDe(e.para)}` : "Técnico removido";
    case "arquivado": return "Arquivado";
    case "restaurado": return "Restaurado";
    default: return e.tipo;
  }
}

export function LeadPainel({ aberto, lead, etapaInicial, pessoas, onFechar, onCriado }: {
  aberto: boolean;
  lead: MvLead | null;
  etapaInicial?: Etapa;
  pessoas: Pessoa[];
  onFechar: () => void;
  onCriado: (id: string) => void;
}) {
  const { user } = useAuth();
  const [r, setR] = useState<Rascunho>(() => deLead(lead, user?.id, etapaInicial));
  const atualizar = useMvAtualizar();
  const criar = useMvCriar();
  const eventos = useMvEventos(lead?.id ?? null);
  const [verHistorico, setVerHistorico] = useState(false);

  // Troca de lead (ou volta do banco depois de salvar) recarrega o rascunho.
  useEffect(() => { setR(deLead(lead, user?.id, etapaInicial)); }, [lead?.id, lead?.updated_at, aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));
  const nomeDe = useMemo(() => {
    const m = new Map(pessoas.map((p) => [p.id, p.nome]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [pessoas]);

  const falta = faltaParaEtapa({ agendado_para: localParaIso(r.agendado_para) }, r.etapa);
  const salvando = atualizar.isPending || criar.isPending;
  const podeSalvar = !!r.nome.trim() && !falta && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    const campos = paraCampos(r);
    if (lead) {
      atualizar.mutate({ id: lead.id, campos }, { onSuccess: onFechar });
    } else {
      const id = await criar.mutateAsync(campos).catch(() => null);
      if (id) onCriado(id);
    }
  }

  async function arquivar() {
    if (!lead) return;
    if (lead.arquivado_em) { atualizar.mutate({ id: lead.id, campos: { arquivado_em: null } }); return; }
    const ok = await confirmar({ titulo: "Arquivar este lead?", mensagem: "Ele sai do pipeline; o histórico fica.", confirmar: "Arquivar" });
    if (ok) atualizar.mutate({ id: lead.id, campos: { arquivado_em: new Date().toISOString() } }, { onSuccess: onFechar });
  }

  async function mudarEtapa(e: Etapa) {
    if (e === "perdido" && !r.motivo_perda.trim()) {
      const m = await pedirTexto({ titulo: "Motivo da perda", rotulo: "Por que não fechou?", obrigatorio: true });
      if (m == null) return;
      setR((x) => ({ ...x, etapa: e, motivo_perda: m }));
      return;
    }
    set("etapa", e);
  }

  const wa = linkWhatsapp(r.whatsapp);
  const gcal = lead ? linkGoogleAgenda({ ...lead, ...paraCampos(r) } as MvLead) : null;

  return (
    <Sheet open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="truncate">{lead ? lead.nome : "Novo lead"}</SheetTitle>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS.map((e) => (
              <button key={e.id} type="button" onClick={() => mudarEtapa(e.id)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={r.etapa === e.id ? { background: e.cor, borderColor: e.cor, color: "#fff" } : { borderColor: `${e.cor}66`, color: e.cor }}>
                {e.rotulo}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nome" className="col-span-2"><Input value={r.nome} onChange={(e) => set("nome", e.target.value)} autoFocus={!lead} /></Campo>
            <Campo rotulo="WhatsApp">
              <div className="flex gap-1">
                <Input value={r.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
                {wa && <Button asChild size="icon" variant="outline" className="shrink-0"><a href={wa} target="_blank" rel="noreferrer" title="Abrir no WhatsApp"><MessageCircle className="h-4 w-4" /></a></Button>}
              </div>
            </Campo>
            <Campo rotulo="Link da conversa">
              <div className="flex gap-1">
                <Input value={r.link_chat} onChange={(e) => set("link_chat", e.target.value)} placeholder="https://" />
                {/^https?:\/\//.test(r.link_chat) && <Button asChild size="icon" variant="outline" className="shrink-0"><a href={r.link_chat} target="_blank" rel="noreferrer" title="Abrir conversa"><ExternalLink className="h-4 w-4" /></a></Button>}
              </div>
            </Campo>
            <Campo rotulo="Cidade"><Input value={r.cidade} onChange={(e) => set("cidade", e.target.value)} /></Campo>
            <Campo rotulo="UF"><Input value={r.uf} maxLength={2} onChange={(e) => set("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></Campo>
            <Campo rotulo="Veículo"><Input value={r.modelo} onChange={(e) => set("modelo", e.target.value)} placeholder="Hilux 2019" /></Campo>
            <Campo rotulo="Qtd. de veículos"><Input value={r.veiculos} inputMode="numeric" onChange={(e) => set("veiculos", e.target.value.replace(/\D/g, ""))} /></Campo>
            <Campo rotulo="Valor (R$)"><Input value={r.valor} inputMode="decimal" onChange={(e) => set("valor", e.target.value)} /></Campo>
            <Campo rotulo="Tomador da decisão"><Input value={r.tomador_decisao} onChange={(e) => set("tomador_decisao", e.target.value)} /></Campo>
            <Campo rotulo="Responsável"><PessoaSelect valor={r.responsavel_id} onChange={(v) => set("responsavel_id", v)} pessoas={pessoas} vazio="Ninguém" /></Campo>
            <Campo rotulo="Primeiro contato"><DatePickerInput value={r.primeiro_contato_em} onChange={(v) => set("primeiro_contato_em", v)} /></Campo>
            <Campo rotulo="Último contato"><DatePickerInput value={r.ultimo_contato_em} onChange={(v) => set("ultimo_contato_em", v)} /></Campo>
            <Campo rotulo="Retomar contato em"><DateTimePicker value={r.proximo_contato_em} onChange={(v) => set("proximo_contato_em", v)} /></Campo>
          </section>

          <section className="space-y-3 rounded-xl border p-3">
            <h3 className="text-sm font-semibold">Execução</h3>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Técnico"><PessoaSelect valor={r.tecnico_id} onChange={(v) => set("tecnico_id", v)} pessoas={pessoas} vazio="A definir" /></Campo>
              <Campo rotulo="Data e hora"><DateTimePicker value={r.agendado_para} onChange={(v) => set("agendado_para", v)} /></Campo>
              <Campo rotulo="Duração">
                <Select value={r.duracao_min} onValueChange={(v) => set("duracao_min", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[30, 60, 90, 120, 180, 240, 480].map((m) => <SelectItem key={m} value={String(m)}>{m < 60 ? `${m} min` : `${m / 60} h`.replace(".5", ",5")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo rotulo="Parceiro (licenciado)"><Input value={r.parceiro} onChange={(e) => set("parceiro", e.target.value)} /></Campo>
              <Campo rotulo="Local" className="col-span-2"><Input value={r.local_execucao} onChange={(e) => set("local_execucao", e.target.value)} placeholder="Endereço ou loja" /></Campo>
            </div>
            {falta && <p className="text-xs text-amber-600">{falta}</p>}
            {gcal && (
              <a href={gcal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <CalendarPlus className="h-3.5 w-3.5" /> Adicionar ao Google Agenda
              </a>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 rounded-xl border p-3">
            <h3 className="col-span-2 text-sm font-semibold">Fechamento</h3>
            <Campo rotulo="Pago para">
              <Select value={r.pago_para || NENHUM} onValueChange={(v) => set("pago_para", v === NENHUM ? "" : (v as PagoPara))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>—</SelectItem>
                  <SelectItem value="carbovapt">CarboVAPT</SelectItem>
                  <SelectItem value="licenciado">Licenciado</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo rotulo="Data do fechamento"><DatePickerInput value={r.fechamento_em} onChange={(v) => set("fechamento_em", v)} /></Campo>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Checkbox checked={r.pos_venda_nf} onCheckedChange={(v) => set("pos_venda_nf", v === true)} /> Pós-venda: NF emitida
            </label>
            {r.etapa === "perdido" && (
              <Campo rotulo="Motivo da perda" className="col-span-2"><Input value={r.motivo_perda} onChange={(e) => set("motivo_perda", e.target.value)} /></Campo>
            )}
          </section>

          <Campo rotulo="Anotações"><Textarea rows={4} value={r.anotacoes} onChange={(e) => set("anotacoes", e.target.value)} /></Campo>

          {lead && (
            <section>
              <button type="button" onClick={() => setVerHistorico((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <History className="h-3.5 w-3.5" /> Histórico
              </button>
              {verHistorico && (
                <ol className="mt-2 space-y-1.5 border-l pl-3 text-xs">
                  {eventos.isLoading && <li><Loader2 className="h-3 w-3 animate-spin" /></li>}
                  {(eventos.data ?? []).map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2">
                      <span className="tabular-nums text-muted-foreground">{fmtQuando(e.em)}</span>
                      <span>{textoEvento(e, nomeDe)}</span>
                      {e.user_id && <span className="text-muted-foreground">· {nomeDe(e.user_id)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          {lead && (
            <Button variant="ghost" size="sm" onClick={arquivar} disabled={salvando}>
              {lead.arquivado_em ? <><ArchiveRestore className="mr-1.5 h-4 w-4" />Restaurar</> : <><Archive className="mr-1.5 h-4 w-4" />Arquivar</>}
            </Button>
          )}
          <span className="ml-auto h-2.5 w-2.5 rounded-full" style={{ background: COR_ETAPA[r.etapa] }} />
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={!podeSalvar}>
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{lead ? "Salvar" : "Criar lead"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
