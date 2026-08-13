import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Camera, Trash2, Loader2, MapPin, CloudOff, CheckCircle2,
  TriangleAlert, ImageOff, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRtmChecklist, useRtmMotivos, useRtmFila, useFotosDaVisita, pegarLocal,
  RTM_SKUS, RTM_SKU_LABEL, RTM_RESULTADO_LABEL,
  type RtmChecklistItem,
} from "@/hooks/useRtm";
import {
  rtmLer, rtmResponder, rtmMarcarSku, rtmAdicionarFoto, rtmRemoverFoto, rtmFecharLocal,
  type RtmVisitaLocal, type RtmResultado, type RtmSituacaoSku,
} from "@/lib/rtmFila";
import { prepararFoto } from "@/lib/rtmFoto";

// ─────────────────────────────────────────────────────────────────────────────
// RTM · A visita — check-in feito, conferência, check-out
//
// Responde à terceira pergunta do briefing: "o que aconteceu dentro da visita?".
//
// ── Duas regras de tela que não são estéticas ─────────────────────────────
//
// 1. NADA aqui espera a rede. Toda interação grava no IndexedDB e volta na
//    hora. O indicador de sincronização é informativo — nunca um bloqueio.
//
// 2. A visita fechada é SÓ LEITURA, e a tela precisa deixar isso óbvio antes
//    do vendedor tentar corrigir. O banco recusa a edição de qualquer jeito
//    (trigger de congelamento); descobrir isso por mensagem de erro seria uma
//    experiência de sistema que não confia em quem usa.
// ─────────────────────────────────────────────────────────────────────────────

export default function RtmVisita() {
  const [params] = useSearchParams();
  const chave = params.get("v");
  const somenteLeitura = params.get("ver") === "1";

  if (!chave) return <SemVisita />;
  return somenteLeitura ? <VisitaSalva id={chave} /> : <VisitaEmCampo clientUuid={chave} />;
}

