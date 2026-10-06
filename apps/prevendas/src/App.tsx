import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BugReports from "./pages/BugReports";
import Profile from "./pages/Profile";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import Pipelines from "./pages/Pipelines";
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
        {/* O MESMO caminho do Sales (`/crm/pipelines`), de propósito: o link de
            card (`?lead=<id>`) é montado igual nos dois apps, e caminho
            diferente cairia no catch-all — a home no lugar do card, sem erro. */}
        <Route path="/crm/pipelines" element={<Pipelines />} />
        <Route path="/perfil" element={<Profile />} />
        {/* Rota desconhecida → volta pra visão geral */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
