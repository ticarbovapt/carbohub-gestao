import { useNavigate } from "react-router-dom";
import { Target, MessagesSquare, ShoppingCart, Bug, UserCircle, ArrowRight, type LucideIcon, KanbanSquare, ShoppingBag, BarChart3 } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { useAuth } from "@/contexts/AuthContext";

// Cor de acento do Carbo Pré-Vendas: LIMA (#65A30D, lime-600).
//
// ⚠️ Ela aparece em QUATRO lugares e os quatro têm de concordar, senão o mesmo
// app tem duas caras conforme a tela: aqui, no chip de `lib/interfaces.ts` (do
// admin e do ti), no `packages/shell/src/apps.ts` (o seletor de apps) e no
// azulejo do Hub (`carbohub-landing/src/lib/apps.ts`).
//
// Escolhida por MEDIDA de matiz contra as cores já usadas no seletor (06/10/2026):
// lima fica a 47° do Ops e a 57° do Portal de Vendas — a única candidata acima
// de 45°. Ciano caía a 10° do TI e do Licenciados; rosa, a 16° do Marketing;
// vermelho, além de colado no md, lê como erro ao lado da tarja de status.
const ACENTO = "#65A30D";

type Atalho = { to: string; label: string; hint: string; icon: LucideIcon };

// Só o que EXISTE hoje. As telas de pré-vendas entram aqui quando existirem —
// card apontando para tela vazia é pior que card ausente.
const ATALHOS: Atalho[] = [
  { to: "/crm/pipelines", label: "Pipeline", hint: "Os leads em cada etapa, do contato ao closer", icon: KanbanSquare },
  { to: "/vendas", label: "Vendas", hint: "O que o closer fechou a partir do SDR", icon: ShoppingBag },
  { to: "/resultados", label: "Resultados", hint: "Repassados, fechados e conversão", icon: BarChart3 },
  { to: "/chat", label: "Carbo Chat", hint: "Falar com o time, ao vivo", icon: MessagesSquare },
  { to: "/vender", label: "Vender", hint: "Registrar uma venda ou orçamento", icon: ShoppingCart },
  { to: "/bugs", label: "Bugs e sugestões", hint: "O que você reportou ao TI", icon: Bug },
  { to: "/perfil", label: "Meu perfil", hint: "Foto, dados e departamento", icon: UserCircle },
];

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const primeiroNome = (profile?.full_name ?? "").split(" ")[0];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        <CarboPageHeader
          title={primeiroNome ? `Olá, ${primeiroNome}` : "Carbo Pré-Vendas"}
          description="O app da pré-venda: a pipeline dos SDRs, do primeiro contato ao repasse para o closer."
          icon={Target}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ATALHOS.map(({ to, label, hint, icon: Icon }) => (
            <CarboCard key={to} variant="interactive" padding="none" onClick={() => navigate(to)}>
              <CarboCardContent className="p-4 flex items-start gap-3">
                <span
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${ACENTO}1A`, color: ACENTO }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {label} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
                </span>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>
      </div>
    </div>
  );
}
