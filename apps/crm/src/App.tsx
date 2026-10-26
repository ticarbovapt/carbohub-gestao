import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SalesShell } from "./components/SalesShell";
import Login from "./pages/Login";
import Pipelines from "./pages/Pipelines";
import Documentacao from "./pages/Documentacao";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import PedidosTravada from "./pages/PedidosTravada";
import Vendas from "./pages/Vendas";
import Metas from "./pages/Metas";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import RequisicaoCompra from "./pages/RequisicaoCompra";
import PosVenda from "./pages/PosVenda";
import DescOrdensServico from "./pages/descarbonizacao/OrdensServico";
import Pdvs from "./pages/Pdvs";
import MeuEstoque from "./pages/MeuEstoque";
import RtmAgenda from "./pages/rtm/Agenda";
import RtmVisita from "./pages/rtm/Visita";
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
      <Route element={<ProtectedRoute><SalesShell /></ProtectedRoute>}>
        {/* Landing = Funil de Vendas (pipeline única ativa) */}
        <Route path="/" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/crm/pipelines" element={<Pipelines />} />
        {/* /funis, /comercial e /territorio/* SAÍRAM (20/10/2026, decisão do dono
            do processo). O endereço antigo cai na home, nunca no "não encontrada". */}
        <Route path="/funis" element={<Navigate to="/crm/pipelines" replace />} />
        {/* compat: rotas antigas por funil → pipelines com filtro */}
        <Route path="/crm/:funnelType" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />
        {/* ⚠️ /pedidos TRAVADA por enquanto. A rota continua existindo, e de
            propósito: quem tem o link salvo precisa saber o que houve. Rota
            apagada daria "página não encontrada", que faz a pessoa achar que
            errou o endereço e procurar de novo. O componente Pedidos segue no
            repositório — é destravar aqui quando for a hora. */}
        <Route path="/pedidos" element={<PedidosTravada />} />
        <Route path="/compras" element={<RequisicaoCompra />} />
        <Route path="/pos-venda" element={<PosVenda />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/comercial" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/pdvs" element={<Pdvs />} />
        <Route path="/meu-estoque" element={<MeuEstoque />} />

        {/* RTM · Fase 1 — registro de visita. A visita fica FORA da agenda de
            propósito: em campo o vendedor precisa de uma URL que abra direto
            no que ele está fazendo, sem passar pela lista. */}
        <Route path="/rtm/agenda" element={<RtmAgenda />} />
        <Route path="/rtm/visita" element={<RtmVisita />} />
        {/* Descarbonização — acompanhamento (pra onde o "+ Nova Descarbonização" leva) */}
        <Route path="/descarbonizacao/os" element={<DescOrdensServico />} />
        {/* A agenda virou uma visão da tela de OS (20/10/2026). */}
        <Route path="/descarbonizacao/agendamentos" element={<Navigate to="/descarbonizacao/os?ver=agenda" replace />} />
        <Route path="/territorio/*" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/dashboard-comercial" element={<Navigate to="/crm/pipelines" replace />} />
        <Route path="/documentacao" element={<Documentacao />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/bugs" element={<BugReports />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
