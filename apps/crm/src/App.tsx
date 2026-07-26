import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireGestor } from "./components/RequireGestor";
import { SalesShell } from "./components/SalesShell";
import Login from "./pages/Login";
import CRM from "./pages/CRM";
import Pipelines from "./pages/Pipelines";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import Pedidos from "./pages/Pedidos";
import DashboardComercial from "./pages/DashboardComercial";
import Vendas from "./pages/Vendas";
import Metas from "./pages/Metas";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import RequisicaoCompra from "./pages/RequisicaoCompra";
import PosVenda from "./pages/PosVenda";
import DescOrdensServico from "./pages/descarbonizacao/OrdensServico";
import DescAgendamentos from "./pages/descarbonizacao/Agendamentos";
import MapaTerritorial from "./pages/territorio/MapaTerritorial";
import NetworkMap from "./pages/territorio/NetworkMap";
import TerritoryExpansion from "./pages/territorio/TerritoryExpansion";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";

// Login é ÚNICO no Hub: /login direto em produção é redirecionado pra lá.
// Em dev/preview (fora do domínio) mostra o login local standalone.
function LoginRoute() {
  if (isCarbohubDomain()) {
    goToHubLogin();
    return null;
  }
  return <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedRoute><SalesShell /></ProtectedRoute>}>
        {/* Landing = Funil de Vendas (pipeline única ativa) */}
        <Route path="/" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/crm/pipelines" element={<Pipelines />} />
        {/* Dashboard de todos os funis — preservado, sem link no menu (escala depois) */}
        <Route path="/funis" element={<CRM />} />
        {/* compat: rotas antigas por funil → pipelines com filtro */}
        <Route path="/crm/:funnelType" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/compras" element={<RequisicaoCompra />} />
        <Route path="/pos-venda" element={<PosVenda />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/comercial" element={<DashboardComercial />} />
        {/* Descarbonização — acompanhamento (pra onde o "+ Nova Descarbonização" leva) */}
        <Route path="/descarbonizacao/os" element={<DescOrdensServico />} />
        <Route path="/descarbonizacao/agendamentos" element={<DescAgendamentos />} />
        {/* Território — só gestor (rede da empresa); barra a URL direta p/ não-gestor */}
        <Route path="/territorio/mapa" element={<RequireGestor><MapaTerritorial /></RequireGestor>} />
        <Route path="/territorio/rede" element={<RequireGestor><NetworkMap /></RequireGestor>} />
        <Route path="/territorio/expansao" element={<RequireGestor><TerritoryExpansion /></RequireGestor>} />
        {/* compatibilidade com rotas antigas (e-commerce migrou para o Carbo Ops) */}
        <Route path="/dashboard-comercial" element={<Navigate to="/comercial" replace />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
