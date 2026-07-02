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
import VendedoresBling from "./pages/VendedoresBling";
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
        <Route path="/vendedores-bling" element={<VendedoresBling />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