function SemVisita() {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-md mx-auto text-center space-y-3">
      <p className="text-sm text-muted-foreground">Nenhuma visita selecionada.</p>
      <Button variant="outline" onClick={() => navigate("/rtm/agenda")}>Voltar para a agenda</Button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// A visita em campo
// ═════════════════════════════════════════════════════════════════════════════

function VisitaEmCampo({ clientUuid }: { clientUuid: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { online, visitas } = useRtmFila();
  const { data: checklist } = useRtmChecklist();
  const { data: motivos } = useRtmMotivos();

  const [v, setV] = useState<RtmVisitaLocal | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [fechando, setFechando] = useState(false);

  // Desfecho
  const [resultado, setResultado] = useState<RtmResultado | "">("");
  const [motivoId, setMotivoId] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");

  const recarregar = useRef(() => {});
  recarregar.current = () => {
    void rtmLer(clientUuid).then((x) => { setV(x ?? null); setCarregando(false); });
  };

  useEffect(() => { recarregar.current(); }, [clientUuid, visitas.length]);

  // Cronômetro da visita. É o "tempo em PDV" do briefing, e mostrá-lo enquanto
  // corre não é enfeite: o vendedor vê o número que vai ser medido, na hora em
  // que ainda pode influenciá-lo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const motivoEscolhido = useMemo(
    () => (motivos ?? []).find((m) => m.id === motivoId) ?? null,
    [motivos, motivoId],
  );

  // "PDV fechado" e "não fui atendido" dispensam conferência e foto: não existe
  // expositor para fotografar com a porta fechada, e exigir a foto ensinaria o
  // vendedor a fotografar qualquer coisa para o sistema deixar passar.
  const semConferencia = resultado === "pdv_fechado" || resultado === "nao_atendido";

  if (carregando) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> Abrindo visita...
    </div>;
  }

  if (!v) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-3">
        <p className="text-sm font-medium">Visita não encontrada neste aparelho.</p>
        <p className="text-xs text-muted-foreground">
          Se ela já foi enviada, abra pela agenda. Visitas sincronizadas são
          limpas do aparelho depois de um dia.
        </p>
        <Button variant="outline" onClick={() => navigate("/rtm/agenda")}>Voltar para a agenda</Button>
      </div>
    );
  }

  const jaFechada = !!v.fechamento;
  const minutos = Math.max(0, Math.round((agora - new Date(v.ts_dispositivo_checkin).getTime()) / 60000));

  const obrigatoriosFaltando = (checklist ?? []).filter(
    (i) => i.obrigatorio && !temResposta(v, i),
  );
  const temFotoExpositor = v.fotos.some((f) => f.tipo === "expositor");

  async function fechar() {
    if (!resultado) { toast.error("Escolha o resultado da visita."); return; }
    if (resultado !== "pedido" && !motivoId) { toast.error("Informe o motivo."); return; }
    if (motivoEscolhido?.exige_texto && !motivoTexto.trim()) {
      toast.error("Este motivo pede uma descrição."); return;
    }
    if (!semConferencia && obrigatoriosFaltando.length > 0) {
      toast.error("Falta responder: " + obrigatoriosFaltando.map((i) => i.label).join(", ")); return;
    }
    if (!semConferencia && !temFotoExpositor) {
      toast.error("Falta a foto do expositor."); return;
    }

    setFechando(true);
    try {
      const geo = await pegarLocal();
      await rtmFecharLocal(clientUuid, {
        resultado: resultado as RtmResultado,
        motivo_id: motivoId || null,
        motivo_texto: motivoTexto.trim() || null,
        proximo_passo: proximoPasso.trim() || null,
        proximo_passo_em: null,
        ts_dispositivo: new Date().toISOString(),
        geo,
      });
      toast.success(online ? "Visita concluída e enviada." : "Visita concluída. Sobe quando o sinal voltar.");
      navigate("/rtm/agenda");
    } catch (e) {
      toast.error("Não deu para concluir: " + ((e as { message?: string })?.message ?? ""));
    } finally {
      setFechando(false);
    }
  }

  return (
    <div className="p-4 md:p-6 pb-28">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* ── Cabeçalho ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
            onClick={() => navigate("/rtm/agenda")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">{v.pdv_nome}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {minutos} min em visita
              </span>
              {v.geo_checkin.lat != null ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> local registrado
                </span>
              ) : (
                // Não esconder isto: se o GPS falhou, quem estava lá é a única
                // pessoa que pode dizer, e o gestor precisa saber que a
                // distância vai sair vazia nessa visita.
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <MapPin className="h-3 w-3" /> sem GPS
                </span>
              )}
              {!online && (
                <span className="inline-flex items-center gap-1"><CloudOff className="h-3 w-3" /> offline</span>
              )}
            </p>
          </div>
        </div>

        {jaFechada && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Visita concluída. {v.estado === "pronta" ? "Já enviada." : "Aguardando envio."}
          </div>
        )}

        {/* ── Desfecho primeiro ─────────────────────────────────────────────
            De propósito no topo: é a única resposta obrigatória, e escolher
            "PDV fechado" some com a conferência inteira. Deixar isso no fim
            faria o vendedor preencher um formulário para depois descobrir
            que não precisava. */}
        <Bloco titulo="Como foi a visita?">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RTM_RESULTADO_LABEL) as RtmResultado[]).map((r) => (
              <button key={r} type="button" disabled={jaFechada}
                onClick={() => setResultado(r)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition ${
                  resultado === r ? "border-primary bg-primary/10" : "hover:bg-muted"
                } ${jaFechada ? "opacity-60" : ""}`}>
                {RTM_RESULTADO_LABEL[r]}
              </button>
            ))}
          </div>

          {resultado && resultado !== "pedido" && (
            <div className="space-y-2 pt-1">
              <Label className="text-xs">Motivo</Label>
              <Select value={motivoId} onValueChange={setMotivoId} disabled={jaFechada}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o motivo" /></SelectTrigger>
                <SelectContent>
                  {(motivos ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Só o motivo marcado como "exige texto" abre a caixa — a lista
                  é fechada porque texto livre não ranqueia e não vira decisão. */}
              {motivoEscolhido?.exige_texto && (
                <Textarea rows={2} value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)}
                  placeholder="Descreva o motivo" disabled={jaFechada} />
              )}
            </div>
          )}
        </Bloco>

        {!semConferencia && (
          <>
            {/* ── Conferência ─────────────────────────────────────────── */}
            <Bloco titulo="Conferência no PDV"
              nota={obrigatoriosFaltando.length > 0
                ? `${obrigatoriosFaltando.length} item(ns) obrigatório(s) em aberto`
                : undefined}>
              {(checklist ?? []).map((item) => (
                <ItemChecklist key={item.id} item={item} visita={v} travado={jaFechada}
                  onMudou={recarregar.current} clientUuid={clientUuid} />
              ))}
              {(checklist ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum item de conferência configurado.</p>
              )}
            </Bloco>

            {/* ── Prateleira ──────────────────────────────────────────── */}
            <Bloco titulo="O que tinha na prateleira"
              nota="'Não trabalha' é diferente de 'zerado' — só o zerado conta como ruptura.">
              <div className="space-y-2">
                {RTM_SKUS.map((sku) => (
                  <div key={sku} className="flex items-center gap-2">
                    <span className="text-sm flex-1 min-w-0 truncate">{RTM_SKU_LABEL[sku]}</span>
                    <div className="flex gap-1 shrink-0">
                      {([["tem", "Tem"], ["zerado", "Zerado"], ["nao_trabalha", "Não trabalha"]] as
                        [RtmSituacaoSku, string][]).map(([valor, label]) => (
                        <button key={valor} type="button" disabled={jaFechada}
                          onClick={() => { void rtmMarcarSku(clientUuid, sku, valor).then(recarregar.current); }}
                          className={`px-2 py-1 rounded-md border text-[11px] ${
                            v.skus[sku]?.situacao === valor
                              ? valor === "zerado"
                                ? "border-amber-500 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                                : "border-primary bg-primary/10"
                              : "hover:bg-muted"
                          } ${jaFechada ? "opacity-60" : ""}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Bloco>

            {/* ── Fotos ───────────────────────────────────────────────── */}
            <Bloco titulo="Fotos"
              nota={temFotoExpositor ? undefined : "Falta a foto do expositor."}>
              <Fotos visita={v} clientUuid={clientUuid} travado={jaFechada} onMudou={recarregar.current} />
            </Bloco>
          </>
        )}

        {/* ── Próximo passo ────────────────────────────────────────────── */}
        <Bloco titulo="Próximo passo (opcional)">
          <Textarea rows={2} value={proximoPasso} onChange={(e) => setProximoPasso(e.target.value)}
            placeholder="Voltar dia 20 com o gerente, levar wobbler novo..." disabled={jaFechada} />
        </Bloco>
      </div>

      {/* ── Barra de conclusão ─────────────────────────────────────────────
          Fixa no rodapé porque em campo a tela é um celular na mão e o botão
          precisa estar sob o polegar, não no fim de uma rolagem longa. */}
      {!jaFechada && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur p-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0 text-xs text-muted-foreground">
              {!resultado ? "Escolha como foi a visita" :
               (!semConferencia && (obrigatoriosFaltando.length > 0 || !temFotoExpositor))
                 ? "Conferência incompleta"
                 : "Tudo pronto para concluir"}
            </div>
            <Button onClick={fechar} disabled={fechando} className="gap-1.5">
              {fechando && <Loader2 className="h-4 w-4 animate-spin" />}
              Concluir visita
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function temResposta(v: RtmVisitaLocal, item: RtmChecklistItem) {
  const r = v.respostas[item.id];
  if (!r) return false;
  return r.resposta != null || r.numero != null || !!(r.texto ?? "").trim();
}

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {nota && <p className="text-[11px] text-amber-600 mt-0.5">{nota}</p>}
        </div>
        {children}
      </CarboCardContent>
    </CarboCard>
  );
}

