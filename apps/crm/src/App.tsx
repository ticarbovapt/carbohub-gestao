import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SalesShell } from "./components/SalesShell";
import Login from "./pages/Login";
import CRM from "./pages/CRM";
import Pipelines from "./pages/Pipelines";
import Vender from "./pages/Vender";
import Pedidos from "./pages/Pedidos";
import DashboardComercial from "./pages/DashboardComercial";
import Vendas from "./pages/Vendas";
import Metas from "./pages/Metas";
import Profile from "./pages/Profile";
import DescOrdensServico from "./pages/descarbonizacao/OrdensServico";
import DescAgendamentos from "./pages/descarbonizacao/Agendamentos";
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
        <Route path="/" element={<CRM />} />
        <Route path="/crm/pipelines" element={<Pipelines />} />
        {/* compat: rotas antigas por funil → pipelines com filtro */}
        <Route path="/crm/:funnelType" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/comercial" element={<DashboardComercial />} />
        {/* Descarbonização — acompanhamento (pra onde o "+ Nova Descarbonização" leva) */}
        <Route path="/descarbonizacao/os" element={<DescOrdensServico />} />
        <Route path="/descarbonizacao/agendamentos" element={<DescAgendamentos />} />
        {/* compatibilidade com rotas antigas (e-commerce migrou para o Carbo Ops) */}
        <Route path="/dashboard-comercial" element={<Navigate to="/comercial" replace />} />
        <Route path="/perfil" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
