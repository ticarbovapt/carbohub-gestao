/**
 * Render Helpers - Utilitários para renderização em testes
 * 
 * Fornece wrappers configurados com providers necessários para testes.
 */

import React, { ReactElement, ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

// ============ QUERY CLIENT PARA TESTES ============

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// ============ WRAPPER PADRÃO ============

interface WrapperProps {
  children: ReactNode;
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {children}
          <Toaster />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };
}

// ============ RENDER CUSTOMIZADO ============

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const { queryClient = createTestQueryClient(), route = "/", ...renderOptions } = options;

  // Set the initial route
  window.history.pushState({}, "Test page", route);

  return {
    ...render(ui, {
      wrapper: createWrapper(queryClient),
      ...renderOptions,
    }),
    queryClient,
  };
}

// ============ RENDER COM CONTEXTO AUTH MOCK ============

// Nota: Para testes que precisam de AuthContext mockado,
// use createMockAuthContext de fixtures/auth.ts e 
// crie um wrapper específico para o teste

// Re-export testing-library utilities for convenience
// Note: Import directly from @testing-library/react in test files