function ItemChecklist({
  item, visita, travado, clientUuid, onMudou,
}: {
  item: RtmChecklistItem; visita: RtmVisitaLocal; travado: boolean;
  clientUuid: string; onMudou: () => void;
}) {
  const atual = visita.respostas[item.id] ?? {};
  const opcoes: ["sim" | "nao" | "na", string][] =
    item.tipo === "sim_nao" ? [["sim", "Sim"], ["nao", "Não"]]
                            : [["sim", "Sim"], ["nao", "Não"], ["na", "N.A."]];

  const marcar = (valor: "sim" | "nao" | "na") =>
    void rtmResponder(clientUuid, item.id, { resposta: valor }).then(onMudou);

  return (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-tight">
          {item.label}
          {item.obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
        </p>
        {item.ajuda && <p className="text-[11px] text-muted-foreground mt-0.5">{item.ajuda}</p>}
      </div>

      {item.tipo === "numero" ? (
        <Input type="number" inputMode="numeric" disabled={travado} className="h-8 w-24 shrink-0"
          value={atual.numero ?? ""}
          onChange={(e) => void rtmResponder(clientUuid, item.id, {
            numero: e.target.value === "" ? undefined : Number(e.target.value),
          }).then(onMudou)} />
      ) : item.tipo === "texto" ? (
        <Input disabled={travado} className="h-8 w-40 shrink-0" value={atual.texto ?? ""}
          onChange={(e) => void rtmResponder(clientUuid, item.id, { texto: e.target.value }).then(onMudou)} />
      ) : (
        <div className="flex gap-1 shrink-0">
          {opcoes.map(([valor, label]) => {
            // "Não" fica em âmbar só nos itens em que "não" é problema. Marcar
            // tudo de vermelho ensinaria o vendedor a evitar a resposta certa.
            const problema = valor === "nao" && !item.nao_e_problema;
            const escolhido = atual.resposta === valor;
            return (
              <button key={valor} type="button" disabled={travado} onClick={() => marcar(valor)}
                className={`px-2.5 py-1 rounded-md border text-xs ${
                  escolhido
                    ? problema
                      ? "border-amber-500 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                      : "border-primary bg-primary/10"
                    : "hover:bg-muted"
                } ${travado ? "opacity-60" : ""}`}>
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Fotos({
  visita, clientUuid, travado, onMudou,
}: { visita: RtmVisitaLocal; clientUuid: string; travado: boolean; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // A prévia precisa de object URL, e object URL vaza se ninguém revogar.
  useEffect(() => {
    const mapa: Record<string, string> = {};
    for (const f of visita.fotos) mapa[f.id] = URL.createObjectURL(f.blob);
    setUrls(mapa);
    return () => Object.values(mapa).forEach((u) => URL.revokeObjectURL(u));
  }, [visita.fotos]);

  async function capturar(e: React.ChangeEvent<HTMLInputElement>, tipo: "expositor" | "outro") {
    const arquivo = e.target.files?.[0];
    e.target.value = "";                       // permite refotografar o mesmo item
    if (!arquivo) return;
    setOcupado(true);
    try {
      const blob = await prepararFoto(arquivo);
      const geo = await pegarLocal(4000);
      await rtmAdicionarFoto(clientUuid, {
        tipo, blob,
        ts_dispositivo: new Date().toISOString(),
        lat: geo.lat, lng: geo.lng,
      });
      onMudou();
    } catch {
      toast.error("Não deu para usar essa foto. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      {visita.fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {visita.fotos.map((f) => (
            <div key={f.id} className="relative rounded-lg overflow-hidden border aspect-square">
              {urls[f.id]
                ? <img src={urls[f.id]} alt={f.tipo} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center bg-muted">
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                  </div>}
              <Badge className="absolute top-1 left-1 text-[9px] px-1 py-0">{f.tipo}</Badge>
              {!travado && (
                <button type="button"
                  onClick={() => void rtmRemoverFoto(clientUuid, f.id).then(onMudou)}
                  className="absolute bottom-1 right-1 rounded-md bg-background/90 p-1">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!travado && (
        <div className="flex gap-2">
          {/* `capture="environment"` abre a câmera traseira direto no celular.
              No desktop o atributo é ignorado e vira seleção de arquivo — o que
              é o comportamento certo para quem está revisando de escritório. */}
          <BotaoFoto label="Foto do expositor" destaque={!visita.fotos.some((f) => f.tipo === "expositor")}
            ocupado={ocupado} onArquivo={(e) => capturar(e, "expositor")} />
          <BotaoFoto label="Outra foto" ocupado={ocupado} onArquivo={(e) => capturar(e, "outro")} />
        </div>
      )}
    </div>
  );
}

function BotaoFoto({
  label, destaque, ocupado, onArquivo,
}: {
  label: string; destaque?: boolean; ocupado: boolean;
  onArquivo: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={`flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border text-sm cursor-pointer ${
      destaque ? "border-primary bg-primary/5 font-medium" : ""} ${ocupado ? "opacity-60 pointer-events-none" : ""}`}>
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      {label}
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onArquivo} />
    </label>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Visita já salva — só leitura
// ═════════════════════════════════════════════════════════════════════════════

function VisitaSalva({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: fotos, isLoading } = useFotosDaVisita(id);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/rtm/agenda")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Visita registrada</h1>
        </div>

        <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Visita concluída não pode ser editada — nem aqui nem no banco. Se algo
            está errado, registre uma correção: ela nasce como um novo registro
            ligado a este, com autor e justificativa, e o original continua
            visível. É isso que deixa o histórico auditável.
          </span>
        </div>

        <CarboCard>
          <CarboCardContent className="p-4">
            <h2 className="text-sm font-semibold mb-3">Fotos da conferência</h2>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : (fotos ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem fotos nesta visita.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(fotos ?? []).map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                    className="relative rounded-lg overflow-hidden border aspect-square block">
                    <img src={f.url} alt={f.tipo} className="w-full h-full object-cover" />
                    <Badge className="absolute top-1 left-1 text-[9px] px-1 py-0">{f.tipo}</Badge>
                  </a>
                ))}
              </div>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
