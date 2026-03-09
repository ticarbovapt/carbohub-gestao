/**
 * Central de Fixtures - Exporta todas as fixtures do projeto
 * 
 * Estrutura organizada seguindo boas práticas do pytest:
 * - Fixtures agrupadas por domínio
 * - Reutilização máxima entre testes
 * - Isolamento completo de estado
 */

// Auth fixtures
export * from "./auth";

// OS (Ordem de Serviço) fixtures
export * from "./os";
