import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Requisicoes from "./pages/Requisicoes";
import ContasAPagar from "./pages/ContasAPagar";
import BlingIntegracao from "./pages/integracoes/Bling";

// Carbo Finanças. Acesso liberado pelo Admin via flag carbo_financas
// (ProtectedRoute). Telas entram por levas.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/requisicoes" element={<Requisicoes />} />
        <Route path="/contas-a-pagar" element={<ContasAPagar />} />
        <Route path="/integracoes/bling" element={<BlingIntegracao />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
