import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Home from "./pages/Home";

// Base do Carbo Finanças. Telas (Contas a Pagar, RC/PC, NF/Faturamento) entram
// por levas. Acesso liberado pelo Admin via flag carbo_financas (ProtectedRoute).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
