import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Gera um bundle "legacy" adicional para navegadores antigos (ex.: Chrome
    // desatualizado de projetores/TVs Android). Navegadores modernos continuam
    // recebendo o bundle moderno sem alteração — isto é puramente aditivo.
    legacy({
      targets: ["chrome >= 64", "android >= 5", "ios >= 11", "safari >= 11"],
      // Polyfills detectados automaticamente a partir do uso real do código.
      modernPolyfills: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
