import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Demandas from "./pages/Demandas";
import BugReports from "./pages/BugReports";
import StatusAvisos from "./pages/StatusAvisos";
import Profile from "./pages/Profile";
import MinhaEquipe from "./pages/MinhaEquipe";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import ChatAdocao from "./pages/ChatAdocao";
import AcademyAcessos from "./pages/AcademyAcessos";
// Vindas do Carbo Admin (20/10/2026) — as MESMAS telas, byte a byte.
import Users from "./pages/Users";
import Structure from "./pages/Structure";
import AvisoVendaOnline from "./pages/AvisoVendaOnline";
import Auditoria from "./pages/Auditoria";
import Acompanhamento from "./pages/Acompanhamento";
import UltimoAcesso from "./pages/UltimoAcesso";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";
import { PaginaNaoEncontrada } from "@carbo/shell";

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
        <Route path="/demandas" element={<Demandas />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/status" element={<StatusAvisos />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/adocao" element={<ChatAdocao />} />
        <Route path="/academy/acessos" element={<AcademyAcessos />} />
        <Route path="/usuarios" element={<Users />} />
        <Route path="/estrutura" element={<Structure />} />
        <Route path="/ecommerce/avisos-de-venda" element={<AvisoVendaOnline />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/acompanhamento" element={<Acompanhamento />} />
        <Route path="/ultimo-acesso" element={<UltimoAcesso />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
