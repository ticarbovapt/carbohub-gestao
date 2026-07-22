import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Campanhas from "./pages/Campanhas";
import Profile from "./pages/Profile";
import MinhaEquipe from "./pages/MinhaEquipe";
import BugReports from "./pages/BugReports";

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
        <Route path="/perfil" element={<Profile />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
