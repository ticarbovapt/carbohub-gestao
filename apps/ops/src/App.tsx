import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import EmBreve from "./pages/EmBreve";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import OrdensProducao from "./pages/producao/OrdensProducao";
import DashboardProducao from "./pages/producao/DashboardProducao";
import ProdutosMrp from "./pages/producao/ProdutosMrp";
import Skus from "./pages/producao/Skus";
import Lotes from "./pages/producao/Lotes";
import FornecedoresMrp from "./pages/producao/FornecedoresMrp";
import RequisicaoCompra from "./pages/compras/RequisicaoCompra";
import Suprimentos from "./pages/compras/Suprimentos";
import Logistica from "./pages/logistica/Logistica";
import PosVenda from "./pages/logistica/PosVenda";
import Recorrencias from "./pages/comercial/Recorrencias";
import EsteiraOnline from "./pages/logistica/EsteiraOnline";
import MensagensCliente from "./pages/MensagensCliente";
import ViagensLog from "./pages/logistica/Viagens";
import OrdensServico from "./pages/campo/OrdensServico";
import Agendamentos from "./pages/campo/Agendamentos";
import Maquinas from "./pages/campo/Maquinas";
import Alertas from "./pages/campo/Alertas";
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
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />

        {/* Produção */}
        <Route path="/producao/ordens" element={<OrdensProducao />} />
        <Route path="/producao/dashboard" element={<DashboardProducao />} />
        <Route path="/producao/produtos" element={<ProdutosMrp />} />
        <Route path="/producao/skus" element={<Skus />} />
        <Route path="/producao/lotes" element={<Lotes />} />
        <Route path="/producao/fornecedores" element={<FornecedoresMrp />} />


        {/* Compras & Suprimentos */}
        <Route path="/compras" element={<RequisicaoCompra />} />
        {/* Duas rotas para o mesmo componente: a estática mantém vivo todo
            link antigo para /suprimentos (sidebar, Home) e o efeito
            canonizador da tela redireciona para o endereço completo. Mesmo
            desenho de /logistica e /logistica/:aba. */}
        <Route path="/suprimentos" element={<Suprimentos />} />
        <Route path="/suprimentos/:hub/:aba" element={<Suprimentos />} />
        <Route path="/suprimentos/:hub" element={<Suprimentos />} />


        {/* Logística */}
        <Route path="/logistica/pos-venda" element={<PosVenda />} />
        <Route path="/logistica/recorrencias" element={<Recorrencias />} />
        <Route path="/logistica/esteira" element={<EsteiraOnline />} />
        {/* Mesmo caminho do admin de propósito: o botão da Esteira é o mesmo
            arquivo nos dois apps e precisa levar ao mesmo lugar. */}
        <Route path="/ecommerce/mensagens" element={<MensagensCliente />} />
        <Route path="/logistica" element={<Logistica />} />
        {/* A aba vira segmento da URL. As rotas estáticas acima (/pos-venda,
            /viagens) ganham desta no ranking do react-router, então não há
            risco de /logistica/viagens cair aqui. */}
        <Route path="/logistica/:aba" element={<Logistica />} />
        <Route path="/logistica/viagens" element={<ViagensLog />} />

        {/* Operação de Campo */}
        <Route path="/campo/os" element={<OrdensServico />} />
        <Route path="/campo/agendamentos" element={<Agendamentos />} />
        <Route path="/campo/maquinas" element={<Maquinas />} />
        <Route path="/campo/alertas" element={<Alertas />} />

        {/* Acompanhamento (Vendas) — espelho do Sales, visualização */}
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
