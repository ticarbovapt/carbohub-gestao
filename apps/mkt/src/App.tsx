import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Campanhas from "./pages/Campanhas";
import Vender from "./pages/Vender";
import Quadros from "./pages/Quadros";
import Board from "./pages/Board";
import BoardCalendar from "./pages/BoardCalendar";
import BoardTimeline from "./pages/BoardTimeline";
import BoardTable from "./pages/BoardTable";
import BoardDashboard from "./pages/BoardDashboard";
import BoardMap from "./pages/BoardMap";
import WorkspaceCalendar from "./pages/WorkspaceCalendar";
import WorkspaceTable from "./pages/WorkspaceTable";
import Profile from "./pages/Profile";
import Documentacao from "./pages/Documentacao";
import MinhaEquipe from "./pages/MinhaEquipe";
import BugReports from "./pages/BugReports";
import AbrirCartao from "./pages/AbrirCartao";
// E-commerce: CÓPIA das telas do Carbo Admin (20/10/2026), byte a byte, nos
// MESMOS endereços — os links moram dentro dos arquivos (/ecommerce/...).
import EcommerceVendas from "./pages/EcommerceVendas";
import EcommerceMetas from "./pages/EcommerceMetas";
import EsteiraOnline from "./pages/EsteiraOnline";
import MensagensCliente from "./pages/MensagensCliente";
import EcommerceAtribuicao from "./pages/EcommerceAtribuicao";
import { PaginaNaoEncontrada, IrPara } from "@carbo/shell";

// Carbo Marketing — app novo do ecossistema. Login único pelo Hub; acesso
// liberado pelo Admin via allowed_interfaces (carbo_mkt). Esqueleto inicial:
// as telas de marketing entram aqui conforme forem construídas.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/campanhas" element={<Campanhas />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/quadros" element={<Quadros />} />
        <Route path="/quadros/:boardId" element={<Board />} />
        <Route path="/cartao/:cardId" element={<AbrirCartao />} />
        <Route path="/quadros/:boardId/calendario" element={<BoardCalendar />} />
        <Route path="/quadros/:boardId/timeline" element={<BoardTimeline />} />
        <Route path="/quadros/:boardId/tabela" element={<BoardTable />} />
        <Route path="/quadros/:boardId/dashboard" element={<BoardDashboard />} />
        <Route path="/quadros/:boardId/mapa" element={<BoardMap />} />
        <Route path="/todos/calendario" element={<WorkspaceCalendar />} />
        <Route path="/todos/tabela" element={<WorkspaceTable />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/documentacao" element={<Documentacao />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        <Route path="/chamados" element={<BugReports />} />
        <Route path="/bugs" element={<IrPara para="/chamados" />} />
        <Route path="/ecommerce/vendas-online" element={<EcommerceVendas />} />
        <Route path="/ecommerce/metas" element={<EcommerceMetas />} />
        <Route path="/ecommerce/esteira" element={<EsteiraOnline />} />
        <Route path="/ecommerce/mensagens" element={<MensagensCliente />} />
        <Route path="/ecommerce/anuncios" element={<EcommerceAtribuicao />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
