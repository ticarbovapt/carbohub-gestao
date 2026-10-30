import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShoppingCart, Plus, FileText, Package, CheckCircle2, Receipt } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { usePurchasingBadges } from "@/hooks/usePurchasing";
import { PurchaseRequestsList } from "@/components/purchasing/PurchaseRequestsList";
import { PurchaseOrdersList } from "@/components/purchasing/PurchaseOrdersList";
import { ReceivingsList } from "@/components/purchasing/ReceivingsList";
import { InvoicesList } from "@/components/purchasing/InvoicesList";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Compras = SÓ o fluxo de compra: requisição → ordem → recebimento → NF.
//
// Até 21/10/2026 esta página era "Financeiro & Suprimentos", com onze abas
// (contas a pagar, a receber, fluxo de caixa, cadastros e painel junto), cinco
// cartões e o botão "Nova Requisição" em todas elas. Cada área ganhou rota
// própria (/pagar, /receber, /fluxo-caixa, /fornecedores, /formas-pagamento, /painel-financeiro);
// os endereços antigos /compras/<aba> redirecionam (App.tsx).
//
// ⚠️ As abas são <Link>, não `onClick` + navigate: só link de verdade abre em
// nova guia. E a contagem de cada aba é a fila dela — os cinco cartões de
// cima saíram porque repetiam essas contagens com regras diferentes.
// ─────────────────────────────────────────────────────────────────────────────

const ABAS = [
  { key: "requisicoes", label: "Requisições", icon: FileText },
  { key: "ordens", label: "Ordens de compra", icon: Package },
  { key: "recebimento", label: "Recebimento", icon: CheckCircle2 },
  { key: "notas", label: "NF de compra", icon: Receipt },
] as const;

type Aba = (typeof ABAS)[number]["key"];

function Contagem({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none bg-warning text-warning-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export default function Compras() {
  const { tab } = useParams();
  const aba: Aba = (ABAS.find((a) => a.key === tab)?.key ?? "requisicoes") as Aba;
  const [novaRC, setNovaRC] = useState(false);
  const { data: badges } = usePurchasingBadges();

  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Compras"
        icon={ShoppingCart}
        actions={
          aba === "requisicoes" ? (
            <Button onClick={() => setNovaRC(true)} className="gap-2 carbo-gradient text-white">
              <Plus className="h-4 w-4" />
              Nova requisição
            </Button>
          ) : undefined
        }
      />

      <nav className="flex gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1" aria-label="Etapas da compra">
        {ABAS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            to={`/compras/${key}`}
            aria-current={aba === key ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              aba === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <Contagem n={(badges as Record<string, number> | undefined)?.[key]} />
          </Link>
        ))}
      </nav>

      {aba === "requisicoes" && <PurchaseRequestsList showNewForm={novaRC} onCloseForm={() => setNovaRC(false)} />}
      {aba === "ordens" && <PurchaseOrdersList />}
      {aba === "recebimento" && <ReceivingsList />}
      {aba === "notas" && <InvoicesList />}
    </div>
  );
}
