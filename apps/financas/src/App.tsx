import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Financeiro from "./pages/Financeiro";
import Purchasing from "./pages/Purchasing";
import Suprimentos from "./pages/Suprimentos";
import Orders from "./pages/Orders";
import Faturamento from "./pages/Faturamento";
import DashboardFinanceiro from "./pages/dashboards/DashboardFinanceiro";
import BlingIntegracao from "./pages/integracoes/Bling";
import BlingCallback from "./pages/integracoes/BlingCallback";

// Carbo Finanças. Acesso liberado pelo Admin via flag carbo_financas
// (ProtectedRoute). Telas portadas 1:1 do Carbo Controle.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/compras" element={<Purchasing />} />
        <Route path="/suprimentos" element={<Suprimentos />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/faturamento" element={<Faturamento />} />
        <Route path="/dashboard-financeiro" element={<DashboardFinanceiro />} />
        <Route path="/integracoes/bling" element={<BlingIntegracao />} />
        <Route path="/integracoes/bling/callback" element={<BlingCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
