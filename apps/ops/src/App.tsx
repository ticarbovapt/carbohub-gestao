import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Documentacao from "./pages/Documentacao";
import BugReports from "./pages/BugReports";
import MinhaEquipe from "./pages/MinhaEquipe";
import EmBreve from "./pages/EmBreve";
import Vender from "./pages/Vender";
import Chat from "./pages/Chat";
import OrdensProducao from "./pages/producao/OrdensProducao";
import DashboardProducao from "./pages/producao/DashboardProducao";
// As quatro telas do MRP entram pela casca de abas, que é quem as monta.
import Mrp from "./pages/producao/Mrp";
import RequisicaoCompra from "./pages/compras/RequisicaoCompra";
import Suprimentos from "./pages/compras/Suprimentos";
import EstoqueVendedores from "./pages/compras/EstoqueVendedores";
import Logistica from "./pages/logistica/Logistica";
import PosVenda from "./pages/logistica/PosVenda";
import Recorrencias from "./pages/comercial/Recorrencias";
import ViagensLog from "./pages/logistica/Viagens";
import OrdensServico from "./pages/campo/OrdensServico";
import Alertas from "./pages/campo/Alertas";
import { OPS_ALL_ITEMS } from "@/lib/opsNav";
import { PaginaNaoEncontrada, IrPara } from "@carbo/shell";

/**
 * A Esteira do On-line (e as Mensagens ao cliente, que só se chegava por ela)
 * SAIU do Ops em 20/10/2026, por decisão do dono do processo — ela continua no
 * Admin, no Atendimento e no Marketing. Os endereços antigos daqui levam à do
 * Admin, com a query INTACTA: é o `?card=` que abre o pedido, e link colado no
 * chat ou o chip de Movimentações do Suprimentos continuam chegando ao card.
 */
const ADMIN = "https://admin.carbohub.com.br";
function ParaAdmin({ destino }: { destino: string }) {
  const { search } = useLocation();
  useEffect(() => { window.location.replace(`${ADMIN}${destino}${search}`); }, [destino, search]);
  return null;
}

// Login é ÚNICO no Hub (carbohub.com.br). O ProtectedRoute cuida do acesso.
// As rotas das áreas já existem (placeholders) — telas portadas 1:1 por etapas.
export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/documentacao" element={<Documentacao />} />
        <Route path="/chamados" element={<BugReports />} />
        <Route path="/bugs" element={<IrPara para="/chamados" />} />
        <Route path="/equipe" element={<MinhaEquipe />} />
        <Route path="/vender" element={<Vender />} />
        <Route path="/chat" element={<Chat />} />

        {/* Produção */}
        <Route path="/producao/ordens" element={<OrdensProducao />} />
        <Route path="/producao/dashboard" element={<DashboardProducao />} />
        {/* MRP: Produtos, SKUs, Lotes e Fornecedores viraram abas da mesma
            tela. A aba é segmento da URL, como em /logistica/:aba. */}
        <Route path="/producao/mrp/:aba" element={<Mrp />} />
        <Route path="/producao/mrp" element={<Mrp />} />
        {/* ⚠️ Os caminhos antigos NÃO somem: viram redirect. Eles estão em
            favorito, em link colado no chat e em conversa antiga — e uma
            reorganização de menu que quebra endereço que já circulou custa
            mais do que a reorganização vale. `replace` para o voltar do
            navegador não cair de novo no redirect. */}
        <Route path="/producao/produtos"     element={<Navigate to="/producao/mrp/produtos"     replace />} />
        <Route path="/producao/skus"         element={<Navigate to="/producao/mrp/skus"         replace />} />
        <Route path="/producao/lotes"        element={<Navigate to="/producao/mrp/lotes"        replace />} />
        <Route path="/producao/fornecedores" element={<Navigate to="/producao/mrp/fornecedores" replace />} />


        {/* Compras & Suprimentos */}
        <Route path="/compras" element={<RequisicaoCompra />} />
        {/* Duas rotas para o mesmo componente: a estática mantém vivo todo
            link antigo para /suprimentos (sidebar, Home) e o efeito
            canonizador da tela redireciona para o endereço completo. Mesmo
            desenho de /logistica e /logistica/:aba. */}
        <Route path="/suprimentos" element={<Suprimentos />} />
        {/* Caixa física de cada vendedor. Fora da grade de Suprimentos de
            propósito: lá é uma coluna por hub, e quinze vendedores tornariam
            a grade ilegível. */}
        <Route path="/suprimentos/vendedores" element={<EstoqueVendedores />} />
        <Route path="/suprimentos/:hub/:aba" element={<Suprimentos />} />
        <Route path="/suprimentos/:hub" element={<Suprimentos />} />


        {/* Logística */}
        <Route path="/logistica/pos-venda" element={<PosVenda />} />
        <Route path="/logistica/recorrencias" element={<Recorrencias />} />
        <Route path="/logistica/esteira" element={<ParaAdmin destino="/ecommerce/esteira" />} />
        <Route path="/ecommerce/esteira" element={<ParaAdmin destino="/ecommerce/esteira" />} />
        <Route path="/ecommerce/mensagens" element={<ParaAdmin destino="/ecommerce/mensagens" />} />
        <Route path="/logistica" element={<Logistica />} />
        {/* A aba vira segmento da URL. As rotas estáticas acima (/pos-venda,
            /viagens) ganham desta no ranking do react-router, então não há
            risco de /logistica/viagens cair aqui. */}
        <Route path="/logistica/:aba" element={<Logistica />} />
        <Route path="/logistica/viagens" element={<ViagensLog />} />

        {/* Operação de Campo */}
        <Route path="/campo/os" element={<OrdensServico />} />
        {/* Agendamentos virou a visão Agenda da própria tela de OS, como no
            Sales; Máquinas saiu (decisão do dono do processo, 20/10/2026). */}
        <Route path="/campo/agendamentos" element={<Navigate to="/campo/os?ver=agenda" replace />} />
        <Route path="/campo/maquinas" element={<Navigate to="/campo/os" replace />} />
        <Route path="/campo/alertas" element={<Alertas />} />

        {/* Demais áreas: placeholder até o port (telas com ready=false) */}
        {OPS_ALL_ITEMS.filter((i) => !i.ready).map((i) => (
          <Route
            key={i.path}
            path={i.path}
            element={<EmBreve title={i.label} icon={i.icon} from={i.from} mirror={i.mirror} />}
          />
        ))}
        {/* Rota inexistente: diz que não existe, em vez de cair na home calado. */}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
