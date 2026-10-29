import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import Documentacao from "./pages/Documentacao";
import EcommerceVendas from "./pages/EcommerceVendas";
import EcommerceMetas from "./pages/EcommerceMetas";
import EsteiraOnline from "./pages/EsteiraOnline";
import MensagensCliente from "./pages/MensagensCliente";
import EcommerceAtribuicao from "./pages/EcommerceAtribuicao";
import MapaConquista from "./pages/MapaConquista";
import MetaConfig from "./pages/MetaConfig";
import Vender from "./pages/Vender";
import DashboardsLojas from "./pages/DashboardsLojas";
import DashboardsFranqueados from "./pages/DashboardsFranqueados";
import DescontoAprovacoes from "./pages/DescontoAprovacoes";
import ProdutosPrecos from "./pages/ProdutosPrecos";
import DashboardComercial from "./pages/DashboardComercial";
import ComercialDados from "./pages/ComercialDados";
import DashboardsMetas from "./pages/DashboardsMetas";
import Suprimentos from "./pages/Suprimentos";
import Chat from "./pages/Chat";
import CallTest from "./pages/CallTest";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";
import { PaginaNaoEncontrada, IrPara } from "@carbo/shell";

// Usuários, Departamentos e funções, Quem recebe a venda e a Auditoria moram no
// Carbo TI desde 20/10/2026 (as mesmas telas). O endereço antigo leva para lá,
// com a query junto — favorito e link mandado a alguém continuam abrindo.
const TI_URL = "https://ti.carbohub.com.br";
// ⚠️ `para` pode trazer query própria (`/notificacoes?aba=venda_online`): a do
// endereço que chegou é SOMADA, nunca colada com um segundo `?`.
function IrParaTi({ para }: { para: string }) {
  useEffect(() => {
    const extra = window.location.search.replace(/^\?/, "");
    const junta = extra ? (para.includes("?") ? `&${extra}` : `?${extra}`) : "";
    window.location.replace(`${TI_URL}${para}${junta}`);
  }, [para]);
  return null;
}

// Pontos de Venda saiu do Admin (20/10/2026): mora no Sales, onde é usado.
function IrParaSales({ para }: { para: string }) {
  useEffect(() => { window.location.replace(`https://sales.carbohub.com.br${para}${window.location.search}`); }, [para]);
  return null;
}

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
        {/* A home era Usuários; agora é o Painel Comercial, o primeiro item do menu. */}
        <Route path="/" element={<Navigate to="/painel-comercial" replace />} />
        <Route path="/usuarios" element={<IrParaTi para="/usuarios" />} />
        <Route path="/estrutura" element={<IrParaTi para="/departamentos" />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/chamados" element={<BugReports />} />
        <Route path="/bugs" element={<IrPara para="/chamados" />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        <Route path="/documentacao" element={<Documentacao />} />

        {/* E-commerce: `/ecommerce/...` FICA (decisão do dono do processo, 29/10/2026).
            As telas são espelhadas byte a byte no Marketing e no Atendimento, e
            os links moram DENTRO dos arquivos — o endereço é parte do espelho. */}
        <Route path="/ecommerce/vendas-online" element={<EcommerceVendas />} />
        <Route path="/ecommerce/metas" element={<EcommerceMetas />} />
        <Route path="/ecommerce/esteira" element={<EsteiraOnline />} />
        <Route path="/ecommerce/mensagens" element={<MensagensCliente />} />
        <Route path="/ecommerce/anuncios" element={<EcommerceAtribuicao />} />
        <Route path="/ecommerce/avisos-de-venda" element={<IrParaTi para="/notificacoes?aba=venda_online" />} />
        <Route path="/configurar-metas" element={<MetaConfig />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/ultimo-acesso" element={<IrParaTi para="/ultimo-acesso" />} />
        <Route path="/auditoria" element={<IrParaTi para="/auditoria" />} />
        <Route path="/acompanhamento" element={<IrParaTi para="/acompanhamento" />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/adocao" element={<IrParaTi para="/chat/adocao" />} />
        <Route path="/teste-chamada" element={<CallTest />} />

        {/* Comercial e Painéis — o endereço é o nome do MENU, curto e em
            português (pedido do dono do processo, 29/10/2026). */}
        <Route path="/painel-comercial" element={<DashboardComercial />} />
        <Route path="/dados-comerciais" element={<ComercialDados />} />
        {/* Aba como segmento da URL — ver a nota em ComercialDados. */}
        <Route path="/dados-comerciais/:aba" element={<ComercialDados />} />
        <Route path="/aprovacoes" element={<DescontoAprovacoes />} />
        <Route path="/tabela-de-precos" element={<ProdutosPrecos />} />
        <Route path="/mapa-da-conquista" element={<MapaConquista />} />
        <Route path="/portal-de-vendas" element={<DashboardsLojas />} />
        <Route path="/licenciados" element={<DashboardsFranqueados />} />
        <Route path="/placar-de-metas" element={<DashboardsMetas />} />
        <Route path="/suprimentos" element={<Suprimentos />} />

        {/* ⚠️ Endereços ANTIGOS (até 29/10/2026). Ficam para sempre: favorito,
            link no chat, no sininho e em outro app continuam abrindo. `IrPara`
            leva a query junto — o recorte de quem mandou o link não se perde. */}
        <Route path="/comercial/dashboard" element={<IrPara para="/painel-comercial" />} />
        <Route path="/comercial/dados" element={<IrPara para="/dados-comerciais" />} />
        <Route path="/comercial/dados/:aba" element={<IrPara para="/dados-comerciais/:aba" />} />
        <Route path="/comercial/descontos" element={<IrPara para="/aprovacoes" />} />
        <Route path="/comercial/precos" element={<IrPara para="/tabela-de-precos" />} />
        <Route path="/comercial/pdvs" element={<IrParaSales para="/pdvs" />} />
        <Route path="/dashboards/mapa-conquista" element={<IrPara para="/mapa-da-conquista" />} />
        <Route path="/dashboards/lojas" element={<IrPara para="/portal-de-vendas" />} />
        <Route path="/dashboards/franqueados" element={<IrPara para="/licenciados" />} />
        <Route path="/dashboards/metas" element={<IrPara para="/placar-de-metas" />} />
        <Route path="/dashboards/suprimentos" element={<IrPara para="/suprimentos" />} />
        {/* Visão Geral e Estratégico saíram (20/10/2026): o Painel Comercial
            cobre os dois, mais completo. Link salvo cai nele. */}
        <Route path="/dashboards/comercial" element={<IrPara para="/painel-comercial" />} />
        <Route path="/dashboards/estrategico" element={<IrPara para="/painel-comercial" />} />
        <Route path="/metas/configurar" element={<IrPara para="/configurar-metas" />} />
        <Route path="/call-test" element={<IrPara para="/teste-chamada" />} />

        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
