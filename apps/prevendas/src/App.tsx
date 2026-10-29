import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BugReports from "./pages/BugReports";
import Profile from "./pages/Profile";
import Vender from "./pages/Vender";
import Pipelines from "./pages/Pipelines";
import Vendas from "./pages/Vendas";
import Resultados from "./pages/Resultados";
import Atendimento from "./pages/Atendimento";
import Documentacao from "./pages/Documentacao";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";
import { PaginaNaoEncontrada, IrPara } from "@carbo/shell";

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
        <Route path="/" element={<Home />} />
        <Route path="/chamados" element={<BugReports />} />
        <Route path="/bugs" element={<IrPara para="/chamados" />} />
        <Route path="/vender" element={<Vender />} />
        {/* Sem Carbo Chat neste app: aviso de chat do sininho cai aqui e volta à home. */}
        <Route path="/chat" element={<Navigate to="/" replace />} />
        {/* O MESMO caminho do Sales (`/funis`), de propósito: o link de card
            (`?funil=…&lead=<id>`) é montado igual nos dois apps, e caminho
            diferente cairia no catch-all — a home no lugar do card, sem erro.
            O endereço antigo (`/crm/pipelines`, até 29/10/2026) continua
            abrindo, com a query: link de card colado no chat leva ao card. */}
        <Route path="/funis" element={<Pipelines />} />
        <Route path="/crm/pipelines" element={<IrPara para="/funis" />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/resultados" element={<Resultados />} />
        <Route path="/atendimento" element={<Atendimento />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/documentacao" element={<Documentacao />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
