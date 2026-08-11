import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Save, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Send, Eye,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConexaoWhatsApp } from "@/components/ConexaoWhatsApp";
import {
  useTemplatesMsg, useSalvarTemplate, useEnviosMsg, useFilaMsg,
  montarPreview, VARIAVEIS, EXEMPLO,
  type TemplateMsg, type EtapaMsg,
} from "@/hooks/useMensagensCliente";

/**
 * Mensagens automáticas ao cliente.
 *
 * Aqui se escreve o que o cliente recebe a cada avanço da esteira. A tela NÃO
 * dispara nada: quem detecta a movimentação é o banco, quem monta o texto é a
 * edge function `kanban-n8n` e quem entrega é o n8n pelo WhatsApp.
 *
 * ⚠️ Todo texto nasce DESLIGADO. Ligar é uma decisão de quem fala com o
 * cliente, tomada olhando a pré-visualização — não um efeito colateral de rodar
 * uma migração.
 */

/** ⚠️ Os nomes têm de ser os MESMOS da esteira. Eu tinha chamado `em_transito`
 *  de "Saiu para entrega" — e como sair para entrega é outro fato, dias depois,
 *  parecia faltar a mensagem do rastreio, que existia com o nome errado. */
const NOME_ETAPA: Record<EtapaMsg, string> = {
  confirmado:   "Confirmado",
  nf_emitida:   "NF emitida",
  etiqueta:     "Etiqueta gerada",
  em_transito:  "Em trânsito",
  saiu_entrega: "Saiu para entrega",
  entregue:     "Entregue",
  recompra:     "Recompra",
};

const QUANDO: Record<EtapaMsg, string> = {
  confirmado:   "assim que o pedido é atendido no Bling",
  nf_emitida:   "quando a nota é autorizada",
  etiqueta:     "quando o rastreio é gerado, antes da coleta",
  em_transito:  "quando a transportadora confirma o envio — é aqui que vai o código e o link",
  saiu_entrega: "quando o rastreio mostra que saiu para o último trecho, no dia da entrega",
  entregue:     "quando a entrega é confirmada",
  // A única que não é etapa da esteira: dispara pela régua da segunda
  // pipeline, contando dias a partir do carimbo de entrega.
  recompra:     "dias após a entrega, para o cliente repor — ver a régua de recompra",
};

/** Etapa que não é coluna da esteira. O aviso explica de onde ela vem, senão
 *  alguém procura essa coluna no quadro e não acha. */
const FORA_DO_QUADRO: Partial<Record<EtapaMsg, string>> = {
  saiu_entrega: "Não é coluna da esteira — vem do rastreio da transportadora.",
};

