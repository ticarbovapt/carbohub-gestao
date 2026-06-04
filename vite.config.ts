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
      // Alvo bem antigo (ES5) para cobrir o Chrome desatualizado de
      // projetores/TVs Android. Quanto mais baixo o alvo, mais o código é
      // rebaixado e mais polyfills entram — navegadores modernos não usam
      // esse bundle, então não há custo para eles.
      targets: ["chrome >= 49", "android >= 4.4", "ios >= 10", "safari >= 10"],
      // Garante polyfills de funcionalidades modernas (Promise, fetch,
      // Object.assign, etc.) tanto no bundle legacy quanto no moderno.
      polyfills: true,
      modernPolyfills: true,
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
