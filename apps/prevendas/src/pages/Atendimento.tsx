import { MessagesSquare, AlertTriangle, Search, MessageCircle } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";

/**
 * Atendimento do Pré-Vendas — a CASCA da tela de Conversas do Carbo
 * Atendimento, sempre vazia (pedido do dono do processo, 14/10/2026).
 *
 * O time de pré-venda atende hoje pelo WhatsApp Web, sem número da Cloud API.
 * A tela existe para eles verem onde o atendimento vai morar; quando houver um
 * número para o Pré-Vendas, ela passa a ler como a do Atendimento.
 *
 * ⚠️ NÃO lê banco nenhum, e isso é a regra, não preguiça: `carbo_wa_numeros`
 * e `carbo_wa_conversas` são as caixas da EMPRESA (serviço, Clube, loja). Ligar
 * esta tela a elas mostraria ao SDR as conversas dos clientes do e-commerce.
 * Número próprio do Pré-Vendas entra no cadastro com `funcao` própria, e a
 * leitura filtra por ele — nunca "todos os números".
 */
const FILTROS = ["Não respondidas", "Minhas", "Sem responsável", "Janela aberta"];

export default function Atendimento() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Atendimento"
        description="As conversas com os postos no WhatsApp oficial, num lugar só."
      />

      <CarboCard>
        <CarboCardContent className="p-4">
          <p className="flex items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Nenhum número de WhatsApp ativo para o Pré-Vendas.
          </p>
        </CarboCardContent>
      </CarboCard>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr]">
        <CarboCard className="min-h-0 min-w-0 overflow-hidden p-0">
          <CarboCardContent className="flex h-full min-h-0 flex-col gap-0 p-0">
            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5
                                   -translate-y-1/2 text-muted-foreground" />
                <Input disabled placeholder="Buscar por nome ou número…"
                       className="h-10 border-border bg-muted/40 pl-8 text-base sm:h-9 sm:text-xs
                                  placeholder:text-muted-foreground/70" />
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[...FILTROS, "Todas"].map((rotulo) => (
                  <div key={rotulo}
                       className={`flex items-center justify-between gap-1.5 rounded-md border
                                   border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] font-medium
                                   leading-none text-muted-foreground ${
                                     rotulo === "Todas" ? "col-span-2" : ""}`}>
                    <span className="truncate">{rotulo}</span>
                    <span className="min-w-[1.25rem] text-right tabular-nums">0</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <p className="text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
            </div>
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="hidden min-h-0 min-w-0 lg:block">
          <CarboCardContent className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
