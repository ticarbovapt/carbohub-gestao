import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BugReports from "./pages/BugReports";
import Profile from "./pages/Profile";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import Conversas from "./pages/Conversas";
import EsteiraOnline from "./pages/EsteiraOnline";
import MensagensCliente from "./pages/MensagensCliente";
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
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/conversas" element={<Conversas />} />
        {/* ⚠️ O caminho é `/ecommerce/...`, e não `/esteira`, DE PROPÓSITO.
            As telas portadas são byte a byte idênticas às do admin e trazem os
            links internos escritos dentro (`/ecommerce/esteira`,
            `/ecommerce/mensagens`). Montar em outro caminho deixaria esses
            links caindo no catch-all — sem erro, só a home aparecendo no lugar
            do pedido. Foi o que aconteceu no Ops, onde a esteira virou
            `/logistica/esteira` e o link das Conversas nunca funcionou.
            O Ops já usa este mesmo truque em `/ecommerce/mensagens`. */}
        <Route path="/ecommerce/esteira" element={<EsteiraOnline />} />
        <Route path="/ecommerce/mensagens" element={<MensagensCliente />} />
        <Route path="/perfil" element={<Profile />} />
        {/* Rota desconhecida → volta pra visão geral */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
