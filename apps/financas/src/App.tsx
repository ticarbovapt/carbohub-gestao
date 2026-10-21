import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Compras from "./pages/Compras";
import Recebiveis from "./pages/Recebiveis";
import FluxoCaixa from "./pages/FluxoCaixa";
import { ContasPagar, Assinaturas, Fornecedores, FormasPagamento, PainelFinanceiro } from "./pages/TelasFinanceiras";
import Suprimentos from "./pages/Suprimentos";
import Orders from "./pages/Orders";
import Faturamento from "./pages/Faturamento";
import BlingIntegracao from "./pages/integracoes/Bling";
import BlingCallback from "./pages/integracoes/BlingCallback";
import Bling2Integracao from "./pages/integracoes/Bling2";
import Bling2Callback from "./pages/integracoes/Bling2Callback";
import NfseNacional from "./pages/integracoes/NfseNacional";
import Profile from "./pages/Profile";
import MinhaEquipe from "./pages/MinhaEquipe";
import BugReports from "./pages/BugReports";
import Vender from "./pages/Vender";
import Comissionamento from "./pages/Comissionamento";
import Funcionarios from "./pages/Funcionarios";
import { PaginaNaoEncontrada } from "@carbo/shell";

// ⚠️ `<Navigate>` DESCARTA a query — e é a query que carrega filtro e período
// (`?status=atrasado`). O redirecionamento copia `search` e `hash`.
function IrPara({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

// Abas antigas de /compras → o endereço novo de cada uma, direto (sem cadeia
// de dois saltos). As quatro etapas de compra continuam em /compras/<etapa>.
const ABA_ANTIGA: Record<string, string> = {
  pagar: "/pagar",
  recebiveis: "/receber",
  fluxo: "/fluxo-caixa",
  fornecedores: "/cadastros/fornecedores",
  cartoes: "/cadastros/formas-pagamento",
  assinaturas: "/pagar/assinaturas",
  dashboard: "/painel-financeiro",
};
const ETAPAS_COMPRA = ["requisicoes", "ordens", "recebimento", "notas"];

function ComprasOuAntiga() {
  const { pathname } = useLocation();
  const tab = pathname.split("/")[2] ?? "";
  if (ABA_ANTIGA[tab]) return <IrPara to={ABA_ANTIGA[tab]} />;
  if (!ETAPAS_COMPRA.includes(tab)) return <IrPara to="/compras/requisicoes" />;
  return <Compras />;
}

// Carbo Finanças. Acesso liberado pelo Admin via flag carbo_financas
// (ProtectedRoute). Telas portadas 1:1 do Carbo Controle.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        {/* Compras = só o fluxo de compra. As outras dez abas do antigo
            "Financeiro & Suprimentos" ganharam rota própria (21/10/2026). */}
        <Route path="/compras" element={<IrPara to="/compras/requisicoes" />} />
        <Route path="/compras/:tab" element={<ComprasOuAntiga />} />
        <Route path="/pagar" element={<ContasPagar />} />
        <Route path="/pagar/assinaturas" element={<Assinaturas />} />
        <Route path="/receber" element={<Recebiveis />} />
        <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
        <Route path="/cadastros/fornecedores" element={<Fornecedores />} />
        <Route path="/cadastros/formas-pagamento" element={<FormasPagamento />} />
        <Route path="/painel-financeiro" element={<PainelFinanceiro />} />
        {/* Endereços aposentados — favorito e link mandado a alguém continuam abrindo. */}
        <Route path="/financeiro" element={<IrPara to="/" />} />
        <Route path="/recebiveis" element={<IrPara to="/receber" />} />
        <Route path="/dashboard-financeiro" element={<IrPara to="/painel-financeiro" />} />
        <Route path="/suprimentos" element={<Suprimentos />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/faturamento" element={<Faturamento />} />
        <Route path="/comissionamento" element={<Comissionamento />} />
        <Route path="/funcionarios" element={<Funcionarios />} />
        <Route path="/integracoes/bling" element={<BlingIntegracao />} />
        <Route path="/integracoes/bling/callback" element={<BlingCallback />} />
        {/* Segunda conta Bling — base própria, não cruza com a integração acima */}
        <Route path="/integracoes/bling2" element={<Bling2Integracao />} />
        <Route path="/integracoes/bling2/callback" element={<Bling2Callback />} />
        {/* NFS-e Nacional (ADN gov.br). Sem callback: a autenticação é o
            certificado A1 no servidor, não OAuth — não há volta de navegador. */}
        <Route path="/integracoes/nfse" element={<NfseNacional />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/vender" element={<Vender />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
