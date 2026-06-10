import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SalesShell } from "./components/SalesShell";
import Login from "./pages/Login";
import CRM from "./pages/CRM";
import Pedidos from "./pages/Pedidos";
import Profile from "./pages/Profile";
import EmConstrucao from "./pages/EmConstrucao";
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
        <Route path="/vender" element={<EmConstrucao titulo="Vender" origem="/orders/new" />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/vendas" element={<EmConstrucao titulo="Vendas" origem="/vendas" />} />
        <Route path="/metas" element={<EmConstrucao titulo="Metas" origem="/sales-targets · /dashboards/metas/vendedores" />} />
        <Route path="/dashboard-comercial" element={<EmConstrucao titulo="Dashboard comercial" origem="/dashboards/comercial" />} />
        <Route path="/ecommerce" element={<EmConstrucao titulo="E-commerce — Vendas online" origem="/dashboards/ecommerce/vendas-online" />} />
        <Route path="/perfil" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
