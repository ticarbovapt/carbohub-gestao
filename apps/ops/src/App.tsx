import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import EmBreve from "./pages/EmBreve";
import OrdensProducao from "./pages/producao/OrdensProducao";
import DashboardProducao from "./pages/producao/DashboardProducao";
import ProdutosMrp from "./pages/producao/ProdutosMrp";
import Skus from "./pages/producao/Skus";
import Lotes from "./pages/producao/Lotes";
import FornecedoresMrp from "./pages/producao/FornecedoresMrp";
import SaldosPorHub from "./pages/estoque/SaldosPorHub";
import { OPS_ALL_ITEMS } from "@/lib/opsNav";

// Login é ÚNICO no Hub (carbohub.com.br). O ProtectedRoute cuida do acesso.
// As rotas das áreas já existem (placeholders) — telas portadas 1:1 por etapas.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/perfil" element={<Profile />} />

        {/* Produção */}
        <Route path="/producao/ordens" element={<OrdensProducao />} />
        <Route path="/producao/dashboard" element={<DashboardProducao />} />
        <Route path="/producao/produtos" element={<ProdutosMrp />} />
        <Route path="/producao/skus" element={<Skus />} />
        <Route path="/producao/lotes" element={<Lotes />} />
        <Route path="/producao/fornecedores" element={<FornecedoresMrp />} />

        {/* Estoque */}
        <Route path="/estoque" element={<SaldosPorHub />} />

        {/* Demais áreas: placeholder até o port (telas com ready=false) */}
        {OPS_ALL_ITEMS.filter((i) => !i.ready).map((i) => (
          <Route
            key={i.path}
            path={i.path}
            element={<EmBreve title={i.label} icon={i.icon} from={i.from} mirror={i.mirror} />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
