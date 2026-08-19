import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, Boxes, Layers, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ProdutosMrp from "./ProdutosMrp";
import Skus from "./Skus";
import Lotes from "./Lotes";
import FornecedoresMrp from "./FornecedoresMrp";

// ─────────────────────────────────────────────────────────────────────────────
// MRP — as quatro telas do cadastro sob um item só da sidebar
//
// Produtos, SKUs, Lotes e Fornecedores ocupavam quatro linhas da sidebar e são
// a mesma pergunta em quatro recortes: "o que existe no cadastro". Quem entra
// em uma quase sempre precisa da outra logo em seguida — SKU sem produto não
// significa nada, lote sem SKU também não.
//
// ⚠️ As telas NÃO foram tocadas. Esta casca só desenha a fita de botões e
// monta o componente da aba escolhida; cada página continua com o próprio
// cabeçalho, os próprios dados e o próprio arquivo. Fundir os quatro num
// arquivo só seria reescrever quatro telas que já funcionam para ganhar
// exatamente nada.
//
// ⚠️ A aba vive na URL (`/producao/mrp/:aba`), não em estado local. É o mesmo
// desenho de `/logistica/:aba`, e pelos mesmos três motivos: o link é
// compartilhável, o F5 volta no mesmo lugar e o botão voltar do navegador
// funciona. Estado local aqui faria o "voltar" pular a tela inteira.
// ─────────────────────────────────────────────────────────────────────────────

const ABAS = [
  { id: "produtos",     label: "Produtos",     icon: Package,   Tela: ProdutosMrp },
  { id: "skus",         label: "SKUs",         icon: Boxes,     Tela: Skus },
  { id: "lotes",        label: "Lotes",        icon: Layers,    Tela: Lotes },
  { id: "fornecedores", label: "Fornecedores", icon: Building2, Tela: FornecedoresMrp },
] as const;

const ABA_PADRAO = ABAS[0].id;

export default function Mrp() {
  const { aba } = useParams<{ aba?: string }>();
  const navigate = useNavigate();

  // Aba desconhecida cai na padrão em vez de dar tela branca: link velho,
  // typo na URL e aba removida no futuro têm todos o mesmo destino sensato.
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  // `/producao/mrp` sem aba (ou com aba inválida) vira a canônica. `replace`
  // para não empilhar no histórico — senão o voltar do navegador ficaria preso
  // alternando entre a URL curta e a completa.
  useEffect(() => {
    if (aba !== atual.id) navigate(`/producao/mrp/${atual.id}`, { replace: true });
  }, [aba, atual.id, navigate]);

  const Tela = atual.Tela;

  return (
    <div className="flex flex-col">
      {/* A fita fica FORA do padding das telas e grudada no topo: cada uma das
          quatro tem o próprio cabeçalho logo abaixo, e empurrá-lo para longe
          faria a tela parecer outra a cada troca de aba. */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur px-4 md:px-6 pt-3 pb-0">
        <nav className="flex flex-wrap gap-1" aria-label="Seções do MRP">
          {ABAS.map((a) => {
            const ativo = a.id === atual.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/producao/mrp/${a.id}`)}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition-colors",
                  ativo
                    ? "border-border bg-background text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <a.icon className="h-4 w-4 shrink-0" />
                {a.label}
              </button>
            );
          })}
        </nav>
      </div>

      <Tela />
    </div>
  );
}
