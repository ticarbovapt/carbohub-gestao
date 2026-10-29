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
      <Route element={<ProtectedRoute><SalesShell /></ProtectedRoute>}>
        {/* Slugs em português e IGUAIS ao nome do menu (dono do processo,
            29/10/2026): "Funis" é /funis, "Rastreio de venda" é /rastreio,
            "Ordens de Serviço" é /os. Todo endereço antigo continua abrindo
            pelo `IrPara`, que leva a query junto — é ela que carrega o
            `?funil=&lead=` do card e os filtros da tela. */}
        <Route path="/" element={<Navigate to="/funis" replace />} />
        <Route path="/funis" element={<Pipelines />} />
        <Route path="/crm/pipelines" element={<IrPara para="/funis" />} />
        {/* compat: rotas antigas por funil (/crm/f1…) → a tela dos funis.
            ⚠️ Fica DEPOIS de /crm/pipelines só por leitura: o react-router
            ranqueia o segmento estático acima do `:funnelType` de qualquer
            jeito. */}
        <Route path="/crm/:funnelType" element={<IrPara para="/funis" />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />
        {/* ⚠️ /pedidos TRAVADA por enquanto. A rota continua existindo, e de
            propósito: quem tem o link salvo precisa saber o que houve. Rota
            apagada daria "página não encontrada", que faz a pessoa achar que
            errou o endereço e procurar de novo. O componente Pedidos segue no
            repositório — é destravar aqui quando for a hora. */}
        <Route path="/pedidos" element={<PedidosTravada />} />
        <Route path="/requisicoes" element={<RequisicaoCompra />} />
        <Route path="/compras" element={<IrPara para="/requisicoes" />} />
        <Route path="/rastreio" element={<PosVenda />} />
        <Route path="/pos-venda" element={<IrPara para="/rastreio" />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/pdvs" element={<Pdvs />} />
        <Route path="/meu-estoque" element={<MeuEstoque />} />

        {/* RTM · Fase 1 — registro de visita. A visita fica FORA da agenda de
            propósito: em campo o vendedor precisa de uma URL que abra direto
            no que ele está fazendo, sem passar pela lista. */}
        <Route path="/rtm/agenda" element={<RtmAgenda />} />
        <Route path="/rtm/visita" element={<RtmVisita />} />
        {/* Ordens de Serviço da descarbonização (pra onde o "+ Nova
            Descarbonização" leva). ⚠️ O MESMO caminho do Ops (`/os`): a tela é
            byte a byte a mesma nos dois apps. */}
        <Route path="/os" element={<DescOrdensServico />} />
        <Route path="/descarbonizacao/os" element={<IrPara para="/os" />} />
        {/* A agenda virou uma visão da tela de OS (20/10/2026). `Navigate`, e
            não `IrPara`, porque o destino já traz a própria query. */}
        <Route path="/descarbonizacao/agendamentos" element={<Navigate to="/os?ver=agenda" replace />} />
        {/* /comercial, /territorio/* e /dashboard-comercial SAÍRAM (20/10/2026,
            decisão do dono do processo). O endereço antigo cai nos funis, nunca
            no "não encontrada". (/funis também era uma tela que saiu — hoje é o
            endereço da tela dos funis.) */}
        <Route path="/comercial" element={<Navigate to="/funis" replace />} />
        <Route path="/territorio/*" element={<Navigate to="/funis" replace />} />
        <Route path="/dashboard-comercial" element={<Navigate to="/funis" replace />} />
        <Route path="/documentacao" element={<Documentacao />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/chamados" element={<BugReports />} />
        <Route path="/bugs" element={<IrPara para="/chamados" />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
