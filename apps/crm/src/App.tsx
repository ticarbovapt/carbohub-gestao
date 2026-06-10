import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SalesShell } from "./components/SalesShell";
import Login from "./pages/Login";
import CRM from "./pages/CRM";
import Vender from "./pages/Vender";
import Pedidos from "./pages/Pedidos";
import DashboardComercial from "./pages/DashboardComercial";
import Vendas from "./pages/Vendas";
import Metas from "./pages/Metas";
import Ecommerce from "./pages/Ecommerce";
import Profile from "./pages/Profile";
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
        <Route path="/vender" element={<Vender />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/dashboard-comercial" element={<DashboardComercial />} />
        <Route path="/ecommerce" element={<Ecommerce />} />
        <Route path="/perfil" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
