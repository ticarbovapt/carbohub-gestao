import { Link } from "react-router-dom";
import { Headset, MessagesSquare, ShoppingCart, Bug, UserCircle, ArrowRight, type LucideIcon } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { useAuth } from "@/contexts/AuthContext";

// Cor de acento do Carbo Atendimento: ROXO (#9333EA, purple).
//
// ⚠️ Ela aparece em QUATRO lugares e os quatro têm de concordar, senão o mesmo
// app tem duas caras conforme a tela: aqui, no chip de `lib/interfaces.ts` (nas
// TRÊS cópias), no `packages/shell/src/apps.ts` (o seletor de apps) e no
// azulejo do Hub (`carbohub-landing/src/lib/apps.ts` + `.access-card.purple`).
//
// Roxo e não laranja porque no seletor de apps o Ops já é âmbar (#F59E0B), e
// laranja (#F97316) ao lado dele vira a mesma cor a um metro de distância.
const ACENTO = "#9333EA";

type Atalho = { to: string; label: string; icon: LucideIcon };

// Só o que EXISTE hoje. As telas de atendimento entram aqui quando existirem —
// card apontando para tela vazia é pior que card ausente.
const ATALHOS: Atalho[] = [
  { to: "/chat", label: "Carbo Chat", icon: MessagesSquare },
  { to: "/vender", label: "Vender", icon: ShoppingCart },
  { to: "/chamados", label: "Bugs e sugestões", icon: Bug },
  { to: "/perfil", label: "Meu perfil", icon: UserCircle },
];

export default function Home() {
  const { profile } = useAuth();
  const primeiroNome = (profile?.full_name ?? "").split(" ")[0];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        <CarboPageHeader
          title={primeiroNome ? `Olá, ${primeiroNome}` : "Carbo Atendimento"}
          icon={Headset}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ATALHOS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="block rounded-xl">
            <CarboCard variant="interactive" padding="none" className="h-full">
              <CarboCardContent className="p-4 flex items-center gap-3">
                <span
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${ACENTO}1A`, color: ACENTO }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 flex items-center gap-1.5 text-sm font-semibold">
                  {label} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </CarboCardContent>
            </CarboCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
