import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RealtimeMachineAlertsProvider } from "@/hooks/useRealtimeMachineAlerts";
import { PageProgressBar } from "@/components/ui/PageProgressBar";

// Pages
import AreaSelector from "./pages/AreaSelector";
import LoginArea from "./pages/LoginArea";
import { HomeHub } from "./components/home/HomeHub";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Team from "./pages/Team";
import OSBoard from "./pages/OSBoard";
import OSDetails from "./pages/OSDetails";
import Checklist from "./pages/Checklist";
import Admin from "./pages/Admin";
import AdminApproval from "./pages/AdminApproval";
import CarboGovernance from "./pages/CarboGovernance";
import NewLicensee from "./pages/NewLicensee";
import ChangePassword from "./pages/ChangePassword";
import Scheduling from "./pages/Scheduling";
import Licensees from "./pages/Licensees";
import LicenseeDetails from "./pages/LicenseeDetails";
import Machines from "./pages/Machines";
import Orders from "./pages/Orders";
import CreateOrder from "./pages/CreateOrder";
import OrderDetails from "./pages/OrderDetails";
import DataImport from "./pages/DataImport";
import MapaTerritorial from "./pages/MapaTerritorial";
import CockpitEstrategico from "./pages/admin/CockpitEstrategico";
import Logistics from "./pages/Logistics";
import Purchasing from "./pages/Purchasing";
import Financeiro from "./pages/Financeiro";
import Suprimentos from "./pages/Suprimentos";
import MrpProducts from "./pages/MrpProducts";
import MrpSuppliers from "./pages/MrpSuppliers";
import NotFound from "./pages/NotFound";
import AIAssistantPage from "./pages/AIAssistantPage";
import { AIChatDrawer } from "./components/ai/AIChatDrawer";

// Licensee Portal Pages
import LicenseeDashboard from "./pages/licensee/LicenseeDashboard";
import ServiceCatalog from "./pages/licensee/ServiceCatalog";
import LicenseeRequests from "./pages/licensee/LicenseeRequests";
import LicenseeCredits from "./pages/licensee/LicenseeCredits";
import LicenseeCommissions from "./pages/licensee/LicenseeCommissions";
import CarboVAPTServices from "./pages/licensee/CarboVAPTServices";
import CarboVAPTCheckout from "./pages/licensee/CarboVAPTCheckout";
import CarboVAPTPayment from "./pages/licensee/CarboVAPTPayment";
import CarboVAPTConfirmation from "./pages/licensee/CarboVAPTConfirmation";

// PDV Pages
import { PDVLayout } from "./components/layouts/PDVLayout";
import PDVDashboard from "./pages/pdv/PDVDashboard";
import PDVStock from "./pages/pdv/PDVStock";
import PDVHistory from "./pages/pdv/PDVHistory";

const queryClient = new QueryClient();

// Animated routes wrapper
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Routes location={location}>
          {/* Public routes - Area Selection */}
          <Route path="/" element={<AreaSelector />} />
          <Route path="/login/:area" element={<LoginArea />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/onboarding" element={<Onboarding />} />
          
          {/* Home Hub - Central access point after login */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <HomeHub />
              </ProtectedRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            }
          />
          <Route
            path="/os"
            element={
              <ProtectedRoute>
                <OSBoard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/os/:id"
            element={
              <ProtectedRoute>
                <OSDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checklist"
            element={
              <ProtectedRoute>
                <Checklist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scheduling"
            element={
              <ProtectedRoute>
                <Scheduling />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensees"
            element={
              <ProtectedRoute>
                <Licensees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensees/:id"
            element={
              <ProtectedRoute>
                <LicenseeDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/machines"
            element={
              <ProtectedRoute>
                <Machines />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/new"
            element={
              <ProtectedRoute>
                <CreateOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <OrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <DataImport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mapa-territorial"
            element={
              <ProtectedRoute>
                <MapaTerritorial />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logistics"
            element={
              <ProtectedRoute>
                <Logistics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchasing"
            element={
              <ProtectedRoute>
                <Purchasing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/financeiro"
            element={
              <ProtectedRoute>
                <Financeiro />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suprimentos"
            element={
              <ProtectedRoute>
                <Suprimentos />
              </ProtectedRoute>
            }
          />
          {/* MRP Routes */}
          <Route
            path="/mrp/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mrp/products"
            element={
              <ProtectedRoute>
                <MrpProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mrp/suppliers"
            element={
              <ProtectedRoute>
                <MrpSuppliers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/new"
            element={
              <ProtectedRoute>
                <NewLicensee />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approval"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminApproval />
              </ProtectedRoute>
            }
          />
          {/* Cockpit Estratégico — Master Admin only (server-side verified inside the page) */}
          <Route
            path="/admin/cockpit"
            element={
              <ProtectedRoute requiredRole="admin" requiresCeo>
                <CockpitEstrategico />
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance"
            element={
              <ProtectedRoute requiresCeo>
                <CarboGovernance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requiredRole="admin">
                <Admin />
              </ProtectedRoute>
            }
          />

          {/* Licensee Portal Routes */}
          <Route
            path="/licensee/dashboard"
            element={
              <ProtectedRoute>
                <LicenseeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/vapt"
            element={
              <ProtectedRoute>
                <ServiceCatalog operationType="carbo_vapt" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/ze"
            element={
              <ProtectedRoute>
                <ServiceCatalog operationType="carbo_ze" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/pedidos"
            element={
              <ProtectedRoute>
                <LicenseeRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/creditos"
            element={
              <ProtectedRoute>
                <LicenseeCredits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/licensee/comissoes"
            element={
              <ProtectedRoute>
                <LicenseeCommissions />
              </ProtectedRoute>
            }
          />

          {/* Legacy portal redirects */}
          {/* CarboVAPT new flow routes */}
          <Route path="/licenciado/carboVAPT/servicos" element={<ProtectedRoute><CarboVAPTServices /></ProtectedRoute>} />
          <Route path="/licenciado/carboVAPT/checkout" element={<ProtectedRoute><CarboVAPTCheckout /></ProtectedRoute>} />
          <Route path="/licenciado/carboVAPT/pagamento" element={<ProtectedRoute><CarboVAPTPayment /></ProtectedRoute>} />
          <Route path="/licenciado/carboVAPT/confirmacao" element={<ProtectedRoute><CarboVAPTConfirmation /></ProtectedRoute>} />

          {/* Legacy portal redirects - SECURITY FIX: Wrapped with ProtectedRoute */}
          <Route path="/portal" element={<ProtectedRoute><LicenseeDashboard /></ProtectedRoute>} />
          <Route path="/portal/vapt" element={<ProtectedRoute><ServiceCatalog operationType="carbo_vapt" /></ProtectedRoute>} />
          <Route path="/portal/ze" element={<ProtectedRoute><ServiceCatalog operationType="carbo_ze" /></ProtectedRoute>} />
          <Route path="/portal/pedidos" element={<ProtectedRoute><LicenseeRequests /></ProtectedRoute>} />
          <Route path="/portal/creditos" element={<ProtectedRoute><LicenseeCredits /></ProtectedRoute>} />

          {/* PDV Routes */}
          <Route
            path="/pdv"
            element={
              <ProtectedRoute>
                <PDVLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<PDVDashboard />} />
            <Route path="stock" element={<PDVStock />} />
            <Route path="history" element={<PDVHistory />} />
          </Route>

          {/* AI Assistant */}
          <Route
            path="/ai-assistant"
            element={
              <ProtectedRoute>
                <AIAssistantPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
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