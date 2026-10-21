import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { Toaster as ToasterShadcn } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { BloqueioAoVivo } from "./components/BloqueioAoVivo";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <App />
            <BloqueioAoVivo />
          </TooltipProvider>
          <Toaster richColors position="top-right" offset={72} />
          {/* ⚠️ Os hooks de compras, contas e cadastros avisam por `@/hooks/use-toast`
              (shadcn), e esse Toaster NUNCA foi montado aqui: todo "salvo" e todo
              erro deles era invisível (achado em 21/10/2026). Os dois convivem. */}
          <ToasterShadcn />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// PWA: registra o service worker (instalável + Web Push do Carbo Chat) só em produção.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
