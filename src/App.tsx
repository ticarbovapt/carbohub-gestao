import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RealtimeMachineAlertsProvider } from "@/hooks/useRealtimeMachineAlerts";
import { PageProgressBar } from "@/components/ui/PageProgressBar";
import { PDVLayout } from "./components/layouts/PDVLayout";
import { AIChatDrawer } from "./components/ai/AIChatDrawer";
import { HomeHub } from "./components/home/HomeHub";

// ── Lazy page imports ─────────────────────────────────────────────────────────
const AreaSelector        = lazy(() => import("./pages/AreaSelector"));
const LoginArea           = lazy(() => import("./pages/LoginArea"));
const Onboarding          = lazy(() => import("./pages/Onboarding"));
const Dashboard           = lazy(() => import("./pages/Dashboard"));
const Team                = lazy(() => import("./pages/Team"));
const OSBoard             = lazy(() => import("./pages/OSBoard"));
const OSDetails           = lazy(() => import("./pages/OSDetails"));
const Checklist           = lazy(() => import("./pages/Checklist"));
const Admin               = lazy(() => import("./pages/Admin"));
const AdminApproval       = lazy(() => import("./pages/AdminApproval"));
const CarboGovernance     = lazy(() => import("./pages/CarboGovernance"));
const NewLicensee         = lazy(() => import("./pages/NewLicensee"));
const ChangePassword      = lazy(() => import("./pages/ChangePassword"));
const Scheduling          = lazy(() => import("./pages/Scheduling"));
const Licensees           = lazy(() => import("./pages/Licensees"));
const LicenseeDetails     = lazy(() => import("./pages/LicenseeDetails"));
const Machines            = lazy(() => import("./pages/Machines"));
const Orders              = lazy(() => import("./pages/Orders"));
const CreateOrder         = lazy(() => import("./pages/CreateOrder"));
const OrderDetails        = lazy(() => import("./pages/OrderDetails"));
const DataImport          = lazy(() => import("./pages/DataImport"));
const MapaTerritorial     = lazy(() => import("./pages/MapaTerritorial"));
const CockpitEstrategico  = lazy(() => import("./pages/admin/CockpitEstrategico"));
const Logistics           = lazy(() => import("./pages/Logistics"));
const Purchasing          = lazy(() => import("./pages/Purchasing"));
const Financeiro          = lazy(() => import("./pages/Financeiro"));
const Suprimentos         = lazy(() => import("./pages/Suprimentos"));
const MrpProducts         = lazy(() => import("./pages/MrpProducts"));
const MrpSuppliers        = lazy(() => import("./pages/MrpSuppliers"));
const Skus                = lazy(() => import("./pages/Skus"));
const Lots                = lazy(() => import("./pages/Lots"));
const ProductionOrdersOP  = lazy(() => import("./pages/ProductionOrdersOP"));
const ProductionOrderDetail = lazy(() => import("./pages/ProductionOrderDetail"));
const B2BFunnel           = lazy(() => import("./pages/B2BFunnel"));
const B2BLeads            = lazy(() => import("./pages/B2BLeads"));
const CRMDashboard        = lazy(() => import("./pages/crm/CRMDashboard"));
const CRMFunnel           = lazy(() => import("./pages/crm/CRMFunnel"));
const SalesTargets        = lazy(() => import("./pages/SalesTargets"));
const RoleMatrix          = lazy(() => import("./pages/RoleMatrix"));
const ResponsibilityMap   = lazy(() => import("./pages/ResponsibilityMap"));
const OrgChartPage        = lazy(() => import("./pages/OrgChartPage"));
const DashboardProducao   = lazy(() => import("./pages/dashboards/DashboardProducao"));
const DashboardFinanceiro = lazy(() => import("./pages/dashboards/DashboardFinanceiro"));
const DashboardLogistica  = lazy(() => import("./pages/dashboards/DashboardLogistica"));
const DashboardComercial  = lazy(() => import("./pages/dashboards/DashboardComercial"));
const DashboardEstrategico = lazy(() => import("./pages/dashboards/DashboardEstrategico"));
const NotFound            = lazy(() => import("./pages/NotFound"));
const AIAssistantPage     = lazy(() => import("./pages/AIAssistantPage"));
const BlingIntegration    = lazy(() => import("./pages/BlingIntegration"));
const BlingCallback       = lazy(() => import("./pages/BlingCallback"));
const SetPassword         = lazy(() => import("./pages/SetPassword"));
const ResetPassword       = lazy(() => import("./pages/ResetPassword"));
// Network Intelligence
const NetworkMap           = lazy(() => import("./pages/NetworkMap"));
const LicenseeRanking      = lazy(() => import("./pages/LicenseeRanking"));
const TerritoryExpansion   = lazy(() => import("./pages/TerritoryExpansion"));
const TerritoryIntelligence = lazy(() => import("./pages/TerritoryIntelligence"));
// Licensee Portal
const LicenseeDashboard    = lazy(() => import("./pages/licensee/LicenseeDashboard"));
const ServiceCatalog       = lazy(() => import("./pages/licensee/ServiceCatalog"));
const LicenseeRequests     = lazy(() => import("./pages/licensee/LicenseeRequests"));
const LicenseeCredits      = lazy(() => import("./pages/licensee/LicenseeCredits"));
const LicenseeCommissions  = lazy(() => import("./pages/licensee/LicenseeCommissions"));
const CarboVAPTServices    = lazy(() => import("./pages/licensee/CarboVAPTServices"));
const CarboVAPTCheckout    = lazy(() => import("./pages/licensee/CarboVAPTCheckout"));
const CarboVAPTPayment     = lazy(() => import("./pages/licensee/CarboVAPTPayment"));
const CarboVAPTConfirmation = lazy(() => import("./pages/licensee/CarboVAPTConfirmation"));
const LicenseeAtendimento  = lazy(() => import("./pages/licensee/LicenseeAtendimento"));
const LicenseeClientes     = lazy(() => import("./pages/licensee/LicenseeClientes"));
const LicenseeReagentes    = lazy(() => import("./pages/licensee/LicenseeReagentes"));
const LicenseeVapt         = lazy(() => import("./pages/licensee/LicenseeVapt"));
const LicenseeProducts     = lazy(() => import("./pages/licensee/LicenseeProducts"));
const OpsAlerts            = lazy(() => import("./pages/OpsAlerts"));
// PDV
const PDVDashboard  = lazy(() => import("./pages/pdv/PDVDashboard"));
const PDVPos        = lazy(() => import("./pages/pdv/PDVPos"));
const PDVEstoque    = lazy(() => import("./pages/pdv/PDVEstoque"));
const PDVVendedores = lazy(() => import("./pages/pdv/PDVVendedores"));
const PDVRanking    = lazy(() => import("./pages/pdv/PDVRanking"));
const OpsNetwork    = lazy(() => import("./pages/OpsNetwork"));

// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Animated routes wrapper
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="sync">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <Routes location={location}>
            {/* Public routes */}
            <Route path="/" element={<AreaSelector />} />
            <Route path="/login/:area" element={<LoginArea />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Home Hub */}
            <Route path="/home" element={<ProtectedRoute><HomeHub /></ProtectedRoute>} />

            {/* Protected routes */}
            <Route path="/dashboard"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/team"             element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/org-chart"        element={<ProtectedRoute><OrgChartPage /></ProtectedRoute>} />
            <Route path="/os"              element={<ProtectedRoute><OSBoard /></ProtectedRoute>} />
            <Route path="/os/:id"          element={<ProtectedRoute><OSDetails /></ProtectedRoute>} />
            <Route path="/checklist"       element={<ProtectedRoute><Checklist /></ProtectedRoute>} />
            <Route path="/scheduling"      element={<ProtectedRoute><Scheduling /></ProtectedRoute>} />
            <Route path="/licensees"       element={<ProtectedRoute><Licensees /></ProtectedRoute>} />
            <Route path="/licensees/:id"   element={<ProtectedRoute><LicenseeDetails /></ProtectedRoute>} />
            <Route path="/machines"        element={<ProtectedRoute><Machines /></ProtectedRoute>} />
            <Route path="/orders"          element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/new"      element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
            <Route path="/orders/:id"      element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
            <Route path="/role-matrix"     element={<ProtectedRoute><RoleMatrix /></ProtectedRoute>} />
            <Route path="/responsibility-map" element={<ProtectedRoute><ResponsibilityMap /></ProtectedRoute>} />
            <Route path="/sales-targets"   element={<ProtectedRoute><SalesTargets /></ProtectedRoute>} />
            <Route path="/b2b"             element={<ProtectedRoute><B2BLeads /></ProtectedRoute>} />
            <Route path="/b2b/funnel"      element={<ProtectedRoute><B2BFunnel /></ProtectedRoute>} />
            <Route path="/crm"             element={<ProtectedRoute><CRMDashboard /></ProtectedRoute>} />
            <Route path="/crm/:funnelType" element={<ProtectedRoute><CRMFunnel /></ProtectedRoute>} />
            <Route path="/import"          element={<ProtectedRoute><DataImport /></ProtectedRoute>} />
            <Route path="/mapa-territorial" element={<ProtectedRoute><MapaTerritorial /></ProtectedRoute>} />

            {/* Network Intelligence */}
            <Route path="/ops/network-map"             element={<ProtectedRoute><NetworkMap /></ProtectedRoute>} />
            <Route path="/ops/licensee-ranking"        element={<ProtectedRoute><LicenseeRanking /></ProtectedRoute>} />
            <Route path="/ops/territory-intelligence"  element={<ProtectedRoute><TerritoryIntelligence /></ProtectedRoute>} />
            <Route path="/ops/territory-expansion"     element={<ProtectedRoute><TerritoryExpansion /></ProtectedRoute>} />

            <Route path="/logistics"   element={<ProtectedRoute><Logistics /></ProtectedRoute>} />
            <Route path="/purchasing"  element={<ProtectedRoute><Purchasing /></ProtectedRoute>} />
            <Route path="/financeiro"  element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
            <Route path="/suprimentos" element={<ProtectedRoute><Suprimentos /></ProtectedRoute>} />

            {/* Dashboards */}
            <Route path="/dashboards" element={<Navigate to="/dashboards/producao" replace />} />
            <Route path="/dashboards/producao"  element={<ProtectedRoute><DashboardProducao /></ProtectedRoute>} />
            <Route path="/dashboards/financeiro" element={<ProtectedRoute><DashboardFinanceiro /></ProtectedRoute>} />
            <Route path="/dashboards/logistica"  element={<ProtectedRoute><DashboardLogistica /></ProtectedRoute>} />
            <Route path="/dashboards/comercial"  element={<ProtectedRoute><DashboardComercial /></ProtectedRoute>} />
            <Route path="/dashboards/estrategico" element={<ProtectedRoute><DashboardEstrategico /></ProtectedRoute>} />

            {/* MRP */}
            <Route path="/mrp"           element={<Navigate to="/dashboards/producao" replace />} />
            <Route path="/mrp/dashboard" element={<Navigate to="/dashboards/producao" replace />} />
            <Route path="/mrp/products"  element={<ProtectedRoute><MrpProducts /></ProtectedRoute>} />
            <Route path="/mrp/suppliers" element={<ProtectedRoute><MrpSuppliers /></ProtectedRoute>} />
            <Route path="/skus"          element={<ProtectedRoute><Skus /></ProtectedRoute>} />
            <Route path="/lots"          element={<ProtectedRoute><Lots /></ProtectedRoute>} />
            <Route path="/production-orders"     element={<ProtectedRoute><ProductionOrdersOP /></ProtectedRoute>} />
            <Route path="/production-orders/:id" element={<ProtectedRoute><ProductionOrderDetail /></ProtectedRoute>} />

            {/* Licensee area */}
            <Route path="/licensee/new"      element={<ProtectedRoute><NewLicensee /></ProtectedRoute>} />
            <Route path="/licensee/dashboard" element={<ProtectedRoute><LicenseeDashboard /></ProtectedRoute>} />
            <Route path="/licensee/vapt"      element={<ProtectedRoute><LicenseeVapt /></ProtectedRoute>} />
            <Route path="/licensee/ze"        element={<Navigate to="/licensee/produtos" replace />} />
            <Route path="/licensee/produtos"  element={<ProtectedRoute><LicenseeProducts /></ProtectedRoute>} />
            <Route path="/licensee/pedidos"   element={<ProtectedRoute><LicenseeRequests /></ProtectedRoute>} />
            <Route path="/licensee/creditos"  element={<ProtectedRoute><LicenseeCredits /></ProtectedRoute>} />
            <Route path="/licensee/comissoes" element={<ProtectedRoute><LicenseeCommissions /></ProtectedRoute>} />
            <Route path="/licensee/atendimentos" element={<ProtectedRoute><LicenseeAtendimento /></ProtectedRoute>} />
            <Route path="/licensee/clientes"  element={<ProtectedRoute><LicenseeClientes /></ProtectedRoute>} />
            <Route path="/licensee/reagentes" element={<ProtectedRoute><LicenseeReagentes /></ProtectedRoute>} />

            {/* CarboVAPT flow */}
            <Route path="/licenciado/carboVAPT/servicos"    element={<ProtectedRoute><CarboVAPTServices /></ProtectedRoute>} />
            <Route path="/licenciado/carboVAPT/checkout"    element={<ProtectedRoute><CarboVAPTCheckout /></ProtectedRoute>} />
            <Route path="/licenciado/carboVAPT/pagamento"   element={<ProtectedRoute><CarboVAPTPayment /></ProtectedRoute>} />
            <Route path="/licenciado/carboVAPT/confirmacao" element={<ProtectedRoute><CarboVAPTConfirmation /></ProtectedRoute>} />

            {/* Legacy portal redirects */}
            <Route path="/portal"         element={<ProtectedRoute><LicenseeDashboard /></ProtectedRoute>} />
            <Route path="/portal/vapt"    element={<ProtectedRoute><ServiceCatalog operationType="carbo_vapt" /></ProtectedRoute>} />
            <Route path="/portal/ze"      element={<ProtectedRoute><ServiceCatalog operationType="carbo_ze" /></ProtectedRoute>} />
            <Route path="/portal/pedidos" element={<ProtectedRoute><LicenseeRequests /></ProtectedRoute>} />
            <Route path="/portal/creditos" element={<ProtectedRoute><LicenseeCredits /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin"        element={<ProtectedRoute requiredRole="admin"><Admin /></ProtectedRoute>} />
            <Route path="/admin/approval" element={<ProtectedRoute requiredRole="admin"><AdminApproval /></ProtectedRoute>} />
            <Route path="/admin/cockpit" element={<ProtectedRoute requiredRole="admin" requiresCeo><CockpitEstrategico /></ProtectedRoute>} />
            <Route path="/governance"   element={<ProtectedRoute requiresCeo><CarboGovernance /></ProtectedRoute>} />
            <Route path="/admin/*"      element={<ProtectedRoute requiredRole="admin"><Admin /></ProtectedRoute>} />

            {/* PDV Routes */}
            <Route path="/pdv" element={<ProtectedRoute><PDVLayout /></ProtectedRoute>}>
              <Route path="dashboard"  element={<PDVDashboard />} />
              <Route path="pos"        element={<PDVPos />} />
              <Route path="estoque"    element={<PDVEstoque />} />
              <Route path="vendedores" element={<PDVVendedores />} />
              <Route path="ranking"    element={<PDVRanking />} />
              <Route path="stock"      element={<Navigate to="/pdv/estoque" replace />} />
              <Route path="history"    element={<Navigate to="/pdv/estoque" replace />} />
            </Route>

            {/* Rede PDV */}
            <Route path="/ops/pdv-network" element={<ProtectedRoute><OpsNetwork /></ProtectedRoute>} />

            {/* Bling Integration */}
            <Route path="/integrations/bling/callback" element={<BlingCallback />} />
            <Route path="/integrations/bling" element={<ProtectedRoute><BlingIntegration /></ProtectedRoute>} />

            {/* CarboOPS */}
            <Route path="/ops/alerts" element={<ProtectedRoute><OpsAlerts /></ProtectedRoute>} />

            {/* AI Assistant */}
            <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RealtimeMachineAlertsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <PageProgressBar />
            <AnimatedRoutes />
            <AIChatDrawer />
          </BrowserRouter>
        </TooltipProvider>
      </RealtimeMachineAlertsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
