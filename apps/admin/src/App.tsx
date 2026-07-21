import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Structure from "./pages/Structure";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import EcommerceVendas from "./pages/EcommerceVendas";
import EcommerceMetas from "./pages/EcommerceMetas";
import MetaConfig from "./pages/MetaConfig";
import Vender from "./pages/Vender";
import UltimoAcesso from "./pages/UltimoAcesso";
import DashboardsLojas from "./pages/DashboardsLojas";
import DashboardsFranqueados from "./pages/DashboardsFranqueados";
import DashboardsComercial from "./pages/DashboardsComercial";
import ComercialVendas from "./pages/ComercialVendas";
import DescontoAprovacoes from "./pages/DescontoAprovacoes";
import ProdutosPrecos from "./pages/ProdutosPrecos";
import DashboardComercial from "./pages/DashboardComercial";
import ComercialDados from "./pages/ComercialDados";
import DashboardsMetas from "./pages/DashboardsMetas";
import DashboardsEstrategico from "./pages/DashboardsEstrategico";
import EstoqueMrp from "./pages/EstoqueMrp";
import Auditoria from "./pages/Auditoria";
import Chat from "./pages/Chat";
import ChatAdocao from "./pages/ChatAdocao";
import CallTest from "./pages/CallTest";
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
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Users />} />
        <Route path="/estrutura" element={<Structure />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/equipe" element={<MinhaEquipe />} />

        {/* Grupos trazidos do Ops — em organização (conteúdo aos poucos) */}
        <Route path="/ecommerce/vendas-online" element={<EcommerceVendas />} />
        <Route path="/ecommerce/metas" element={<EcommerceMetas />} />
        <Route path="/metas/configurar" element={<MetaConfig />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/ultimo-acesso" element={<UltimoAcesso />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/adocao" element={<ChatAdocao />} />
        <Route path="/call-test" element={<CallTest />} />

        {/* Dashboards espelhados dos sistemas do ecossistema */}
        <Route path="/dashboards/lojas" element={<DashboardsLojas />} />
        <Route path="/dashboards/franqueados" element={<DashboardsFranqueados />} />
        <Route path="/dashboards/comercial" element={<DashboardsComercial />} />
        <Route path="/comercial/vendas" element={<ComercialVendas />} />
        <Route path="/comercial/dashboard" element={<DashboardComercial />} />
        <Route path="/comercial/dados" element={<ComercialDados />} />
        <Route path="/comercial/descontos" element={<DescontoAprovacoes />} />
        <Route path="/comercial/precos" element={<ProdutosPrecos />} />
        <Route path="/dashboards/metas" element={<DashboardsMetas />} />
        <Route path="/dashboards/estrategico" element={<DashboardsEstrategico />} />
        <Route path="/dashboards/estoque-mrp" element={<EstoqueMrp />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