function Editor({ t }: { t: TemplateMsg }) {
  const salvar = useSalvarTemplate();
  const [rascunho, setRascunho] = useState(t);
  useEffect(() => setRascunho(t), [t]);

  const mudou =
    rascunho.texto !== t.texto ||
    rascunho.ativo !== t.ativo ||
    rascunho.atraso_min !== t.atraso_min;

  const preview = useMemo(() => montarPreview(rascunho.texto, EXEMPLO), [rascunho.texto]);

  /** Variável escrita errada não some calada: ela aparece aqui, e o texto sai
   *  com o marcador cru para o cliente se ninguém corrigir. */
  const desconhecidas = useMemo(() => {
    const usadas = [...rascunho.texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    const validas = new Set(VARIAVEIS.map((v) => v.chave));
    return [...new Set(usadas.filter((u) => !validas.has(u)))];
  }, [rascunho.texto]);

  const inserir = (chave: string) =>
    setRascunho((r) => ({ ...r, texto: `${r.texto}{{${chave}}}` }));

  return (
    <CarboCard className={rascunho.ativo ? "" : "opacity-75"}>
      <CarboCardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {NOME_ETAPA[t.etapa]}
              {rascunho.ativo
                ? <CarboBadge variant="secondary" className="text-emerald-500">ligada</CarboBadge>
                : <CarboBadge variant="secondary">desligada</CarboBadge>}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Dispara {QUANDO[t.etapa]}.</p>
            {FORA_DO_QUADRO[t.etapa] && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">{FORA_DO_QUADRO[t.etapa]}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">enviar</span>
            <Switch checked={rascunho.ativo}
                    onCheckedChange={(v) => setRascunho((r) => ({ ...r, ativo: v }))} />
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">
            <Textarea
              value={rascunho.texto}
              onChange={(e) => setRascunho((r) => ({ ...r, texto: e.target.value }))}
              rows={9}
              className="resize-y font-mono text-xs leading-relaxed"
            />

            <div className="mt-2 flex flex-wrap gap-1">
              {VARIAVEIS.map((v) => (
                <button key={v.chave} type="button" title={v.descricao}
                        onClick={() => inserir(v.chave)}
                        className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-carbo-green/50 hover:text-foreground">
                  {`{{${v.chave}}}`}
                </button>
              ))}
            </div>

            {desconhecidas.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-500">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                Variável que não existe: {desconhecidas.map((d) => `{{${d}}}`).join(", ")} —
                vai sair assim mesmo para o cliente.
              </p>
            )}

            {t.etapa === "entregue" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">esperar</span>
                <Input type="number" min={0} className="h-8 w-20"
                       value={rascunho.atraso_min}
                       onChange={(e) => setRascunho((r) => ({ ...r, atraso_min: Number(e.target.value) || 0 }))} />
                <span className="text-[11px] text-muted-foreground">
                  minutos após a entrega — perguntar “chegou tudo certo?” no
                  mesmo minuto da baixa é antes de a pessoa abrir a caixa
                </span>
              </div>
            )}
          </div>

          {/* Pré-visualização com a MESMA regra do envio, inclusive a de apagar
              a linha cuja variável está vazia. */}
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3" /> Como chega no WhatsApp
            </div>
            <div className="rounded-lg rounded-bl-sm border bg-carbo-green/5 p-3">
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {preview || <span className="text-muted-foreground">mensagem vazia</span>}
              </p>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Linha cuja variável está vazia é removida — pedido sem link de rastreio
              não manda “Acompanhe aqui:” seguido de nada.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5" disabled={!mudou || salvar.isPending}
                  onClick={() => salvar.mutate(rascunho, {
                    onSuccess: () => toast.success("Mensagem salva"),
                    onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
                  })}>
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
          {mudou && <span className="text-[11px] text-amber-500">alterações não salvas</span>}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {preview.length} caracteres
          </span>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

const ICONE_STATUS = {
  enviado:  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  erro:     <XCircle className="h-3.5 w-3.5 text-red-500" />,
  pendente: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  ignorado: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default function MensagensCliente() {
  const [params] = useSearchParams();
  /* De onde a pessoa veio. A Esteira manda o próprio caminho porque ele muda
     entre os apps; sem o parâmetro (link direto, favorito), o padrão é o do
     admin, que é onde esta tela nasceu. */
  const voltar = params.get("voltar") || "/ecommerce/esteira";

  const { data: templates, isLoading } = useTemplatesMsg();
  const { data: envios } = useEnviosMsg();
  const { data: naFila } = useFilaMsg();

  const ligadas = (templates ?? []).filter((t) => t.ativo).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <CarboPageHeader
        icon={MessageSquare}
        title="Mensagens ao cliente"
        description="O que o cliente recebe no WhatsApp a cada avanço da esteira. O texto se monta aqui; o n8n entrega."
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to={voltar}>
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar à Esteira
              </Link>
            </Button>
            <div className="flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-carbo-green" />
              <span className="text-sm font-semibold tabular-nums">{ligadas}/6</span>
              <span className="text-[11px] text-muted-foreground">ligadas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm font-semibold tabular-nums">{naFila ?? 0}</span>
              <span className="text-[11px] text-muted-foreground">na fila agora</span>
            </div>
          </div>
        }
      />

      {/* Antes dos textos: de nada adianta a redação estar perfeita se o
          número que envia está desconectado. */}
      <ConexaoWhatsApp />

      {ligadas === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <span>
            Nenhuma mensagem está ligada — nada é enviado. Escreva o texto, confira
            a pré-visualização e ligue uma de cada vez.{" "}
            <strong>Pedidos que já existiam não recebem nada</strong>: só quem
            avançar de etapa a partir de agora.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-3">
          {(templates ?? []).map((t) => <Editor key={t.etapa} t={t} />)}
        </div>
      )}

      <CarboCard>
        <CarboCardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Últimos envios</h3>
          {!envios?.length ? (
            <p className="text-[11px] text-muted-foreground">
              Nada enviado ainda. Aqui aparece cada mensagem, com o motivo quando não sai.
            </p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {envios.map((e) => (
                <div key={`${e.bling_id}-${e.etapa}`}
                     className="flex items-center gap-2 border-b border-border/40 py-1.5 text-xs last:border-0">
                  {ICONE_STATUS[e.status]}
                  <span className="shrink-0 font-medium">{NOME_ETAPA[e.etapa as EtapaMsg] ?? e.etapa}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{e.telefone ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {e.motivo ?? e.mensagem?.split("\n")[0] ?? ""}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {new Date(e.enviado_em ?? e.detectado_em).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}
