import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import EmBreve from "./pages/EmBreve";
import OrdensProducao from "./pages/producao/OrdensProducao";
import DashboardProducao from "./pages/producao/DashboardProducao";
import ProdutosMrp from "./pages/producao/ProdutosMrp";
import Skus from "./pages/producao/Skus";
import Lotes from "./pages/producao/Lotes";
import FornecedoresMrp from "./pages/producao/FornecedoresMrp";
import SaldosPorHub from "./pages/estoque/SaldosPorHub";
import EstoqueHub from "./pages/estoque/EstoqueHub";
import RequisicaoCompra from "./pages/compras/RequisicaoCompra";
import Suprimentos from "./pages/compras/Suprimentos";
import BlingIntegracao from "./pages/integracoes/Bling";
import Financeiro from "./pages/financeiro/Financeiro";
import Faturamento from "./pages/financeiro/Faturamento";
import NotasFiscais from "./pages/financeiro/NotasFiscais";
import NFSe from "./pages/financeiro/NFSe";
import DashboardFinanceiro from "./pages/financeiro/DashboardFinanceiro";
import Logistica from "./pages/logistica/Logistica";
import ViagensLog from "./pages/logistica/Viagens";
import DashboardLogistica from "./pages/logistica/DashboardLogistica";
import OrdensServico from "./pages/campo/OrdensServico";
import Agendamentos from "./pages/campo/Agendamentos";
import Maquinas from "./pages/campo/Maquinas";
import Checklists from "./pages/campo/Checklists";
import Alertas from "./pages/campo/Alertas";
import AcompDashboardComercial from "./pages/acompanhamento/DashboardComercial";
import AcompMetasVendedores from "./pages/acompanhamento/MetasVendedores";
import { OPS_ALL_ITEMS } from "@/lib/opsNav";

// Login é ÚNICO no Hub (carbohub.com.br). O ProtectedRoute cuida do acesso.
// As rotas das áreas já existem (placeholders) — telas portadas 1:1 por etapas.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/equipe" element={<MinhaEquipe />} />

        {/* Produção */}
        <Route path="/producao/ordens" element={<OrdensProducao />} />
        <Route path="/producao/dashboard" element={<DashboardProducao />} />
        <Route path="/producao/produtos" element={<ProdutosMrp />} />
        <Route path="/producao/skus" element={<Skus />} />
        <Route path="/producao/lotes" element={<Lotes />} />
        <Route path="/producao/fornecedores" element={<FornecedoresMrp />} />

        {/* Estoque — visão geral + subpáginas por hub (somente leitura) */}
        <Route path="/estoque" element={<SaldosPorHub />} />
        <Route path="/estoque/:hub" element={<EstoqueHub />} />

        {/* Compras & Suprimentos */}
        <Route path="/compras" element={<RequisicaoCompra />} />
        <Route path="/suprimentos" element={<Suprimentos />} />
        <Route path="/integracoes/bling" element={<BlingIntegracao />} />

        {/* Financeiro */}
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/financeiro/faturamento" element={<Faturamento />} />
        <Route path="/financeiro/notas-fiscais" element={<NotasFiscais />} />
        <Route path="/financeiro/nfse" element={<NFSe />} />
        <Route path="/financeiro/dashboard" element={<DashboardFinanceiro />} />

        {/* Logística */}
        <Route path="/logistica" element={<Logistica />} />
        <Route path="/logistica/viagens" element={<ViagensLog />} />
        <Route path="/logistica/dashboard" element={<DashboardLogistica />} />

        {/* Operação de Campo */}
        <Route path="/campo/os" element={<OrdensServico />} />
        <Route path="/campo/agendamentos" element={<Agendamentos />} />
        <Route path="/campo/maquinas" element={<Maquinas />} />
        <Route path="/campo/checklists" element={<Checklists />} />
        <Route path="/campo/alertas" element={<Alertas />} />

        {/* Acompanhamento (Vendas) — espelho do Sales, visualização */}
        <Route path="/acompanhamento/comercial" element={<AcompDashboardComercial />} />
        <Route path="/acompanhamento/metas" element={<AcompMetasVendedores />} />

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
